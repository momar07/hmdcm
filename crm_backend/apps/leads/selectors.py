from django.db.models import Q, QuerySet
from .models import Lead


def get_all_leads(user=None) -> QuerySet:
    qs = Lead.objects.select_related(
        'status', 'priority', 'assigned_to', 'campaign'
    ).filter(is_active=True)
    if user and user.role == 'agent':
        qs = qs.filter(assigned_to=user)
    elif user and user.role == 'supervisor':
        qs = qs.filter(assigned_to__team=user.team)
    return qs


def get_lead_by_id(lead_id) -> Lead:
    return Lead.objects.select_related(
        'status', 'priority', 'assigned_to'
    ).get(pk=lead_id)


def get_leads_for_followup() -> QuerySet:
    from django.utils import timezone
    return Lead.objects.filter(
        followup_date__lte=timezone.now(),
        is_active=True,
        status__is_closed=False
    ).select_related('assigned_to')
