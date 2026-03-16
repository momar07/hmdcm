from django.utils import timezone
from .models import Call, CallEvent, CallDisposition


def create_call_from_ami(event_data: dict) -> Call:
    """Create a Call record from an Asterisk AMI event payload."""
    call, _ = Call.objects.get_or_create(
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
    return call


def update_call_status(uniqueid: str, new_status: str, **kwargs):
    updates = {'status': new_status, **kwargs}
    if new_status == 'answered' and 'answered_at' not in updates:
        updates['answered_at'] = timezone.now()
    if new_status in ('no_answer', 'busy', 'failed') and 'ended_at' not in updates:
        updates['ended_at'] = timezone.now()
    Call.objects.filter(uniqueid=uniqueid).update(**updates)


def submit_disposition(call_id, disposition_id, agent_id, notes='') -> CallDisposition:
    return CallDisposition.objects.create(
        call_id=call_id,
        disposition_id=disposition_id,
        agent_id=agent_id,
        notes=notes,
    )
