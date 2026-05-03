from django.db.models  import QuerySet, Q
from django.utils      import timezone
from .models           import Call


def get_all_calls(user=None) -> QuerySet:
    qs = Call.objects.select_related(
        'agent', 'lead'
    ).prefetch_related('events').all()
    if user and user.role == 'agent':
        # Agent sees: their own calls + unassigned inbound calls
        qs = qs.filter(
            Q(agent=user) |
            Q(agent__isnull=True, direction='inbound')
        )
    elif user and user.role == 'supervisor':
        # Supervisor: team filter only on /calls/ list page — NOT when
        # filtering by lead (lead filter is applied by the ViewSet)
        # so we don't restrict here to avoid hiding calls on lead page
        if user.team_id:
            qs = qs.filter(
                Q(agent__team=user.team) | Q(agent__isnull=True)
            )
    # admin sees all — no filter
    return qs.order_by('-created_at')


def get_call_by_id(call_id) -> Call:
    return Call.objects.select_related(
        'agent', 'lead'
    ).get(pk=call_id)


def get_active_calls() -> QuerySet:
    return Call.objects.filter(
        status__in=['ringing', 'answered']
    ).select_related('agent', 'lead').order_by('-started_at')


def get_pending_completions(agent=None) -> QuerySet:
    qs = Call.objects.filter(
        status='answered',
        is_completed=False,
    ).select_related('agent', 'lead')
    if agent and agent.role == 'agent':
        qs = qs.filter(agent=agent)
    return qs.order_by('-started_at')


def get_agent_calls_today(agent) -> QuerySet:
    start_of_day = timezone.now().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return Call.objects.filter(
        agent=agent,
        started_at__gte=start_of_day,
    ).order_by('-started_at')


def get_calls_by_date_range(
    date_from=None, date_to=None,
    agent=None, direction=None, status=None,
) -> QuerySet:
    qs = Call.objects.select_related('agent', 'lead').all()
    if date_from:
        qs = qs.filter(started_at__gte=date_from)
    if date_to:
        qs = qs.filter(started_at__lte=date_to)
    if agent:
        qs = qs.filter(agent=agent)
    if direction:
        qs = qs.filter(direction=direction)
    if status:
        qs = qs.filter(status=status)
    return qs.order_by('-started_at')


def get_calls_by_lead(lead_id) -> QuerySet:
    return Call.objects.filter(
        lead_id=lead_id
    ).select_related('agent').order_by('-started_at')


def get_calls_by_phone(phone_number: str) -> QuerySet:
    return Call.objects.filter(
        Q(caller=phone_number) | Q(callee=phone_number)
    ).select_related('agent', 'lead').order_by('-started_at')
