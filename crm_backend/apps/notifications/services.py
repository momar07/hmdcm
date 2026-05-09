"""
Central helper for creating notifications.
Stores in PostgreSQL AND pushes a realtime WebSocket event.
Always use this instead of raw channel_layer.group_send for in-app notifs.
"""
import logging
import threading
import asyncio
from typing import Optional, Dict, Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def create_notification(
    recipient,
    type: str,
    title: str,
    body: str = '',
    data: Optional[Dict[str, Any]] = None,
    link: str = '',
    priority: str = 'normal',
    push_realtime: bool = True,
):
    """
    Create a Notification row and (optionally) push it to the user via WebSocket.

    Args:
        recipient: User instance OR user id (UUID/int).
        type:      One of Notification.TYPE_CHOICES.
        title:     Short headline.
        body:      Optional longer text.
        data:      Arbitrary JSON payload (lead_id, call_id, etc.).
        link:      Frontend route to navigate when clicked, e.g. /leads/<id>.
        priority:  low | normal | high | urgent.
        push_realtime: send via Channels.

    Returns:
        Notification instance, or None on failure.
    """
    from .models import Notification

    try:
        # Accept either a User instance or an id
        if hasattr(recipient, 'id'):
            recipient_id = recipient.id
            recipient_obj = recipient
        else:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            recipient_obj = User.objects.filter(id=recipient).first()
            if not recipient_obj:
                logger.warning(f'[Notification] Recipient {recipient} not found')
                return None
            recipient_id = recipient_obj.id

        notif = Notification.objects.create(
            recipient=recipient_obj,
            type=type,
            title=title,
            body=body,
            data=data or {},
            link=link,
            priority=priority,
        )
        logger.info(f'[Notification] Created {notif.id} ({type}) for {recipient_id}')

        if push_realtime:
            _push_to_websocket(notif)

        return notif

    except Exception as e:
        logger.exception(f'[Notification] create failed: {e}')
        return None


def _push_to_websocket(notif):
    """Send the notification payload through Channels to agent_<id> group."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    payload = {
        'type':       'notification_new',  # consumer handler name
        'id':         str(notif.id),
        'notif_type': notif.type,
        'title':      notif.title,
        'body':       notif.body,
        'data':       notif.data,
        'link':       notif.link,
        'priority':   notif.priority,
        'is_read':    notif.is_read,
        'created_at': notif.created_at.isoformat(),
    }
    group_name = f'agent_{notif.recipient_id}'

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                channel_layer.group_send(group_name, payload)
            )
        except Exception as e:
            logger.error(f'[Notification] WS push failed: {e}')
        finally:
            loop.close()

    threading.Thread(target=_run, daemon=True).start()
