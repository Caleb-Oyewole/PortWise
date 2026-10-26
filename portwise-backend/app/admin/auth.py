"""Admin sign-in: PBKDF2 password hashes and short-lived signed bearer tokens.

Only the standard library is used. A token is ``base64url(payload).base64url(hmac)``
signed with ADMIN_TOKEN_SECRET; it carries the admin id, a fingerprint of the
admin's password hash (so changing the password ends every session) and an expiry.

Security defaults:
- No admin account exists unless ADMIN_EMAIL / ADMIN_PASSWORD are set. A local
  development account is created only when PORTWISE_DEV=1, and it is deleted at
  start-up whenever dev mode is off.
- The signing secret is never derived from other settings. Without
  ADMIN_TOKEN_SECRET a random per-process secret is used (sessions end on restart).
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
from collections import OrderedDict, deque
from typing import Deque, Dict, Optional

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.errors import PortWiseError
from app.models import AdminUser

log = logging.getLogger("portwise.admin")

PBKDF2_ITERATIONS = int(os.getenv("PBKDF2_ITERATIONS", "260000"))  # tests lower this; each hash stores its own count
TOKEN_TTL_SECONDS = int(os.getenv("ADMIN_TOKEN_TTL_SECONDS", str(12 * 3600)))
MIN_PASSWORD_LENGTH = 12
DEV_ADMIN_EMAIL = "admin@portwise.local"
DEV_ADMIN_PASSWORD = "portwise-admin"


def dev_mode() -> bool:
    return os.getenv("PORTWISE_DEV", "").strip().lower() in ("1", "true", "yes", "on")


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


# A real hash to check against when the email is unknown, so response time does not reveal accounts.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_dummy(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


# ---------- tokens ----------

_process_secret = secrets.token_bytes(32)
_warned_secret = False


def _secret() -> bytes:
    global _warned_secret
    explicit = os.getenv("ADMIN_TOKEN_SECRET", "")
    if explicit:
        if len(explicit) < 32 and not _warned_secret:
            log.warning("ADMIN_TOKEN_SECRET is shorter than 32 characters; use a long random value.")
            _warned_secret = True
        return explicit.encode()
    if not _warned_secret and not dev_mode():
        log.warning("ADMIN_TOKEN_SECRET is not set; using a random secret, so admin sessions end on every restart.")
        _warned_secret = True
    return _process_secret


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def password_fingerprint(password_hash: str) -> str:
    """Changes whenever the password changes, which invalidates outstanding tokens."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _sign(payload: str) -> str:
    return _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())


def issue_token(admin: AdminUser, now: Optional[float] = None) -> Dict[str, object]:
    now = now or time.time()
    expires = int(now + TOKEN_TTL_SECONDS)
    body = {"sub": admin.id, "pv": password_fingerprint(admin.password_hash), "exp": expires}
    payload = _b64(json.dumps(body).encode())
    return {"token": f"{payload}.{_sign(payload)}", "expires_at": expires}


def read_token(token: str, now: Optional[float] = None) -> Optional[dict]:
    """Return the payload of a valid, unexpired token, or None. Never raises."""
    try:
        payload, signature = token.split(".")
        if not hmac.compare_digest(signature.encode("ascii"), _sign(payload).encode("ascii")):
            return None
        data = json.loads(_unb64(payload))
        if not isinstance(data, dict) or int(data.get("exp", 0)) < (now or time.time()):
            return None
        return data
    except (ValueError, UnicodeError, TypeError, json.JSONDecodeError):
        return None


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
    try:
        admin = db.get(AdminUser, int(data["sub"]))
    except (KeyError, TypeError, ValueError):
        raise unauthorized()
    if admin is None or not hmac.compare_digest(str(data.get("pv", "")), password_fingerprint(admin.password_hash)):
        raise unauthorized("Your session has ended. Sign in again.")
    return admin


# ---------- sign-in throttling ----------
# Failures are counted per account and per client IP. The client IP is the right-most
# X-Forwarded-For hop (the one our proxy appended), never the client-supplied first one.

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 20
_MAX_KEYS = 10_000

_failures: "OrderedDict[str, Deque[float]]" = OrderedDict()
_failures_lock = threading.Lock()


def client_ip(request: Request) -> str:
    forwarded = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    if forwarded:
        return forwarded[-1]
    return request.client.host if request.client else "unknown"


def _recent(key: str, now: float) -> Deque[float]:
    q = _failures.get(key)
    if q is None:
        return deque()
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    if not q:
        _failures.pop(key, None)
    return q


def check_login_allowed(request: Request, email: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        if (
            len(_recent(f"email:{email}", now)) >= MAX_FAILURES_PER_EMAIL
            or len(_recent(f"ip:{client_ip(request)}", now)) >= MAX_FAILURES_PER_IP
        ):
            raise PortWiseError("too_many_attempts", "Too many failed sign-ins. Wait 15 minutes and try again.", 429)


def record_login_failure(request: Request, email: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        for key in (f"email:{email}", f"ip:{client_ip(request)}"):
            q = _failures.setdefault(key, deque())
            q.append(now)
            _failures.move_to_end(key)
        while len(_failures) > _MAX_KEYS:
            _failures.popitem(last=False)


def clear_login_failures(email: str) -> None:
    with _failures_lock:
        _failures.pop(f"email:{email}", None)


def reset_throttle() -> None:
    with _failures_lock:
        _failures.clear()


# ---------- bootstrap ----------

def ensure_bootstrap_admin() -> Optional[str]:
    """Create or update the admin from ADMIN_EMAIL / ADMIN_PASSWORD; manage the dev account.

    Returns the email of the admin that was created, if any.
    """
    email = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD") or ""
    name = os.getenv("ADMIN_NAME", "PortWise admin")

    db = SessionLocal()
    try:
        dev_row = db.query(AdminUser).filter(AdminUser.email == DEV_ADMIN_EMAIL).first()
        if dev_row and (not dev_mode() or (email and email != DEV_ADMIN_EMAIL)):
            db.delete(dev_row)
            db.commit()
            log.warning("Removed the development admin account (%s).", DEV_ADMIN_EMAIL)

        if not (email and password):
            if dev_mode():
                email, password, name = DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, "Local developer"
            else:
                log.warning("ADMIN_EMAIL / ADMIN_PASSWORD are not set; no admin account is available.")
                return None
        elif len(password) < MIN_PASSWORD_LENGTH:
            log.error("ADMIN_PASSWORD must be at least %d characters; the admin account was not created.", MIN_PASSWORD_LENGTH)
            return None
        elif password == DEV_ADMIN_PASSWORD and not dev_mode():
            # The development password is published in the repository, so it must never protect a real admin.
            # Fail closed: remove any account that still holds it, so nobody can sign in until it is changed.
            stale = db.query(AdminUser).filter(AdminUser.email == email).first()
            if stale:
                db.delete(stale)
                db.commit()
            log.error("ADMIN_PASSWORD is the published development password; it was refused and the admin account removed. "
                      "Set a new, unique password (at least %d characters) and restart.", MIN_PASSWORD_LENGTH)
            return None

        existing = db.query(AdminUser).filter(AdminUser.email == email).first()
        if existing:
            # The env password is authoritative: rotating ADMIN_PASSWORD takes effect on restart
            # and ends existing sessions (the token fingerprint changes).
            if not verify_password(password, existing.password_hash):
                existing.password_hash = hash_password(password)
                db.commit()
            return None
        db.add(AdminUser(email=email, name=name, password_hash=hash_password(password)))
        db.commit()
        if email == DEV_ADMIN_EMAIL:
            log.warning("Created development admin %s (PORTWISE_DEV=1). Never enable dev mode in production.", email)
        return email
    finally:
        db.close()
