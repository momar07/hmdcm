import django_filters
from django.utils import timezone
from .models import Ticket, TicketStatus, TicketPriority, TicketType, TicketSource


class TicketFilter(django_filters.FilterSet):

    # ── Exact filters ─────────────────────────────────────────────
    status      = django_filters.MultipleChoiceFilter(choices=TicketStatus.choices)
    priority    = django_filters.MultipleChoiceFilter(choices=TicketPriority.choices)
    ticket_type = django_filters.MultipleChoiceFilter(choices=TicketType.choices)
    source      = django_filters.MultipleChoiceFilter(choices=TicketSource.choices)
    agent       = django_filters.UUIDFilter(field_name="agent__id")
    lead        = django_filters.UUIDFilter(field_name="lead__id")
    queue       = django_filters.CharFilter(lookup_expr="iexact")

    # ── Boolean filters ───────────────────────────────────────────
    sla_breached  = django_filters.BooleanFilter()
    is_escalated  = django_filters.BooleanFilter()
    is_overdue    = django_filters.BooleanFilter(method="filter_overdue")

    # ── Text search ───────────────────────────────────────────────
    search = django_filters.CharFilter(method="filter_search")

    # ── Date range ────────────────────────────────────────────────
    created_after  = django_filters.DateTimeFilter(
                       field_name="created_at", lookup_expr="gte"
                     )
    created_before = django_filters.DateTimeFilter(
                       field_name="created_at", lookup_expr="lte"
                     )

    # ── Tag filter ────────────────────────────────────────────────
    tag = django_filters.CharFilter(method="filter_tag")

    class Meta:
        model  = Ticket
        fields = [
            "status", "priority", "ticket_type", "source",
            "agent", "lead", "queue",
            "sla_breached", "is_escalated",
        ]

    def filter_search(self, queryset, name, value):
        """Search across title, lead name, phone number."""
        from django.db.models import Q
        return queryset.filter(
            Q(title__icontains=value)          |
            Q(customer_name__icontains=value)  |
            Q(phone_number__icontains=value)   |
            Q(description__icontains=value)
        )

    def filter_overdue(self, queryset, name, value):
        """Filter tickets past their resolution deadline."""
        now = timezone.now()
        if value:
            return queryset.filter(
                resolution_deadline__lt=now,
            ).exclude(status__in=["resolved", "closed"])
        return queryset.exclude(
            resolution_deadline__lt=now,
        )

    def filter_tag(self, queryset, name, value):
        """Filter by tag name."""
        return queryset.filter(tags__name__iexact=value)
