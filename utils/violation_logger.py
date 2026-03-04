from pathlib import Path


def log_violation(text: str):
    log_path = Path("backend/storage/evidence/violations.log")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(text + "\n")
