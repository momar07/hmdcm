from django.db.models import QuerySet
from django.utils import timezone
from .models import Followup


def get_followups(user=None) -> QuerySet:
    qs = Followup.objects.select_related('customer', 'lead', 'call', 'assigned_to')
    if user and user.role == 'agent':
        qs = qs.filter(assigned_to=user)
    elif user and user.role == 'supervisor':
        qs = qs.filter(assigned_to__team=user.team)
    return qs


def get_due_followups() -> QuerySet:
    return Followup.objects.filter(
        status='pending',
        scheduled_at__lte=timezone.now(),
        reminder_sent=False
    ).select_related('assigned_to', 'customer')
