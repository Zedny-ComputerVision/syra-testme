from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

    DATABASE_URL: str = Field(default="postgresql://postgres:password@localhost:5432/syra_lms")
    SECRET_KEY: str = Field(..., min_length=32)
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)
    PASSWORD_RESET_EXPIRE_MINUTES: int = Field(default=60)

    BREVO_API_KEY: str | None = None
    BREVO_BASE_URL: str = "https://api.brevo.com/v3"
    BREVO_SENDER_EMAIL: str | None = None
    BREVO_SENDER_NAME: str | None = None
    BREVO_SANDBOX: bool = False

    OPENAI_API_KEY: str | None = None

    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str | None = None
    SMTP_TLS: bool = True

    FRONTEND_BASE_URL: str | None = None
    BACKEND_BASE_URL: str = Field(default="http://127.0.0.1:8000")

    CORS_ORIGINS: str = Field(default="*")
    RATE_LIMIT_LOGIN: str = Field(default="10/minute")
    RATE_LIMIT_FORGOT: str = Field(default="5/minute")
    E2E_SEED_ENABLED: bool = False
    DEV_LOG_REQUESTS: bool = False
    PRECHECK_ALLOW_TEST_BYPASS: bool = False

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
