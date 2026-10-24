"""Security regressions: admin bootstrap, token forgery, session invalidation, throttling."""
import base64
import hashlib
import hmac
import json

import pytest

from app.admin import auth
from app.admin.auth import DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, ensure_bootstrap_admin, reset_throttle
from app.database import SessionLocal
from app.models import AdminUser


def _login(client, email=DEV_ADMIN_EMAIL, password=DEV_ADMIN_PASSWORD, ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return client.post("/api/v1/admin/login", json={"email": email, "password": password}, headers=headers)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def test_no_dev_admin_without_dev_mode(client, monkeypatch):
    monkeypatch.delenv("PORTWISE_DEV", raising=False)
    ensure_bootstrap_admin()  # dev mode off: the dev account must be removed
    with SessionLocal() as db:
        assert db.query(AdminUser).filter(AdminUser.email == DEV_ADMIN_EMAIL).first() is None
    reset_throttle()
    assert _login(client).status_code == 401


def test_dev_admin_removed_once_a_real_admin_is_configured(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "ops@portwise.ng")
    monkeypatch.setenv("ADMIN_PASSWORD", "a-long-production-passphrase")
    ensure_bootstrap_admin()
    with SessionLocal() as db:
        emails = {a.email for a in db.query(AdminUser).all()}
    assert emails == {"ops@portwise.ng"}


def test_short_admin_password_is_refused(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "ops@portwise.ng")
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    assert ensure_bootstrap_admin() is None
    with SessionLocal() as db:
        assert db.query(AdminUser).filter(AdminUser.email == "ops@portwise.ng").first() is None


def test_token_signed_with_a_guessable_key_is_rejected(client):
    # The old fallback derived the key from public values; forging with it must fail now.
    payload = _b64(json.dumps({"sub": 1, "exp": 9_999_999_999}).encode())
    key = hashlib.sha256(b"portwise::sqlite:///./portwise.db::").digest()
    forged = f"{payload}.{_b64(hmac.new(key, payload.encode(), hashlib.sha256).digest())}"
    r = client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


@pytest.mark.parametrize("token", ["not-a-token", "....", "e30.e30", "a.b.c"])
def test_malformed_tokens_are_401_not_500(client, token):
    r = client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_non_ascii_token_is_rejected_without_crashing():
    assert auth.read_token("a.é") is None
    assert auth.read_token("éé.abc") is None


def test_changing_the_password_ends_existing_sessions(client):
    reset_throttle()
    token = _login(client).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/admin/me", headers=headers).status_code == 200
    with SessionLocal() as db:
        admin = db.query(AdminUser).filter(AdminUser.email == DEV_ADMIN_EMAIL).first()
        admin.password_hash = auth.hash_password("a-brand-new-passphrase")
        db.commit()
    assert client.get("/api/v1/admin/me", headers=headers).status_code == 401


def test_throttle_counts_failures_per_account_and_ignores_spoofed_forwarded_for(client):
    reset_throttle()
    for i in range(auth.MAX_FAILURES_PER_EMAIL):
        # A different spoofed first hop each time must not reset the per-account count.
        assert _login(client, password="wrong", ip=f"203.0.113.{i}, 10.0.0.1").status_code == 401
    assert _login(client, ip="198.51.100.7, 10.0.0.1").status_code == 429
    reset_throttle()
    assert _login(client).status_code == 200


def test_successful_sign_in_clears_the_account_counter(client):
    reset_throttle()
    for _ in range(auth.MAX_FAILURES_PER_EMAIL - 1):
        _login(client, password="wrong")
    assert _login(client).status_code == 200
    assert _login(client, password="wrong").status_code == 401  # counter was reset, so not locked yet


def test_client_ip_uses_the_proxy_appended_hop():
    class Req:
        headers = {"x-forwarded-for": "1.2.3.4, 9.9.9.9"}
        client = None

    assert auth.client_ip(Req()) == "9.9.9.9"
