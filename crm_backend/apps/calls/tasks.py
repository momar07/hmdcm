import logging
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def notify_incoming_call(self, call_id: str):
    """
    Called by the AMI listener when a new inbound call arrives.
    Pushes an incoming_call event to the assigned agent via WebSocket.
    """
    from .models import Call

    try:
        call = Call.objects.select_related(
            'customer', 'agent', 'lead'
        ).get(pk=call_id)
    except Call.DoesNotExist:
        logger.error(f'[Notify] Call {call_id} not found')
        return

    payload = {
        'type':          'incoming_call',
        'uniqueid':      call.uniqueid,
        'caller':        call.caller,
        'callee':        call.callee,
        'queue':         call.queue or '',
        'customer_id':   str(call.customer_id)   if call.customer_id else None,
        'customer_name': call.customer.get_full_name() if call.customer else None,
        'lead_id':       str(call.lead_id)        if call.lead_id    else None,
    }

    channel_layer = get_channel_layer()

    # send to assigned agent
    if call.agent_id:
        try:
            async_to_sync(channel_layer.group_send)(
                f'agent_{call.agent_id}',
                {'type': 'call_event', 'payload': payload}
            )
            logger.info(f'[Notify] Sent to agent_{call.agent_id}')
        except Exception as exc:
            logger.error(f'[Notify] Agent push failed: {exc}')

    # also notify supervisors
    try:
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {'type': 'call_event', 'payload': payload}
        )
    except Exception as exc:
        logger.error(f'[Notify] Supervisors push failed: {exc}')

    return f'Notified: {call_id}'


@shared_task(bind=True, max_retries=3)
def notify_call_ended(self, call_id: str, status: str):
    """
    Called when a call ends.
    Pushes call_ended event so frontend can update the UI.
    """
    from .models import Call

    try:
        call = Call.objects.select_related('agent').get(pk=call_id)
    except Call.DoesNotExist:
        return

    payload = {
        'type':     'call_ended',
        'uniqueid': call.uniqueid,
        'call_id':  str(call.id),
        'status':   status,
    }

    channel_layer = get_channel_layer()

    if call.agent_id:
        try:
            async_to_sync(channel_layer.group_send)(
                f'agent_{call.agent_id}',
                {'type': 'call_event', 'payload': payload}
            )
        except Exception as exc:
            logger.error(f'[CallEnded] Push failed: {exc}')

    return f'CallEnded notified: {call_id}'


@shared_task(bind=True, max_retries=5, default_retry_delay=10)
def process_ami_event(self, event: dict):
    """
    Processes a raw AMI event dict from Asterisk 11 (Issabel).
    """
    from django.utils import timezone
    from .models import Call
    from apps.customers.models import CustomerPhone

    event_name = event.get('Event', '')

    # Asterisk 11 uses Uniqueid per channel — use Uniqueid1 for Bridge
    uniqueid = (
        event.get('Uniqueid1')   # Bridge event
        or event.get('Uniqueid') # all others
        or ''
    )

    if not uniqueid:
        return

    try:
        # ── Newchannel ────────────────────────────────────────
        if event_name == 'Newchannel':
            caller    = event.get('CallerIDNum', '').strip()
            callee    = event.get('Exten', '').strip()
            context   = event.get('Context', '')
            channel   = event.get('Channel', '')

            # skip the second leg (callee channel — CallerIDNum == callee)
            # we only create a Call record for the originating channel
            if not callee or caller == callee:
                return

            # direction: from-trunk = inbound, from-internal = outbound
            direction = 'inbound' if 'trunk' in context else 'outbound'

            # screen pop
            customer = None
            try:
                lookup_num = caller if direction == 'inbound' else callee
                digits = ''.join(c for c in lookup_num if c.isdigit())
                suffix = digits[-9:] if len(digits) >= 9 else digits
                if suffix:
                    phone = CustomerPhone.objects.select_related(
                        'customer'
                    ).filter(normalized__endswith=suffix).first()
                    if phone:
                        customer = phone.customer
            except Exception as e:
                logger.warning(f'[AMI] Screen pop failed: {e}')

            call, created = Call.objects.get_or_create(
                uniqueid = uniqueid,
                defaults = {
                    'caller':    caller,
                    'callee':    callee,
                    'direction': direction,
                    'status':    'ringing',
                    'customer':  customer,
                }
            )

            if created:
                logger.info(
                    f'[AMI] ✅ New call: {uniqueid} '
                    f'{caller} → {callee} ({direction})'
                )
                notify_incoming_call.delay(str(call.id))
            else:
                logger.debug(f'[AMI] Call already exists: {uniqueid}')

        # ── Bridge (Link = answered) ──────────────────────────
        elif event_name == 'Bridge':
            bridge_state = event.get('Bridgestate', '')
            if bridge_state == 'Link':
                updated = Call.objects.filter(
                    uniqueid = uniqueid,
                    status   = 'ringing',
                ).update(
                    status     = 'answered',
                    started_at = timezone.now(),
                )
                if updated:
                    logger.info(f'[AMI] ✅ Call answered: {uniqueid}')

        # ── Hangup ────────────────────────────────────────────
        elif event_name == 'Hangup':
            # only process the primary channel (Uniqueid matches)
            event_uid = event.get('Uniqueid', '')
            call = Call.objects.filter(uniqueid=event_uid).first()
            if not call:
                return

            # calculate duration
            from django.utils import timezone as tz
            duration = 0
            if call.started_at:
                duration = int((tz.now() - call.started_at).total_seconds())

            cause = str(event.get('Cause', '16'))
            status_map = {
                '16': 'no_answer' if call.status == 'ringing' else 'answered',
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
            }
            final_status = status_map.get(cause, 'no_answer')

            # don't overwrite if already completed
            if not call.is_completed:
                call.status   = final_status
                call.ended_at = tz.now()
                call.duration = duration
                call.save(update_fields=['status', 'ended_at', 'duration'])
                notify_call_ended.delay(str(call.id), final_status)
                logger.info(
                    f'[AMI] ✅ Call ended: {event_uid} '
                    f'→ {final_status} ({duration}s)'
                )

    except Exception as exc:
        logger.error(f'[AMI] Error processing {event_name}: {exc}')
        raise self.retry(exc=exc)
