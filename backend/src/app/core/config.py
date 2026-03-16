from functools import lru_cache
import os
import sys

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_API_KEYS = {
    "",
    "change-me",
    "none",
    "null",
    "your-openai-key",
    "your-openai-key-optional",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    DATABASE_URL: str = Field(default="postgresql+psycopg://postgres:password@localhost:5432/syra_lms")
    DB_POOL_SIZE: int = Field(default=3, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=0, ge=0)
    DB_POOL_TIMEOUT_SECONDS: int = Field(default=15, ge=1)
    DB_POOL_RECYCLE_SECONDS: int = Field(default=1800, ge=60)
    DB_DISABLE_POOLING: bool | None = None
    JWT_SECRET: str = Field(..., min_length=32, validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"))
    JWT_ALGORITHM: str = Field(default="HS256", validation_alias=AliasChoices("JWT_ALGORITHM", "ALGORITHM"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)
    PASSWORD_RESET_EXPIRE_MINUTES: int = Field(default=60)
    LOG_LEVEL: str = Field(default="INFO")

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
    AUTO_APPLY_MIGRATIONS: bool = False
    IDENTITY_RETENTION_DAYS: int = Field(default=7, ge=1)
    PROCTORING_VIDEO_RETENTION_DAYS: int = Field(default=90, ge=1)
    PROCTORING_EVIDENCE_RETENTION_DAYS: int = Field(default=90, ge=1)
    MEDIA_STORAGE_PROVIDER: str = Field(default="local")
    PROCTORING_VIDEO_STORAGE_PROVIDER: str = Field(default="cloudflare")
    CLOUDFLARE_MEDIA_API_BASE_URL: str = Field(default="")
    CLOUDFLARE_MEDIA_REQUIRE_SIGNED_URLS: bool = False
    CLOUDFLARE_MEDIA_WATERMARK_UID: str | None = None
    SUPABASE_URL: str | None = None
    SUPABASE_PUBLISHABLE_KEY: str | None = None
    SUPABASE_SECRET_KEY: str | None = None
    SUPABASE_STORAGE_BUCKET: str = Field(default="syra-media")
    SUPABASE_SIGNED_URL_EXPIRES_SECONDS: int = Field(default=3600, ge=60)

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("DATABASE_URL is required")
        if normalized.startswith("postgres://"):
            normalized = f"postgresql+psycopg://{normalized[len('postgres://'):]}"
        elif normalized.startswith("postgresql://"):
            normalized = f"postgresql+psycopg://{normalized[len('postgresql://'):]}"
        if not normalized.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use a PostgreSQL connection string")
        return normalized

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

    @field_validator("JWT_ALGORITHM")
    @classmethod
    def validate_jwt_algorithm(cls, value: str) -> str:
        normalized = str(value or "").strip().upper()
        if normalized != "HS256":
            raise ValueError("JWT_ALGORITHM must be HS256")
        return normalized

    @field_validator("LOG_LEVEL")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        normalized = str(value or "INFO").strip().upper()
        if normalized not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ValueError("LOG_LEVEL must be one of CRITICAL, ERROR, WARNING, INFO, DEBUG")
        return normalized

    @field_validator("MEDIA_STORAGE_PROVIDER")
    @classmethod
    def normalize_media_storage_provider(cls, value: str) -> str:
        normalized = str(value or "local").strip().lower()
        if normalized not in {"local", "supabase"}:
            raise ValueError("MEDIA_STORAGE_PROVIDER must be either 'local' or 'supabase'")
        return normalized

    @field_validator("PROCTORING_VIDEO_STORAGE_PROVIDER")
    @classmethod
    def normalize_video_storage_provider(cls, value: str) -> str:
        normalized = str(value or "cloudflare").strip().lower()
        if normalized not in {"local", "cloudflare", "supabase"}:
            raise ValueError("PROCTORING_VIDEO_STORAGE_PROVIDER must be 'local', 'cloudflare', or 'supabase'")
        return normalized

    @field_validator("CLOUDFLARE_MEDIA_API_BASE_URL", mode="before")
    @classmethod
    def normalize_cloudflare_media_api_base_url(cls, value: str | None) -> str:
        normalized = str(value or "").strip().rstrip("/")
        if not normalized:
            return ""
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("CLOUDFLARE_MEDIA_API_BASE_URL must start with http:// or https://")
        return normalized

    @field_validator("SUPABASE_URL", mode="before")
    @classmethod
    def normalize_supabase_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip().rstrip("/")
        if not normalized:
            return None
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("SUPABASE_URL must start with http:// or https://")
        return normalized

    @field_validator("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", mode="before")
    @classmethod
    def normalize_supabase_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("SUPABASE_STORAGE_BUCKET")
    @classmethod
    def normalize_supabase_bucket(cls, value: str) -> str:
        normalized = str(value or "syra-media").strip()
        if not normalized:
            raise ValueError("SUPABASE_STORAGE_BUCKET is required")
        return normalized

    @field_validator("OPENAI_API_KEY", mode="before")
    @classmethod
    def normalize_openai_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            return None
        if normalized.lower() in _PLACEHOLDER_API_KEYS or normalized.lower().startswith("your-openai-key"):
            return None
        return normalized

    @property
    def precheck_test_bypass_enabled(self) -> bool:
        return bool(
            self.PRECHECK_ALLOW_TEST_BYPASS
            and (
                self.E2E_SEED_ENABLED
                or "pytest" in sys.modules
                or "PYTEST_CURRENT_TEST" in os.environ
            )
        )

    @property
    def db_disable_pooling(self) -> bool:
        if self.DB_DISABLE_POOLING is not None:
            return bool(self.DB_DISABLE_POOLING)
        return ".pooler.supabase.com" in self.DATABASE_URL

@lru_cache
def get_settings() -> Settings:
    return Settings()
