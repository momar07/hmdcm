import logging
from django.utils import timezone
from django.db    import transaction
from .models import Call, CallEvent, CallDisposition, CallRecording

logger = logging.getLogger(__name__)


# ── Create ───────────────────────────────────────────────────────────────────

def create_call_from_ami(event_data: dict) -> Call:
    """
    Create or retrieve a Call record from an AMI event payload.
    Expected keys: uniqueid, linkedid, calleridnum, exten, direction
    """
    call, created = Call.objects.get_or_create(
        uniqueid=event_data['uniqueid'],
        defaults={
            'linkedid':      event_data.get('linkedid', ''),
            'caller_number': event_data.get('calleridnum', ''),
            'callee_number': event_data.get('exten', ''),
            'direction':     event_data.get('direction', 'inbound'),
            'status':        'ringing',
            'started_at':    timezone.now(),
        }
    )
    if created:
        logger.info(f'[calls.services] New call created: {call.uniqueid}')
    return call


# ── Status Updates ───────────────────────────────────────────────────────────

def update_call_status(uniqueid: str, new_status: str, **kwargs) -> int:
    """
    Update a call's status by uniqueid.
    Automatically sets answered_at / ended_at timestamps.
    Returns number of rows updated.
    """
    updates = {'status': new_status, **kwargs}

    if new_status == 'answered' and 'answered_at' not in updates:
        updates['answered_at'] = timezone.now()

    if new_status in ('no_answer', 'busy', 'failed', 'voicemail', 'transferred') \
            and 'ended_at' not in updates:
        updates['ended_at'] = timezone.now()

    rows = Call.objects.filter(uniqueid=uniqueid).update(**updates)
    logger.info(f'[calls.services] Status → {new_status} for uniqueid={uniqueid} ({rows} rows)')
    return rows


def close_call(uniqueid: str, duration: int = 0, status: str = 'answered') -> Call | None:
    """
    Finalise a call — set status, duration, ended_at.
    Returns the updated Call instance or None if not found.
    """
    try:
        call = Call.objects.get(uniqueid=uniqueid)
    except Call.DoesNotExist:
        logger.warning(f'[calls.services] close_call: uniqueid={uniqueid} not found')
        return None

    call.status   = status
    call.duration = duration
    call.ended_at = timezone.now()
    if status == 'answered' and not call.answered_at:
        call.answered_at = timezone.now()
    call.save(update_fields=['status', 'duration', 'ended_at', 'answered_at'])
    logger.info(f'[calls.services] Closed call {uniqueid} status={status} duration={duration}s')
    return call


# ── Agent ────────────────────────────────────────────────────────────────────

def attach_agent_to_call(uniqueid: str, agent_id: str) -> int:
    """
    Link an agent (by UUID) to a call identified by uniqueid.
    Also tries to resolve the agent's Extension and attach it.
    """
    from apps.users.models import User
    try:
        agent = User.objects.select_related('extension').get(pk=agent_id)
    except User.DoesNotExist:
        logger.warning(f'[calls.services] attach_agent: agent {agent_id} not found')
        return 0

    updates: dict = {'agent': agent}
    if hasattr(agent, 'extension') and agent.extension:
        updates['extension'] = agent.extension

    rows = Call.objects.filter(uniqueid=uniqueid).update(**updates)
    logger.info(f'[calls.services] Agent {agent.email} attached to call {uniqueid}')
    return rows


# ── Events ───────────────────────────────────────────────────────────────────

def record_call_event(call_id, event_type: str, data: dict = None) -> CallEvent | None:
    """
    Append a CallEvent to a call.
    call_id can be a UUID or a Call instance.
    """
    try:
        if isinstance(call_id, Call):
            call = call_id
        else:
            call = Call.objects.get(pk=call_id)
    except Call.DoesNotExist:
        logger.warning(f'[calls.services] record_call_event: call {call_id} not found')
        return None

    allowed = {c[0] for c in CallEvent.EVENT_CHOICES}
    if event_type not in allowed:
        logger.warning(f'[calls.services] Unknown event type: {event_type}')
        return None

    event = CallEvent.objects.create(
        call=call,
        event=event_type,
        data=data or {},
    )
    return event


# ── Disposition ──────────────────────────────────────────────────────────────

@transaction.atomic
def submit_disposition(
    call_id,
    disposition_id,
    agent_id,
    notes: str = '',
    auto_followup: bool = False,
) -> CallDisposition:
    """
    Submit a disposition for a completed call.
    If auto_followup=True and the disposition requires_followup,
    a Followup record is created automatically.
    """
    # prevent duplicate dispositions
    existing = CallDisposition.objects.filter(call_id=call_id).first()
    if existing:
        logger.info(f'[calls.services] Disposition already exists for call {call_id}')
        return existing

    disp_obj = CallDisposition.objects.create(
        call_id=call_id,
        disposition_id=disposition_id,
        agent_id=agent_id,
        notes=notes,
    )

    # auto follow-up if the disposition requires it
    if auto_followup:
        try:
            from apps.followups.services import create_followup_from_disposition
            create_followup_from_disposition(disp_obj)
        except Exception as exc:
            logger.error(f'[calls.services] Auto-followup failed: {exc}')

    logger.info(
        f'[calls.services] Disposition submitted: call={call_id} '
        f'disposition={disposition_id}'
    )
    return disp_obj


# ── Recording ────────────────────────────────────────────────────────────────

def attach_recording(
    call_id,
    file_path: str,
    file_url:  str = '',
    file_size: int = 0,
    fmt:       str = 'wav',
    duration:  int = 0,
) -> CallRecording:
    """
    Attach a recording file to a call.
    Also updates Call.recording_file and Call.recording_url for quick access.
    """
    recording, _ = CallRecording.objects.update_or_create(
        call_id=call_id,
        defaults={
            'file_path': file_path,
            'file_url':  file_url,
            'file_size': file_size,
            'format':    fmt,
            'duration':  duration,
        }
    )
    # mirror on the Call row for easy filtering
    Call.objects.filter(pk=call_id).update(
        recording_file=file_path,
        recording_url=file_url,
    )
    logger.info(f'[calls.services] Recording attached to call {call_id}: {file_path}')
    return recording
