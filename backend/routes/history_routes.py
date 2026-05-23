"""
History API endpoints.

Blueprint: history_bp  → /api

GET  /api/devices/<id>/history       — fetch history records (with filters)
POST /api/devices/<id>/history       — bulk-save session history to DB
DELETE /api/devices/<id>/history     — clear all history for a device
GET  /api/devices/<id>/history/stats — aggregate stats (total, online %, avg RTT)
"""

import json
import logging
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import IntegrityError

from backend.extensions import db
from backend.models import Device, PingHistory

logger = logging.getLogger(__name__)

history_bp = Blueprint("history_bp", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# GET history
# ---------------------------------------------------------------------------

@history_bp.route("/devices/<int:device_id>/history", methods=["GET"])
def get_device_history(device_id: int):
    """Return history records for a device with optional query-string filters.

    Query parameters (all optional):
        status      — filter by status string (e.g. ``online``)
        check_type  — ``ping`` or ``snmp``
        date_from   — ISO 8601 lower bound (inclusive)
        date_to     — ISO 8601 upper bound (inclusive)
        sort_by     — column to sort by (default: ``timestamp``)
        sort_order  — ``asc`` or ``desc`` (default: ``desc``)
        limit       — max records to return (default: 500)
    """
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    query = PingHistory.query.filter_by(device_id=device_id)

    # Filters
    status = request.args.get("status")
    check_type = request.args.get("check_type")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    if status:
        query = query.filter(PingHistory.status == status)
    if check_type:
        query = query.filter(PingHistory.check_type == check_type)
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from.rstrip("Z"))
            query = query.filter(PingHistory.timestamp >= dt_from)
        except ValueError:
            return jsonify({"error": f"Invalid date_from format: {date_from}"}), 400
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to.rstrip("Z"))
            query = query.filter(PingHistory.timestamp <= dt_to)
        except ValueError:
            return jsonify({"error": f"Invalid date_to format: {date_to}"}), 400

    # Sorting
    sort_col = request.args.get("sort_by", "timestamp")
    sort_order = request.args.get("sort_order", "desc").lower()
    allowed_cols = {"timestamp", "status", "rtt_avg_ms", "check_type"}
    if sort_col not in allowed_cols:
        sort_col = "timestamp"
    col = getattr(PingHistory, sort_col)
    query = query.order_by(col.asc() if sort_order == "asc" else col.desc())

    # Limit
    try:
        limit = min(int(request.args.get("limit", 500)), 2000)
    except ValueError:
        limit = 500
    query = query.limit(limit)

    records = query.all()
    logger.info("GET history device %d → %d records", device_id, len(records))
    return jsonify([r.to_json() for r in records])


# ---------------------------------------------------------------------------
# POST history (bulk save from session)
# ---------------------------------------------------------------------------

@history_bp.route("/devices/<int:device_id>/history", methods=["POST"])
def save_device_history(device_id: int):
    """Bulk-save check records from the browser session into the database.

    Body: ``{"records": [{timestamp_iso, status, check_type, ...}, ...]}``
    """
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    body = request.get_json(silent=True)
    if not body or not isinstance(body.get("records"), list):
        return jsonify({"error": "Body must be {records: [...]}"}), 400

    saved = 0
    skipped = 0
    errors = []

    for item in body["records"]:
        ts_iso = item.get("timestamp_iso")
        status = item.get("status")
        check_type = item.get("check_type", "ping")

        if not ts_iso or not status:
            errors.append(f"Skipped: missing timestamp_iso or status in {item}")
            continue

        try:
            dt = datetime.fromisoformat(ts_iso.rstrip("Z")).replace(microsecond=0)
        except ValueError as exc:
            errors.append(f"Invalid timestamp_iso '{ts_iso}': {exc}")
            continue

        entry = PingHistory(
            device_id=device_id,
            timestamp=dt,
            status=status,
            check_type=check_type,
            rtt_avg_ms=item.get("rtt_avg_ms"),
            raw_output_snippet=item.get("raw_output_snippet"),
        )

        if check_type == "snmp":
            metrics = item.get("metrics")
            if metrics and isinstance(metrics, dict):
                entry.metrics_json = json.dumps(metrics)

        try:
            db.session.add(entry)
            db.session.flush()  # detect duplicates early
            saved += 1
        except IntegrityError:
            db.session.rollback()
            skipped += 1

    db.session.commit()
    logger.info("Save history device %d: saved=%d skipped=%d errors=%d", device_id, saved, skipped, len(errors))
    return jsonify({
        "message": f"Saved {saved}, skipped {skipped} duplicates.",
        "errors": errors or None,
    }), 201


# ---------------------------------------------------------------------------
# DELETE history
# ---------------------------------------------------------------------------

@history_bp.route("/devices/<int:device_id>/history", methods=["DELETE"])
def clear_device_history(device_id: int):
    """Delete all history records for a device."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    count = PingHistory.query.filter_by(device_id=device_id).delete()
    db.session.commit()
    logger.info("Cleared %d history records for device %d", count, device_id)
    return jsonify({"message": f"Deleted {count} records for device '{device.name}'."}), 200


# ---------------------------------------------------------------------------
# GET stats
# ---------------------------------------------------------------------------

@history_bp.route("/devices/<int:device_id>/history/stats", methods=["GET"])
def device_history_stats(device_id: int):
    """Return aggregate statistics for a device's history."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    records = PingHistory.query.filter_by(device_id=device_id).all()
    total = len(records)
    if total == 0:
        return jsonify({"total": 0, "online_pct": None, "avg_rtt_ms": None})

    online = sum(1 for r in records if r.status == "online")
    rtts = [r.rtt_avg_ms for r in records if r.rtt_avg_ms is not None]
    avg_rtt = round(sum(rtts) / len(rtts), 2) if rtts else None

    return jsonify({
        "total": total,
        "online_pct": round(online / total * 100, 1),
        "avg_rtt_ms": avg_rtt,
    })
