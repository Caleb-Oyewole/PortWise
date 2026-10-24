# PortWise API: FastAPI on uvicorn, running as an unprivileged user.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Every dependency ships a binary wheel, so no compiler is needed in the image.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd --system --uid 10001 --home /app portwise && chown -R portwise /app
USER portwise

# Rumpty sets $PORT. --proxy-headers lets uvicorn see the client scheme behind the proxy;
# --no-server-header stops it advertising its name and version.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
