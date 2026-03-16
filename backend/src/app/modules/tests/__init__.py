from .enums import TestStatus, TestType, ReportDisplayed, ReportContent
from .models import Test, TestSettings, TestUiColumn
from .schemas import (
    ActionResponse,
    ActionResponseDTO,
    ErrorResponse,
    ErrorResponseDTO,
    TestCreate,
    TestCreateDTO,
    TestDetail,
    TestListItem,
    TestListItemDTO,
    TestListResponse,
    TestListResponseDTO,
    TestResponseDTO,
    TestSettingsSchema,
    TestUpdate,
    TestUpdateDTO,
)

__all__ = [
    "TestStatus",
    "TestType",
    "ReportDisplayed",
    "ReportContent",
    "Test",
    "TestSettings",
    "TestUiColumn",
    "TestSettingsSchema",
    "TestCreate",
    "TestCreateDTO",
    "TestUpdate",
    "TestUpdateDTO",
    "TestDetail",
    "TestResponseDTO",
    "TestListItem",
    "TestListItemDTO",
    "TestListResponse",
    "TestListResponseDTO",
    "ActionResponse",
    "ActionResponseDTO",
    "ErrorResponse",
    "ErrorResponseDTO",
    "router",
]


def __getattr__(name):
    if name == "router":
        from .routes_admin import router

        return router
    raise AttributeError(name)
