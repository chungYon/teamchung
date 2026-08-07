import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import String, TypeDecorator


KEY_PATH = Path(__file__).with_name(".encryption.key")


def load_key() -> bytes:
    configured_key = os.getenv("DASOM_ENCRYPTION_KEY")
    if configured_key:
        return configured_key.encode("utf-8")
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes().strip()

    key = Fernet.generate_key()
    KEY_PATH.write_bytes(key)
    return key


fernet = Fernet(load_key())


def encrypt_value(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    return fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    try:
        return fernet.decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return value


class EncryptedString(TypeDecorator):
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_value(value)

    def process_result_value(self, value, dialect):
        return decrypt_value(value)