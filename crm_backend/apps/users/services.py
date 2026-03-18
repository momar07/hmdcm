from .models import User, Extension
from .selectors import get_user_by_id


def create_user(email, first_name, last_name, role, password, team=None, phone=''):
    user = User.objects.create_user(
        email=email, password=password,
        first_name=first_name, last_name=last_name,
        role=role, team=team, phone=phone,
    )
    return user


def update_user_status(user_id, status: str):
    User.objects.filter(pk=user_id).update(status=status)


def assign_extension(user_id, number: str, peer_name: str = '', secret: str = ''):
    user = get_user_by_id(user_id)
    ext, created = Extension.objects.update_or_create(
        user=user,
        defaults={'number': number, 'peer_name': peer_name, 'secret': secret}
    )
    return ext


# ── Queue / Agent Status via AMI ──────────────────────────────
def _ami_action(action: dict) -> bool:
    """Send a single AMI action and return True on Success."""
    import socket
    from django.conf import settings
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((settings.AMI_HOST, settings.AMI_PORT))
        s.recv(100)                          # banner
        login = (
            f"Action: Login\r\n"
            f"Username: {settings.AMI_USERNAME}\r\n"
            f"Secret: {settings.AMI_SECRET}\r\n"
            f"Events: off\r\n\r\n"
        )
        s.sendall(login.encode())
        import time; time.sleep(0.3)
        s.recv(512)                          # login response

        msg = "\r\n".join(
            f"{k}: {v}" for k, v in action.items()
        ) + "\r\n\r\n"
        s.sendall(msg.encode())
        import time; time.sleep(0.3)
        resp = s.recv(512).decode(errors='ignore')

        s.sendall(b"Action: Logoff\r\n\r\n")
        s.close()
        return 'Success' in resp or 'error' not in resp.lower()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'[AMI Action] {e}')
        return False


def agent_queue_login(user) -> bool:
    """Add agent SIP extension to all active queues."""
    from .models import Extension
    from apps.users.models import Queue
    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        return False

    queues = Queue.objects.filter(is_active=True)
    if not queues.exists():
        # no queues configured — just update status
        update_user_status(str(user.id), 'available')
        return True

    ok = True
    for q in queues:
        # جرب SIP/ الأول، لو فشل جرب Agent/
        result = _ami_action({
            'Action':    'QueueAdd',
            'Queue':     q.name,
            'Interface': f'SIP/{ext.number}',
            'MemberName': ext.peer_name or f'SIP/{ext.number}',
            'Penalty':   '0',
            'Paused':    '0',
        })
        if not result:
            result = _ami_action({
                'Action':    'QueueAdd',
                'Queue':     q.name,
                'Interface': f'Agent/{ext.number}',
                'Penalty':   '0',
                'Paused':    '0',
            })
        ok = ok and result

    update_user_status(str(user.id), 'available')
    _notify_status_change(user, 'available')
    return ok


def agent_queue_pause(user, reason: str = 'Break') -> bool:
    """Pause agent in all queues (Break)."""
    from .models import Extension
    from apps.users.models import Queue
    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        return False

    queues = Queue.objects.filter(is_active=True)
    ok = True
    if queues.exists():
        for q in queues:
            result = _ami_action({
                'Action':    'QueuePause',
                'Interface': f'SIP/{ext.number}',
                'Paused':    '1',
                'Reason':    reason,
            })
            if not result:
                result = _ami_action({
                    'Action':    'QueuePause',
                    'Interface': f'Agent/{ext.number}',
                    'Paused':    '1',
                    'Reason':    reason,
                })
            ok = ok and result
    else:
        ok = True

    update_user_status(str(user.id), 'away')
    _notify_status_change(user, 'away')
    return ok


def agent_queue_logoff(user) -> bool:
    """Remove agent from all queues (Logoff)."""
    from .models import Extension
    from apps.users.models import Queue
    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        update_user_status(str(user.id), 'offline')
        _notify_status_change(user, 'offline')
        return True

    queues = Queue.objects.filter(is_active=True)
    ok = True
    if queues.exists():
        for q in queues:
            result = _ami_action({
                'Action':    'QueueRemove',
                'Queue':     q.name,
                'Interface': f'SIP/{ext.number}',
            })
            if not result:
                result = _ami_action({
                    'Action':    'QueueRemove',
                    'Queue':     q.name,
                    'Interface': f'Agent/{ext.number}',
                })
            ok = ok and result

    update_user_status(str(user.id), 'offline')
    _notify_status_change(user, 'offline')
    return ok


def _notify_status_change(user, new_status: str):
    """Push status update to supervisors via WebSocket."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {
                'type': 'agent_status_update',
                'payload': {
                    'agent_id':   str(user.id),
                    'agent_name': user.get_full_name(),
                    'status':     new_status,
                    'extension':  getattr(getattr(user, 'extension', None), 'number', None),
                }
            }
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'[WS Notify] {e}')
