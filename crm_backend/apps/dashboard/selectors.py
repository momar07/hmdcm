from django.db.models import Count, Avg, Q
from django.utils import timezone
from datetime import timedelta


def get_agent_dashboard(user) -> dict:
    """
    Personal stats for the logged-in agent — today only.
    """
    from apps.calls.models import Call
    from apps.followups.models import Followup
    from apps.leads.models import Lead

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

    calls_today = Call.objects.filter(agent=user, started_at__gte=today_start)
    followups   = Followup.objects.filter(assigned_to=user, status='pending')

    return {
        'calls_today':        calls_today.count(),
        'answered_today':     calls_today.filter(status='answered').count(),
        'avg_duration_today': round(
            calls_today.aggregate(Avg('duration'))['duration__avg'] or 0, 2
        ),
        'open_leads':         Lead.objects.filter(
            assigned_to=user, is_active=True, status__is_closed=False
        ).count(),
        'pending_followups':  followups.count(),
        'due_followups':      followups.filter(
            scheduled_at__lte=timezone.now()
        ).count(),
    }


def get_supervisor_dashboard(user) -> dict:
    """
    Team-wide stats for the supervisor.
    """
    from apps.calls.models import Call
    from apps.users.models import User

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    team_agents = User.objects.filter(team=user.team, role='agent', is_active=True)
    agent_ids   = list(team_agents.values_list('id', flat=True))

    calls_today = Call.objects.filter(
        agent_id__in=agent_ids, started_at__gte=today_start
    )

    return {
        'team_size':          team_agents.count(),
        'agents_available':   team_agents.filter(status='available').count(),
        'agents_on_call':     team_agents.filter(status='on_call').count(),
        'calls_today':        calls_today.count(),
        'answered_today':     calls_today.filter(status='answered').count(),
        'avg_duration_today': round(
            calls_today.aggregate(Avg('duration'))['duration__avg'] or 0, 2
        ),
        'active_calls':       Call.objects.filter(
            agent_id__in=agent_ids, status='ringing'
        ).count(),
    }


def get_admin_dashboard() -> dict:
    """
    System-wide overview for admins.
    """
    from apps.calls.models import Call
    from apps.customers.models import Customer
    from apps.leads.models import Lead
    from apps.users.models import User

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

    return {
        'total_customers':    Customer.objects.filter(is_active=True).count(),
        'total_leads':        Lead.objects.filter(is_active=True).count(),
        'calls_today':        Call.objects.filter(started_at__gte=today_start).count(),
        'active_agents':      User.objects.filter(
            role='agent', is_active=True
        ).exclude(status='offline').count(),
        'total_agents':       User.objects.filter(role='agent', is_active=True).count(),
        'calls_this_week':    Call.objects.filter(
            started_at__gte=today_start - timedelta(days=7)
        ).count(),
    }
