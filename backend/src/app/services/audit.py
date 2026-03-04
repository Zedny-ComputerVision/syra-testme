from sqlalchemy.orm import Session

from ..models import AuditLog


def write_audit_log(
    db: Session,
    user_id,
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    detail: str = None,
    ip_address: str = None,
):
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(log)
    db.commit()
