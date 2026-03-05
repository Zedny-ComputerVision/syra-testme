from enum import Enum


__test__ = False  # prevent pytest from attempting to collect these enums as tests


class TestStatus(str, Enum):
    __test__ = False
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class TestType(str, Enum):
    __test__ = False
    MCQ = "MCQ"
    TEXT = "TEXT"


class ReportDisplayed(str, Enum):
    __test__ = False
    IMMEDIATELY_AFTER_GRADING = "IMMEDIATELY_AFTER_GRADING"
    IMMEDIATELY_AFTER_FINISHING = "IMMEDIATELY_AFTER_FINISHING"
    ON_MANAGER_APPROVAL = "ON_MANAGER_APPROVAL"


class ReportContent(str, Enum):
    __test__ = False
    SCORE_ONLY = "SCORE_ONLY"
    SCORE_AND_DETAILS = "SCORE_AND_DETAILS"
