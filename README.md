# 🖥️ Network Monitoring System

> An interactive web-based system for monitoring and managing network devices.  
> Built with **Flask** · **SQLite** · **pysnmp** · **paramiko** · **Chart.js**

![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey?logo=flask)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| Category | Capability |
|---|---|
| **Device Management** | Add, edit, delete devices; store IP, SNMP, SSH config in SQLite |
| **ICMP Ping** | Ping one device or all; RTT parsing via pingparsing; cross-platform (Linux/Windows) |
| **SNMP v1/v2c** | Collect sysDescr, sysUpTime, laLoad1, memAvailReal per device |
| **SSH** | Execute shell commands on devices via paramiko (Fernet-encrypted credentials) |
| **History** | Persistent check history with filtering by status/type/date and sortable table |
| **RTT Chart** | Chart.js line chart of ping RTT over time on the device history page |
| **Auto-refresh** | Configurable periodic background polling of all devices |
| **Docker** | Multi-stage Dockerfile + docker-compose for one-command deployment |

---

## 🗂️ Project Structure

```
network_monitoring/
├── backend/
│   ├── app.py           # Application factory (create_app)
│   ├── extensions.py    # SQLAlchemy singleton
│   ├── models.py        # Device + PingHistory ORM models
│   ├── schemas.py       # Marshmallow validation schemas
│   ├── security.py      # Fernet SSH password encryption
│   ├── utils.py         # perform_ping() + get_snmp_data()
│   └── routes/
│       ├── main_routes.py    # Serves frontend HTML
│       ├── device_routes.py  # CRUD + SNMP + SSH endpoints
│       └── history_routes.py # History CRUD + stats endpoint
├── frontend/
│   ├── index.html            # Main dashboard
│   ├── device_history.html   # Per-device history + RTT chart
│   ├── css/
│   │   ├── main.css
│   │   └── device_history.css
│   └── js/
│       ├── main.js            # Bootstrap & initialization
│       ├── uiUpdater.js       # DOM helpers
│       ├── deviceManagement.js
│       ├── pingLogic.js
│       ├── snmpLogic.js
│       ├── historyLogic.js
│       ├── historyModal.js
│       ├── globalStats.js
│       ├── autoRefresh.js
│       └── device_history.js
├── config.py            # Dev/Prod/Test config classes
├── run.py               # Entry point
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
git clone https://github.com/<your-username>/network-monitoring.git
cd network-monitoring

cp .env.example .env       # edit SECRET_KEY etc.
docker compose up --build
```

Open **http://localhost:5000**

### Option B — Local Python

**Prerequisites:** Python 3.10+, `ping` utility in PATH

```bash
# 1. Clone
git clone https://github.com/<your-username>/network-monitoring.git
cd network-monitoring

# 2. Virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 3. Install deps
pip install -r requirements.txt

# 4. Environment
cp .env.example .env
# Edit .env: set SECRET_KEY and SSH_ENCRYPTION_SECRET

# 5. Run
python run.py
```

Open **http://localhost:5000**

---

## 🔌 REST API Reference

### Devices

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/devices` | List all devices |
| `POST` | `/api/devices` | Create device |
| `GET` | `/api/devices/<id>` | Get device |
| `PUT` | `/api/devices/<id>` | Update device |
| `DELETE` | `/api/devices/<id>` | Delete device |
| `POST` | `/api/devices/<id>/snmp` | Run SNMP check |
| `POST` | `/api/devices/<id>/ssh/command` | Execute SSH command |

### Ping

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/ping` | `{device_id}` or `{ip_address}` | Ping one device |
| `POST` | `/api/ping_all` | — | Ping all devices |

### History

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/devices/<id>/history` | Get records (filterable) |
| `POST` | `/api/devices/<id>/history` | Bulk-save session records |
| `DELETE` | `/api/devices/<id>/history` | Clear all history |
| `GET` | `/api/devices/<id>/history/stats` | Aggregate stats |

#### History filter params (GET)
`?status=online&check_type=ping&date_from=2025-01-01T00:00:00&sort_by=timestamp&sort_order=desc&limit=100`

---

## 🔐 Security Notes

- SSH passwords are encrypted at rest using **Fernet** (AES-128-CBC + HMAC-SHA256).
- The encryption key is derived from `SSH_ENCRYPTION_SECRET` via **PBKDF2-HMAC-SHA256** (100k iterations).
- `ssh_password` is `load_only=True` in the schema — it is **never** returned by the API.
- Set strong, unique values for `SECRET_KEY` and `SSH_ENCRYPTION_SECRET` in production.

---

## 🛠️ Configuration

All settings are controlled via environment variables (`.env` file):

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | dev key | Flask session secret |
| `FLASK_ENV` | `development` | `development` / `production` / `testing` |
| `DATABASE_URL` | SQLite in `./database/` | SQLAlchemy DB URI |
| `SSH_ENCRYPTION_SECRET` | dev key | Master secret for Fernet KDF |
| `PASSWORD_SALT_SSH` | dev salt | PBKDF2 salt |
| `PING_PACKET_COUNT_LINUX` | `2` | `-c` value for Linux ping |
| `PING_TIMEOUT_SEC_LINUX` | `1` | `-W` value for Linux ping |
| `PING_COMMUNICATE_TIMEOUT` | `3` | subprocess.communicate() timeout |

---

## 📜 License

MIT — see [LICENSE](LICENSE)
