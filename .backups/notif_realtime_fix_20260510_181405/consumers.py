import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class CallEventConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer — agents and supervisors subscribe here.

    URL  : ws://<host>/ws/calls/
    Auth : JWT passed as ?token=<access_token>
           (resolved by JWTAuthMiddleware in routing.py)

    Group topology
    ──────────────
    agent_<uuid>   : personal channel for each agent
    supervisors    : all supervisors + admins
    """

    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.personal_group = f'agent_{self.user.id}'
        await self.channel_layer.group_add(
            self.personal_group, self.channel_name
        )

        # All authenticated users join the 'agents' group
        # so queue calls (which have no agent yet) can reach everyone
        await self.channel_layer.group_add('agents', self.channel_name)

        if self.user.role in ('admin', 'supervisor'):
            await self.channel_layer.group_add('supervisors', self.channel_name)

        await self.accept()
        await self.send(text_data=json.dumps({
            'type':    'connected',
            'message': f'Welcome {self.user.get_full_name()}',
        }))
        logger.info(f'[WS] Connected: {self.user.email} ({self.user.role})')

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.personal_group, self.channel_name
        )
        await self.channel_layer.group_discard('agents', self.channel_name)
        if self.user.role in ('admin', 'supervisor'):
            await self.channel_layer.group_discard('supervisors', self.channel_name)
        logger.info(f'[WS] Disconnected: {self.user.email}')

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = data.get('type')

        if msg_type == 'agent_status':
            # Agent broadcasts their status to supervisors
            await self.channel_layer.group_send(
                'supervisors',
                {
                    'type':     'agent_status_update',
                    'agent_id': str(self.user.id),
                    'status':   data.get('status', 'available'),
                }
            )

        elif msg_type == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ── Group message type handlers ───────────────────────────────────────

    async def call_event(self, event):
        """Handles messages sent to 'supervisors' or personal group."""
        await self.send(text_data=json.dumps(event.get('payload', {})))

    async def followup_reminder(self, event):
        await self.send(text_data=json.dumps({
            'type':         'followup_reminder',
            'followup_id':  event.get('followup_id'),
            'title':        event.get('title'),
            'lead_name':    event.get('lead_name'),
            'scheduled_at': event.get('scheduled_at'),
        }))

    async def agent_status_update(self, event):
        """Forward agent status update — used by both supervisors and the agent themselves."""
        await self.send(text_data=json.dumps({
            'type':       'agent_status_update',
            'agent_id':   event.get('agent_id'),
            'agent_name': event.get('agent_name'),
            'status':     event.get('status'),
            'extension':  event.get('extension'),
        }))

    async def task_assigned(self, event):
        """Notify agent when a new task is assigned to them."""
        await self.send(text_data=json.dumps({
            'type':        'task_assigned',
            'task_id':     event.get('task_id'),
            'title':       event.get('title'),
            'priority':    event.get('priority'),
            'due_date':    event.get('due_date'),
            'assigned_by': event.get('assigned_by'),
        }))

    async def quotation_pending(self, event):
        """Notify supervisors that an agent submitted a quotation for approval."""
        await self.send(text_data=json.dumps({
            'type':         'quotation_pending',
            'quotation_id': event.get('quotation_id'),
            'ref_number':   event.get('ref_number'),
            'agent_name':   event.get('agent_name'),
            'total':        event.get('total'),
        }))

    async def quotation_update(self, event):
        """Notify agent when their quotation is approved/rejected/revision-requested."""
        await self.send(text_data=json.dumps({
            'type':         'quotation_update',
            'quotation_id': event.get('quotation_id'),
            'ref_number':   event.get('ref_number'),
            'event':        event.get('event'),
            'comment':      event.get('comment'),
        }))

    async def notification_new(self, event):
        """Generic in-app notification pushed by apps.notifications.services."""
        await self.send_json({
            'event':      'notification_new',
            'id':         event.get('id'),
            'notif_type': event.get('notif_type'),
            'title':      event.get('title'),
            'body':       event.get('body'),
            'data':       event.get('data', {}),
            'link':       event.get('link', ''),
            'priority':   event.get('priority', 'normal'),
            'is_read':    event.get('is_read', False),
            'created_at': event.get('created_at'),
        })

