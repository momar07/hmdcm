from django.utils import timezone
from .models import Followup


def create_followup(customer_id, assigned_to_id, title, scheduled_at,
                    lead_id=None, call_id=None, followup_type='call',
                    description='') -> Followup:
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


def complete_followup(followup_id):
    Followup.objects.filter(pk=followup_id).update(
        status='completed', completed_at=timezone.now()
    )
