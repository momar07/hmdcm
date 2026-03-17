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
    from apps.users.models import Extension

    event_name = event.get('Event', '')
    uniqueid   = event.get('Uniqueid') or event.get('Linkedid', '')

    try:
        if event_name == 'Newchannel':
            caller    = event.get('CallerIDNum', '')
            callee    = event.get('Exten', '')
            context   = event.get('Context', '')
            chan_name  = event.get('Channel', '')

            # ── Direction detection ──────────────────────────────
            INBOUND_CONTEXTS  = {'from-trunk', 'from-pstn', 'from-did',
                                  'from-sip-external', 'ext-did', 'from-external'}
            INTERNAL_CONTEXTS = {'ext-local', 'from-internal', 'default'}

            if context in INBOUND_CONTEXTS:
                direction = 'inbound'
            elif context in INTERNAL_CONTEXTS:
                direction = 'internal'
            else:
                direction = 'outbound'

            # ── Agent detection from extension number ────────────
            agent = None
            # Channel format: SIP/200-0000xxxx → extract "200"
            if '/' in chan_name:
                ext_num = chan_name.split('/')[1].split('-')[0]
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    agent = ext_obj.user
                    logger.info(f'[AMI] Agent detected: {agent.email} (ext {ext_num})')
                except Extension.DoesNotExist:
                    logger.debug(f'[AMI] No agent for extension: {ext_num}')

            # ── Customer screen pop ──────────────────────────────
            customer = None
            lookup_num = caller if direction != 'outbound' else callee
            if lookup_num and len(lookup_num) >= 7:
                try:
                    phone = CustomerPhone.objects.select_related('customer').filter(
                        normalized__endswith=lookup_num[-9:]
                    ).first()
                    if phone:
                        customer = phone.customer
                        logger.info(f'[AMI] Customer matched: {customer}')
                except Exception as e:
                    logger.debug(f'[AMI] Screen pop error: {e}')

            call, created = Call.objects.get_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':    caller,
                    'callee':    callee,
                    'direction': direction,
                    'status':    'ringing',
                    'customer':  customer,
                    'agent':     agent,
                    'started_at': timezone.now(),
                }
            )

            if created:
                notify_incoming_call.apply(args=[str(call.id)])
                logger.info(f'[AMI] New call: {uniqueid} | dir={direction} | agent={agent}')

        elif event_name == 'Bridge':
            # Asterisk 11: Bridge has Uniqueid1 and Uniqueid2
            uid1 = event.get('Uniqueid1', '')
            uid2 = event.get('Uniqueid2', '')
            for uid in filter(None, [uid1, uid2, uniqueid]):
                updated = Call.objects.filter(uniqueid=uid, status='ringing').update(
                    status='answered',
                    started_at=timezone.now(),
                )
                if updated:
                    logger.info(f'[AMI] Call answered: {uid}')
                    break

        elif event_name in ('Hangup', 'SoftHangupRequest'):
            duration = int(event.get('Duration', 0))
            status_map = {
                '16': 'answered',
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
            }
            cause  = str(event.get('Cause', '16'))
            status = status_map.get(cause, 'failed')

            now = timezone.now()
            # Asterisk 11 لا يبعت Duration في Hangup — نحسبه من started_at
            call_obj = Call.objects.filter(uniqueid=uniqueid).first()
            if call_obj and call_obj.started_at and duration == 0:
                delta = (now - call_obj.started_at).total_seconds()
                duration = max(0, int(delta))

            updated = Call.objects.filter(
                uniqueid=uniqueid,
                is_completed=False,
            ).update(
                status=status,
                ended_at=now,
                duration=duration,
            )

            if updated:
                call = Call.objects.filter(uniqueid=uniqueid).first()
                if call:
                    notify_call_ended.apply(args=[str(call.id), status])
                logger.info(f'[AMI] Call ended: {uniqueid} → {status} ({duration}s)')

    except Exception as exc:
        logger.error(f'[AMI] Error processing {event_name}: {exc}')
        raise self.retry(exc=exc)
