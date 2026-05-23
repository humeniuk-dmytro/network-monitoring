"""
SQLAlchemy ORM models.

Tables
------
Device       — managed network devices
PingHistory  — timestamped ping / SNMP check records per device
"""

import json
from datetime import datetime, timezone

from backend.extensions import db


class Device(db.Model):
    """A network device managed by this system."""

    __tablename__ = "device"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(45), unique=True, nullable=False)  # IPv4 or IPv6

    # SNMP settings
    snmp_enabled = db.Column(db.Boolean, default=False, nullable=False)
    snmp_version = db.Column(db.Integer, nullable=True)       # 1 = v1, 2 = v2c
    snmp_community = db.Column(db.String(100), nullable=True)
    snmp_port = db.Column(db.Integer, default=161, nullable=True)

    # SSH settings (password stored encrypted)
    ssh_enabled = db.Column(db.Boolean, default=False, nullable=False)
    ssh_username = db.Column(db.String(100), nullable=True)
    ssh_password_encrypted = db.Column(db.String(255), nullable=True)

    # Cascade-delete history when device is removed
    history_records = db.relationship(
        "PingHistory",
        backref=db.backref("device", lazy=True),
        lazy=True,
        cascade="all, delete-orphan",
    )

    def to_json(self) -> dict:
        """Serialize to a dict safe to return via the REST API.

        Note: ssh_password_encrypted is intentionally excluded.
        """
        return {
            "id": self.id,
            "name": self.name,
            "ip_address": self.ip_address,
            "snmp_enabled": self.snmp_enabled,
            "snmp_version": self.snmp_version,
            "snmp_community": self.snmp_community,
            "snmp_port": self.snmp_port,
            "ssh_enabled": self.ssh_enabled,
            "ssh_username": self.ssh_username,
        }

    def __repr__(self) -> str:
        return f"<Device {self.name!r} ({self.ip_address})>"


class PingHistory(db.Model):
    """A single check result (ping or SNMP) recorded for a device."""

    __tablename__ = "ping_history"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey("device.id"), nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False)

    # Possible values: online | offline | timeout | error | online_parsing_error
    status = db.Column(db.String(30), nullable=False)

    rtt_avg_ms = db.Column(db.Float, nullable=True)
    raw_output_snippet = db.Column(db.Text, nullable=True)

    # 'ping' or 'snmp'
    check_type = db.Column(db.String(10), nullable=False, default="ping")

    # SNMP metrics stored as JSON string
    metrics_json = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint(
            "device_id",
            "timestamp",
            "check_type",
            name="uq_history_device_timestamp_type",
        ),
    )

    def to_json(self) -> dict:
        """Serialize to a dict safe to return via the REST API."""
        ts_iso = self.timestamp.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        metrics = None
        if self.check_type == "snmp" and self.metrics_json:
            try:
                metrics = json.loads(self.metrics_json)
            except json.JSONDecodeError:
                metrics = {"error": "Failed to parse stored metrics"}

        return {
            "id": self.id,
            "device_id": self.device_id,
            "timestamp_iso": ts_iso,
            "status": self.status,
            "rtt_avg_ms": self.rtt_avg_ms,
            "raw_output_snippet": self.raw_output_snippet,
            "check_type": self.check_type,
            "metrics": metrics,
        }

    def __repr__(self) -> str:
        ts = self.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        return f"<PingHistory dev_id={self.device_id} ts={ts} status={self.status!r}>"
