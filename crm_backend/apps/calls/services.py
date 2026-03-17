from django.utils import timezone
from django.core.exceptions import ValidationError
from .models import Call, CallCompletion, Disposition


def complete_call(call_id: str, agent, data: dict) -> CallCompletion:
    """
    الـ service الرئيسي للـ enforcement.
    بيتأكد من كل الـ validation rules قبل الحفظ.
    """
    try:
        call = Call.objects.select_related('customer', 'lead', 'agent').get(pk=call_id)
    except Call.DoesNotExist:
        raise ValidationError('Call not found.')

    # Rule 1: المكالمة لازم تكون answered
    if call.status != 'answered':
        raise ValidationError('Only answered calls can be completed.')

    # Rule 2: مينفعش تكمل نفس المكالمة مرتين
    if call.is_completed:
        raise ValidationError('Call is already completed.')

    # Rule 3: لازم يكون فيه disposition
    disposition_id = data.get('disposition_id')
    if not disposition_id:
        raise ValidationError('Disposition is required.')

    try:
        disposition = Disposition.objects.get(pk=disposition_id, is_active=True)
    except Disposition.DoesNotExist:
        raise ValidationError('Invalid disposition.')

    # Rule 4: لازم يكون فيه note
    note = data.get('note', '').strip()
    if not note:
        raise ValidationError('Note is required.')
    if len(note) < 10:
        raise ValidationError('Note must be at least 10 characters.')

    # Rule 5: لازم يكون فيه next_action
    next_action = data.get('next_action', '').strip()
    if not next_action:
        raise ValidationError('Next action is required.')

    valid_actions = [c[0] for c in CallCompletion.NEXT_ACTION_CHOICES]
    if next_action not in valid_actions:
        raise ValidationError(f'Invalid next action. Choose from: {valid_actions}')

    # Rule 6: لو disposition بتطلب followup — لازم followup data
    followup_required = disposition.requires_followup
    followup_due_at   = data.get('followup_due_at')
    followup_assigned = data.get('followup_assigned_to') or data.get('followup_assigned_id')
    followup_type     = data.get('followup_type', '').strip()

    if followup_required:
        if not followup_due_at:
            raise ValidationError('Follow-up due date is required for this disposition.')
        # followup_assigned defaults to current agent if not provided
        if not followup_type:
            followup_type = 'call'

    # Rule 7: لو next_action = close_lead — لازم lead مرتبط
    if next_action == 'close_lead' and not call.lead:
        raise ValidationError('Cannot close lead: no lead is linked to this call.')

    # Rule 8: لو Lead stage = Won — لازم won_amount
    new_stage_id = data.get('new_lead_stage_id')
    if new_stage_id and call.lead:
        from apps.leads.models import LeadStage
        try:
            stage = LeadStage.objects.get(pk=new_stage_id)
            if stage.is_won and not data.get('won_amount'):
                raise ValidationError('Won amount is required when marking lead as Won.')
            if stage.slug == 'lost' and not data.get('lost_reason', '').strip():
                raise ValidationError('Lost reason is required when marking lead as Lost.')
        except LeadStage.DoesNotExist:
            raise ValidationError('Invalid lead stage.')

    # ── كل الـ validation passed — ابدأ الحفظ ──────────────────
    from apps.users.models import User

    assigned_user = agent  # default to current agent
    if followup_assigned:
        try:
            assigned_user = User.objects.get(pk=followup_assigned)
        except User.DoesNotExist:
            assigned_user = agent  # fallback to current agent

    # إنشاء الـ CallCompletion
    completion = CallCompletion.objects.create(
        call               = call,
        disposition        = disposition,
        note               = note,
        next_action        = next_action,
        followup_required  = followup_required,
        followup_due_at    = followup_due_at if followup_required else None,
        followup_assigned  = assigned_user,
        followup_type      = followup_type,
        lead_stage_updated = bool(new_stage_id),
        new_lead_stage_id  = new_stage_id or None,
        submitted_by       = agent,
    )

    # تحديث الـ Call
    call.is_completed = True
    call.completed_at = timezone.now()
    call.save(update_fields=['is_completed', 'completed_at'])

    # تحديث الـ Lead stage لو موجود
    if new_stage_id and call.lead:
        from apps.leads.models import LeadStage
        from django.utils import timezone as tz
        stage = LeadStage.objects.get(pk=new_stage_id)
        call.lead.stage_id = new_stage_id

        if stage.is_won:
            call.lead.won_amount = data.get('won_amount')
            call.lead.won_at     = tz.now()
        elif stage.slug == 'lost':
            call.lead.lost_reason = data.get('lost_reason', '')
            call.lead.lost_at     = tz.now()

        call.lead.save()

    # إنشاء الـ Followup تلقائياً لو مطلوب
    if followup_required and assigned_user:
        from apps.followups.models import Followup
        followup = Followup.objects.create(
            lead          = call.lead,
            call          = call,
            assigned_to   = assigned_user,
            title         = f'Follow-up: {disposition.name}',
            description   = note,
            followup_type = followup_type,
            scheduled_at  = followup_due_at,
            status        = 'pending',
        )
        completion.followup_created = followup
        completion.save(update_fields=['followup_created'])

    return completion


def get_pending_completions(agent=None):
    """المكالمات المجاوبة اللي لسه ما اتكملتش"""
    qs = Call.objects.filter(status='answered', is_completed=False)\
                     .select_related('customer', 'agent', 'lead')
    if agent:
        qs = qs.filter(agent=agent)
    return qs
