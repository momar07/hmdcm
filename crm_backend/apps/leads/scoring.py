from django.utils import timezone
from .models import Lead, ScoreEvent


# ── Points table ─────────────────────────────────────────────
SCORE_POINTS = {
    'call_long':          +10,
    'call_short':         +5,
    'call_no_answer':     -5,
    'followup_responded': +15,
    'followup_missed':    -10,
    'quotation_sent':     +20,
    'quotation_accepted': +25,
    'quotation_rejected': -15,
    'profile_complete':   +10,
    'time_decay':         -5,
    'manual':             0,
}


def _get_classification(score: int) -> str:
    if score >= 86: return 'very_hot'
    if score >= 61: return 'hot'
    if score >= 31: return 'warm'
    if score >= 1:  return 'cold'
    return 'none'


def add_score_event(lead: Lead, event_type: str, points: int = None, reason: str = '') -> Lead:
    """
    يضيف ScoreEvent ويحدث lead.score و lead.classification.
    لو points=None يستخدم الـ default من SCORE_POINTS.
    """
    pts = points if points is not None else SCORE_POINTS.get(event_type, 0)

    ScoreEvent.objects.create(
        lead=lead, event_type=event_type, points=pts, reason=reason
    )

    new_score = max(0, min(100, lead.score + pts))
    new_class = _get_classification(new_score)

    Lead.objects.filter(pk=lead.pk).update(
        score=new_score, classification=new_class
    )
    lead.score          = new_score
    lead.classification = new_class
    return lead


def recalculate_score(lead: Lead) -> Lead:
    """
    يحسب الـ score من الأول من كل الـ ScoreEvents.
    """
    total = sum(
        e.points for e in ScoreEvent.objects.filter(lead=lead)
    )
    new_score = max(0, min(100, total))
    new_class = _get_classification(new_score)

    Lead.objects.filter(pk=lead.pk).update(
        score=new_score, classification=new_class
    )
    lead.score          = new_score
    lead.classification = new_class
    return lead


def apply_time_decay(lead: Lead) -> Lead:
    """
    يطبق time decay لو مفيش تواصل.
    بيتشتغل من Celery كل يوم.
    """
    from apps.calls.models import Call
    from apps.followups.models import Followup

    now = timezone.now()

    last_call = Call.objects.filter(
        lead=lead, status='answered'
    ).order_by('-started_at').first()

    last_followup = Followup.objects.filter(
        lead=lead, status='completed'
    ).order_by('-completed_at').first()

    last_contact = None
    if last_call:
        last_contact = last_call.started_at
    if last_followup:
        lf_at = last_followup.completed_at
        if last_contact is None or (lf_at and lf_at > last_contact):
            last_contact = lf_at

    if not last_contact:
        return lead  # مفيش تاريخ تواصل — مش هنعاقبه

    days_silent = (now - last_contact).days

    if days_silent >= 30:
        return add_score_event(lead, 'time_decay', points=-20,
                               reason=f'{days_silent} days without contact')
    elif days_silent >= 14:
        return add_score_event(lead, 'time_decay', points=-10,
                               reason=f'{days_silent} days without contact')
    elif days_silent >= 7:
        return add_score_event(lead, 'time_decay', points=-5,
                               reason=f'{days_silent} days without contact')
    return lead
