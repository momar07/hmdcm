"""
Signals that auto-link the currently-active call to entities being
modified by the agent.

Strategy (option c — "meaningful action only"):
  - On UPDATE of Ticket/Approval/Followup/Quotation, only auto-link if
    one of the "meaningful" fields actually changed.
  - On CREATE of TicketNote, auto-link (every new note during a call
    is meaningful).
  - On any TicketHistory or QuotationLog creation, populate the call FK
    with the active call (so each audit row knows which call it came from).

The "current user" is read from thread-local (set by AuditLogMiddleware).
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.common.threadlocal import get_current_user
from .services import (
    auto_link_if_on_call,
    get_active_call_for_user,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# Helper: snapshot meaningful fields BEFORE save, compare AFTER save
# We use pre_save to stash the old values, post_save to compare.
# ═══════════════════════════════════════════════════════════════════
_PRE_SAVE_CACHE = {}


def _snapshot_key(instance):
    return (instance.__class__.__name__, instance.pk)


def _snapshot_fields(instance, fields):
    """Read fresh values from DB for the listed fields (called in pre_save)."""
    if not instance.pk:
        return None
    try:
        Model = instance.__class__
        old = Model.objects.filter(pk=instance.pk).values(*fields).first()
        return old
    except Exception:
        return None


def _diff_fields(old, instance, fields):
    """Returns a list of 'field: old → new' strings for fields that changed."""
    if not old:
        return []
    changes = []
    for f in fields:
        new_val = getattr(instance, f, None)
        # For FKs, getattr returns the related object; compare by _id
        if hasattr(instance, f + "_id"):
            new_val = getattr(instance, f + "_id", None)
            old_val = old.get(f + "_id", old.get(f))
        else:
            old_val = old.get(f)
        if old_val != new_val:
            changes.append(f"{f}: {old_val} → {new_val}")
    return changes


# ═══════════════════════════════════════════════════════════════════
# TICKET — auto-link on meaningful update
# ═══════════════════════════════════════════════════════════════════
TICKET_MEANINGFUL_FIELDS = ["status", "priority", "assigned_to_id", "category"]


@receiver(pre_save, sender=None)  # bound below via apps.py
def _ticket_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "Ticket":
        return
    if not instance.pk:
        return  # create — handled by originating call FK
    fields = [f.replace("_id", "") for f in TICKET_MEANINGFUL_FIELDS]
    _PRE_SAVE_CACHE[_snapshot_key(instance)] = _snapshot_fields(instance, fields)


@receiver(post_save, sender=None)
def _ticket_post_save(sender, instance, created, **kwargs):
    if sender.__name__ != "Ticket":
        return
    if created:
        return  # originating call already linked via Ticket.call FK
    key = _snapshot_key(instance)
    old = _PRE_SAVE_CACHE.pop(key, None)
    fields = [f.replace("_id", "") for f in TICKET_MEANINGFUL_FIELDS]
    changes = _diff_fields(old, instance, fields)
    if not changes:
        return
    user = get_current_user()
    summary = "; ".join(changes)[:500]
    try:
        auto_link_if_on_call(instance, user, summary=summary)
    except Exception as e:
        logger.warning(f"[ticket auto-link] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# TICKET NOTE — auto-link on create
# ═══════════════════════════════════════════════════════════════════
@receiver(post_save, sender=None)
def _ticket_note_post_save(sender, instance, created, **kwargs):
    if sender.__name__ != "TicketNote":
        return
    if not created:
        return
    user = get_current_user()
    ticket = getattr(instance, "ticket", None)
    if not ticket:
        return
    preview = (getattr(instance, "content", "") or "")[:80]
    summary = f"Note added: {preview}"
    try:
        auto_link_if_on_call(ticket, user, summary=summary)
    except Exception as e:
        logger.warning(f"[ticket-note auto-link] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# APPROVAL — auto-link on status/decision change
# ═══════════════════════════════════════════════════════════════════
APPROVAL_MEANINGFUL_FIELDS = ["status", "reviewed_by_id", "decision_note"]


@receiver(pre_save, sender=None)
def _approval_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "ApprovalRequest":
        return
    if not instance.pk:
        return
    fields = [f.replace("_id", "") for f in APPROVAL_MEANINGFUL_FIELDS]
    _PRE_SAVE_CACHE[_snapshot_key(instance)] = _snapshot_fields(instance, fields)


@receiver(post_save, sender=None)
def _approval_post_save(sender, instance, created, **kwargs):
    if sender.__name__ != "ApprovalRequest":
        return
    if created:
        return
    key = _snapshot_key(instance)
    old = _PRE_SAVE_CACHE.pop(key, None)
    fields = [f.replace("_id", "") for f in APPROVAL_MEANINGFUL_FIELDS]
    changes = _diff_fields(old, instance, fields)
    if not changes:
        return
    user = get_current_user()
    summary = "; ".join(changes)[:500]
    try:
        auto_link_if_on_call(instance, user, summary=summary)
    except Exception as e:
        logger.warning(f"[approval auto-link] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# FOLLOWUP — auto-link on status/scheduled_at change
# ═══════════════════════════════════════════════════════════════════
FOLLOWUP_MEANINGFUL_FIELDS = ["status", "scheduled_at", "assigned_to_id", "completed_at"]


@receiver(pre_save, sender=None)
def _followup_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "Followup":
        return
    if not instance.pk:
        return
    fields = [f.replace("_id", "") for f in FOLLOWUP_MEANINGFUL_FIELDS]
    _PRE_SAVE_CACHE[_snapshot_key(instance)] = _snapshot_fields(instance, fields)


@receiver(post_save, sender=None)
def _followup_post_save(sender, instance, created, **kwargs):
    if sender.__name__ != "Followup":
        return
    if created:
        return
    key = _snapshot_key(instance)
    old = _PRE_SAVE_CACHE.pop(key, None)
    fields = [f.replace("_id", "") for f in FOLLOWUP_MEANINGFUL_FIELDS]
    changes = _diff_fields(old, instance, fields)
    if not changes:
        return
    user = get_current_user()
    summary = "; ".join(changes)[:500]
    try:
        auto_link_if_on_call(instance, user, summary=summary)
    except Exception as e:
        logger.warning(f"[followup auto-link] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# QUOTATION — auto-link on status change
# ═══════════════════════════════════════════════════════════════════
QUOTATION_MEANINGFUL_FIELDS = ["status", "total_amount", "valid_until"]


@receiver(pre_save, sender=None)
def _quotation_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "Quotation":
        return
    if not instance.pk:
        return
    fields = [f.replace("_id", "") for f in QUOTATION_MEANINGFUL_FIELDS]
    _PRE_SAVE_CACHE[_snapshot_key(instance)] = _snapshot_fields(instance, fields)


@receiver(post_save, sender=None)
def _quotation_post_save(sender, instance, created, **kwargs):
    if sender.__name__ != "Quotation":
        return
    if created:
        return
    key = _snapshot_key(instance)
    old = _PRE_SAVE_CACHE.pop(key, None)
    fields = [f.replace("_id", "") for f in QUOTATION_MEANINGFUL_FIELDS]
    changes = _diff_fields(old, instance, fields)
    if not changes:
        return
    user = get_current_user()
    summary = "; ".join(changes)[:500]
    try:
        auto_link_if_on_call(instance, user, summary=summary)
    except Exception as e:
        logger.warning(f"[quotation auto-link] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# TICKET HISTORY — auto-fill history_call with active call
# ═══════════════════════════════════════════════════════════════════
@receiver(pre_save, sender=None)
def _ticket_history_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "TicketHistory":
        return
    if instance.pk:
        return  # only on create
    if instance.history_call_id:
        return  # already set explicitly
    user = get_current_user()
    if not user:
        return
    try:
        active = get_active_call_for_user(user)
        if active:
            instance.history_call = active
    except Exception as e:
        logger.warning(f"[ticket-history pre_save] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# QUOTATION LOG — auto-fill log_call with active call
# ═══════════════════════════════════════════════════════════════════
@receiver(pre_save, sender=None)
def _quotation_log_pre_save(sender, instance, **kwargs):
    if sender.__name__ != "QuotationLog":
        return
    if instance.pk:
        return
    if instance.log_call_id:
        return
    user = get_current_user()
    if not user:
        return
    try:
        active = get_active_call_for_user(user)
        if active:
            instance.log_call = active
    except Exception as e:
        logger.warning(f"[quotation-log pre_save] failed: {e}")


# ═══════════════════════════════════════════════════════════════════
# Wiring: connect the receivers to the actual models
# Called once from CallsConfig.ready()
# ═══════════════════════════════════════════════════════════════════
def connect_call_link_signals():
    """Idempotent — safe to call multiple times (Django dedupes by uid)."""
    from apps.tickets.models   import Ticket, TicketNote, TicketHistory
    from apps.approvals.models import ApprovalRequest
    from apps.followups.models import Followup
    from apps.sales.models     import Quotation, QuotationLog

    # Ticket
    pre_save.connect(_ticket_pre_save,   sender=Ticket, dispatch_uid="ticket_pre_save_calllink")
    post_save.connect(_ticket_post_save, sender=Ticket, dispatch_uid="ticket_post_save_calllink")

    # TicketNote
    post_save.connect(_ticket_note_post_save, sender=TicketNote, dispatch_uid="ticket_note_post_save_calllink")

    # TicketHistory
    pre_save.connect(_ticket_history_pre_save, sender=TicketHistory, dispatch_uid="ticket_history_pre_save_calllink")

    # Approval
    pre_save.connect(_approval_pre_save,   sender=ApprovalRequest, dispatch_uid="approval_pre_save_calllink")
    post_save.connect(_approval_post_save, sender=ApprovalRequest, dispatch_uid="approval_post_save_calllink")

    # Followup
    pre_save.connect(_followup_pre_save,   sender=Followup, dispatch_uid="followup_pre_save_calllink")
    post_save.connect(_followup_post_save, sender=Followup, dispatch_uid="followup_post_save_calllink")

    # Quotation
    pre_save.connect(_quotation_pre_save,   sender=Quotation, dispatch_uid="quotation_pre_save_calllink")
    post_save.connect(_quotation_post_save, sender=Quotation, dispatch_uid="quotation_post_save_calllink")

    # QuotationLog
    pre_save.connect(_quotation_log_pre_save, sender=QuotationLog, dispatch_uid="quotation_log_pre_save_calllink")

    logger.info("[calls.signals] connect_call_link_signals: signals wired")
