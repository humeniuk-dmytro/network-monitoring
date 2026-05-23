# syntax=docker/dockerfile:1
# -------------------------------------------------------------------
# Stage 1 — builder: install Python deps into a clean prefix
# -------------------------------------------------------------------
FROM python:3.10-slim AS builder

WORKDIR /build

# System deps needed to compile some Python packages (e.g. cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

# -------------------------------------------------------------------
# Stage 2 — runtime: lean final image
# -------------------------------------------------------------------
FROM python:3.10-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# iputils-ping required for the ping command inside the container
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy application source
COPY . .

# Create a non-root user for the process
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /app/database \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

# Use gunicorn in production; falls back to Flask dev server if absent
CMD ["python", "run.py"]
