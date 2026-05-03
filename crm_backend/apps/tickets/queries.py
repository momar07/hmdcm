from django.db.models import Count, Avg, Q, F, ExpressionWrapper, DurationField
from django.utils     import timezone
from .models          import Ticket


def get_open_tickets():
    """All open tickets — optimized with select_related."""
    return (
        Ticket.objects
        .filter(status="open")
        .select_related("lead", "agent", "sla_policy")
        .prefetch_related("tags")
        .order_by("-updated_at")
    )


def get_tickets_by_agent(agent_id: str):
    """All active tickets assigned to a specific agent."""
    return (
        Ticket.objects
        .filter(agent_id=agent_id)
        .exclude(status="closed")
        .select_related("lead", "agent")
        .prefetch_related("tags")
        .order_by("priority", "-updated_at")
    )


def get_overdue_sla_tickets():
    """Tickets past resolution deadline and not yet resolved."""
    return (
        Ticket.objects
        .filter(
            resolution_deadline__lt=timezone.now(),
            sla_breached=False,
        )
        .exclude(status__in=["resolved", "closed"])
        .select_related("lead", "agent")
        .order_by("resolution_deadline")
    )


def get_tickets_for_lead(lead_id: str):
    """All tickets for a lead — used in lead timeline."""
    return (
        Ticket.objects
        .filter(lead_id=lead_id)
        .select_related("agent")
        .prefetch_related("tags")
        .only(
            "id", "ticket_number", "title", "status", "priority",
            "created_at", "resolved_at", "source",
            "agent__first_name", "agent__last_name",
        )
        .order_by("-created_at")
    )


def get_dashboard_stats(agent_id: str = None) -> dict:
    """
    Real-time dashboard counters.
    Pass agent_id to scope to one agent, or None for global view.
    """
    qs = Ticket.objects.all()
    if agent_id:
        qs = qs.filter(agent_id=agent_id)

    now = timezone.now()

    return qs.aggregate(
        total_open         = Count("id", filter=Q(status="open")),
        total_in_progress  = Count("id", filter=Q(status="in_progress")),
        total_pending      = Count("id", filter=Q(status="pending")),
        total_resolved     = Count("id", filter=Q(status="resolved")),
        total_closed       = Count("id", filter=Q(status="closed")),
        total_breached     = Count("id", filter=Q(sla_breached=True)),
        total_escalated    = Count("id", filter=Q(is_escalated=True)),
        urgent_open        = Count("id", filter=Q(
                               status="open", priority="urgent"
                             )),
        overdue_count      = Count("id", filter=Q(
                               resolution_deadline__lt=now,
                             ) & ~Q(status__in=["resolved", "closed"])),
        avg_resolution_hrs = Avg(
            ExpressionWrapper(
                F("resolved_at") - F("created_at"),
                output_field=DurationField(),
            ),
            filter=Q(resolved_at__isnull=False),
        ),
    )


def get_agent_workload() -> list:
    """Per-agent ticket counts — for supervisor dashboard."""
    return list(
        Ticket.objects
        .exclude(status="closed")
        .values(
            "agent__id",
            "agent__first_name",
            "agent__last_name",
        )
        .annotate(
            open_count     = Count("id", filter=Q(status="open")),
            in_prog_count  = Count("id", filter=Q(status="in_progress")),
            breached_count = Count("id", filter=Q(sla_breached=True)),
            escalated_count = Count("id", filter=Q(is_escalated=True)),
            total          = Count("id"),
        )
        .order_by("-open_count")
    )


def get_tickets_by_phone(phone: str):
    """
    Find tickets by normalized phone number.
    Used during incoming calls — screen pop.
    """
    import re
    normalized = re.sub(r"\D", "", phone)[-9:]
    return (
        Ticket.objects
        .filter(phone_number_normalized__endswith=normalized)
        .exclude(status="closed")
        .select_related("lead", "agent")
        .order_by("-created_at")
    )


def get_tickets_by_call_id(asterisk_call_id: str):
    """Find tickets linked to a specific Asterisk call."""
    return (
        Ticket.objects
        .filter(asterisk_call_id=asterisk_call_id)
        .select_related("lead", "agent")
        .order_by("-created_at")
    )
