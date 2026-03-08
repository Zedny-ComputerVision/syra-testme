from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Survey, SurveyResponse, RoleEnum
from ...schemas import SurveyCreate, SurveyUpdate, SurveyRead, SurveyResponseCreate, SurveyResponseRead, Message
from ..deps import ensure_permission, get_current_user, get_db_dep, parse_uuid_param, require_permission

router = APIRouter()

QUESTION_TYPES = {"TEXT", "MCQ", "MULTI_SELECT", "RATING", "BOOLEAN"}
CHOICE_TYPES = {"MCQ", "MULTI_SELECT"}


def _clean_required_text(value: str | None, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return text


def _clean_optional_text(value: str | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_questions(raw_questions) -> list[dict]:
    if not isinstance(raw_questions, list):
        raise HTTPException(status_code=422, detail="Questions must be a list")
    cleaned_questions: list[dict] = []
    for index, raw_question in enumerate(raw_questions, start=1):
        if not isinstance(raw_question, dict):
            raise HTTPException(status_code=422, detail=f"Question {index} is invalid")
        text = str(raw_question.get("text") or "").strip()
        if not text:
            continue
        question_type = str(raw_question.get("question_type") or raw_question.get("type") or "TEXT").strip().upper()
        if question_type not in QUESTION_TYPES:
            raise HTTPException(status_code=422, detail=f"Question {index} has an unsupported type")
        question_payload = {
            "text": text,
            "question_type": question_type,
        }
        if question_type in CHOICE_TYPES:
            options = [str(option or "").strip() for option in (raw_question.get("options") or [])]
            options = [option for option in options if option]
            if len(options) < 2:
                raise HTTPException(status_code=422, detail=f"Question {index} needs at least two options")
            question_payload["options"] = options
        cleaned_questions.append(question_payload)
    if not cleaned_questions:
        raise HTTPException(status_code=422, detail="Add at least one question")
    return cleaned_questions


def _normalize_survey_payload(payload: dict, *, partial: bool) -> dict:
    cleaned: dict = {}
    if not partial or "title" in payload:
        cleaned["title"] = _clean_required_text(payload.get("title"), "Title")
    if not partial or "description" in payload:
        cleaned["description"] = _clean_optional_text(payload.get("description"))
    if not partial or "questions" in payload:
        cleaned["questions"] = _normalize_questions(payload.get("questions"))
    if "is_active" in payload:
        cleaned["is_active"] = payload["is_active"]
    return cleaned


@router.post("/", response_model=SurveyRead)
async def create_survey(body: SurveyCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    payload = _normalize_survey_payload(body.model_dump(), partial=False)
    survey = Survey(created_by_id=current.id, **payload)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.get("/", response_model=list[SurveyRead])
async def list_surveys(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Survey)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Survey.is_active == True)
    else:
        ensure_permission(db, current, "Edit Tests")
    return db.scalars(query.order_by(Survey.created_at.desc())).all()


@router.get("/{survey_id}", response_model=SurveyRead)
async def get_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey_pk = parse_uuid_param(survey_id, detail="Survey not found")
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if current.role == RoleEnum.LEARNER and not survey.is_active:
        raise HTTPException(status_code=404, detail="Survey not found")
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "Edit Tests")
    return survey


@router.put("/{survey_id}", response_model=SurveyRead)
async def update_survey(
    survey_id: str,
    body: SurveyUpdate,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    survey_pk = parse_uuid_param(survey_id, detail="Survey not found")
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if current.role == RoleEnum.INSTRUCTOR and survey.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    payload = _normalize_survey_payload(body.model_dump(exclude_unset=True), partial=True)
    for field, value in payload.items():
        setattr(survey, field, value)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.delete("/{survey_id}", response_model=Message)
async def delete_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    survey_pk = parse_uuid_param(survey_id, detail="Survey not found")
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    db.delete(survey)
    db.commit()
    return Message(detail="Deleted")


@router.post("/{survey_id}/respond", response_model=SurveyResponseRead)
async def submit_response(survey_id: str, body: SurveyResponseCreate, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey_pk = parse_uuid_param(survey_id, detail="Survey not found")
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if current.role == RoleEnum.LEARNER and not survey.is_active:
        raise HTTPException(status_code=404, detail="Survey not found")
    existing = db.scalar(
        select(SurveyResponse).where(SurveyResponse.survey_id == survey_pk, SurveyResponse.user_id == current.id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already responded")
    resp = SurveyResponse(survey_id=survey_pk, user_id=current.id, answers=body.answers)
    db.add(resp)
    db.commit()
    db.refresh(resp)
    return resp


@router.get("/{survey_id}/responses", response_model=list[SurveyResponseRead])
async def list_responses(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    survey_pk = parse_uuid_param(survey_id, detail="Survey not found")
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if current.role == RoleEnum.INSTRUCTOR and survey.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    return db.scalars(select(SurveyResponse).where(SurveyResponse.survey_id == survey_pk)).all()
