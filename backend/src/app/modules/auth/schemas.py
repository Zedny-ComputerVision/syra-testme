from ...schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    Message,
    RefreshRequest,
    ResetPasswordRequest,
    Token,
    TokenRefresh,
    UserCreate,
    UserRead,
)
from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(max_length=255)
    user_id: str = Field(max_length=50)
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: EmailStr | str) -> str:
        return str(value).strip().lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Name is required")
        return text

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("User ID is required")
        return text

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value or "") < 8:
            raise ValueError("Password must be at least 8 characters")
        return value


__all__ = [
    "ChangePasswordRequest",
    "ForgotPasswordRequest",
    "LoginRequest",
    "Message",
    "RefreshRequest",
    "ResetPasswordRequest",
    "SignupRequest",
    "Token",
    "TokenRefresh",
    "UserCreate",
    "UserRead",
]
