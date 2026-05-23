"""
Network utility functions.

perform_ping(host_ip)
    Runs the system ping command and returns (status, raw_output).
    Cross-platform: chooses -c/-W for Linux and -n/-w for Windows.

get_snmp_data(host, community, snmp_version, port, oids_map)
    Queries a set of OIDs via SNMP v1/v2c and returns
    (overall_status, metrics_dict, error_message).
"""

import logging
import platform
import subprocess

import pingparsing
from flask import current_app
from pysnmp.carrier.error import CarrierError
from pysnmp.error import PySnmpError
from pysnmp.hlapi import (
    CommunityData,
    ContextData,
    ObjectIdentity,
    ObjectType,
    SnmpEngine,
    UdpTransportTarget,
    getCmd,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ping
# ---------------------------------------------------------------------------

def perform_ping(host_ip: str) -> tuple[str, str]:
    """Run a ping against *host_ip* and return ``(status, raw_output)``.

    Possible statuses: ``online`` | ``offline`` | ``timeout`` | ``error``
    """
    try:
        cfg = current_app.config
        is_windows = platform.system().lower() == "windows"

        if is_windows:
            count = cfg.get("PING_PACKET_COUNT_WINDOWS", 2)
            timeout = cfg.get("PING_TIMEOUT_MS_WINDOWS", 1000)
            command = ["ping", "-n", str(count), "-w", str(timeout), host_ip]
        else:
            count = cfg.get("PING_PACKET_COUNT_LINUX", 2)
            timeout = cfg.get("PING_TIMEOUT_SEC_LINUX", 1)
            command = ["ping", "-c", str(count), "-W", str(timeout), host_ip]

        communicate_timeout = cfg.get("PING_COMMUNICATE_TIMEOUT", 3)

        process = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate(timeout=communicate_timeout)

        raw = stdout.decode("utf-8", errors="ignore")
        raw_err = stderr.decode("utf-8", errors="ignore")
        combined = raw + raw_err

        parser = pingparsing.PingParsing()
        stats = parser.parse(combined)

        is_online = False
        if stats.packet_loss_rate is not None and stats.packet_loss_rate < 1.0:
            is_online = True
        elif (
            stats.packet_transmit
            and stats.packet_receive
            and stats.packet_receive > 0
        ):
            is_online = True

        # Fallback: trust the process return code
        if not is_online and process.returncode == 0:
            logger.debug(
                "Ping %s: pingparsing said offline but returncode=0, treating as online",
                host_ip,
            )
            is_online = True

        return ("online" if is_online else "offline"), raw

    except subprocess.TimeoutExpired:
        logger.warning("Ping %s: process timed out", host_ip)
        return "timeout", ""
    except Exception as exc:
        logger.error("Ping %s: unexpected error: %s", host_ip, exc, exc_info=True)
        return "error", ""


# ---------------------------------------------------------------------------
# SNMP
# ---------------------------------------------------------------------------

_SNMP_HOST_DOWN_KEYWORDS = ("host is down", "[errno 64]")
_SNMP_NO_ROUTE_KEYWORDS = ("no route to host", "[errno 65]")
_SNMP_TIMEOUT_KEYWORDS = ("timed out", "timeout", "no snmp response")


def _classify_snmp_error(err_str: str) -> str:
    """Map an error string to one of the internal SNMP error categories."""
    s = err_str.lower()
    if any(k in s for k in _SNMP_HOST_DOWN_KEYWORDS):
        return "host_down"
    if any(k in s for k in _SNMP_NO_ROUTE_KEYWORDS):
        return "no_route"
    if any(k in s for k in _SNMP_TIMEOUT_KEYWORDS):
        return "timeout"
    return "other"


def get_snmp_data(
    host: str,
    community: str,
    snmp_version: int,
    port: int,
    oids_map: dict[str, str],
) -> tuple[str, dict, str | None]:
    """Query *oids_map* via SNMP and return ``(status, metrics, error_msg)``.

    Parameters
    ----------
    oids_map:
        ``{"metric_name": "1.3.6.1.2.1..."}`` mapping.

    Returns
    -------
    status:
        One of: ``snmp_ok`` | ``snmp_host_down`` | ``snmp_timeout`` |
        ``snmp_no_access`` | ``snmp_error``
    metrics:
        Dict of ``{metric_name: value_or_error_string}``.
    error_msg:
        Human-readable summary of the first significant error, or ``None``
        if all OIDs succeeded.
    """
    metrics: dict[str, str] = {}
    engine = SnmpEngine()

    counters = {k: 0 for k in ("success", "host_down", "no_route", "timeout", "no_access", "other")}
    first_error: str | None = None
    total = len(oids_map)

    for name, oid_str in oids_map.items():
        user_msg = "SNMP: unknown error"
        category: str | None = None

        try:
            iterator = getCmd(
                engine,
                CommunityData(community, mpModel=snmp_version - 1),
                UdpTransportTarget((host, port), timeout=1, retries=2),
                ContextData(),
                ObjectType(ObjectIdentity(oid_str)),
            )
            err_ind, err_status, err_index, var_binds = next(iterator)

            if err_ind:
                category = _classify_snmp_error(str(err_ind))
                user_msg = f"Error: {str(err_ind)[:120]}"
                logger.warning("SNMP %s OID %s (%s): %s", host, oid_str, name, err_ind)

            elif err_status:
                status_str = err_status.prettyPrint().lower()
                if "noaccess" in status_str:
                    category = "no_access"
                    user_msg = "Error: noAccess"
                elif any(k in status_str for k in ("nosuchname", "nosuchobject", "nosuchinstance")):
                    category = "other"
                    user_msg = f"Error: OID not found ({err_status.prettyPrint()})"
                else:
                    category = "other"
                    user_msg = f"Error: {err_status.prettyPrint()}"
                logger.warning("SNMP %s OID %s (%s): status=%s", host, oid_str, name, err_status.prettyPrint())

            else:
                # Success
                counters["success"] += 1
                for vb in var_binds:
                    metrics[name] = str(vb[1])
                logger.debug("SNMP %s OID %s (%s) = %s", host, oid_str, name, metrics.get(name))
                continue

        except (OSError, CarrierError, PySnmpError) as exc:
            category = _classify_snmp_error(str(exc))
            user_msg = f"Exception: {type(exc).__name__}"
            logger.error("SNMP %s OID %s (%s): %s", host, oid_str, name, exc, exc_info=True)
        except Exception as exc:
            category = "other"
            user_msg = f"Unexpected exception: {type(exc).__name__}"
            logger.error("SNMP %s OID %s (%s): %s", host, oid_str, name, exc, exc_info=True)

        # Record failure
        metrics[name] = user_msg
        counters[category or "other"] += 1
        if first_error is None:
            first_error = user_msg

    # Determine overall status
    if counters["success"] > 0:
        overall = "snmp_ok"
        first_error = None
    elif total == 0:
        overall = "snmp_error"
        first_error = "SNMP: no OIDs configured"
    elif counters["host_down"] + counters["no_route"] == total:
        overall = "snmp_host_down"
    elif counters["timeout"] == total:
        overall = "snmp_timeout"
    elif counters["no_access"] > 0 and counters["success"] == 0:
        overall = "snmp_no_access"
    else:
        overall = "snmp_error"

    logger.info(
        "SNMP %s → %s | success=%d/%d | err=%s",
        host, overall, counters["success"], total, first_error,
    )
    return overall, metrics, first_error
