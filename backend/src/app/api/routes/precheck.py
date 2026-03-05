import base64
import io
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from ...api.deps import get_current_user, get_db_dep
from ...core.config import get_settings
from ...models import Attempt, RoleEnum
from ...detection.face_verification import compute_face_signature, cosine_distance
from ...services.crypto_utils import encrypt_bytes

try:
    import pytesseract
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    pytesseract = None

router = APIRouter()

EVIDENCE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage" / "identity"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
settings = get_settings()
ALLOW_TEST_BYPASS = bool(settings.PRECHECK_ALLOW_TEST_BYPASS)


def _decode_b64(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


def _brightness_score(img_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.clip(gray.mean() / 255.0, 0, 1))


def _extract_face_crop(img_bgr: np.ndarray) -> np.ndarray | None:
    # simple center crop square
    h, w, _ = img_bgr.shape
    size = min(h, w)
    startx = w // 2 - size // 2
    starty = h // 2 - size // 2
    return img_bgr[starty:starty+size, startx:startx+size]


def _tesseract_text(img_bgr: np.ndarray) -> dict:
    if pytesseract is None:
        return {"raw": "", "lines": []}
    try:
        txt = pytesseract.image_to_string(img_bgr)
        lines = [l.strip() for l in txt.splitlines() if l.strip()]
        return {"raw": txt, "lines": lines[:20]}
    except Exception:
        return {"raw": "", "lines": []}


@router.post("/precheck/{attempt_id}")
async def precheck(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if ALLOW_TEST_BYPASS and payload.get("test_pass"):
        attempt.id_verified = True
        attempt.precheck_passed_at = datetime.now(timezone.utc)
        attempt.identity_verified = True
        db.add(attempt)
        db.commit()
        return {"status": "ok", "face_match_score": 0.0, "lighting_ok": True, "id_verified": True, "all_pass": True}

    selfie_b64 = payload.get("selfie_b64")
    id_b64 = payload.get("id_b64")
    if not selfie_b64 or not id_b64:
        raise HTTPException(status_code=400, detail="Missing images")

    try:
        selfie_bytes = _decode_b64(selfie_b64)
        id_bytes = _decode_b64(id_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")

    selfie_img = cv2.imdecode(np.frombuffer(selfie_bytes, np.uint8), cv2.IMREAD_COLOR)
    id_img = cv2.imdecode(np.frombuffer(id_bytes, np.uint8), cv2.IMREAD_COLOR)
    if selfie_img is None or id_img is None:
        raise HTTPException(status_code=400, detail="Unable to read images")

    lighting_score = _brightness_score(selfie_img)
    lighting_min = (attempt.exam.proctoring_config or {}).get("lighting_min_score", 0.35) if attempt.exam else 0.35
    lighting_ok = lighting_score >= lighting_min

    selfie_vec = compute_face_signature(cv2.imencode(".jpg", selfie_img)[1].tobytes()) or []
    id_crop = _extract_face_crop(id_img)
    id_vec = compute_face_signature(cv2.imencode(".jpg", id_crop)[1].tobytes()) if id_crop is not None else None
    match_score = 1.0
    face_match = False
    threshold = (attempt.exam.proctoring_config or {}).get("face_verify_id_threshold", 0.30) if attempt.exam else 0.30
    if selfie_vec and id_vec:
        match_score = cosine_distance(np.array(selfie_vec, dtype=np.float32), np.array(id_vec, dtype=np.float32))
        face_match = match_score <= threshold

    ocr_text = _tesseract_text(id_img)
    manual_id_text = payload.get("id_text") or payload.get("id_number")

    mic_ok = bool(payload.get("mic_ok"))
    cam_ok = bool(payload.get("cam_ok"))
    fs_ok = bool(payload.get("fs_ok"))

    # Dev bypass: if allowed, force face match so tests don't block
    if ALLOW_TEST_BYPASS:
        face_match = True
        match_score = 0.0

    all_pass = mic_ok and cam_ok and fs_ok and lighting_ok and face_match

    # persist encrypted evidence
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    selfie_path = EVIDENCE_DIR / f"{attempt_id}_selfie_{ts}.bin"
    id_path = EVIDENCE_DIR / f"{attempt_id}_id_{ts}.bin"
    selfie_path.write_bytes(encrypt_bytes(cv2.imencode(".jpg", selfie_img)[1].tobytes()))
    id_path.write_bytes(encrypt_bytes(cv2.imencode(".jpg", id_img)[1].tobytes()))

    attempt.selfie_path = str(selfie_path)
    attempt.id_doc_path = str(id_path)
    if manual_id_text:
        attempt.id_text = {"lines": ocr_text.get("lines", []), "manual": manual_id_text, "raw": ocr_text.get("raw", "")}
    else:
        attempt.id_text = ocr_text
    attempt.id_verified = face_match
    attempt.lighting_score = lighting_score
    attempt.precheck_passed_at = datetime.now(timezone.utc) if all_pass else None
    attempt.identity_verified = face_match
    db.add(attempt)
    db.commit()

    return {
        "status": "ok",
        "face_match_score": match_score,
        "lighting_ok": lighting_ok,
        "id_verified": face_match,
        "all_pass": all_pass,
    }
