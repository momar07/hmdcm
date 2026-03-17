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
    Processes a raw AMI event dict from the Asterisk listener.
    Creates/updates Call records accordingly.
    """
    from django.utils import timezone
    from .models import Call
    from apps.customers.models import CustomerPhone

    event_name = event.get('Event', '')
    uniqueid   = event.get('Uniqueid') or event.get('Linkedid', '')

    try:
        if event_name == 'Newchannel':
            caller  = event.get('CallerIDNum', '')
            callee  = event.get('Exten', '')
            direction = 'inbound' if event.get('Context') == 'from-trunk' else 'outbound'

            # screen pop — find customer by phone
            customer = None
            try:
                phone = CustomerPhone.objects.select_related('customer').filter(
                    normalized__endswith=caller[-9:]
                ).first()
                if phone:
                    customer = phone.customer
            except Exception:
                pass

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
                notify_incoming_call.delay(str(call.id))
                logger.info(f'[AMI] New call created: {uniqueid}')

        elif event_name == 'Bridge':
            Call.objects.filter(uniqueid=uniqueid).update(
                status    = 'answered',
                started_at= timezone.now(),
            )
            logger.info(f'[AMI] Call answered: {uniqueid}')

        elif event_name in ('Hangup', 'SoftHangupRequest'):
            duration = int(event.get('Duration', 0))
            status_map = {
                '16': 'answered',
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
            }
            cause   = str(event.get('Cause', '16'))
            status  = status_map.get(cause, 'failed')

            updated = Call.objects.filter(
                uniqueid   = uniqueid,
                is_completed = False,
            ).update(
                status   = status,
                ended_at = timezone.now(),
                duration = duration,
            )

            if updated:
                call = Call.objects.filter(uniqueid=uniqueid).first()
                if call:
                    notify_call_ended.delay(str(call.id), status)
                logger.info(f'[AMI] Call ended: {uniqueid} → {status}')

    except Exception as exc:
        logger.error(f'[AMI] Error processing {event_name}: {exc}')
        raise self.retry(exc=exc)
