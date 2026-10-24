"""Admin sign-in: PBKDF2 password hashes and short-lived signed bearer tokens.

Only the standard library is used. A token is ``base64url(payload).base64url(hmac)``
signed with ADMIN_TOKEN_SECRET; it carries the admin id and an expiry time.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.database import DATABASE_URL, SessionLocal, get_db
from app.errors import PortWiseError
from app.models import AdminUser

log = logging.getLogger("portwise.admin")

PBKDF2_ITERATIONS = int(os.getenv("PBKDF2_ITERATIONS", "260000"))  # tests lower this; each hash stores its own count
TOKEN_TTL_SECONDS = int(os.getenv("ADMIN_TOKEN_TTL_SECONDS", str(12 * 3600)))
DEV_ADMIN_EMAIL = "admin@portwise.local"
DEV_ADMIN_PASSWORD = "portwise-admin"


# ---------- passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(digest.hex(), digest_hex)


# ---------- tokens ----------

def _secret() -> bytes:
    explicit = os.getenv("ADMIN_TOKEN_SECRET")
    if explicit:
        return explicit.encode()
    # Fallback keeps tokens valid across restarts without extra setup; it is derived from values
    # that are already secret. Set ADMIN_TOKEN_SECRET in production.
    seed = f"portwise::{DATABASE_URL}::{os.getenv('ADMIN_PASSWORD', '')}"
    return hashlib.sha256(seed.encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(admin: AdminUser, now: Optional[float] = None) -> Dict[str, object]:
    now = now or time.time()
    expires = int(now + TOKEN_TTL_SECONDS)
    payload = _b64(json.dumps({"sub": admin.id, "email": admin.email, "exp": expires}).encode())
    signature = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return {"token": f"{payload}.{signature}", "expires_at": expires}


def read_token(token: str, now: Optional[float] = None) -> Optional[dict]:
    try:
        payload, signature = token.split(".")
    except ValueError:
        return None
    expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(data.get("exp", 0)) < (now or time.time()):
        return None
    return data


# ---------- request guard ----------

def unauthorized(message: str = "Sign in to continue.") -> PortWiseError:
    return PortWiseError("unauthorized", message, status_code=401)


def require_admin(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthorized()
    data = read_token(authorization.split(" ", 1)[1].strip())
    if not data:
        raise unauthorized("Your session has expired. Sign in again.")
    admin = db.get(AdminUser, int(data["sub"]))
    if admin is None:
        raise unauthorized()
    return admin


# ---------- sign-in throttling ----------

_attempts: Dict[str, Deque[float]] = defaultdict(deque)
_attempts_lock = threading.Lock()
MAX_ATTEMPTS, WINDOW_SECONDS = 10, 300


def throttle_login(request: Request) -> None:
    """At most 10 sign-in attempts per IP every 5 minutes."""
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0]
    now = time.monotonic()
    with _attempts_lock:
        q = _attempts[ip.strip()]
        while q and now - q[0] > WINDOW_SECONDS:
            q.popleft()
        if len(q) >= MAX_ATTEMPTS:
            raise PortWiseError("too_many_attempts", "Too many sign-in attempts. Wait a few minutes and try again.", 429)
        q.append(now)


def reset_throttle() -> None:
    with _attempts_lock:
        _attempts.clear()


# ---------- bootstrap ----------

def ensure_bootstrap_admin() -> Optional[str]:
    """Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD (or a dev account on SQLite).

    Returns the email of the admin that was created, if any.
    """
    email = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD") or ""
    name = os.getenv("ADMIN_NAME", "PortWise admin")
    if not (email and password):
        if not DATABASE_URL.startswith("sqlite"):
            log.warning("ADMIN_EMAIL / ADMIN_PASSWORD are not set; no admin account will be created.")
            return None
        email, password = DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD

    db = SessionLocal()
    try:
        existing = db.query(AdminUser).filter(AdminUser.email == email).first()
        if existing:
            # Keep the env password authoritative, so rotating ADMIN_PASSWORD takes effect on restart.
            if os.getenv("ADMIN_PASSWORD") and not verify_password(password, existing.password_hash):
                existing.password_hash = hash_password(password)
                db.commit()
            return None
        db.add(AdminUser(email=email, name=name, password_hash=hash_password(password)))
        db.commit()
        if email == DEV_ADMIN_EMAIL:
            log.warning("Created development admin %s / %s. Do not use this outside local dev.", email, password)
        return email
    finally:
        db.close()
