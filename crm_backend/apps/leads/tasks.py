from celery import shared_task
from django.utils import timezone


@shared_task
def run_daily_score_decay():
    """
    يشتغل كل يوم — يطبق time decay على كل الـ leads النشطة.
    """
    from .models import Lead
    from .scoring import apply_time_decay

    active_leads = Lead.objects.filter(
        is_active=True
    ).exclude(
        lifecycle_stage__in=['customer', 'churned']
    )

    count = 0
    for lead in active_leads:
        apply_time_decay(lead)
        count += 1

    return f'Time decay applied to {count} leads'
