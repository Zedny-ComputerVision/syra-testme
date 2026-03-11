from dataclasses import dataclass
from math import floor


DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200


@dataclass(slots=True)
class PaginationParams:
    page: int = DEFAULT_PAGE
    page_size: int = DEFAULT_PAGE_SIZE
    search: str | None = None
    sort: str = "created_at"
    order: str = "desc"

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


def normalize_pagination(
    *,
    page: int | None = None,
    page_size: int | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    skip: int | None = None,
    limit: int | None = None,
    default_sort: str = "created_at",
    default_order: str = "desc",
    default_page_size: int = DEFAULT_PAGE_SIZE,
    max_page_size: int = MAX_PAGE_SIZE,
) -> PaginationParams:
    resolved_page_size = _coerce_int(page_size, _coerce_int(limit, default_page_size))
    resolved_page_size = min(max(resolved_page_size, 1), max_page_size)

    if page is None:
        if skip is not None:
            resolved_page = floor(max(_coerce_int(skip, 0), 0) / resolved_page_size) + 1
        else:
            resolved_page = DEFAULT_PAGE
    else:
        resolved_page = max(_coerce_int(page, DEFAULT_PAGE), 1)

    return PaginationParams(
        page=resolved_page,
        page_size=resolved_page_size,
        search=_coerce_text(search),
        sort=_coerce_text(sort) or default_sort,
        order=_normalize_order(_coerce_text(order) or default_order),
    )


def build_page_response(
    *,
    items: list,
    total: int,
    pagination: PaginationParams,
    extended: bool = True,
) -> dict:
    payload = {
        "items": items,
        "total": total,
        "skip": pagination.offset,
        "limit": pagination.limit,
    }
    if extended:
        payload.update(
            {
                "page": pagination.page,
                "page_size": pagination.page_size,
                "search": pagination.search,
                "sort": pagination.sort,
                "order": pagination.order,
            }
        )
    return payload


def clamp_sort_field(value: str, allowed: set[str], default: str) -> str:
    return value if value in allowed else default


def _normalize_order(value: str) -> str:
    normalized = str(value or "desc").strip().lower()
    return normalized if normalized in {"asc", "desc"} else "desc"


def _coerce_int(value, default: int) -> int:
    candidate = getattr(value, "default", value)
    try:
        return int(candidate)
    except (TypeError, ValueError):
        return default


def _coerce_text(value) -> str | None:
    candidate = getattr(value, "default", value)
    normalized = str(candidate or "").strip()
    return normalized or None
