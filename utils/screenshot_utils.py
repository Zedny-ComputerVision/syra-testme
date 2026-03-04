from pathlib import Path
from datetime import datetime


def save_screenshot(frame_bytes: bytes, attempt_id: str) -> str:
    evidence_dir = Path("backend/storage/evidence")
    evidence_dir.mkdir(parents=True, exist_ok=True)
    filename = evidence_dir / f"{attempt_id}_{datetime.utcnow().timestamp()}.jpg"
    filename.write_bytes(frame_bytes)
    return str(filename)
