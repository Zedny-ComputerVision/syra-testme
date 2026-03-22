import base64
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import threading

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from ...api.deps import get_current_user, get_db_dep, parse_uuid_param
from ...core.config import get_settings
from ...models import Attempt, RoleEnum
from ...detection.face_verification import compute_face_signature, cosine_distance
from ...services.normalized_relations import exam_proctoring
from ...services.crypto_utils import encrypt_bytes
from ...services.supabase_storage import upload_bytes as upload_bytes_to_supabase
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

try:
    import pytesseract
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    pytesseract = None

try:
    import easyocr
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    easyocr = None

router = APIRouter()
logger = logging.getLogger(__name__)

EVIDENCE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage" / "identity"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
settings = get_settings()
ALLOW_TEST_BYPASS = settings.precheck_test_bypass_enabled
_ID_TOKEN_RE = re.compile(r"[A-Z0-9]{6,24}")
_HAAR_FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_TESSERACT_CONFIGURED = False
_TESSERACT_LOCK = threading.Lock()  # pytesseract is not thread-safe
_EASYOCR_READER = None
_EASYOCR_INIT_ATTEMPTED = False


def _decode_b64(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


def _brightness_score(img_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.clip(gray.mean() / 255.0, 0, 1))


def _extract_face_crop(img_bgr: np.ndarray) -> np.ndarray | None:
    box = _largest_face_box(img_bgr)
    if box is None:
        return None
    x, y, w, h = box
    pad = int(max(w, h) * 0.35)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(img_bgr.shape[1], x + w + pad)
    y1 = min(img_bgr.shape[0], y + h + pad)
    face_crop = img_bgr[y0:y1, x0:x1]
    if face_crop.size == 0:
        return None
    return face_crop


def _preprocess_id_image(img_bgr: np.ndarray) -> np.ndarray:
    """Preprocess an ID card photo for OCR: grayscale, denoise, adaptive threshold."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    # Bilateral filter preserves edges while removing noise
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    # CLAHE for contrast normalisation under uneven lighting
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    # Adaptive threshold handles glare / shadow gradients
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10,
    )
    return binary


def _tesseract_text(img_bgr: np.ndarray) -> dict:
    if pytesseract is None:
        return _easyocr_text(img_bgr, "pytesseract_not_installed")
    try:
        global _TESSERACT_CONFIGURED
        if not _TESSERACT_CONFIGURED:
            configured = os.getenv("TESSERACT_CMD", "").strip()
            if configured and Path(configured).exists():
                pytesseract.pytesseract.tesseract_cmd = configured
            elif os.name == "nt":
                default_win_path = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
                if default_win_path.exists():
                    pytesseract.pytesseract.tesseract_cmd = str(default_win_path)
            _TESSERACT_CONFIGURED = True
        _ = pytesseract.get_tesseract_version()
        # Run OCR on both raw and preprocessed image, merge results
        preprocessed = _preprocess_id_image(img_bgr)
        with _TESSERACT_LOCK:
            raw_txt = pytesseract.image_to_string(img_bgr)
            pre_txt = pytesseract.image_to_string(preprocessed, config="--psm 6")
        combined = raw_txt + "\n" + pre_txt
        lines = list(dict.fromkeys(l.strip() for l in combined.splitlines() if l.strip()))
        return {"raw": combined, "lines": lines[:30], "available": True, "error": None, "engine": "tesseract"}
    except Exception as exc:
        return _easyocr_text(img_bgr, str(exc))


def _easyocr_text(img_bgr: np.ndarray, prior_error: str | None = None) -> dict:
    global _EASYOCR_READER, _EASYOCR_INIT_ATTEMPTED
    if easyocr is None:
        return {
            "raw": "",
            "lines": [],
            "available": False,
            "error": prior_error or "easyocr_not_installed",
            "engine": None,
        }
    try:
        if _EASYOCR_READER is None:
            if _EASYOCR_INIT_ATTEMPTED:
                raise RuntimeError(prior_error or "easyocr_initialization_failed")
            _EASYOCR_READER = easyocr.Reader(["en"], gpu=False)
            _EASYOCR_INIT_ATTEMPTED = True
        lines = [str(line).strip() for line in _EASYOCR_READER.readtext(img_bgr, detail=0) if str(line).strip()]
        return {
            "raw": "\n".join(lines),
            "lines": lines[:20],
            "available": True,
            "error": prior_error,
            "engine": "easyocr",
        }
    except Exception as exc:
        _EASYOCR_INIT_ATTEMPTED = True
        return {
            "raw": "",
            "lines": [],
            "available": False,
            "error": prior_error or str(exc),
            "engine": None,
        }


def _largest_face_box(img_bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = _HAAR_FACE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(24, 24))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    return int(x), int(y), int(w), int(h)


def _fallback_face_signature(img_bgr: np.ndarray) -> list[float] | None:
    box = _largest_face_box(img_bgr)
    if box is None:
        return None
    x, y, w, h = box
    pad = int(max(w, h) * 0.25)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(img_bgr.shape[1], x + w + pad)
    y1 = min(img_bgr.shape[0], y + h + pad)
    face_crop = img_bgr[y0:y1, x0:x1]
    if face_crop.size == 0:
        return None
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
    gray = cv2.equalizeHist(gray)
    vec = gray.astype(np.float32).flatten()
    norm = float(np.linalg.norm(vec))
    if norm < 1e-6:
        return None
    vec = vec / norm
    return vec.tolist()


def _compute_signature_with_fallback(img_bgr: np.ndarray) -> tuple[list[float] | None, str]:
    raw = cv2.imencode(".jpg", img_bgr)[1].tobytes()
    vec = compute_face_signature(raw)
    if vec:
        return vec, "mediapipe"
    fallback = _fallback_face_signature(img_bgr)
    if fallback:
        return fallback, "haar"
    return None, "none"


def _normalized_id_text(text: str | None) -> str:
    if text is None:
        return ""
    compact = re.sub(r"\s+", "", str(text)).strip()
    return compact.upper()


def _build_id_text_payload(
    *,
    ocr_text: dict | None,
    ocr_candidates: list[str],
    manual_token: str | None,
    manual_valid: bool,
    method: str,
    ocr_available: bool,
    requirements=None,
) -> dict:
    payload = {
        "lines": (ocr_text or {}).get("lines", []) if isinstance(ocr_text, dict) else [],
        "ocr_candidates": ocr_candidates,
        "manual": manual_token or None,
        "manual_valid": manual_valid,
        "method": method,
        "raw_text": (ocr_text or {}).get("raw", "") if isinstance(ocr_text, dict) else "",
        "ocr_available": ocr_available,
    }
    if requirements is not None:
        payload["requirements"] = requirements
    return payload


def _looks_like_id_token(token: str) -> bool:
    if not token:
        return False
    cleaned = re.sub(r"[^A-Z0-9]", "", token.upper())
    if len(cleaned) < 6 or len(cleaned) > 24:
        return False
    digit_count = sum(ch.isdigit() for ch in cleaned)
    return digit_count >= 4


def _extract_id_candidates(ocr_text: dict) -> list[str]:
    text_pool = " ".join([*(ocr_text.get("lines") or []), ocr_text.get("raw") or ""])
    text_pool = text_pool.upper()
    tokens = [tok for tok in _ID_TOKEN_RE.findall(text_pool) if _looks_like_id_token(tok)]
    seen = set()
    out: list[str] = []
    for token in tokens:
        if token not in seen:
            seen.add(token)
            out.append(token)
    return out


def _normalize_for_matching(text: str) -> str:
    """Lowercase, strip accents/diacritics, collapse whitespace."""
    import unicodedata
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.lower().strip())


def _match_user_id_in_ocr(user_id: str, ocr_candidates: list[str], ocr_raw: str) -> dict:
    """Check if the user's student ID appears in OCR output.

    Returns {"matched": bool, "method": str, "matched_token": str|None}.
    """
    if not user_id:
        return {"matched": False, "method": "no_user_id", "matched_token": None}
    clean_uid = re.sub(r"[^A-Z0-9]", "", user_id.upper())
    if not clean_uid:
        return {"matched": False, "method": "no_user_id", "matched_token": None}
    # Exact match in OCR candidates
    for candidate in ocr_candidates:
        clean_candidate = re.sub(r"[^A-Z0-9]", "", candidate.upper())
        if clean_uid == clean_candidate:
            return {"matched": True, "method": "exact", "matched_token": candidate}
    # Substring match in raw OCR text (handles spaces/dashes in printed IDs)
    raw_upper = re.sub(r"[^A-Z0-9]", "", ocr_raw.upper())
    if clean_uid in raw_upper:
        return {"matched": True, "method": "substring", "matched_token": clean_uid}
    # Fuzzy: allow up to 1 char difference (OCR misread)
    if len(clean_uid) >= 6:
        for candidate in ocr_candidates:
            clean_candidate = re.sub(r"[^A-Z0-9]", "", candidate.upper())
            if len(clean_candidate) == len(clean_uid):
                diffs = sum(1 for a, b in zip(clean_uid, clean_candidate) if a != b)
                if diffs <= 1:
                    return {"matched": True, "method": "fuzzy_1", "matched_token": candidate}
    return {"matched": False, "method": "not_found", "matched_token": None}


def _match_user_name_in_ocr(user_name: str, ocr_raw: str) -> dict:
    """Check if the user's name appears in OCR output.

    Splits name into parts and checks how many appear in the OCR text.
    Returns {"matched": bool, "parts_found": int, "parts_total": int, "method": str}.
    """
    if not user_name or not ocr_raw:
        return {"matched": False, "parts_found": 0, "parts_total": 0, "method": "no_data"}
    norm_raw = _normalize_for_matching(ocr_raw)
    name_parts = [p for p in _normalize_for_matching(user_name).split() if len(p) >= 2]
    if not name_parts:
        return {"matched": False, "parts_found": 0, "parts_total": 0, "method": "no_name_parts"}
    found = sum(1 for part in name_parts if part in norm_raw)
    # Require at least half the name parts (handles middle names, OCR noise)
    threshold = max(1, len(name_parts) // 2)
    matched = found >= threshold
    return {
        "matched": matched,
        "parts_found": found,
        "parts_total": len(name_parts),
        "method": "name_parts",
    }


def _image_similarity_score(img_a: np.ndarray, img_b: np.ndarray) -> float:
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)
    gray_a = cv2.resize(gray_a, (96, 96), interpolation=cv2.INTER_AREA).astype(np.float32)
    gray_b = cv2.resize(gray_b, (96, 96), interpolation=cv2.INTER_AREA).astype(np.float32)
    va = gray_a.flatten()
    vb = gray_b.flatten()
    if np.std(va) < 1e-6 or np.std(vb) < 1e-6:
        mse = float(np.mean((va - vb) ** 2))
        return float(np.clip(1.0 - (mse / (255.0 ** 2)), 0.0, 1.0))
    corr = float(np.corrcoef(va, vb)[0, 1])
    if np.isnan(corr):
        return 0.0
    return float(np.clip((corr + 1.0) / 2.0, 0.0, 1.0))


def _has_document_outline(img_bgr: np.ndarray) -> bool:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 60, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False
    area_total = float(img_bgr.shape[0] * img_bgr.shape[1])
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < area_total * 0.08:
            continue
        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) == 4:
            return True
    return False


@router.post("/precheck/{attempt_id}")
async def precheck(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    nested_payload = payload.get("data") if isinstance(payload.get("data"), dict) else {}

    def _payload_value(key: str):
        if key in payload:
            return payload.get(key)
        return nested_payload.get(key)

    def _payload_flag(key: str, default: bool = True) -> bool:
        raw = _payload_value(key)
        if raw is None:
            return default
        if isinstance(raw, str):
            normalized = raw.strip().lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off"}:
                return False
        return bool(raw)

    def _payload_float(key: str, default: float = 0.0) -> float:
        raw = _payload_value(key)
        if raw is None:
            return default
        try:
            return float(raw)
        except (TypeError, ValueError):
            return default

    proctoring_payload = exam_proctoring(attempt.exam) if attempt and attempt.exam else {}
    requirements = get_proctoring_requirements(proctoring_payload)
    lighting_min = float((proctoring_payload or {}).get("lighting_min_score", 0.35))

    test_pass = _payload_flag("test_pass", default=False)
    if test_pass and (not requirements["identity_required"] or ALLOW_TEST_BYPASS):
        logger.warning("Precheck bypassed for attempt %s via test_pass flag", attempt_id)
        attempt.id_verified = True
        attempt.precheck_passed_at = datetime.now(timezone.utc)
        attempt.identity_verified = True
        db.add(attempt)
        db.commit()
        return {"status": "ok", "face_match_score": 0.0, "lighting_ok": True, "id_verified": True, "all_pass": True}

    manual_id_text = _payload_value("id_text") or _payload_value("id_number")
    manual_token = _normalized_id_text(manual_id_text)
    manual_valid = _looks_like_id_token(manual_token)

    mic_ok = _payload_flag("mic_ok", default=not requirements["mic_required"])
    cam_ok = _payload_flag("cam_ok", default=not requirements["camera_required"])
    fs_ok = _payload_flag("fs_ok", default=not requirements["fullscreen_required"])
    lighting_score = _payload_float("lighting_score", default=1.0)
    lighting_ok = lighting_score >= lighting_min

    match_score = 1.0
    face_match = True
    ocr_text = {"raw": "", "lines": [], "available": False, "error": None}
    ocr_candidates: list[str] = []
    ocr_available = False
    image_similarity = 0.0
    id_face_ratio = 0.0
    id_has_document_outline = True
    selfie_sig_mode = "none"
    id_sig_mode = "none"

    failure_reasons: list[str] = []
    if requirements["mic_required"] and not mic_ok:
        failure_reasons.append("MIC_CHECK_FAILED")
    if requirements["camera_required"] and not cam_ok:
        failure_reasons.append("CAMERA_CHECK_FAILED")
    if requirements["fullscreen_required"] and not fs_ok:
        failure_reasons.append("FULLSCREEN_REQUIRED")

    if ALLOW_TEST_BYPASS and requirements["identity_required"]:
        if requirements["lighting_required"] and not lighting_ok:
            failure_reasons.append("LOW_LIGHTING")
        logger.warning("Precheck bypassed for attempt %s via local dev bypass", attempt_id)
        all_pass = len(failure_reasons) == 0
        attempt.id_text = _build_id_text_payload(
            ocr_text=None,
            ocr_candidates=[],
            manual_token=manual_token,
            manual_valid=manual_valid,
            method="test_bypass",
            ocr_available=False,
            requirements=requirements,
        )
        attempt.id_verified = all_pass
        attempt.lighting_score = lighting_score
        attempt.precheck_passed_at = datetime.now(timezone.utc) if all_pass else None
        attempt.identity_verified = all_pass
        db.add(attempt)
        db.commit()
        return {
            "status": "ok",
            "requirements": requirements,
            "face_match_score": 0.0,
            "lighting_ok": lighting_ok,
            "id_verified": all_pass,
            "all_pass": all_pass,
            "failure_reasons": failure_reasons,
            "ocr_available": False,
            "ocr_candidates": [],
            "manual_id_valid": manual_valid,
            "id_selfie_similarity": 0.0,
            "id_face_ratio": 0.0,
            "id_document_outline": True,
            "signature_mode": {"selfie": "bypass", "id": "bypass"},
        }

    if requirements["identity_required"]:
        selfie_b64 = _payload_value("selfie_b64")
        id_b64 = _payload_value("id_b64")
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
        lighting_ok = lighting_score >= lighting_min

        selfie_vec, selfie_sig_mode = _compute_signature_with_fallback(selfie_img)
        id_crop = _extract_face_crop(id_img)
        id_vec, id_sig_mode = _compute_signature_with_fallback(id_crop if id_crop is not None else id_img)
        match_score = 1.0
        face_match = False
        threshold = float((proctoring_payload or {}).get("face_verify_id_threshold", 0.30))
        if selfie_vec is not None and id_vec is not None and len(selfie_vec) == len(id_vec):
            match_score = cosine_distance(np.array(selfie_vec, dtype=np.float32), np.array(id_vec, dtype=np.float32))
            face_match = match_score <= threshold

        ocr_text = _tesseract_text(id_img)
        ocr_candidates = _extract_id_candidates(ocr_text)
        ocr_available = bool(ocr_text.get("available"))
        id_evidence_ok = manual_valid or len(ocr_candidates) > 0

        # Smart identity matching: compare OCR output against user's student ID and name
        user = current
        ocr_raw = (ocr_text or {}).get("raw", "")
        id_match = _match_user_id_in_ocr(user.user_id, ocr_candidates, ocr_raw)
        name_match = _match_user_name_in_ocr(user.name, ocr_raw)
        identity_verified = id_match["matched"] or name_match["matched"]
        # If smart matching found the student, count that as valid ID evidence
        if identity_verified:
            id_evidence_ok = True

        image_similarity = _image_similarity_score(selfie_img, id_img)
        similarity_threshold = float((proctoring_payload or {}).get("id_selfie_similarity_threshold", 0.94))
        id_too_similar = image_similarity >= similarity_threshold

        id_face_box = _largest_face_box(id_img)
        if id_face_box is not None:
            _, _, fw, fh = id_face_box
            id_face_ratio = float((fw * fh) / max(1, id_img.shape[0] * id_img.shape[1]))
        max_face_ratio = float((proctoring_payload or {}).get("id_face_max_area_ratio", 0.22))
        id_looks_like_selfie = id_face_ratio >= max_face_ratio
        id_has_document_outline = _has_document_outline(id_img)

        strict_doc_checks = bool((proctoring_payload or {}).get("strict_id_document_checks", False))
        require_id_text = bool((proctoring_payload or {}).get("id_text_required", True))

        if requirements["lighting_required"] and not lighting_ok:
            failure_reasons.append("LOW_LIGHTING")
        if not face_match:
            failure_reasons.append("FACE_MATCH_FAILED")
        if require_id_text and not id_evidence_ok:
            failure_reasons.append("ID_TEXT_MISSING_OR_INVALID")
        if require_id_text and not ocr_available and not manual_valid:
            failure_reasons.append("OCR_UNAVAILABLE_AND_MANUAL_ID_REQUIRED")
        if strict_doc_checks and id_too_similar:
            failure_reasons.append("ID_IMAGE_TOO_SIMILAR_TO_SELFIE")
        if strict_doc_checks and id_looks_like_selfie:
            failure_reasons.append("ID_CAPTURE_LOOKS_LIKE_SELFIE")
        if strict_doc_checks and not id_has_document_outline:
            failure_reasons.append("ID_DOCUMENT_NOT_DETECTED")
        # Strict mode: require OCR text to match the user's registered identity
        require_identity_match = bool((proctoring_payload or {}).get("require_identity_match", False))
        if require_identity_match and not identity_verified:
            failure_reasons.append("IDENTITY_NOT_MATCHED")

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        selfie_filename = f"{attempt_id}_selfie_{ts}.bin"
        id_filename = f"{attempt_id}_id_{ts}.bin"
        selfie_bytes = encrypt_bytes(cv2.imencode(".jpg", selfie_img)[1].tobytes())
        id_bytes = encrypt_bytes(cv2.imencode(".jpg", id_img)[1].tobytes())
        if settings.MEDIA_STORAGE_PROVIDER == "supabase":
            stored_selfie = await upload_bytes_to_supabase("identity", selfie_filename, selfie_bytes, content_type="application/octet-stream")
            stored_id = await upload_bytes_to_supabase("identity", id_filename, id_bytes, content_type="application/octet-stream")
            attempt.selfie_path = str(stored_selfie.get("path") or selfie_filename)
            attempt.id_doc_path = str(stored_id.get("path") or id_filename)
        else:
            selfie_path = EVIDENCE_DIR / selfie_filename
            id_path = EVIDENCE_DIR / id_filename
            selfie_path.write_bytes(selfie_bytes)
            id_path.write_bytes(id_bytes)
            attempt.selfie_path = str(selfie_path)
            attempt.id_doc_path = str(id_path)
        attempt.id_text = _build_id_text_payload(
            ocr_text=ocr_text,
            ocr_candidates=ocr_candidates,
            manual_token=manual_token,
            manual_valid=manual_valid,
            method="manual" if manual_token else "ocr",
            ocr_available=ocr_available,
        )
    elif requirements["lighting_required"] and not lighting_ok:
        failure_reasons.append("LOW_LIGHTING")

    all_pass = len(failure_reasons) == 0

    if not requirements["identity_required"]:
        attempt.id_text = _build_id_text_payload(
            ocr_text=None,
            ocr_candidates=[],
            manual_token=manual_token,
            manual_valid=manual_valid,
            method="manual" if manual_token else "ocr",
            ocr_available=False,
            requirements=requirements,
        )
    attempt.id_verified = all_pass
    attempt.lighting_score = lighting_score
    attempt.precheck_passed_at = datetime.now(timezone.utc) if all_pass else None
    attempt.identity_verified = all_pass
    db.add(attempt)
    db.commit()

    # Build identity match results (only populated when identity check ran)
    identity_match_result = {}
    if requirements["identity_required"] and not (ALLOW_TEST_BYPASS):
        try:
            identity_match_result = {
                "id_number_match": id_match,
                "name_match": name_match,
                "identity_verified_by_ocr": identity_verified,
            }
        except NameError:
            pass

    return {
        "status": "ok",
        "requirements": requirements,
        "face_match_score": match_score,
        "lighting_ok": lighting_ok,
        "id_verified": all_pass,
        "all_pass": all_pass,
        "failure_reasons": failure_reasons,
        "ocr_available": ocr_available,
        "ocr_candidates": ocr_candidates,
        "manual_id_valid": manual_valid,
        "id_selfie_similarity": image_similarity,
        "id_face_ratio": id_face_ratio,
        "id_document_outline": id_has_document_outline,
        "signature_mode": {"selfie": selfie_sig_mode, "id": id_sig_mode},
        **identity_match_result,
    }
