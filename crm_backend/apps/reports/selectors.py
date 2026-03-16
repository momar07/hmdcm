from django.db.models import Count, Avg, Sum, Q, F
from django.utils import timezone
from datetime import timedelta


def _date_range(date_from, date_to):
    date_from = date_from or (timezone.now() - timedelta(days=30))
    date_to   = date_to   or timezone.now()
    return date_from, date_to


def get_agent_performance_report(date_from=None, date_to=None, team_id=None) -> list:
    from apps.users.models import User
    date_from, date_to = _date_range(date_from, date_to)
    qs = User.objects.filter(role='agent', is_active=True)
    if team_id:
        qs = qs.filter(team_id=team_id)

    return list(
        qs.annotate(
            total_calls=Count(
                'calls',
                filter=Q(calls__started_at__range=(date_from, date_to))
            ),
            answered_calls=Count(
                'calls',
                filter=Q(calls__status='answered',
                         calls__started_at__range=(date_from, date_to))
            ),
            avg_duration=Avg(
                'calls__duration',
                filter=Q(calls__started_at__range=(date_from, date_to))
            ),
            total_leads=Count(
                'assigned_leads',
                filter=Q(assigned_leads__created_at__range=(date_from, date_to))
            ),
            closed_leads=Count(
                'assigned_leads',
                filter=Q(assigned_leads__status__is_closed=True,
                         assigned_leads__created_at__range=(date_from, date_to))
            ),
        ).values(
            'id', 'first_name', 'last_name', 'email',
            'total_calls', 'answered_calls', 'avg_duration',
            'total_leads', 'closed_leads',
        )
    )


def get_call_summary_report(date_from=None, date_to=None) -> dict:
    from apps.calls.models import Call
    date_from, date_to = _date_range(date_from, date_to)
    calls = Call.objects.filter(started_at__range=(date_from, date_to))
    return {
        'total':        calls.count(),
        'answered':     calls.filter(status='answered').count(),
        'no_answer':    calls.filter(status='no_answer').count(),
        'busy':         calls.filter(status='busy').count(),
        'failed':       calls.filter(status='failed').count(),
        'inbound':      calls.filter(direction='inbound').count(),
        'outbound':     calls.filter(direction='outbound').count(),
        'avg_duration': round(
            calls.aggregate(Avg('duration'))['duration__avg'] or 0, 2
        ),
        'total_duration': calls.aggregate(Sum('duration'))['duration__sum'] or 0,
    }


def get_lead_pipeline_report() -> list:
    from apps.leads.models import Lead
    return list(
        Lead.objects.filter(is_active=True)
        .values('status__name', 'status__color')
        .annotate(count=Count('id'), total_value=Sum('value'))
        .order_by('status__order')
    )


def get_followup_rate_report(date_from=None, date_to=None) -> dict:
    from apps.followups.models import Followup
    date_from, date_to = _date_range(date_from, date_to)
    qs = Followup.objects.filter(scheduled_at__range=(date_from, date_to))
    total     = qs.count()
    completed = qs.filter(status='completed').count()
    return {
        'total':     total,
        'completed': completed,
        'pending':   qs.filter(status='pending').count(),
        'cancelled': qs.filter(status='cancelled').count(),
        'rate':      round((completed / total * 100) if total else 0, 2),
    }


def get_campaign_stats_report(campaign_id=None) -> list:
    from apps.campaigns.models import CampaignMember, Campaign
    qs = Campaign.objects.filter(is_active=True)
    if campaign_id:
        qs = qs.filter(pk=campaign_id)

    return list(
        qs.annotate(
            total_members=Count('members'),
            called=Count('members', filter=Q(members__status='called')),
            answered=Count('members', filter=Q(members__status='answered')),
            completed=Count('members', filter=Q(members__status='completed')),
        ).values(
            'id', 'name', 'status', 'total_members',
            'called', 'answered', 'completed',
        )
    )
