"""
Application configuration.

Uses environment variables (loaded from .env by python-dotenv).
Three profiles:
  - DevelopmentConfig  (FLASK_ENV=development, default)
  - ProductionConfig   (FLASK_ENV=production)
  - TestingConfig      (FLASK_ENV=testing)
"""

import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_DIR = os.path.join(BASE_DIR, "database")
os.makedirs(DATABASE_DIR, exist_ok=True)


class Config:
    # Security
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    # Database
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(DATABASE_DIR, 'network_devices.db')}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # SSH credential encryption
    SSH_ENCRYPTION_SECRET: str = os.environ.get(
        "SSH_ENCRYPTION_SECRET", "dev-encryption-secret-change-in-production"
    )
    PASSWORD_SALT_SSH: bytes = os.environ.get(
        "PASSWORD_SALT_SSH", "dev-salt-change-in-production"
    ).encode()

    # Ping timeouts
    PING_PACKET_COUNT_LINUX: int = int(os.environ.get("PING_PACKET_COUNT_LINUX", 2))
    PING_TIMEOUT_SEC_LINUX: int = int(os.environ.get("PING_TIMEOUT_SEC_LINUX", 1))
    PING_PACKET_COUNT_WINDOWS: int = int(os.environ.get("PING_PACKET_COUNT_WINDOWS", 2))
    PING_TIMEOUT_MS_WINDOWS: int = int(os.environ.get("PING_TIMEOUT_MS_WINDOWS", 1000))
    PING_COMMUNICATE_TIMEOUT: int = int(os.environ.get("PING_COMMUNICATE_TIMEOUT", 3))


class DevelopmentConfig(Config):
    DEBUG: bool = True
    SQLALCHEMY_ECHO: bool = False  # Set True to log all SQL queries


class ProductionConfig(Config):
    DEBUG: bool = False

    def __init__(self):
        # Fail fast if critical secrets are not set
        required = ("SECRET_KEY", "SSH_ENCRYPTION_SECRET", "PASSWORD_SALT_SSH")
        missing = [k for k in required if os.environ.get(k) is None]
        if missing:
            raise EnvironmentError(
                f"Missing required environment variables for production: {missing}"
            )


class TestingConfig(Config):
    TESTING: bool = True
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///:memory:"
    WTF_CSRF_ENABLED: bool = False


_config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}

ActiveConfig = _config_map.get(os.environ.get("FLASK_ENV", "development"), DevelopmentConfig)
