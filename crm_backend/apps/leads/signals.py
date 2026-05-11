"""
Cross-app signal receivers that record LeadEvent rows when objects
related to a Lead are created or change state.

Registered in apps/leads/apps.py via ready().
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver


# ── Tracking dicts ──────────────────────────────────────────────────
# We track the previous status of objects so we only log when status changes
_prev_status = {}


def _log(lead, event_type, actor=None, old='', new='', note=''):
    """Create a LeadEvent — imported lazily to avoid circular imports."""
    if not lead:
        return
    from apps.leads.models import LeadEvent
    LeadEvent.objects.create(
        lead       = lead,
        event_type = event_type,
        actor      = actor,
        old_value  = old or '',
        new_value  = new or '',
        note       = note or '',
    )


# ══════════════════════════════════════════════════════════════════════
# QUOTATIONS  ──  apps.sales.Quotation
# ══════════════════════════════════════════════════════════════════════
def _connect_quotation_signals():
    from apps.sales.models import Quotation

    @receiver(pre_save, sender=Quotation, dispatch_uid='leads.quotation.pre_save')
    def quotation_pre_save(sender, instance, **kwargs):
        if instance.pk:
            try:
                old = Quotation.objects.only('status').get(pk=instance.pk)
                _prev_status[f'quot:{instance.pk}'] = old.status
            except Quotation.DoesNotExist:
                pass

    @receiver(post_save, sender=Quotation, dispatch_uid='leads.quotation.post_save')
    def quotation_post_save(sender, instance, created, **kwargs):
        lead = instance.lead
        if not lead:
            return

        actor = instance.agent

        if created:
            _log(
                lead, 'quotation_created', actor=actor,
                new=instance.ref_number or str(instance.pk)[:8],
                note=f'Quotation {instance.ref_number} created (status: {instance.status})',
            )
            return

        # Status transitions
        key = f'quot:{instance.pk}'
        old_status = _prev_status.pop(key, None)
        if old_status and old_status != instance.status:
            mapping = {
                'sent':     'quotation_sent',
                'approved': 'quotation_approved',
                'rejected': 'quotation_rejected',
                'accepted': 'quotation_accepted',
            }
            ev = mapping.get(instance.status)
            if ev:
                _log(
                    lead, ev, actor=actor,
                    old=old_status, new=instance.status,
                    note=f'Quotation {instance.ref_number}: {old_status} → {instance.status}',
                )


# ══════════════════════════════════════════════════════════════════════
# APPROVALS  ──  apps.approvals.ApprovalRequest
# ══════════════════════════════════════════════════════════════════════
def _connect_approval_signals():
    from apps.approvals.models import ApprovalRequest

    @receiver(pre_save, sender=ApprovalRequest, dispatch_uid='leads.approval.pre_save')
    def approval_pre_save(sender, instance, **kwargs):
        if instance.pk:
            try:
                old = ApprovalRequest.objects.only('status').get(pk=instance.pk)
                _prev_status[f'appr:{instance.pk}'] = old.status
            except ApprovalRequest.DoesNotExist:
                pass

    @receiver(post_save, sender=ApprovalRequest, dispatch_uid='leads.approval.post_save')
    def approval_post_save(sender, instance, created, **kwargs):
        # Approval may link to lead directly OR via its ticket
        lead = instance.lead
        if not lead and getattr(instance, 'ticket', None):
            lead = getattr(instance.ticket, 'lead', None)
        if not lead:
            return

        actor = instance.requested_by if created else (instance.reviewed_by or instance.requested_by)

        if created:
            _log(
                lead, 'approval_requested', actor=actor,
                new=instance.title,
                note=f'{instance.get_approval_type_display()}: {instance.title}',
            )
            return

        key = f'appr:{instance.pk}'
        old_status = _prev_status.pop(key, None)
        if old_status and old_status != instance.status:
            mapping = {
                'approved': 'approval_approved',
                'rejected': 'approval_rejected',
            }
            ev = mapping.get(instance.status)
            if ev:
                _log(
                    lead, ev, actor=actor,
                    old=old_status, new=instance.status,
                    note=f'Approval "{instance.title}": {old_status} → {instance.status}',
                )


# ══════════════════════════════════════════════════════════════════════
# TASKS  ──  apps.tasks.Task
# ══════════════════════════════════════════════════════════════════════
def _connect_task_signals():
    from apps.tasks.models import Task

    @receiver(pre_save, sender=Task, dispatch_uid='leads.task.pre_save')
    def task_pre_save(sender, instance, **kwargs):
        if instance.pk:
            try:
                old = Task.objects.only('status').get(pk=instance.pk)
                _prev_status[f'task:{instance.pk}'] = old.status
            except Task.DoesNotExist:
                pass

    @receiver(post_save, sender=Task, dispatch_uid='leads.task.post_save')
    def task_post_save(sender, instance, created, **kwargs):
        lead = instance.lead
        if not lead:
            return

        actor = instance.assigned_by or instance.assigned_to

        if created:
            _log(
                lead, 'task_created', actor=actor,
                new=instance.title,
                note=f'Task "{instance.title}" assigned to {instance.assigned_to.get_full_name() if instance.assigned_to else "—"}',
            )
            return

        key = f'task:{instance.pk}'
        old_status = _prev_status.pop(key, None)
        if old_status and old_status != instance.status and instance.status == 'completed':
            _log(
                lead, 'task_completed', actor=instance.assigned_to,
                old=old_status, new=instance.status,
                note=f'Task "{instance.title}" marked completed',
            )


# ──────────────────────────────────────────────────────────────────────
def connect_all():
    """Called from LeadsConfig.ready()."""
    _connect_quotation_signals()
    _connect_approval_signals()
    _connect_task_signals()
