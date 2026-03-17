import logging
from logging.config import dictConfig

from .config import get_settings


def setup_logging() -> None:
    settings = get_settings()
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                }
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                }
            },
            "root": {
                "handlers": ["default"],
                "level": settings.LOG_LEVEL,
            },
            "loggers": {
                "sqlalchemy.engine": {
                    "handlers": ["default"],
                    "level": "WARNING",
                    "propagate": False,
                },
                "uvicorn.error": {
                    "handlers": ["default"],
                    "level": settings.LOG_LEVEL,
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["default"],
                    "level": settings.LOG_LEVEL,
                    "propagate": False,
                },
                "gunicorn.error": {
                    "handlers": ["default"],
                    "level": settings.LOG_LEVEL,
                    "propagate": False,
                },
                "gunicorn.access": {
                    "handlers": ["default"],
                    "level": settings.LOG_LEVEL,
                    "propagate": False,
                },
            },
        }
    )
    logging.getLogger(__name__).debug("Logging configured")
