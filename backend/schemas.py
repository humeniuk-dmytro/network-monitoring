"""
Marshmallow schemas for API input validation.

DeviceSchema      — used when creating a new device (POST /api/devices)
DeviceUpdateSchema — used when updating an existing device (PUT /api/devices/<id>)
"""

import ipaddress
from marshmallow import Schema, ValidationError, fields, validate
from marshmallow import EXCLUDE


def validate_ip_address(ip_str: str) -> None:
    """Raise ValidationError if *ip_str* is not a valid IPv4 or IPv6 address."""
    try:
        ipaddress.ip_address(ip_str)
    except ValueError as exc:
        raise ValidationError(f"'{ip_str}' is not a valid IP address.") from exc


class DeviceSchema(Schema):
    """Validates the body of a create-device request."""

    class Meta:
        ordered = True
        unknown = EXCLUDE  # silently drop unexpected fields

    id = fields.Int(dump_only=True)

    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    ip_address = fields.Str(required=True, validate=validate_ip_address)

    # SNMP
    snmp_enabled = fields.Bool(load_default=False)
    snmp_version = fields.Int(
        validate=validate.OneOf([1, 2]),
        allow_none=True,
        load_default=None,
    )
    snmp_community = fields.Str(
        validate=validate.Length(max=100), allow_none=True, load_default=None
    )
    snmp_port = fields.Int(
        validate=validate.Range(min=1, max=65535), allow_none=True, load_default=161
    )

    # SSH (password is write-only — never returned in API responses)
    ssh_enabled = fields.Bool(load_default=False)
    ssh_username = fields.Str(
        validate=validate.Length(max=100), allow_none=True, load_default=None
    )
    ssh_password = fields.Str(
        validate=validate.Length(max=255),
        allow_none=True,
        load_only=True,  # never serialized in responses
        load_default=None,
    )


class DeviceUpdateSchema(Schema):
    """Validates the body of an update-device request (all fields optional)."""

    class Meta:
        ordered = True
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=100))
    ip_address = fields.Str(validate=validate_ip_address)

    snmp_enabled = fields.Bool()
    snmp_version = fields.Int(validate=validate.OneOf([1, 2]), allow_none=True)
    snmp_community = fields.Str(validate=validate.Length(max=100), allow_none=True)
    snmp_port = fields.Int(validate=validate.Range(min=1, max=65535), allow_none=True)

    ssh_enabled = fields.Bool()
    ssh_username = fields.Str(validate=validate.Length(max=100), allow_none=True)
    ssh_password = fields.Str(
        validate=validate.Length(max=255), allow_none=True, load_only=True
    )
