"""
SSH credential encryption utilities.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
The Fernet key is derived from SSH_ENCRYPTION_SECRET and
PASSWORD_SALT_SSH via PBKDF2-HMAC-SHA256 with 100,000 iterations.

Usage::

    from backend.security import encrypt_password, decrypt_password

    encrypted = encrypt_password("hunter2")
    plaintext = decrypt_password(encrypted)
"""

import logging
import os
from base64 import urlsafe_b64encode

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# These are read at import time so they are resolved once per process.
_SECRET: str = os.environ.get(
    "SSH_ENCRYPTION_SECRET", "dev-encryption-secret-change-in-production"
)
_SALT: bytes = os.environ.get(
    "PASSWORD_SALT_SSH", "dev-salt-change-in-production"
).encode()


def _derive_fernet_key(secret: str, salt: bytes) -> bytes:
    """Derive a 32-byte URL-safe base64 key suitable for Fernet."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    return urlsafe_b64encode(kdf.derive(secret.encode()))


_FERNET = Fernet(_derive_fernet_key(_SECRET, _SALT))


def encrypt_password(password: str | None) -> str | None:
    """Encrypt *password* and return the ciphertext as a UTF-8 string.

    Returns ``None`` if *password* is falsy.
    """
    if not password:
        return None
    return _FERNET.encrypt(password.encode()).decode()


def decrypt_password(ciphertext: str | None) -> str | None:
    """Decrypt *ciphertext* and return the plaintext password.

    Returns ``None`` if *ciphertext* is falsy or decryption fails
    (e.g. the key has been rotated since the password was stored).
    """
    if not ciphertext:
        return None
    try:
        return _FERNET.decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception) as exc:
        logger.error("Password decryption failed: %s", exc)
        return None
