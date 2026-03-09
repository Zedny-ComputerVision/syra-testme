from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Node, Course, CourseStatus, RoleEnum
from ...schemas import NodeCreate, NodeRead, NodeBase, Message
from ..deps import ensure_permission, get_current_user, get_db_dep, parse_uuid_param, require_permission

router = APIRouter()


@router.post("/", response_model=NodeRead)
async def create_node(body: NodeCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    course = db.get(Course, body.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current.role == RoleEnum.INSTRUCTOR and course.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    now = datetime.now(timezone.utc)
    node = Node(course_id=body.course_id, title=body.title, order=body.order, created_at=now, updated_at=now)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.get("/", response_model=list[NodeRead])
async def list_nodes(course_id: str | None = None, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Node)
    if course_id:
        course_pk = parse_uuid_param(course_id, detail="Invalid course_id")
        query = query.where(Node.course_id == course_pk)
    if current.role == RoleEnum.LEARNER:
        query = query.join(Course, Node.course_id == Course.id).where(Course.status == CourseStatus.PUBLISHED)
    else:
        ensure_permission(db, current, "Edit Tests")
    query = query.order_by(Node.order)
    return db.scalars(query).all()


@router.get("/{node_id}", response_model=NodeRead)
async def get_node(node_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    node_pk = parse_uuid_param(node_id, detail="Node not found")
    node = db.get(Node, node_pk)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if current.role == RoleEnum.LEARNER and node.course and node.course.status != CourseStatus.PUBLISHED:
        raise HTTPException(status_code=404, detail="Node not found")
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "Edit Tests")
    return node


@router.put("/{node_id}", response_model=NodeRead)
async def update_node(node_id: str, body: NodeBase, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    node_pk = parse_uuid_param(node_id, detail="Node not found")
    node = db.get(Node, node_pk)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if current.role == RoleEnum.INSTRUCTOR and node.course.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    node.title = body.title
    node.order = body.order
    node.updated_at = datetime.now(timezone.utc)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/{node_id}", response_model=Message)
async def delete_node(node_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    node_pk = parse_uuid_param(node_id, detail="Node not found")
    node = db.get(Node, node_pk)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if current.role == RoleEnum.INSTRUCTOR and node.course.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(node)
    db.commit()
    return Message(detail="Deleted")
