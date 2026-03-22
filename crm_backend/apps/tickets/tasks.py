import logging
from celery          import shared_task
from django.utils    import timezone
from django.db       import transaction

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# SLA BREACH CHECK — runs every 5 minutes via Celery beat
# ═══════════════════════════════════════════════════════════════════

@shared_task(
    bind=True,
    name="apps.tickets.tasks.check_sla_breaches",
    max_retries=3,
    default_retry_delay=60,
)
def check_sla_breaches(self):
    """
    Bulk-update tickets that have passed their SLA deadlines.
    Writes a TicketHistory entry for every newly breached ticket.
    """
    from .models import Ticket, TicketHistory

    now            = timezone.now()
    resolution_ids = []
    response_ids   = []

    try:
        with transaction.atomic():

            # ── Resolution deadline breach ────────────────────────
            resolution_qs = (
                Ticket.objects
                .filter(
                    resolution_deadline__lt = now,
                    sla_breached            = False,
                )
                .exclude(status__in=["resolved", "closed"])
                .values_list("id", flat=True)
            )
            resolution_ids = list(resolution_qs)

            if resolution_ids:
                Ticket.objects.filter(pk__in=resolution_ids).update(
                    sla_breached=True
                )
                TicketHistory.objects.bulk_create([
                    TicketHistory(
                        ticket_id = pk,
                        field     = "sla_breached",
                        old_value = "False",
                        new_value = "True",
                        note      = "SLA resolution deadline breached automatically",
                    )
                    for pk in resolution_ids
                ])
                logger.warning(
                    f"[SLA] {len(resolution_ids)} tickets marked as resolution-breached"
                )

            # ── Response deadline breach ──────────────────────────
            response_qs = (
                Ticket.objects
                .filter(
                    response_time_deadline__lt = now,
                    sla_response_breached      = False,
                    first_response_at__isnull  = True,
                )
                .exclude(status__in=["resolved", "closed"])
                .values_list("id", flat=True)
            )
            response_ids = list(response_qs)

            if response_ids:
                Ticket.objects.filter(pk__in=response_ids).update(
                    sla_response_breached=True
                )
                TicketHistory.objects.bulk_create([
                    TicketHistory(
                        ticket_id = pk,
                        field     = "sla_response_breached",
                        old_value = "False",
                        new_value = "True",
                        note      = "SLA first-response deadline breached automatically",
                    )
                    for pk in response_ids
                ])
                logger.warning(
                    f"[SLA] {len(response_ids)} tickets marked as response-breached"
                )

        return {
            "resolution_breached": len(resolution_ids),
            "response_breached":   len(response_ids),
            "checked_at":          now.isoformat(),
        }

    except Exception as exc:
        logger.error(f"[SLA] check_sla_breaches failed: {exc}")
        raise self.retry(exc=exc)


# ═══════════════════════════════════════════════════════════════════
# AUTO-CLOSE RESOLVED TICKETS — runs daily at midnight
# ═══════════════════════════════════════════════════════════════════

@shared_task(
    bind=True,
    name="apps.tickets.tasks.auto_close_resolved_tickets",
    max_retries=2,
)
def auto_close_resolved_tickets(self):
    """
    Auto-close tickets that have been in 'resolved' status
    for more than 48 hours with no further activity.
    """
    from .models import Ticket, TicketHistory

    cutoff = timezone.now() - timezone.timedelta(hours=48)

    try:
        with transaction.atomic():
            qs = (
                Ticket.objects
                .filter(
                    status      = "resolved",
                    resolved_at__lt = cutoff,
                )
                .values_list("id", flat=True)
            )
            ids = list(qs)

            if ids:
                Ticket.objects.filter(pk__in=ids).update(
                    status    = "closed",
                    closed_at = timezone.now(),
                )
                TicketHistory.objects.bulk_create([
                    TicketHistory(
                        ticket_id = pk,
                        field     = "status",
                        old_value = "resolved",
                        new_value = "closed",
                        note      = "Auto-closed after 48h in resolved state",
                    )
                    for pk in ids
                ])
                logger.info(f"[Tickets] Auto-closed {len(ids)} resolved tickets")

        return {"auto_closed": len(ids) if ids else 0}

    except Exception as exc:
        logger.error(f"[Tickets] auto_close failed: {exc}")
        raise self.retry(exc=exc)


# ═══════════════════════════════════════════════════════════════════
# ESCALATION REMINDER — runs every 30 minutes
# ═══════════════════════════════════════════════════════════════════

@shared_task(
    bind=True,
    name="apps.tickets.tasks.notify_escalated_tickets",
    max_retries=2,
)
def notify_escalated_tickets(self):
    """
    Push WebSocket notification to supervisors for
    any escalated open tickets older than 1 hour.
    """
    from .models import Ticket
    from channels.layers import get_channel_layer

    cutoff = timezone.now() - timezone.timedelta(hours=1)

    tickets = (
        Ticket.objects
        .filter(
            is_escalated = True,
            escalated_at__lt = cutoff,
        )
        .exclude(status__in=["resolved", "closed"])
        .select_related("customer", "agent", "escalated_to")
        .values(
            "id", "ticket_number", "title",
            "priority", "status",
            "customer_name", "escalated_at",
            "agent__first_name", "agent__last_name",
        )
    )

    if not tickets:
        return {"notified": 0}

    payload = {
        "type":    "escalated_tickets_reminder",
        "tickets": [
            {
                "id":            str(t["id"]),
                "ticket_number": t["ticket_number"],
                "title":         t["title"],
                "priority":      t["priority"],
                "customer_name": t["customer_name"],
                "agent_name":    f'{t["agent__first_name"]} {t["agent__last_name"]}',
                "escalated_at":  t["escalated_at"].isoformat() if t["escalated_at"] else None,
            }
            for t in tickets
        ],
    }

    import threading

    def _push():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            channel_layer = get_channel_layer()
            loop.run_until_complete(
                channel_layer.group_send(
                    "supervisors",
                    {"type": "call_event", "payload": payload},
                )
            )
            logger.info(f"[Tickets] Escalation reminder sent — {len(payload['tickets'])} tickets")
        finally:
            loop.close()

    t = threading.Thread(target=_push, daemon=True)
    t.start()
    t.join(timeout=5)

    return {"notified": len(payload["tickets"])}
