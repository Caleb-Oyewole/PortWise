"""Write an audit row for every admin change."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditLog


def _default(value: Any):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def to_json(data: Any) -> Optional[str]:
    return None if data is None else json.dumps(data, default=_default, ensure_ascii=False)


def record(
    db: Session,
    admin_email: Optional[str],
    entity: str,
    action: str,
    entity_id: Optional[str] = None,
    summary: Optional[str] = None,
    before: Any = None,
    after: Any = None,
) -> AuditLog:
    """Add (not commit) an audit row, so it lands in the same transaction as the change."""
    row = AuditLog(
        admin_email=admin_email,
        entity=entity,
        entity_id=entity_id,
        action=action,
        summary=(summary or "")[:255] or None,
        before_data=to_json(before),
        after_data=to_json(after),
    )
    db.add(row)
    return row


def row_json(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "admin_email": row.admin_email,
        "entity": row.entity,
        "entity_id": row.entity_id,
        "action": row.action,
        "summary": row.summary,
        "before": json.loads(row.before_data) if row.before_data else None,
        "after": json.loads(row.after_data) if row.after_data else None,
        "created_at": row.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
