from __future__ import annotations

import uuid

from fastapi import HTTPException, status

from ...core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from ...models import RoleEnum, User
from ...schemas import Message, Token, TokenRefresh
from ...services.audit import write_audit_log
from .repository import AuthRepository
from .schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    UserCreate,
)


class AuthService:
    def __init__(self, repository: AuthRepository):
        self.repository = repository

    def setup_admin(self, body: UserCreate) -> User:
        if self.repository.any_user_exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already set up")
        user = User(
            email=body.email,
            name=body.name,
            user_id=body.user_id,
            hashed_password=hash_password(body.password),
            role=RoleEnum.ADMIN,
        )
        self.repository.add(user)
        self.repository.commit()
        self.repository.refresh(user)
        return user

    def signup_status(self) -> dict[str, bool]:
        return {"allowed": self.repository.signup_allowed()}

    def signup(self, body: SignupRequest) -> User:
        if not self.repository.signup_allowed():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self sign-up disabled")
        existing = self.repository.get_user_by_email_or_user_id(email=body.email, user_id=body.user_id)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists")
        user = User(
            email=body.email,
            name=body.name,
            user_id=body.user_id,
            hashed_password=hash_password(body.password),
            role=RoleEnum.LEARNER,
        )
        self.repository.add(user)
        self.repository.commit()
        self.repository.refresh(user)
        return user

    def login(self, body: LoginRequest, *, request_ip: str | None) -> Token:
        email = str(body.email).strip().lower()
        user = self.repository.get_user_by_email(email)
        if not user or not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
        write_audit_log(
            self.repository.db,
            user.id,
            action="USER_LOGIN",
            resource_type="user",
            resource_id=str(user.id),
            detail="Successful login",
            ip_address=request_ip,
        )
        return Token(
            access_token=create_access_token(
                str(user.id),
                user.user_id,
                user.role.value,
                name=user.name,
                email=user.email,
            ),
            refresh_token=create_refresh_token(str(user.id)),
        )

    def refresh_access_token(self, body: RefreshRequest) -> TokenRefresh:
        try:
            payload = verify_token(body.refresh_token, expected_type="refresh")
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
        user = self._load_token_user(payload)
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
        return TokenRefresh(
            access_token=create_access_token(
                str(user.id),
                user.user_id,
                user.role.value,
                name=user.name,
                email=user.email,
            )
        )

    def logout(self, *, current_user: User, request_ip: str | None) -> Message:
        write_audit_log(
            self.repository.db,
            current_user.id,
            action="USER_LOGOUT",
            resource_type="user",
            resource_id=str(current_user.id),
            detail="User logged out",
            ip_address=request_ip,
        )
        return Message(detail="Logged out")

    def change_password(self, *, current_user: User, body: ChangePasswordRequest) -> Message:
        if not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")
        current_user.hashed_password = hash_password(body.new_password)
        self.repository.add(current_user)
        self.repository.commit()
        write_audit_log(
            self.repository.db,
            current_user.id,
            action="PASSWORD_CHANGED",
            resource_type="user",
            resource_id=str(current_user.id),
            detail="Password changed by authenticated user",
        )
        return Message(detail="Password updated")

    def prepare_password_reset(self, body: ForgotPasswordRequest) -> tuple[User | None, str | None]:
        email = str(body.email).strip().lower()
        user = self.repository.get_user_by_email(email)
        if not user:
            return None, None
        return user, create_password_reset_token(str(user.id))

    def reset_password(self, body: ResetPasswordRequest) -> Message:
        try:
            payload = verify_token(body.token, expected_type="password_reset")
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
        user = self._load_token_user(payload, not_found_status=status.HTTP_404_NOT_FOUND)
        user.hashed_password = hash_password(body.new_password)
        self.repository.add(user)
        self.repository.commit()
        write_audit_log(
            self.repository.db,
            user.id,
            action="PASSWORD_RESET",
            resource_type="user",
            resource_id=str(user.id),
            detail="Password reset via token",
        )
        return Message(detail="Password reset successful")

    def _load_token_user(self, payload: dict, *, not_found_status: int = status.HTTP_401_UNAUTHORIZED) -> User:
        sub = payload.get("sub")
        try:
            user_pk = uuid.UUID(sub) if isinstance(sub, str) else sub
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

        user = self.repository.get_user_by_id(user_pk)
        if not user:
            detail = "User not found" if not_found_status == status.HTTP_404_NOT_FOUND else "Invalid token"
            raise HTTPException(status_code=not_found_status, detail=detail)
        return user
