from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models import Survey, SurveyResponse, RoleEnum
from ...schemas import SurveyCreate, SurveyUpdate, SurveyRead, SurveyResponseCreate, SurveyResponseRead, Message
from ...services.normalized_relations import replace_survey_questions, serialize_survey_questions
from ...services.sanitization import sanitize_plain_text
from ...core.i18n import translate as _t
from ..deps import ensure_permission, get_current_user, get_db_dep, parse_uuid_param, require_permission

router = APIRouter()

QUESTION_TYPES = {"TEXT", "MCQ", "MULTI_SELECT", "RATING", "BOOLEAN"}
CHOICE_TYPES = {"MCQ", "MULTI_SELECT"}


def _clean_required_text(value: str | None, field_name: str) -> str:
    text = sanitize_plain_text(str(value or "").strip()) or ""
    if not text:
        raise HTTPException(status_code=422, detail=_t("field_required", field_name=field_name))
    return text


def _clean_optional_text(value: str | None) -> str | None:
    text = sanitize_plain_text(str(value or "").strip()) or ""
    return text or None


def _normalize_questions(raw_questions) -> list[dict]:
    if not isinstance(raw_questions, list):
        raise HTTPException(status_code=422, detail=_t("questions_must_be_list"))
    cleaned_questions: list[dict] = []
    for index, raw_question in enumerate(raw_questions, start=1):
        if not isinstance(raw_question, dict):
            raise HTTPException(status_code=422, detail=f"Question {index} is invalid")
        text = sanitize_plain_text(str(raw_question.get("text") or "").strip()) or ""
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
            options = [sanitize_plain_text(str(option or "").strip()) or "" for option in (raw_question.get("options") or [])]
            options = [option for option in options if option]
            if len(options) < 2:
                raise HTTPException(status_code=422, detail=f"Question {index} needs at least two options")
            question_payload["options"] = options
        cleaned_questions.append(question_payload)
    if not cleaned_questions:
        raise HTTPException(status_code=422, detail=_t("add_at_least_one_q"))
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


def _build_survey_read(survey: Survey) -> SurveyRead:
    return SurveyRead(
        id=survey.id,
        title=survey.title,
        description=survey.description,
        questions=serialize_survey_questions(survey),
        is_active=survey.is_active,
        created_by_id=survey.created_by_id,
        created_at=survey.created_at,
        updated_at=survey.updated_at,
    )


def _validate_response_payload(survey: Survey, survey_id: str, body: SurveyResponseCreate) -> dict:
    if str(body.survey_id) != str(survey_id):
        raise HTTPException(status_code=422, detail=_t("survey_id_mismatch"))
    answers = {} if body.answers is None else body.answers
    if not isinstance(answers, dict):
        raise HTTPException(status_code=422, detail=_t("answers_must_be_object"))
    expected_keys = {
        str(question.get("text") or "").strip()
        for question in serialize_survey_questions(survey)
        if str(question.get("text") or "").strip()
    }
    unknown_keys = sorted(key for key in answers.keys() if str(key) not in expected_keys)
    if unknown_keys:
        raise HTTPException(status_code=422, detail=_t("answers_unknown_questions"))
    return answers


@router.post("/", response_model=SurveyRead)
def create_survey(body: SurveyCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    payload = _normalize_survey_payload(body.model_dump(), partial=False)
    questions = payload.pop("questions", [])
    survey = Survey(created_by_id=current.id, **payload)
    replace_survey_questions(survey, questions)
    db.add(survey)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_t("survey_already_exists"))
    db.refresh(survey)
    return _build_survey_read(survey)


@router.get("/", response_model=list[SurveyRead])
def list_surveys(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Survey)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Survey.is_active.is_(True))
    else:
        ensure_permission(db, current, "Edit Tests")
    surveys = db.scalars(query.order_by(Survey.created_at.desc())).all()
    return [_build_survey_read(survey) for survey in surveys]


@router.get("/{survey_id}", response_model=SurveyRead)
def get_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey_pk = parse_uuid_param(survey_id, detail=_t("survey_not_found"))
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    if current.role == RoleEnum.LEARNER and not survey.is_active:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "Edit Tests")
    return _build_survey_read(survey)


@router.put("/{survey_id}", response_model=SurveyRead)
def update_survey(
    survey_id: str,
    body: SurveyUpdate,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    survey_pk = parse_uuid_param(survey_id, detail=_t("survey_not_found"))
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    if current.role == RoleEnum.INSTRUCTOR and survey.created_by_id != current.id:
        raise HTTPException(status_code=403, detail=_t("not_allowed"))
    payload = _normalize_survey_payload(body.model_dump(exclude_unset=True), partial=True)
    questions = payload.pop("questions", None)
    for field, value in payload.items():
        setattr(survey, field, value)
    if questions is not None:
        for item in list(survey.question_items or []):
            db.delete(item)
        survey.question_items = []
        db.flush()
        replace_survey_questions(survey, questions)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return _build_survey_read(survey)


@router.delete("/{survey_id}", response_model=Message)
def delete_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    survey_pk = parse_uuid_param(survey_id, detail=_t("survey_not_found"))
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    db.delete(survey)
    db.commit()
    return Message(detail=_t("deleted"))


@router.post("/{survey_id}/respond", response_model=SurveyResponseRead)
def submit_response(survey_id: str, body: SurveyResponseCreate, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey_pk = parse_uuid_param(survey_id, detail=_t("survey_not_found"))
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    if current.role == RoleEnum.LEARNER and not survey.is_active:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    existing = db.scalar(
        select(SurveyResponse).where(SurveyResponse.survey_id == survey_pk, SurveyResponse.user_id == current.id)
    )
    if existing:
        raise HTTPException(status_code=409, detail=_t("already_responded"))
    answers = _validate_response_payload(survey, survey_pk, body)
    resp = SurveyResponse(survey_id=survey_pk, user_id=current.id, answers=answers)
    db.add(resp)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_t("already_responded"))
    db.refresh(resp)
    return resp


@router.get("/{survey_id}/responses", response_model=list[SurveyResponseRead])
def list_responses(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    survey_pk = parse_uuid_param(survey_id, detail=_t("survey_not_found"))
    survey = db.get(Survey, survey_pk)
    if not survey:
        raise HTTPException(status_code=404, detail=_t("survey_not_found"))
    if current.role == RoleEnum.INSTRUCTOR and survey.created_by_id != current.id:
        raise HTTPException(status_code=403, detail=_t("not_allowed"))
    return db.scalars(select(SurveyResponse).where(SurveyResponse.survey_id == survey_pk)).all()
