from .models import AuditLog, ActivityLog


def log_action(user, action, model_name='', object_id='',
               object_repr='', changes=None, ip_address=None,
               user_agent=''):
    AuditLog.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        object_repr=object_repr,
        changes=changes or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def log_activity(user, verb, description='', customer=None,
                 lead=None, call=None, extra=None):
    ActivityLog.objects.create(
        user=user,
        verb=verb,
        description=description,
        customer=customer,
        lead=lead,
        call=call,
        extra=extra or {},
    )
