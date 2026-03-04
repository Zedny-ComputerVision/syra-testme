from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Survey, SurveyResponse, RoleEnum
from ...schemas import SurveyCreate, SurveyRead, SurveyResponseCreate, SurveyResponseRead, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=SurveyRead)
async def create_survey(body: SurveyCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    survey = Survey(title=body.title, description=body.description, questions=body.questions, created_by_id=current.id)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.get("/", response_model=list[SurveyRead])
async def list_surveys(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Survey)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Survey.is_active == True)
    return db.scalars(query).all()


@router.get("/{survey_id}", response_model=SurveyRead)
async def get_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.delete("/{survey_id}", response_model=Message)
async def delete_survey(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    db.delete(survey)
    db.commit()
    return Message(detail="Deleted")


@router.post("/{survey_id}/respond", response_model=SurveyResponseRead)
async def submit_response(survey_id: str, body: SurveyResponseCreate, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    existing = db.scalar(
        select(SurveyResponse).where(SurveyResponse.survey_id == survey_id, SurveyResponse.user_id == current.id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already responded")
    resp = SurveyResponse(survey_id=survey_id, user_id=current.id, answers=body.answers)
    db.add(resp)
    db.commit()
    db.refresh(resp)
    return resp


@router.get("/{survey_id}/responses", response_model=list[SurveyResponseRead])
async def list_responses(survey_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(SurveyResponse).where(SurveyResponse.survey_id == survey_id)).all()
