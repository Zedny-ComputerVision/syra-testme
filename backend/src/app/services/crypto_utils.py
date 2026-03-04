import base64
import os
from cryptography.fernet import Fernet, InvalidToken

_raw_key = os.environ.get("EVIDENCE_KEY")
_fernet = None
if _raw_key:
    try:
        # Accept raw 32-byte urlsafe base64 or plain text; normalize
        key = _raw_key.encode()
        if len(key) != 44:  # not already fernet formatted
            key = base64.urlsafe_b64encode(key.ljust(32, b"0")[:32])
        _fernet = Fernet(key)
    except Exception:
        _fernet = None


def encrypt_bytes(data: bytes) -> bytes:
    if not _fernet:
        return data
    return _fernet.encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    if not _fernet:
        return data
    try:
        return _fernet.decrypt(data)
    except InvalidToken:
        return b""
