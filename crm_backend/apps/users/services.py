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
    from django.utils import timezone
    User.objects.filter(pk=user_id).update(status=status, status_since=timezone.now())


def assign_extension(user_id, number: str, peer_name: str = '', secret: str = ''):
    user = get_user_by_id(user_id)
    ext, created = Extension.objects.update_or_create(
        user=user,
        defaults={'number': number, 'peer_name': peer_name, 'secret': secret}
    )
    return ext


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
