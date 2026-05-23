"""
Device and ping/SNMP/SSH API endpoints.

Blueprints
----------
device_bp  — /api/devices  (CRUD + SNMP + SSH)
ping_bp    — /api          (ping one / ping all)
"""

import logging

import pingparsing
import paramiko
from datetime import datetime, timezone
from flask import Blueprint, current_app, jsonify, request
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError

from backend.extensions import db
from backend.models import Device
from backend.schemas import DeviceSchema, DeviceUpdateSchema
from backend.security import decrypt_password, encrypt_password
from backend.utils import perform_ping, get_snmp_data

logger = logging.getLogger(__name__)

device_bp = Blueprint("device_bp", __name__, url_prefix="/api/devices")
ping_bp = Blueprint("ping_bp", __name__, url_prefix="/api")

_device_schema = DeviceSchema()
_device_update_schema = DeviceUpdateSchema()
_ping_parser = pingparsing.PingParsing()

# OIDs fetched for every SNMP check
_DEFAULT_OIDS = {
    "sysDescr":    "1.3.6.1.2.1.1.1.0",
    "sysUpTime":   "1.3.6.1.2.1.1.3.0",
    "laLoad1":     "1.3.6.1.4.1.2021.10.1.3.1",
    "memAvailReal": "1.3.6.1.4.1.2021.4.6.0",
}


# ---------------------------------------------------------------------------
# Device CRUD
# ---------------------------------------------------------------------------

@device_bp.route("", methods=["GET"])
def get_devices():
    """Return all registered devices."""
    devices = Device.query.all()
    logger.info("GET /api/devices → %d devices", len(devices))
    return jsonify([d.to_json() for d in devices])


@device_bp.route("/<int:device_id>", methods=["GET"])
def get_device(device_id: int):
    """Return a single device by ID."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
    return jsonify(device.to_json())


@device_bp.route("", methods=["POST"])
def add_device():
    """Create a new device. Body: DeviceSchema fields."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    try:
        validated = _device_schema.load(data)
    except ValidationError as exc:
        logger.warning("add_device validation error: %s", exc.messages)
        return jsonify({"errors": exc.messages}), 400

    # Encrypt SSH password before persisting
    ssh_password = validated.pop("ssh_password", None)
    validated["ssh_password_encrypted"] = (
        encrypt_password(ssh_password) if ssh_password else None
    )

    # Clear SSH credentials if SSH is disabled
    if not validated.get("ssh_enabled"):
        validated["ssh_username"] = None
        validated["ssh_password_encrypted"] = None

    new_device = Device(**validated)
    db.session.add(new_device)
    try:
        db.session.commit()
        logger.info("Device created: %s (%s)", new_device.name, new_device.ip_address)
        return jsonify(_device_schema.dump(new_device)), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": f"Device with IP {validated['ip_address']} already exists."}), 409


@device_bp.route("/<int:device_id>", methods=["PUT"])
def update_device(device_id: int):
    """Update an existing device (partial update supported)."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    try:
        validated = _device_update_schema.load(data, partial=True)
    except ValidationError as exc:
        return jsonify({"errors": exc.messages}), 400

    ssh_password = validated.pop("ssh_password", None)
    if ssh_password is not None:
        validated["ssh_password_encrypted"] = encrypt_password(ssh_password)

    for field, value in validated.items():
        setattr(device, field, value)

    if not device.ssh_enabled:
        device.ssh_username = None
        device.ssh_password_encrypted = None

    try:
        db.session.commit()
        logger.info("Device updated: ID %d", device_id)
        return jsonify(device.to_json())
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "IP address conflict with another device."}), 409


@device_bp.route("/<int:device_id>", methods=["DELETE"])
def delete_device(device_id: int):
    """Delete a device and all its history records."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    name = device.name
    db.session.delete(device)
    db.session.commit()
    logger.info("Device deleted: ID %d (%s)", device_id, name)
    return jsonify({"message": f"Device '{name}' deleted."}), 200


# ---------------------------------------------------------------------------
# SNMP
# ---------------------------------------------------------------------------

@device_bp.route("/<int:device_id>/snmp", methods=["POST"])
def snmp_check(device_id: int):
    """Run an SNMP check against a device and return metrics."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    if not device.snmp_enabled:
        return jsonify({"error": "SNMP is not enabled for this device."}), 400

    if device.snmp_version not in (1, 2):
        return jsonify({
            "error": f"Unsupported SNMP version: {device.snmp_version}",
            "overall_status": "config_error",
        }), 400

    overall_status, metrics, error_msg = get_snmp_data(
        host=device.ip_address,
        community=device.snmp_community or "public",
        snmp_version=device.snmp_version,
        port=device.snmp_port or 161,
        oids_map=_DEFAULT_OIDS,
    )

    payload = {"overall_status": overall_status, "metrics": metrics or {}}
    if error_msg:
        payload["error"] = error_msg

    logger.info("SNMP check ID %d → %s", device_id, overall_status)
    return jsonify(payload), 200


# ---------------------------------------------------------------------------
# SSH
# ---------------------------------------------------------------------------

@device_bp.route("/<int:device_id>/ssh/command", methods=["POST"])
def execute_ssh_command(device_id: int):
    """Execute a shell command on a device via SSH."""
    device = db.session.get(Device, device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    if not device.ssh_enabled:
        return jsonify({"error": "SSH is not enabled for this device."}), 400

    if not device.ssh_username or not device.ssh_password_encrypted:
        return jsonify({"error": "SSH credentials are not configured."}), 400

    data = request.get_json(silent=True) or {}
    command = data.get("command", "").strip()
    if not command:
        return jsonify({"error": "No command provided."}), 400

    ssh_password = decrypt_password(device.ssh_password_encrypted)
    if not ssh_password:
        logger.error("SSH decrypt failed for device ID %d", device_id)
        return jsonify({"error": "Failed to retrieve SSH credentials."}), 500

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=device.ip_address,
            username=device.ssh_username,
            password=ssh_password,
            timeout=10,
        )
        stdin, stdout, stderr = client.exec_command(command, timeout=15)
        output = stdout.read().decode("utf-8", errors="replace")
        err_out = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()

        logger.info("SSH command on device %d exit=%d", device_id, exit_code)
        return jsonify({
            "device_id": device_id,
            "command": command,
            "output": output,
            "error": err_out,
            "exit_status": exit_code,
        }), 200

    except paramiko.AuthenticationException:
        return jsonify({"error": "SSH authentication failed."}), 401
    except paramiko.SSHException as exc:
        return jsonify({"error": f"SSH error: {exc}"}), 500
    except TimeoutError:
        return jsonify({"error": "SSH connection timed out."}), 408
    except Exception as exc:
        logger.error("SSH unexpected error device %d: %s", device_id, exc, exc_info=True)
        return jsonify({"error": "Internal server error during SSH command."}), 500
    finally:
        client.close()


# ---------------------------------------------------------------------------
# Ping endpoints (separate blueprint)
# ---------------------------------------------------------------------------

def _build_ping_result(device: Device | None, host_ip: str, status: str, raw: str) -> dict:
    result = {
        "host_ip": host_ip,
        "status": status,
        "rtt_avg_ms": None,
        "raw_output_snippet": (raw[:250] + "…") if len(raw) > 250 else raw,
    }
    if device:
        result.update({"id": device.id, "name": device.name, "ip_address": device.ip_address})

    if status == "online":
        try:
            result["rtt_avg_ms"] = _ping_parser.parse(raw).as_dict().get("rtt_avg")
        except Exception as exc:
            logger.warning("RTT parse failed for %s: %s", host_ip, exc)
            result["status"] = "online_parsing_error"
    return result


@ping_bp.route("/ping", methods=["POST"])
def ping_one():
    """Ping a single device. Body: {device_id} or {ip_address}."""
    data = request.get_json(silent=True) or {}

    if "device_id" in data:
        device = db.session.get(Device, data["device_id"])
        if not device:
            return jsonify({"error": f"Device ID {data['device_id']} not found"}), 404
        host_ip = device.ip_address
    elif "ip_address" in data:
        host_ip = data["ip_address"]
        device = Device.query.filter_by(ip_address=host_ip).first()
    else:
        return jsonify({"error": "Provide 'device_id' or 'ip_address'"}), 400

    logger.info("Ping one: %s", host_ip)
    status, raw = perform_ping(host_ip)
    return jsonify(_build_ping_result(device, host_ip, status, raw))


@ping_bp.route("/ping_all", methods=["POST"])
def ping_all():
    """Ping every registered device and return results array."""
    devices = Device.query.all()
    if not devices:
        return jsonify({"message": "No devices registered.", "results": []}), 200

    results = []
    for device in devices:
        status, raw = perform_ping(device.ip_address)
        results.append(_build_ping_result(device, device.ip_address, status, raw))

    logger.info("Ping all: %d devices checked", len(results))
    return jsonify({"message": f"{len(results)} devices checked.", "results": results})
