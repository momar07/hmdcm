# Lead Scoring & Classification

## Overview

The lead scoring system quantifies lead engagement and interest level on a 0-100 scale. Scores automatically map to classifications that indicate how "hot" a lead is.

---

## Scoring Model

### Score Range

- **Minimum:** 0 (clamped)
- **Maximum:** 100 (clamped)
- **Default:** 0 (on lead creation)

### Classification Thresholds

```python
def _get_classification(score: int) -> str:
    if score >= 86: return 'very_hot'   # 86-100
    if score >= 61: return 'hot'        # 61-85
    if score >= 31: return 'warm'       # 31-60
    if score >= 1:  return 'cold'       # 1-30
    return 'none'                        # 0
```

**File:** `crm_backend/apps/leads/scoring.py:21-26`

---

## Score Events

### Event Types & Default Points

| Event Type | Points | Trigger |
|---|---|---|
| `call_long` | +10 | Call duration > 3 minutes |
| `call_short` | +5 | Call duration < 3 minutes |
| `call_no_answer` | -5 | Call not answered |
| `followup_responded` | +15 | Lead responded to follow-up |
| `followup_missed` | -10 | Follow-up was missed/ignored |
| `quotation_sent` | +20 | Quotation was sent to lead |
| `quotation_accepted` | +25 | Lead accepted quotation |
| `quotation_rejected` | -15 | Lead rejected quotation |
| `profile_complete` | +10 | Lead profile was completed |
| `time_decay` | -5 to -20 | Inactivity penalty (see below) |
| `manual` | 0 | Manual score adjustment |

**File:** `crm_backend/apps/leads/scoring.py:6-18`

### ScoreEvent Model

```python
class ScoreEvent(BaseModel):
    lead       = ForeignKey(Lead)
    event_type = CharField(choices=EVENT_CHOICES)
    points     = IntegerField()  # positive or negative
    reason     = CharField(max_length=255, blank=True)
```

Every score change creates an immutable `ScoreEvent` record for auditability.

**File:** `crm_backend/apps/leads/models.py:213-239`

---

## Scoring Functions

### `add_score_event()`

```python
add_score_event(lead: Lead, event_type: str, points: int = None, reason: str = '') -> Lead
```

**Behavior:**
1. Uses default points from `SCORE_POINTS` if `points=None`
2. Creates `ScoreEvent` record
3. Clamps new score to 0-100 range
4. Auto-updates `lead.classification` based on new score
5. Returns updated lead

**File:** `crm_backend/apps/leads/scoring.py:29-48`

### `recalculate_score()`

```python
recalculate_score(lead: Lead) -> Lead
```

**Behavior:**
1. Sums all `ScoreEvent.points` for the lead from scratch
2. Clamps to 0-100
3. Updates classification
4. Useful for correcting drift or after bulk imports

**File:** `crm_backend/apps/leads/scoring.py:51-66`

---

## Time Decay

### `apply_time_decay()`

```python
apply_time_decay(lead: Lead) -> Lead
```

**Purpose:** Penalize leads that haven't been contacted recently.

**Logic:**
1. Find last answered call (`Call.objects.filter(lead=lead, status='answered')`)
2. Find last completed followup (`Followup.objects.filter(lead=lead, status='completed')`)
3. Use the more recent of the two as `last_contact`
4. If no contact history exists → skip (no penalty for brand new leads)
5. Apply penalty based on days since last contact:

| Days Without Contact | Penalty |
|---|---|
| 7+ days | -5 points |
| 14+ days | -10 points |
| 30+ days | -20 points |

**File:** `crm_backend/apps/leads/scoring.py:69-109`

### Recommended Schedule

Run via Celery beat daily:

```python
# celery beat schedule
'score-time-decay': {
    'task': 'apps.leads.tasks.apply_time_decay_all',
    'schedule': crontab(hour=2, minute=0),  # 2 AM daily
}
```

---

## Classification Usage

### UI Display

Classifications should be displayed with visual indicators:

| Classification | Suggested Color |
|---|---|
| `very_hot` | Red / Fire |
| `hot` | Orange |
| `warm` | Yellow |
| `cold` | Blue |
| `none` | Gray |

### Business Rules

- **`very_hot` leads:** Prioritize for immediate follow-up, assign to top performers
- **`hot` leads:** Schedule follow-up within 24 hours
- **`warm` leads:** Nurture with content, schedule follow-up within 3 days
- **`cold` leads:** Low priority, batch outreach campaigns
- **`none` leads:** New or inactive, needs initial engagement

---

## Integration Points

### Call Completion

After call completion, scoring should be triggered:

```python
# In complete_call() after disposition actions
if call.lead:
    if call.duration > 180:  # 3 minutes
        add_score_event(call.lead, 'call_long')
    elif call.duration > 0:
        add_score_event(call.lead, 'call_short')
    else:
        add_score_event(call.lead, 'call_no_answer')
```

> **Note:** This integration point exists in the scoring module but may need to be explicitly called from the call completion flow.

### Follow-up Completion

When a follow-up is completed:

```python
if followup.status == 'completed':
    add_score_event(followup.lead, 'followup_responded')
elif followup.status == 'missed':
    add_score_event(followup.lead, 'followup_missed')
```

### Quotation Events

When quotation status changes:

```python
add_score_event(lead, 'quotation_sent')
add_score_event(lead, 'quotation_accepted')
add_score_event(lead, 'quotation_rejected')
```

---

## Key Models & Files

| Model/Function | File | Purpose |
|---|---|---|
| `Lead.score` | `leads/models.py:156` | Current score (0-100) |
| `Lead.classification` | `leads/models.py:152-155` | Derived classification |
| `ScoreEvent` | `leads/models.py:213` | Score change history |
| `SCORE_POINTS` | `leads/scoring.py:6` | Default point values |
| `add_score_event()` | `leads/scoring.py:29` | Add score event |
| `recalculate_score()` | `leads/scoring.py:51` | Recalculate from scratch |
| `apply_time_decay()` | `leads/scoring.py:69` | Inactivity penalty |
