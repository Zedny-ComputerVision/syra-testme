from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Course, CourseStatus, RoleEnum
from ...schemas import CourseCreate, CourseRead, CourseBase, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.get("/", response_model=list[CourseRead])
async def list_courses(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Course)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Course.status == CourseStatus.PUBLISHED)
    courses = db.scalars(query).all()
    return courses


@router.post("/", response_model=CourseRead)
async def create_course(body: CourseCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    now = datetime.now(timezone.utc)
    course = Course(
        title=body.title,
        description=body.description,
        status=body.status,
        created_by_id=current.id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseRead)
async def get_course(course_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current.role == RoleEnum.LEARNER and course.status == CourseStatus.DRAFT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


@router.put("/{course_id}", response_model=CourseRead)
async def update_course(course_id: str, body: CourseBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current.role == RoleEnum.INSTRUCTOR and course.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    for field, value in body.model_dump().items():
        setattr(course, field, value)
    course.updated_at = datetime.now(timezone.utc)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.delete("/{course_id}", response_model=Message)
async def delete_course(course_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db.delete(course)
    db.commit()
    return Message(detail="Deleted")
