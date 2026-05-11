from .models import Lead, LeadEvent


# ── helpers ────────────────────────────────────────────────────────────
def _log_event(lead, event_type, actor=None, old_value='', new_value='', note=''):
    LeadEvent.objects.create(
        lead=lead, event_type=event_type,
        actor=actor, old_value=old_value,
        new_value=new_value, note=note,
    )


def _notify_agent(agent, lead, message: str):
    """Persist + push real-time lead_assigned notification."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from apps.notifications.services import create_notification
        create_notification(
            recipient=agent,
            type='lead_assigned',
            title=f'New lead: {lead.get_display_name()}',
            body=message,
            link=f'/leads/{lead.id}',
            priority='normal',
            data={
                'lead_id':   str(lead.id),
                'lead_name': lead.get_display_name(),
            },
            push_realtime=True,
        )
    except Exception as e:
        logger.warning(f'[Lead] Notify agent error: {e}')


def _sync_followup(lead, actor=None):
    """
    لما followup_date يتغير على الـ Lead →
    نعمل/نحدّث Followup مربوط بيه تلقائياً.
    """
    from apps.followups.models import Followup

    if not lead.followup_date:
        # لو اتمسحت الـ date — cancel الـ pending followup
        Followup.objects.filter(
            lead=lead, status='pending'
        ).update(status='cancelled')
        return

    fu = Followup.objects.filter(lead=lead, status='pending').first()
    if fu:
        # حدّث الـ date لو اتغيرت
        if fu.scheduled_at != lead.followup_date:
            fu.scheduled_at   = lead.followup_date
            fu.reminder_sent  = False
            fu.save(update_fields=['scheduled_at', 'reminder_sent'])
    else:
        # عمل followup جديد
        assigned = lead.assigned_to or actor
        if assigned:
            Followup.objects.create(
                lead          = lead,
                assigned_to   = assigned,
                title         = f'Follow-up: {lead.get_display_name()}',
                followup_type = 'call',
                scheduled_at  = lead.followup_date,
                status        = 'pending',
                reminder_sent = False,
            )


# ── public services ────────────────────────────────────────────────────
def create_lead(full_name='', status_id=None, priority_id=None,
                source='manual', assigned_to=None, actor=None, **kwargs) -> Lead:
    lead = Lead.objects.create(
        full_name=full_name,
        status_id=status_id, priority_id=priority_id,
        source=source, assigned_to=assigned_to, **kwargs
    )

    _log_event(lead, 'created', actor=actor or assigned_to,
               new_value=lead.get_display_name())

    if lead.followup_date:
        _sync_followup(lead, actor=actor or assigned_to)

    if assigned_to:
        _notify_agent(
            assigned_to, lead,
            f'New lead assigned to you: {lead.get_display_name()}'
        )
    return lead


def assign_lead(lead_id, agent_id, actor=None):
    from apps.users.models import User
    lead = Lead.objects.select_related('assigned_to').get(pk=lead_id)
    old_name = lead.assigned_to.get_full_name() if lead.assigned_to else '—'

    Lead.objects.filter(pk=lead_id).update(assigned_to_id=agent_id)
    lead.refresh_from_db()

    new_name = lead.assigned_to.get_full_name() if lead.assigned_to else '—'
    _log_event(lead, 'assigned', actor=actor,
               old_value=old_name, new_value=new_name)

    if lead.assigned_to:
        _notify_agent(
            lead.assigned_to, lead,
            f'Lead assigned to you: {lead.get_display_name()}'
        )


def update_lead_status(lead_id, status_id, actor=None):
    from django.utils import timezone
    from apps.leads.models import LeadStatus
    lead = Lead.objects.select_related('status').get(pk=lead_id)
    old_name = lead.status.name if lead.status else '—'

    lead.status_id = status_id
    status_obj = LeadStatus.objects.get(pk=status_id)
    if status_obj.is_closed:
        lead.closed_at = timezone.now()
    lead.save(update_fields=['status_id', 'closed_at' if status_obj.is_closed else 'status_id'])

    _log_event(lead, 'status_changed', actor=actor,
               old_value=old_name, new_value=status_obj.name)
    return lead


def update_lead_stage(lead_id, stage_id, actor=None):
    from django.utils import timezone
    from apps.leads.models import LeadStage
    lead  = Lead.objects.select_related('stage').get(pk=lead_id)
    old_name = lead.stage.name if lead.stage else '—'
    stage = LeadStage.objects.get(pk=stage_id, is_active=True)

    lead.stage = stage
    fields = ['stage']
    if stage.is_won:
        lead.won_at  = timezone.now(); fields.append('won_at')
        _log_event(lead, 'won', actor=actor,
                   old_value=old_name, new_value=stage.name)
    elif stage.is_closed and not stage.is_won:
        lead.lost_at = timezone.now(); fields.append('lost_at')
        _log_event(lead, 'lost', actor=actor,
                   old_value=old_name, new_value=stage.name)
    else:
        _log_event(lead, 'stage_changed', actor=actor,
                   old_value=old_name, new_value=stage.name)
    lead.save(update_fields=fields)
    return lead, stage


def update_lead_followup_date(lead_id, followup_date, actor=None):
    lead = Lead.objects.get(pk=lead_id)
    lead.followup_date = followup_date
    lead.save(update_fields=['followup_date'])
    _sync_followup(lead, actor=actor)
    _log_event(lead, 'followup_set', actor=actor,
               new_value=str(followup_date))
    return lead
