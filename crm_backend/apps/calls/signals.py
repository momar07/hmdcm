"""
Auto-log call.answered and call.rejected to ActivityLog whenever a
CallAgentEvent of those types is created.

Lightweight bridge between the legacy CallAgentEvent table and the unified
ActivityLog feed used by the admin Audit page.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction

from apps.auditlog.services import log_activity
from apps.auditlog import constants as audit_actions
from .models import CallAgentEvent


# Map CallAgentEvent.event_type → ActivityLog verb
_EVENT_TYPE_TO_VERB = {
    'answered': audit_actions.CALL_ANSWERED,
    'rejected': audit_actions.CALL_REJECTED,
}


@receiver(post_save, sender=CallAgentEvent)
def log_call_agent_event(sender, instance, created, **kwargs):
    """Create an ActivityLog row when a relevant CallAgentEvent is born."""
    if not created:
        return

    verb = _EVENT_TYPE_TO_VERB.get(instance.event_type)
    if not verb:
        return  # not an event we mirror to ActivityLog

    if not instance.agent:
        return  # cannot log without an actor

    call = instance.call
    lead = getattr(call, 'lead', None) if call else None
    direction = getattr(call, 'direction', None) if call else None

    desc_verb = 'Answered' if instance.event_type == 'answered' else 'Rejected'
    description = f'{desc_verb} call {call.id}' if call else f'{desc_verb} call'

    def _do_log():
        try:
            log_activity(
                user=instance.agent,
                verb=verb,
                description=description,
                lead=lead,
                call=call,
                extra={
                    'call_id':       str(call.id) if call else None,
                    'event_id':      str(instance.id),
                    'ring_duration': instance.ring_duration,
                    'direction':     direction,
                    'note':          instance.note or None,
                    'role':          getattr(instance.agent, 'role', None),
                },
            )
        except Exception:
            pass  # never break the save() if logging fails

    transaction.on_commit(_do_log)
