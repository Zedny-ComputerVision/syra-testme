from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select

from ...api.deps import load_permission_rows, parse_uuid_param, permission_allowed
from ...core.security import hash_password
from ...models import Attempt, RoleEnum, User, UserPreference
from ...schemas import (
    AdminPasswordResetRequest,
    AdminUserPatch,
    Message,
    UserCreate,
    UserPreferenceRead,
    UserPreferenceUpdate,
    UserSelfUpdate,
    UserUpdate,
)
from ...services.audit import write_audit_log
from ...utils.pagination import PaginationParams, build_page_response, clamp_sort_field
from .repository import UserRepository


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def list_users(
        self,
        *,
        pagination: PaginationParams,
        role: str | None,
        is_active: bool | None,
    ) -> dict:
        resolved_sort = clamp_sort_field(pagination.sort, {"name", "email", "role", "created_at"}, "created_at")
        query = select(User)
        if role:
            try:
                query = query.where(User.role == RoleEnum(role))
            except ValueError:
                pass
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if pagination.search:
            like = f"%{pagination.search.lower()}%"
            query = query.where(
                or_(
                    func.lower(User.name).like(like),
                    func.lower(User.email).like(like),
                    func.lower(User.user_id).like(like),
                )
            )
        total = self.repository.count_users(query)
        users = self.repository.list_users(
            self._sort_user_query(query, resolved_sort, pagination.order)
            .offset(pagination.offset)
            .limit(pagination.limit)
        ).all()
        return build_page_response(items=users, total=total, pagination=pagination, extended=False)

    def list_learners_for_scheduling(
        self,
        *,
        current: User,
        search: str | None,
        is_active: bool | None,
    ) -> list[User]:
        rows = load_permission_rows(self.repository.db)
        can_schedule = permission_allowed(rows, current.role, "Assign Schedules")
        can_manage_users = permission_allowed(rows, current.role, "Manage Users")
        if current.role not in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR} or not (can_schedule or can_manage_users):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

        query = select(User).where(User.role == RoleEnum.LEARNER)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        learners = self.repository.list_users(query.order_by(User.created_at.desc())).all()
        if search:
            q = search.strip().lower()
            learners = [
                learner
                for learner in learners
                if q in (learner.name or "").lower()
                or q in (learner.email or "").lower()
                or q in (learner.user_id or "").lower()
            ]
        return learners

    def create_user(self, *, body: UserCreate) -> User:
        payload = self._normalize_user_payload(body.model_dump(exclude={"password"}), partial=False)
        self._ensure_unique_email(payload["email"])
        self._ensure_unique_user_id(payload["user_id"])
        now = datetime.now(timezone.utc)
        user = User(
            email=payload["email"],
            name=payload["name"],
            user_id=payload["user_id"],
            role=payload["role"],
            is_active=payload["is_active"],
            hashed_password=hash_password(body.password),
            created_at=now,
            updated_at=now,
        )
        self.repository.add(user)
        try:
            self.repository.commit()
        except Exception:
            self.repository.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or User ID already exists")
        self.repository.refresh(user)
        return user

    def get_user(self, user_id: str) -> User:
        user = self.repository.get_user(parse_uuid_param(user_id, detail="User not found"))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    def update_user(self, *, user_id: str, body: UserUpdate, current: User) -> User:
        user = self.get_user(user_id)
        payload = self._normalize_user_payload(body.model_dump(exclude_unset=True), partial=True)
        self._ensure_unique_email(payload.get("email"), existing_user_id=user.id)
        self._ensure_unique_user_id(payload.get("user_id"), existing_user_id=user.id)
        return self._update_user_record(user=user, payload=payload, current=current)

    def patch_user(self, *, user_id: str, body: AdminUserPatch, current: User) -> User:
        user = self.get_user(user_id)
        payload = body.model_dump(exclude_unset=True)
        if "email" in payload:
            payload["email"] = self._clean_required_text(payload.get("email"), "Email")
        if "name" in payload:
            payload["name"] = self._clean_required_text(payload.get("name"), "Name")
        if "user_id" in payload:
            payload["user_id"] = self._clean_required_text(payload.get("user_id"), "User ID")
        self._ensure_unique_email(payload.get("email"), existing_user_id=user.id)
        self._ensure_unique_user_id(payload.get("user_id"), existing_user_id=user.id)
        return self._update_user_record(user=user, payload=payload, current=current)

    def update_me(self, *, body: UserSelfUpdate, current: User) -> User:
        payload = body.model_dump(exclude_unset=True)
        cleaned: dict = {}
        if "email" in payload:
            cleaned["email"] = self._clean_required_text(payload.get("email"), "Email")
        if "name" in payload:
            cleaned["name"] = self._clean_required_text(payload.get("name"), "Name")
        if "email" in cleaned:
            self._ensure_unique_email(cleaned.get("email"), existing_user_id=current.id)
        for field, value in cleaned.items():
            setattr(current, field, value)
        current.updated_at = datetime.now(timezone.utc)
        self.repository.add(current)
        self.repository.commit()
        self.repository.refresh(current)
        return current

    def get_my_preference(self, *, key: str, current: User) -> UserPreferenceRead | UserPreference:
        pref = self.repository.get_preference(user_id=current.id, key=key)
        if not pref:
            return UserPreferenceRead(key=key, value=None, updated_at=None)
        return pref

    def update_my_preference(self, *, key: str, body: UserPreferenceUpdate, current: User) -> UserPreference:
        pref = self.repository.get_preference(user_id=current.id, key=key)
        if not pref:
            pref = UserPreference(user_id=current.id, key=key, value=body.value)
        else:
            pref.value = body.value
        pref.updated_at = datetime.now(timezone.utc)
        self.repository.add(pref)
        self.repository.commit()
        self.repository.refresh(pref)
        return pref

    def reset_user_password(self, *, user_id: str, body: AdminPasswordResetRequest, current: User) -> Message:
        user = self.get_user(user_id)
        if not body.new_password or len(body.new_password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        now = datetime.now(timezone.utc)
        user.hashed_password = hash_password(body.new_password)
        user.token_invalid_before = now
        user.updated_at = now
        self.repository.add(user)
        self.repository.commit()
        write_audit_log(
            self.repository.db,
            current.id,
            action="PASSWORD_RESET",
            resource_type="User",
            resource_id=str(user.id),
            detail="Password reset by administrator",
        )
        return Message(detail="Password reset")

    def delete_user(self, *, user_id: str, current: User) -> Message:
        user = self.get_user(user_id)
        if user.id == current.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        attempt_count = int(
            self.repository.db.scalar(select(func.count(Attempt.id)).where(Attempt.user_id == user.id))
            or 0
        )
        if attempt_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a user with existing attempts",
            )
        self.repository.delete(user)
        self.repository.commit()
        return Message(detail="Deleted")

    def _clean_required_text(self, value: str | None, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise HTTPException(status_code=422, detail=f"{field_name} is required")
        return text

    def _normalize_user_payload(self, payload: dict, *, partial: bool) -> dict:
        cleaned: dict = {}
        if not partial or "email" in payload:
            cleaned["email"] = self._clean_required_text(payload.get("email"), "Email")
        if not partial or "name" in payload:
            cleaned["name"] = self._clean_required_text(payload.get("name"), "Name")
        if not partial or "user_id" in payload:
            cleaned["user_id"] = self._clean_required_text(payload.get("user_id"), "User ID")
        if "role" in payload:
            cleaned["role"] = payload["role"]
        if "is_active" in payload:
            cleaned["is_active"] = payload["is_active"]
        return cleaned

    def _ensure_unique_email(self, email: str | None, existing_user_id=None) -> None:
        if not email:
            return
        existing = self.repository.get_user_by_email(email)
        if existing and existing.id != existing_user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email exists")

    def _ensure_unique_user_id(self, user_id: str | None, existing_user_id=None) -> None:
        if not user_id:
            return
        existing = self.repository.get_user_by_user_id(user_id)
        if existing and existing.id != existing_user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User ID exists")

    def _sort_user_query(self, query, sort_by: str, sort_dir: str):
        field_map = {
            "name": User.name,
            "email": User.email,
            "role": User.role,
            "created_at": User.created_at,
        }
        column = field_map.get(sort_by, User.created_at)
        if sort_dir == "asc":
            return query.order_by(column.asc(), User.created_at.asc())
        return query.order_by(column.desc(), User.created_at.desc())

    def _update_user_record(self, *, user: User, payload: dict, current: User) -> User:
        if user.id == current.id and "role" in payload and payload["role"] != user.role:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        if user.id == current.id and payload.get("is_active") is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

        previous_role = user.role
        changed_fields: list[str] = []
        for field, value in payload.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed_fields.append(field)

        if not changed_fields:
            return user

        user.updated_at = datetime.now(timezone.utc)
        self.repository.add(user)
        self.repository.commit()
        self.repository.refresh(user)

        if "role" in changed_fields and previous_role != user.role:
            write_audit_log(
                self.repository.db,
                current.id,
                action="USER_ROLE_CHANGED",
                resource_type="User",
                resource_id=str(user.id),
                detail=f"Role changed from {previous_role.value} to {user.role.value}",
            )

        write_audit_log(
            self.repository.db,
            current.id,
            action="USER_UPDATED",
            resource_type="User",
            resource_id=str(user.id),
            detail=f"Updated fields: {', '.join(changed_fields)}",
        )
        return user
