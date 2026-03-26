from app.utils.pagination import normalize_pagination


def test_normalize_pagination_accepts_combined_sort_and_order() -> None:
    pagination = normalize_pagination(sort="created_at:desc")

    assert pagination.sort == "created_at"
    assert pagination.order == "desc"


def test_normalize_pagination_prefers_explicit_order_over_embedded_order() -> None:
    pagination = normalize_pagination(sort="name:desc", order="asc")

    assert pagination.sort == "name"
    assert pagination.order == "asc"
