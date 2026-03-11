from fastapi import APIRouter, Depends, Query

from ...models import RoleEnum
from ...schemas import ExamCreate, ExamRead, ExamUpdate, Message, PaginatedResponse
from ...services.exam_compat_service import (
    create_test as create_test_service,
    delete_test as delete_test_service,
    get_test as get_test_service,
    list_tests as list_tests_service,
    update_test as update_test_service,
)
from ...utils.pagination import MAX_PAGE_SIZE
from ..deps import get_current_user, get_db_dep, require_permission

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[ExamRead])
async def list_exams(
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    order: str | None = Query(None),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
    db=Depends(get_db_dep),
    current=Depends(get_current_user),
):
    return list_tests_service(
        db=db,
        current=current,
        page=page,
        page_size=page_size,
        search=search,
        sort=sort,
        order=order,
        skip=skip,
        limit=limit,
    )


@router.post("/", response_model=ExamRead)
async def create_exam(
    body: ExamCreate,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Create Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return create_test_service(db=db, body=body, current=current)


@router.get("/{exam_id}", response_model=ExamRead)
async def get_exam(
    exam_id: str,
    db=Depends(get_db_dep),
    current=Depends(get_current_user),
):
    return get_test_service(db=db, test_id=exam_id, current=current)


@router.put("/{exam_id}", response_model=ExamRead)
async def update_exam(
    exam_id: str,
    body: ExamUpdate,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return update_test_service(db=db, test_id=exam_id, body=body, current=current)


@router.delete("/{exam_id}", response_model=Message)
async def delete_exam(
    exam_id: str,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Delete Tests", RoleEnum.ADMIN)),
):
    del current
    return delete_test_service(db=db, test_id=exam_id)
