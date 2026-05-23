"""
Flask application factory.

Usage::

    from backend.app import create_app
    app = create_app()           # uses ActiveConfig from config.py
    app = create_app("testing")  # explicit profile
"""

import logging
import os

from flask import Flask, jsonify, request

from config import ActiveConfig, _config_map, BASE_DIR
from backend.extensions import db
from backend.routes.main_routes import main_bp
from backend.routes.device_routes import device_bp, ping_bp
from backend.routes.history_routes import history_bp

_FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


def create_app(config_name: str | None = None):
    """Create and configure the Flask application.

    Parameters
    ----------
    config_name:
        One of ``"development"``, ``"production"``, ``"testing"``.
        Defaults to ``FLASK_ENV`` environment variable, then ``"development"``.
    """
    app = Flask(__name__, static_folder=_FRONTEND_DIR, static_url_path="")

    # Load config
    config_class = _config_map.get(config_name or os.environ.get("FLASK_ENV", "development"), ActiveConfig)
    app.config.from_object(config_class)

    _configure_logging(app)
    _register_extensions(app)
    _register_blueprints(app)
    _register_error_handlers(app)

    with app.app_context():
        db.create_all()
        app.logger.info("Database tables ensured.")

    app.logger.info("App ready. Config: %s", config_class.__name__)
    return app


def _configure_logging(app: Flask) -> None:
    fmt = "%(asctime)s %(levelname)s [%(name)s]: %(message)s"
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(fmt))
    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.DEBUG if app.debug else logging.INFO)


def _register_extensions(app: Flask) -> None:
    db.init_app(app)


def _register_blueprints(app: Flask) -> None:
    app.register_blueprint(main_bp)
    app.register_blueprint(device_bp)
    app.register_blueprint(ping_bp)
    app.register_blueprint(history_bp)


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(404)
    def not_found(error):
        app.logger.warning("404 %s %s", request.method, request.url)
        return jsonify({"error": "Resource not found", "status_code": 404}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({"error": "Method not allowed", "status_code": 405}), 405

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error("500 %s %s — %s", request.method, request.url, error)
        db.session.rollback()
        return jsonify({"error": "Internal server error", "status_code": 500}), 500
