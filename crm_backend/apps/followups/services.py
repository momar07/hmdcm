from django.utils import timezone
from .models import Followup


def create_followup(
    customer_id,
    assigned_to_id,
    title,
    scheduled_at,
    lead_id=None,
    call_id=None,
    followup_type='call',
    description='',
    **kwargs,
) -> Followup:
    return Followup.objects.create(
        customer_id=customer_id,
        lead_id=lead_id,
        call_id=call_id,
        assigned_to_id=assigned_to_id,
        title=title,
        scheduled_at=scheduled_at,
        followup_type=followup_type,
        description=description,
    )


def complete_followup(followup_id) -> Followup:
    fu = Followup.objects.get(pk=followup_id)
    fu.status       = 'completed'
    fu.completed_at = timezone.now()
    fu.save(update_fields=['status', 'completed_at'])
    return fu


def cancel_followup(followup_id) -> Followup:
    fu = Followup.objects.get(pk=followup_id)
    fu.status = 'cancelled'
    fu.save(update_fields=['status'])
    return fu


def reschedule_followup(followup_id, new_scheduled_at) -> Followup:
    fu = Followup.objects.get(pk=followup_id)
    fu.status       = 'rescheduled'
    fu.scheduled_at = new_scheduled_at
    fu.save(update_fields=['status', 'scheduled_at'])
    return fu


def update_followup(followup_id, **fields) -> Followup:
    allowed = {'title', 'description', 'followup_type', 'scheduled_at', 'status'}
    update  = {k: v for k, v in fields.items() if k in allowed}
    Followup.objects.filter(pk=followup_id).update(**update)
    return Followup.objects.get(pk=followup_id)
