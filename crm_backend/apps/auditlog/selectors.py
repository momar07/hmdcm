from .models import AuditLog, ActivityLog


def get_audit_logs(user_id=None, model_name=None, limit=100):
    qs = AuditLog.objects.select_related('user').all()[:limit]
    if user_id:
        qs = AuditLog.objects.filter(user_id=user_id)[:limit]
    if model_name:
        qs = AuditLog.objects.filter(model_name=model_name)[:limit]
    return qs


def get_activity_logs(user_id=None, limit=50):
    qs = ActivityLog.objects.select_related('user').all()
    if user_id:
        qs = qs.filter(user_id=user_id)
    return qs[:limit]
