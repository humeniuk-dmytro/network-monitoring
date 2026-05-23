"""Main blueprint — serves the frontend SPA entry point."""

import os
from flask import Blueprint, send_from_directory

main_bp = Blueprint("main_bp", __name__)

_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_FRONTEND_DIR = os.path.join(_BASE_DIR, "frontend")


@main_bp.route("/")
def index():
    """Serve the main SPA page."""
    return send_from_directory(_FRONTEND_DIR, "index.html")


@main_bp.route("/device_history.html")
def device_history():
    """Serve the device history sub-page."""
    return send_from_directory(_FRONTEND_DIR, "device_history.html")
