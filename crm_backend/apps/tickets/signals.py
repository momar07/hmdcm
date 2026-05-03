from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch           import receiver
from django.utils              import timezone
from django.db                 import models


# ═══════════════════════════════════════════════════════════════════
# TRACKED FIELDS — any change here gets logged to TicketHistory
# ═══════════════════════════════════════════════════════════════════

TRACKED_FIELDS = [
    "status", "priority", "agent_id",
    "ticket_type", "category", "is_escalated", "escalated_to_id",
]


# ── Snapshot old values before save ──────────────────────────────

@receiver(pre_save, sender="tickets.Ticket")
def capture_old_values(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        from .models import Ticket
        instance._pre_save = Ticket.objects.get(pk=instance.pk)
    except Exception:
        instance._pre_save = None


# ── Post-save: audit log + SLA + timestamps ───────────────────────

@receiver(post_save, sender="tickets.Ticket")
def handle_ticket_save(sender, instance, created, **kwargs):
    from .models import Ticket, TicketHistory
    now = timezone.now()

    if created:
        # ── Apply SLA deadlines ───────────────────────────────────
        instance.apply_sla()
        Ticket.objects.filter(pk=instance.pk).update(
            response_time_deadline = instance.response_time_deadline,
            resolution_deadline    = instance.resolution_deadline,
            sla_policy             = instance.sla_policy,
            customer_name          = (
                instance.lead.get_full_name()
                if instance.lead else ""
            ),
            customer_email         = (
                instance.lead.email
                if instance.lead else ""
            ),
        )
        # ── Log creation ──────────────────────────────────────────
        TicketHistory.objects.create(
            ticket    = instance,
            field     = "status",
            old_value = "",
            new_value = instance.status,
            note      = f"Ticket #{instance.ticket_number} created",
        )
        return

    # ── Diff tracked fields and write history ─────────────────────
    old = getattr(instance, "_pre_save", None)
    if not old:
        return

    history_entries = []
    for field in TRACKED_FIELDS:
        old_val = str(getattr(old, field) or "")
        new_val = str(getattr(instance, field) or "")
        if old_val != new_val:
            history_entries.append(TicketHistory(
                ticket    = instance,
                field     = field,
                old_value = old_val,
                new_value = new_val,
            ))

    if history_entries:
        TicketHistory.objects.bulk_create(history_entries)

    # ── Set resolved_at / closed_at ───────────────────────────────
    if old.status != "resolved" and instance.status == "resolved":
        Ticket.objects.filter(pk=instance.pk).update(resolved_at=now)

    if old.status != "closed" and instance.status == "closed":
        Ticket.objects.filter(pk=instance.pk).update(closed_at=now)

    # ── Set escalated_at ──────────────────────────────────────────
    if not old.is_escalated and instance.is_escalated:
        Ticket.objects.filter(pk=instance.pk).update(escalated_at=now)


# ── Note counters + first response tracking ───────────────────────

@receiver(post_save, sender="tickets.TicketNote")
def handle_note_save(sender, instance, created, **kwargs):
    from .models import Ticket, TicketNote
    if not created:
        return

    # Increment counter
    Ticket.objects.filter(pk=instance.ticket_id).update(
        note_count=models.F("note_count") + 1
    )

    # Track first public response for SLA
    if instance.visibility == "public":
        ticket = Ticket.objects.filter(
            pk=instance.ticket_id,
            first_response_at__isnull=True,
        ).first()
        if ticket:
            Ticket.objects.filter(pk=ticket.pk).update(
                first_response_at=instance.created_at
            )
            TicketNote.objects.filter(pk=instance.pk).update(
                is_first_response=True
            )


@receiver(post_delete, sender="tickets.TicketNote")
def handle_note_delete(sender, instance, **kwargs):
    from .models import Ticket
    Ticket.objects.filter(pk=instance.ticket_id).update(
        note_count=models.F("note_count") - 1
    )


# ── Attachment counters ───────────────────────────────────────────

@receiver(post_save, sender="tickets.TicketAttachment")
def handle_attachment_save(sender, instance, created, **kwargs):
    from .models import Ticket
    if created:
        Ticket.objects.filter(pk=instance.ticket_id).update(
            attachment_count=models.F("attachment_count") + 1
        )


@receiver(post_delete, sender="tickets.TicketAttachment")
def handle_attachment_delete(sender, instance, **kwargs):
    from .models import Ticket
    Ticket.objects.filter(pk=instance.ticket_id).update(
        attachment_count=models.F("attachment_count") - 1
    )
