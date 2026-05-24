"""
Network utility functions.

perform_ping(host_ip)
    Runs the system ping command and returns (status, raw_output).
    Cross-platform: chooses -c/-W for Linux and -n/-w for Windows.

get_snmp_data(host, community, snmp_version, port, oids_map)
    Queries a set of OIDs via SNMP v1/v2c using the asyncio-based
    pysnmp 7.x API (Python 3.12+ compatible).
    Returns (overall_status, metrics_dict, error_message).
"""

import asyncio
import logging
import platform
import subprocess

import pingparsing
from flask import current_app

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
# SNMP  (pysnmp 7.x, asyncio-based, Python 3.12+ compatible)
# ---------------------------------------------------------------------------

_SNMP_HOST_DOWN_KEYWORDS = ("host is down", "[errno 64]", "no route to host", "[errno 65]")
_SNMP_TIMEOUT_KEYWORDS = ("timed out", "timeout", "no snmp response", "request timed out")


def _classify_snmp_error(err_str: str) -> str:
    s = err_str.lower()
    if any(k in s for k in _SNMP_HOST_DOWN_KEYWORDS):
        return "host_down"
    if any(k in s for k in _SNMP_TIMEOUT_KEYWORDS):
        return "timeout"
    if "noaccess" in s or "no access" in s:
        return "no_access"
    return "other"


async def _snmp_get_all(
    host: str,
    community: str,
    snmp_version: int,
    port: int,
    oids_map: dict[str, str],
) -> dict[str, str]:
    """Async inner: query each OID and return raw result strings."""
    # Import here to keep module-level imports clean
    from pysnmp.hlapi.v3arch.asyncio import (
        CommunityData, ContextData, ObjectIdentity, ObjectType,
        SnmpEngine, UdpTransportTarget, get_cmd,
    )

    results: dict[str, str] = {}
    engine = SnmpEngine()

    for name, oid_str in oids_map.items():
        try:
            target = await UdpTransportTarget.create(
                (host, port), timeout=2, retries=1
            )
            err_ind, err_status, err_index, var_binds = await get_cmd(
                engine,
                CommunityData(community, mpModel=snmp_version - 1),
                target,
                ContextData(),
                ObjectType(ObjectIdentity(oid_str)),
            )

            if err_ind:
                results[name] = f"Error: {str(err_ind)[:120]}"
                logger.warning("SNMP %s OID %s: %s", host, name, err_ind)
            elif err_status:
                results[name] = f"Error: {err_status.prettyPrint()}"
                logger.warning("SNMP %s OID %s: status=%s", host, name, err_status.prettyPrint())
            else:
                for vb in var_binds:
                    results[name] = str(vb[1])
                logger.debug("SNMP %s OID %s = %s", host, name, results.get(name))

        except Exception as exc:
            results[name] = f"Exception: {type(exc).__name__}: {str(exc)[:80]}"
            logger.error("SNMP %s OID %s: %s", host, name, exc, exc_info=True)

    engine.close_dispatcher()
    return results


def get_snmp_data(
    host: str,
    community: str,
    snmp_version: int,
    port: int,
    oids_map: dict[str, str],
) -> tuple[str, dict, str | None]:
    """Query *oids_map* via SNMP v1/v2c and return ``(status, metrics, error_msg)``.

    Wraps the asyncio coroutine in a synchronous call so Flask routes
    don't need to be async.
    """
    if not oids_map:
        return "snmp_error", {}, "No OIDs configured"

    try:
        metrics = asyncio.run(_snmp_get_all(host, community, snmp_version, port, oids_map))
    except Exception as exc:
        logger.error("SNMP asyncio.run failed for %s: %s", host, exc, exc_info=True)
        return "snmp_error", {}, str(exc)

    total = len(oids_map)
    errors = {k: v for k, v in metrics.items() if v.startswith(("Error:", "Exception:"))}
    success_count = total - len(errors)

    if success_count > 0:
        overall = "snmp_ok"
        first_error = None
    elif errors:
        categories = [_classify_snmp_error(v) for v in errors.values()]
        if all(c == "host_down" for c in categories):
            overall = "snmp_host_down"
        elif all(c == "timeout" for c in categories):
            overall = "snmp_timeout"
        elif all(c == "no_access" for c in categories):
            overall = "snmp_no_access"
        else:
            overall = "snmp_error"
        first_error = next(iter(errors.values()))
    else:
        overall = "snmp_error"
        first_error = "Unknown error"

    logger.info(
        "SNMP %s → %s | success=%d/%d", host, overall, success_count, total
    )
    return overall, metrics, first_error if overall != "snmp_ok" else None
