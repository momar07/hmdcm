from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from .models import Call, CallCompletion, Disposition, DispositionAction
from apps.auditlog.services import log_activity
from apps.auditlog import constants as audit_actions
import logging

logger = logging.getLogger(__name__)



def complete_call(call_id: str, agent, data: dict) -> CallCompletion:
    """
    الـ service الرئيسي للـ enforcement.
    بيتأكد من كل الـ validation rules قبل الحفظ.
    """
    try:
        call = Call.objects.select_related('lead', 'agent').get(pk=call_id)
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
    requires_note = disposition.requires_note
    if requires_note:
        if not note:
            raise ValidationError('Note is required for this disposition.')
        if len(note) < 10:
            raise ValidationError('Note must be at least 10 characters.')
    else:
        note = note or 'No additional notes'

    # Rule 5: لازم يكون فيه next_action
    next_action = data.get('next_action', '').strip()
    if not next_action:
        raise ValidationError('Next action is required.')

    valid_actions = [c[0] for c in CallCompletion.NEXT_ACTION_CHOICES]
    if next_action not in valid_actions:
        raise ValidationError(f'Invalid next action. Choose from: {valid_actions}')

    # Rule 6: لو disposition عنده create_followup action — لازم followup_due_at
    # Use new actions system — ignore legacy requires_followup field
    disp_action_types = list(
        DispositionAction.objects.filter(disposition=disposition)
        .values_list('action_type', flat=True)
    )
    followup_due_at   = data.get('followup_due_at') or data.get('followup_date')
    followup_assigned = data.get('followup_assigned_to') or data.get('followup_assigned_id')
    followup_type     = data.get('followup_type', '').strip()

    # Only require followup_due_at if there's a create_followup action
    followup_required = 'create_followup' in disp_action_types

    if followup_required:
        if not followup_due_at:
            raise ValidationError('Follow-up due date is required for this disposition.')
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

            # Tag as VIP if high value
            if call.lead.won_amount and call.lead.won_amount > 10000:
                from apps.leads.models import LeadTag
                vip_tag, _ = LeadTag.objects.get_or_create(name='VIP')
                call.lead.tags.add(vip_tag)

            logger.info(f'[CallComplete] Lead won: {call.lead.id}')

        elif stage.slug == 'lost':
            call.lead.lost_reason = data.get('lost_reason', '')
            call.lead.lost_at     = tz.now()

        call.lead.save()

    # ── تنفيذ الـ DispositionActions الديناميكية ───────────────
    disp_actions = DispositionAction.objects.filter(
        disposition=disposition
    ).order_by('order')

    for action in disp_actions:
        atype = action.action_type

        # 1) create_followup
        if atype == 'create_followup':
            scheduled = followup_due_at or data.get('followup_date')
            if scheduled:
                from apps.followups.models import Followup
                followup = Followup.objects.create(
                    lead          = call.lead,
                    call          = call,
                    assigned_to   = assigned_user,
                    title         = f'Follow-up: {disposition.name}',
                    description   = note,
                    followup_type = followup_type or 'call',
                    scheduled_at  = scheduled,
                    status        = 'pending',
                )
                completion.followup_created = followup
                completion.save(update_fields=['followup_created'])
        # 2) create_lead — TODO: implement when lead doesn't exist yet
        # (currently a no-op; unknown-caller leads are created by the agent form)

        # 3) create_ticket
        elif atype == 'create_ticket':
            if call.lead:
                from apps.tickets.models import Ticket
                cfg = action.config or {}
                Ticket.objects.create(
                    title       = f'Ticket from call — {call.lead.get_full_name()}',
                    lead        = call.lead,
                    assigned_to = agent,
                    priority    = cfg.get('default_priority', 'medium'),
                    description = note,
                    source      = 'call',
                )

        # 4) mark_won
        elif atype == 'mark_won':
            if call.lead:
                from apps.leads.models import LeadStage
                from django.utils import timezone as tz
                won_stage = LeadStage.objects.filter(is_won=True, is_active=True).first()
                if won_stage:
                    call.lead.stage    = won_stage
                    call.lead.won_at   = tz.now()
                    call.lead.won_amount = data.get('won_amount') or call.lead.won_amount
                    call.lead.save(update_fields=['stage', 'won_at', 'won_amount'])

        # 5) escalate
        elif atype == 'escalate':
            try:
                from channels.layers import get_channel_layer
                from asgiref.sync import async_to_sync
                layer = get_channel_layer()
                async_to_sync(layer.group_send)('supervisors', {
                    'type':        'send_event',
                    'event_type':  'escalation',
                    'call_id':     str(call.id),
                    'agent_name':  agent.name if hasattr(agent, 'name') else str(agent),
                    'note':        note,
                    'disposition': disposition.name,
                })
            except Exception:
                pass

        # 6) change_lead_stage
        elif atype == 'change_lead_stage':
            stage_id = data.get('new_lead_stage_id') or (action.config or {}).get('stage_id')
            if stage_id and call.lead:
                from apps.leads.models import LeadStage
                from django.utils import timezone as tz
                try:
                    stage = LeadStage.objects.get(pk=stage_id)
                    call.lead.stage = stage
                    if stage.is_won:
                        call.lead.won_at = tz.now()
                    call.lead.save(update_fields=['stage', 'won_at'])
                except LeadStage.DoesNotExist:
                    pass

    # Fallback: النظام القديم لو مفيش actions جديدة
    if not disp_actions.exists() and followup_required and assigned_user:
        from apps.followups.models import Followup
        followup = Followup.objects.create(
            lead          = call.lead,
            call          = call,
            assigned_to   = assigned_user,
            title         = f'Follow-up: {disposition.name}',
            description   = note,
            followup_type = followup_type or 'call',
            scheduled_at  = followup_due_at,
            status        = 'pending',
        )
        completion.followup_created = followup
        completion.save(update_fields=['followup_created'])

    # ── ActivityLog: call.completed ─────────────────────
    try:
        transaction.on_commit(lambda: log_activity(
            user=agent,
            verb=audit_actions.CALL_COMPLETED,
            description=(
                f'Completed call {call.id} '
                f'(disposition: {disposition.name})'
            ),
            lead=call.lead,
            call=call,
            extra={
                'call_id':         str(call.id),
                'disposition':     disposition.name,
                'disposition_code': disposition.code,
                'next_action':     next_action,
                'duration_secs':   call.duration,
                'direction':       call.direction,
                'role':            getattr(agent, 'role', None),
            },
        ))
    except Exception:
        pass
    
    return completion


def get_pending_completions(agent=None):
    """المكالمات المجاوبة اللي لسه ما اتكملتش"""
    qs = Call.objects.filter(status='answered', is_completed=False)\
                     .select_related('agent', 'lead')
    if agent:
        # Supervisors/admins see all pending — agents only see their own
        role = getattr(agent, 'role', 'agent')
        if role not in ('supervisor', 'admin'):
            qs = qs.filter(agent=agent)
    return qs

def get_active_call_for_user(user):
    """Return the user's currently-active call, or None.

    An active call = status='answered' AND ended_at IS NULL,
    belonging to this agent, most recent first.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    from .models import Call
    return (Call.objects
            .filter(agent=user, status="answered", ended_at__isnull=True)
            .order_by("-started_at")
            .first())


# ═══════════════════════════════════════════════════════════════════
# build_call_detail()
# Returns a unified nested dict describing a call, used by
# Ticket / Approval / Followup / Quotation serializers when they
# expose the linked call to the frontend (LinkedCallCard component).
#
# recording_url is ONLY returned for supervisor / admin / qa roles.
# Agents see the metadata but cannot listen to the recording.
# ═══════════════════════════════════════════════════════════════════
SUPERVISOR_ROLES = ("supervisor", "admin", "qa")


def build_call_detail(call, user=None):
    """
    Build a nested representation of a Call for embedding in other
    serializers (LinkedCallCard payload).

    Args:
        call: apps.calls.models.Call instance (or None).
        user: requesting user (optional; controls recording_url visibility).

    Returns:
        dict or None
    """
    if call is None:
        return None

    # Lazy imports to avoid circular dependency
    from apps.calls.models import CallCompletion, CallRecording

    # Agent name
    agent_name = ""
    if call.agent_id:
        try:
            agent_name = call.agent.get_full_name() or call.agent.email
        except Exception:
            agent_name = ""

    # Completion info (disposition + note)
    disposition_name = ""
    disposition_color = ""
    completion_note = ""
    try:
        completion = CallCompletion.objects.filter(call=call).select_related("disposition").first()
        if completion:
            completion_note = completion.note or ""
            if completion.disposition:
                disposition_name = completion.disposition.name
                disposition_color = completion.disposition.color or ""
    except Exception:
        pass

    # Recording URL — supervisor-only
    recording_url = None
    can_listen = bool(user and getattr(user, "role", None) in SUPERVISOR_ROLES)
    if can_listen:
        try:
            rec = CallRecording.objects.filter(call=call).first()
            if rec:
                recording_url = getattr(rec, "url", None) or getattr(rec, "file_url", None) or ""
        except Exception:
            recording_url = None

    return {
        "id": str(call.id),
        "started_at": call.started_at.isoformat() if call.started_at else None,
        "duration": getattr(call, "talk_duration", 0) or getattr(call, "duration", 0) or 0,
        "direction": call.direction or "",
        "status": call.status or "",
        "agent_name": agent_name,
        "caller_number": getattr(call, "caller_number", "") or getattr(call, "caller", "") or "",
        "callee_number": getattr(call, "callee_number", "") or getattr(call, "callee", "") or "",
        "disposition_name": disposition_name,
        "disposition_color": disposition_color,
        "completion_note": completion_note,
        "recording_url": recording_url,
        "can_listen": can_listen,
    }
