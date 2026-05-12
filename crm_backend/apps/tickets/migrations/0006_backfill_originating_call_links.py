"""
Backfill data migration:
Copy every existing `<entity>.call` FK into the new <Entity>CallLink table
with reason='originating'.

This preserves the historical "this entity was created from this call"
information using the new M2M-style link model.

Idempotent: uses get_or_create on (entity, call).
"""
from django.db import migrations


def backfill_links(apps, schema_editor):
    Ticket           = apps.get_model("tickets",   "Ticket")
    TicketCallLink   = apps.get_model("tickets",   "TicketCallLink")
    ApprovalRequest  = apps.get_model("approvals", "ApprovalRequest")
    ApprovalCallLink = apps.get_model("approvals", "ApprovalCallLink")
    Followup         = apps.get_model("followups", "Followup")
    FollowupCallLink = apps.get_model("followups", "FollowupCallLink")
    Quotation        = apps.get_model("sales",     "Quotation")
    QuotationCallLink= apps.get_model("sales",     "QuotationCallLink")

    summary = {"ticket": 0, "approval": 0, "followup": 0, "quotation": 0}

    # Tickets
    for t in Ticket.objects.filter(call__isnull=False).only("id", "call_id"):
        _, created = TicketCallLink.objects.get_or_create(
            ticket_id=t.id,
            call_id=t.call_id,
            defaults={
                "reason": "originating",
                "action_summary": "Ticket originally created from this call",
            },
        )
        if created:
            summary["ticket"] += 1

    # Approvals
    for a in ApprovalRequest.objects.filter(call__isnull=False).only("id", "call_id"):
        _, created = ApprovalCallLink.objects.get_or_create(
            approval_id=a.id,
            call_id=a.call_id,
            defaults={
                "reason": "originating",
                "action_summary": "Approval originally requested during this call",
            },
        )
        if created:
            summary["approval"] += 1

    # Followups
    for f in Followup.objects.filter(call__isnull=False).only("id", "call_id"):
        _, created = FollowupCallLink.objects.get_or_create(
            followup_id=f.id,
            call_id=f.call_id,
            defaults={
                "reason": "originating",
                "action_summary": "Followup originally scheduled from this call",
            },
        )
        if created:
            summary["followup"] += 1

    # Quotations
    for q in Quotation.objects.filter(call__isnull=False).only("id", "call_id"):
        _, created = QuotationCallLink.objects.get_or_create(
            quotation_id=q.id,
            call_id=q.call_id,
            defaults={
                "reason": "originating",
                "action_summary": "Quotation originally created during this call",
            },
        )
        if created:
            summary["quotation"] += 1

    print(
        f"\n[backfill] Originating links created: "
        f"tickets={summary['ticket']}, approvals={summary['approval']}, "
        f"followups={summary['followup']}, quotations={summary['quotation']}"
    )


def reverse_backfill(apps, schema_editor):
    """Remove only the 'originating' links — leave any new auto/manual ones."""
    for app_label, model_name in [
        ("tickets",   "TicketCallLink"),
        ("approvals", "ApprovalCallLink"),
        ("followups", "FollowupCallLink"),
        ("sales",     "QuotationCallLink"),
    ]:
        Model = apps.get_model(app_label, model_name)
        Model.objects.filter(reason="originating").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tickets",   "0005_add_ticket_call_link_and_history_call"),
        ("approvals", "0005_add_approval_call_link"),
        ("followups", "0006_add_followup_call_link"),
        ("sales",     "0004_add_quotation_call_link_and_log_call"),
    ]

    operations = [
        migrations.RunPython(backfill_links, reverse_backfill),
    ]
