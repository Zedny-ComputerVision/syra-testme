from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...models import GradingScale, RoleEnum
from ...schemas import GradingScaleBase, GradingScaleRead, Message
from ...services.audit import write_audit_log
from ..deps import get_db_dep, parse_uuid_param, require_permission

router = APIRouter()


def _clean_required_text(value: str | None, field_name: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return cleaned


def _ensure_unique_scale_name(db: Session, name: str, existing_scale_id=None):
    existing = db.scalar(
        select(GradingScale).where(func.lower(GradingScale.name) == name.lower())
    )
    if existing and getattr(existing, "id", None) != existing_scale_id:
        raise HTTPException(status_code=409, detail="Grading scale exists")


def _normalize_scale_bands(labels: list[dict]) -> list[dict]:
    if not labels:
        raise HTTPException(status_code=422, detail="At least one grade band is required")

    normalized = []
    seen_labels: set[str] = set()
    for index, band in enumerate(labels, start=1):
        label = _clean_required_text(band.get("label"), f"Band {index} label")
        label_key = label.lower()
        if label_key in seen_labels:
            raise HTTPException(status_code=422, detail="Band labels must be unique")
        seen_labels.add(label_key)
        try:
            min_score = int(band.get("min_score"))
            max_score = int(band.get("max_score"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=f"Band {index} scores must be numbers") from None
        if min_score < 0 or max_score < 0 or min_score > 100 or max_score > 100:
            raise HTTPException(status_code=422, detail=f"Band {index} scores must be between 0 and 100")
        if min_score > max_score:
            raise HTTPException(status_code=422, detail=f"Band {index} minimum score cannot exceed maximum score")
        normalized.append({"label": label, "min_score": min_score, "max_score": max_score})

    ordered = sorted(normalized, key=lambda band: (band["min_score"], band["max_score"]))
    for previous, current in zip(ordered, ordered[1:]):
        if current["min_score"] <= previous["max_score"]:
            raise HTTPException(status_code=422, detail="Grade bands cannot overlap")

    return normalized


def _normalize_scale_payload(body: GradingScaleBase) -> dict:
    return {
        "name": _clean_required_text(body.name, "Scale name"),
        "labels": _normalize_scale_bands(body.labels),
    }


@router.post("/", response_model=GradingScaleRead)
async def create_scale(
    body: GradingScaleBase,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Grading Scales", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    payload = _normalize_scale_payload(body)
    _ensure_unique_scale_name(db, payload["name"])
    scale = GradingScale(**payload)
    db.add(scale)
    db.commit()
    db.refresh(scale)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="GRADING_SCALE_CREATED",
        resource_type="grading_scale",
        resource_id=str(scale.id),
        detail=f"Created grading scale: {scale.name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return scale


@router.get("/", response_model=list[GradingScaleRead])
async def list_scales(db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Grading Scales", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(GradingScale).order_by(GradingScale.name.asc())).all()


@router.get("/{scale_id}", response_model=GradingScaleRead)
async def get_scale(scale_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Grading Scales", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    scale_pk = parse_uuid_param(scale_id, detail="Not found")
    scale = db.get(GradingScale, scale_pk)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    return scale


@router.put("/{scale_id}", response_model=GradingScaleRead)
async def update_scale(
    scale_id: str,
    body: GradingScaleBase,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Grading Scales", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    scale_pk = parse_uuid_param(scale_id, detail="Not found")
    scale = db.get(GradingScale, scale_pk)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    payload = _normalize_scale_payload(body)
    _ensure_unique_scale_name(db, payload["name"], existing_scale_id=scale.id)
    scale.name = payload["name"]
    scale.labels = payload["labels"]
    db.add(scale)
    db.commit()
    db.refresh(scale)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="GRADING_SCALE_UPDATED",
        resource_type="grading_scale",
        resource_id=str(scale.id),
        detail=f"Updated grading scale: {scale.name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return scale


@router.delete("/{scale_id}", response_model=Message)
async def delete_scale(
    scale_id: str,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Grading Scales", RoleEnum.ADMIN)),
):
    scale_pk = parse_uuid_param(scale_id, detail="Not found")
    scale = db.get(GradingScale, scale_pk)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    scale_name = scale.name
    scale_pk_str = str(scale.id)
    db.delete(scale)
    db.commit()
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="GRADING_SCALE_DELETED",
        resource_type="grading_scale",
        resource_id=scale_pk_str,
        detail=f"Deleted grading scale: {scale_name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return Message(detail="Deleted")
