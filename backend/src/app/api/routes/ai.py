from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...core.config import get_settings

router = APIRouter()


class GenerateRequest(BaseModel):
    topic: str = Field(..., description="Subject or chapter to generate questions for")
    count: int = Field(5, ge=1, le=20)
    difficulty: str | None = Field(None, description="e.g., easy|medium|hard")
    question_type: str = Field("MCQ", description="MCQ or TEXT")


class GeneratedQuestion(BaseModel):
    text: str
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


@router.post("/generate-questions", response_model=list[GeneratedQuestion])
async def generate_questions(body: GenerateRequest):
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured on server")

    try:
        from openai import OpenAI
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"OpenAI client missing: {exc}") from exc

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = (
        "You are an exam generator. Produce concise questions only. "
        "Return JSON list with fields: text, options (array of 4 strings for MCQ; omit for TEXT), "
        "correct_answer (must be EXACTLY one of the options for MCQ, or a short key phrase for TEXT), "
        "explanation (1 sentence). Keep language clear and neutral."
    )

    user_prompt = (
        f"Topic: {body.topic}\n"
        f"Difficulty: {body.difficulty or 'mixed'}\n"
        f"Count: {body.count}\n"
        f"Type: {body.question_type}\n"
        "Output JSON only."
    )

    try:
        completion = client.responses.create(
          model="gpt-4o-mini",
          messages=[
              {"role": "system", "content": system_prompt},
              {"role": "user", "content": user_prompt},
          ],
          temperature=0.7,
          max_output_tokens=1200,
          response_format={"type": "json_object"},
        )
        content = completion.output_text
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model error: {exc}") from exc

    import json

    try:
        data = json.loads(content)
        # Accept either list or {"questions":[...]}
        questions = data.get("questions") if isinstance(data, dict) else data
        parsed = []
        for q in questions:
            parsed.append(GeneratedQuestion.model_validate({
                "text": q.get("text") or q.get("question"),
                "options": q.get("options"),
                "correct_answer": q.get("correct_answer"),
                "explanation": q.get("explanation"),
            }))
        return parsed
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not parse model output: {exc}") from exc
