import hashlib
import secrets
from .config import get_settings


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = _pbkdf2(password, salt)
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    return secrets.compare_digest(_pbkdf2(password, salt), digest)


def _pbkdf2(password: str, salt: str) -> str:
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        (get_settings().secret_key + salt).encode("utf-8"),
        120_000,
    )
    return key.hex()
