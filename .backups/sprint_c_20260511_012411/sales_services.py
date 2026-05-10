import re
import logging
from datetime import date
from decimal  import Decimal

from .models import Quotation, QuotationLog, SalesSettings

logger = logging.getLogger(__name__)


def generate_ref_number():
    """Generate unique ref number e.g. QUO-2026-0042 and increment counter."""
    settings = SalesSettings.get()
    from django.utils import timezone
    year = timezone.now().year
    num  = settings.next_quotation_number
    ref  = f"{settings.quotation_prefix}-{year}-{num:04d}"
    settings.next_quotation_number = num + 1
    settings.save(update_fields=["next_quotation_number"])
    return ref


def recalculate_totals(quotation):
    """Recalculate subtotal, tax, total from line items."""
    if quotation.quotation_type != "price_quote":
        return
    subtotal = sum(item.line_total for item in quotation.items.all())
    tax      = subtotal * (quotation.tax_rate / Decimal("100"))
    quotation.subtotal     = subtotal
    quotation.tax_amount   = tax
    quotation.total_amount = subtotal + tax
    quotation.save(update_fields=["subtotal", "tax_amount", "total_amount"])


def render_terms(template_body, quotation):
    """
    Replace {{placeholders}} in template body with real values.
    Works for both price_quote (uses totals) and contract (uses fields).
    """
    context = {
        "lead_name":     quotation.lead.get_full_name() if quotation.lead else "",
        "customer_name": quotation.lead.get_full_name() if quotation.lead else "",  # alias for backwards compat
        "agent_name":    quotation.agent.get_full_name()    if quotation.agent    else "",
        "ref_number":    quotation.ref_number,
        "total_amount":  f"{quotation.total_amount:,.2f} {quotation.currency}",
        "valid_until":   str(quotation.valid_until) if quotation.valid_until else "",
    }
    # Add contract custom fields as placeholders
    for field in quotation.fields.all():
        key = field.key.lower().replace(" ", "_").replace("(", "").replace(")", "")
        context[key] = field.value

    def replacer(match):
        key = match.group(1).strip()
        return context.get(key, match.group(0))

    return re.sub(r"\{\{(.+?)\}\}", replacer, template_body)


def submit_for_approval(quotation, agent):
    """Move quotation to pending_approval and create ApprovalRequest."""
    from apps.approvals.models import ApprovalRequest, ApprovalType

    if quotation.status not in ("draft", "revision"):
        raise ValueError("Only draft or revision quotations can be submitted.")

    approval = ApprovalRequest.objects.create(
        approval_type = ApprovalType.OTHER,
        title         = f"Quotation Approval: {quotation.ref_number}",
        description   = f"Agent {agent.get_full_name()} submitted quotation {quotation.ref_number} for approval.",
        amount        = quotation.total_amount,
        requested_by  = agent,
        lead          = quotation.lead,
    )
    quotation.approval = approval
    quotation.status   = "pending_approval"
    quotation.save(update_fields=["approval", "status"])

    QuotationLog.objects.create(
        quotation = quotation,
        actor     = agent,
        action    = "submitted",
        detail    = f"Submitted for approval — ref: {approval.id}",
    )
    _notify_supervisors(quotation)
    return quotation


def approve_quotation(quotation, supervisor, comment=""):
    """Supervisor approves — status becomes approved."""
    from django.utils import timezone
    quotation.status         = "approved"
    quotation.reviewed_by    = supervisor
    quotation.reviewed_at    = timezone.now()
    quotation.review_comment = comment
    quotation.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_comment"])

    if quotation.approval:
        quotation.approval.status         = "approved"
        quotation.approval.reviewed_by    = supervisor
        quotation.approval.review_comment = comment
        quotation.approval.reviewed_at    = timezone.now()
        quotation.approval.save()

    QuotationLog.objects.create(
        quotation = quotation,
        actor     = supervisor,
        action    = "approved",
        detail    = comment,
    )
    _notify_agent(quotation, "approved", comment)
    return quotation


def reject_quotation(quotation, supervisor, comment=""):
    """Supervisor rejects."""
    from django.utils import timezone
    quotation.status         = "rejected"
    quotation.reviewed_by    = supervisor
    quotation.reviewed_at    = timezone.now()
    quotation.review_comment = comment
    quotation.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_comment"])

    if quotation.approval:
        quotation.approval.status      = "rejected"
        quotation.approval.reviewed_by = supervisor
        quotation.approval.review_comment = comment
        quotation.approval.reviewed_at = timezone.now()
        quotation.approval.save()

    QuotationLog.objects.create(
        quotation = quotation,
        actor     = supervisor,
        action    = "rejected",
        detail    = comment,
    )
    _notify_agent(quotation, "rejected", comment)
    return quotation


def request_revision(quotation, supervisor, comment):
    """Supervisor requests revision — creates v+1 draft."""
    from django.utils import timezone
    quotation.status         = "revision"
    quotation.review_comment = comment
    quotation.reviewed_by    = supervisor
    quotation.reviewed_at    = timezone.now()
    quotation.save(update_fields=["status", "review_comment", "reviewed_by", "reviewed_at"])

    QuotationLog.objects.create(
        quotation = quotation,
        actor     = supervisor,
        action    = "revision_requested",
        detail    = comment,
    )
    _notify_agent(quotation, "revision_requested", comment)
    return quotation


def mark_sent(quotation, agent):
    if quotation.status != "approved":
        raise ValueError("Only approved quotations can be marked as sent.")
    quotation.status = "sent"
    quotation.save(update_fields=["status"])
    QuotationLog.objects.create(quotation=quotation, actor=agent, action="sent", detail="")
    return quotation


def expire_overdue_quotations():
    """Celery task — auto-expire past valid_until."""
    from datetime import date as _date
    expired = Quotation.objects.filter(
        valid_until__lt=_date.today(),
        status__in=["draft", "pending_approval", "approved", "sent"],
    )
    count = expired.count()
    expired.update(status="expired")
    logger.info(f"Auto-expired {count} quotations.")
    return count


def _notify_supervisors(quotation):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        async_to_sync(channel_layer.group_send)(
            "supervisors",
            {
                "type":       "quotation_pending",
                "quotation_id": str(quotation.id),
                "ref_number": quotation.ref_number,
                "agent_name": quotation.agent.get_full_name() if quotation.agent else "",
                "total":      str(quotation.total_amount),
            },
        )
    except Exception as e:
        logger.warning(f"WS notify supervisors failed: {e}")


def _notify_agent(quotation, event, comment=""):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        async_to_sync(channel_layer.group_send)(
            f"user_{quotation.agent_id}",
            {
                "type":         "quotation_update",
                "quotation_id": str(quotation.id),
                "ref_number":   quotation.ref_number,
                "event":        event,
                "comment":      comment,
            },
        )
    except Exception as e:
        logger.warning(f"WS notify agent failed: {e}")
