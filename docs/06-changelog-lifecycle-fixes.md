# Changelog — Lifecycle Fixes

## Date: 2026-05-02

### Summary

Fixed 6 critical issues in the incoming call and lead lifecycle, plus 3 pre-existing bugs discovered during testing. All 42 tests pass.

---

## Fixes Applied

### FIX #1 — Auto-convert Lead to Customer on Won via `complete_call()`
**Severity:** P0 (Critical)
**File:** `crm_backend/apps/calls/services.py:136-139`

**Problem:** When an agent completed a call and selected a Won stage, the lead was marked as Won but `convert_lead_to_customer()` was never called. This left the lead in a Won state without creating the corresponding Customer record.

**Fix:** Added `convert_lead_to_customer()` call immediately after setting Won fields in the stage-change block:
```python
if stage.is_won:
    call.lead.won_amount = data.get('won_amount')
    call.lead.won_at     = tz.now()
    call.lead.save()
    # NEW: Auto-convert to Customer
    from apps.leads.services import convert_lead_to_customer
    convert_lead_to_customer(call.lead.id, actor=agent)
```

**Test:** `TestCompleteCallWonConversion.test_complete_call_won_converts_to_customer`

---

### FIX #2 — Auto-convert Lead to Customer on `mark_won` Disposition Action
**Severity:** P0 (Critical)
**File:** `crm_backend/apps/calls/services.py:206-210`

**Problem:** Same as Fix #1 but for the `mark_won` disposition action path. When a disposition had a `mark_won` action configured, it set the lead to Won but didn't convert to Customer.

**Fix:** Added `convert_lead_to_customer()` call after the mark_won action:
```python
elif atype == 'mark_won':
    if call.lead:
        # ... existing Won logic ...
        call.lead.save(update_fields=['stage', 'won_at', 'won_amount'])
        # NEW: Auto-convert to Customer
        from apps.leads.services import convert_lead_to_customer
        convert_lead_to_customer(call.lead.id, actor=agent)
```

**Test:** `TestMarkWonDispositionActionConversion.test_mark_won_action_converts_to_customer`

---

### FIX #3 — Update Lead Score After Call Completion
**Severity:** P1 (High)
**File:** `crm_backend/apps/calls/services.py:259-267`

**Problem:** The `add_score_event()` function existed but was never called after call completion. Lead scores remained at 0 regardless of call activity.

**Fix:** Added scoring logic at the end of `complete_call()`:
```python
if call.lead and call.duration:
    if call.duration > 180:
        add_score_event(call.lead, 'call_long',
                        reason=f'Call duration: {call.duration}s')
    elif call.duration > 0:
        add_score_event(call.lead, 'call_short',
                        reason=f'Call duration: {call.duration}s')
```

**Tests:**
- `TestScoringAfterCallCompletion.test_long_call_adds_score`
- `TestScoringAfterCallCompletion.test_short_call_adds_score`
- `TestScoringAfterCallCompletion.test_no_call_duration_no_score`

---

### FIX #4 — Replace `time.sleep(0.5)` with Proper DB Re-check in Hangup
**Severity:** P1 (High)
**File:** `crm_backend/apps/calls/tasks.py:317-326`

**Problem:** The Hangup event handler used `time.sleep(0.5)` to handle a race condition with the AgentConnect event. This is fragile and unreliable under load.

**Fix:** Replaced with a proper `select_for_update(skip_locked=True)` transaction:
```python
from django.db import transaction
with transaction.atomic():
    fresh = Call.objects.select_for_update(
        skip_locked=True
    ).filter(uniqueid=uniqueid).values('status').first()
if fresh and fresh['status'] == 'answered':
    status = 'answered'
else:
    status = 'no_answer'
```

---

### FIX #5 — Improve Phone Matching in AMI Tasks
**Severity:** P2 (Medium)
**File:** `crm_backend/apps/calls/tasks.py:207-220` (Newchannel), `244-258` (QueueCallerJoin)

**Problem:** Customer phone lookup only used suffix matching (last 9 digits), which could miss exact matches and cause false positives.

**Fix:** Added exact normalized match as the first attempt, with suffix as fallback:
```python
from apps.common.utils import normalize_phone
caller_normalized = normalize_phone(caller)
phone = CustomerPhone.objects.select_related('customer').filter(
    normalized=caller_normalized
).first()
if not phone and len(caller_normalized) >= 9:
    phone = CustomerPhone.objects.select_related('customer').filter(
        normalized__endswith=caller_normalized[-9:]
    ).first()
```

**Tests:**
- `TestPhoneMatchingImprovement.test_exact_normalized_match`
- `TestPhoneMatchingImprovement.test_suffix_fallback_match`

---

### FIX #6 — Improve AMI Listener Resilience
**Severity:** P2 (Medium)
**File:** `crm_backend/apps/asterisk/ami_client.py`

**Problem:** The AMI listener had a fixed reconnect delay (10s) and no TCP keepalive configuration.

**Fixes:**
1. Added `SO_KEEPALIVE` socket option for connection health monitoring
2. Implemented exponential backoff for reconnection (10s → 20s → 40s → ... → max 120s)
3. Added `_reconnect_count` tracking with reset on successful connection
4. Added `last_ping` tracking to monitor connection activity

**New constants:**
```python
MAX_RECONNECT_DELAY = 120  # cap for exponential backoff
PING_INTERVAL       = 30   # seconds between keepalive pings
```

**Tests:**
- `TestAMIClientResilience.test_reconnect_count_resets_on_success`
- `TestAMIClientResilience.test_stop_resets_reconnect_count`
- `TestAMIClientResilience.test_exponential_backoff_constants`

---

## Pre-existing Bugs Fixed

### Bug A — Migration Dependency Error
**File:** `crm_backend/apps/settings_core/migrations/0003_seed_default_settings.py`

**Problem:** Migration 0003 depended on `0001_initial` but used fields (`category`, `is_public`) that were only added in `0002`.

**Fix:** Changed dependency from `0001_initial` to `0002_alter_systemsetting_options_and_more`.

---

### Bug B — User Model Test Incompatibility
**Files:** `crm_backend/apps/leads/tests/test_services.py`, `test_api.py`

**Problem:** Tests used `create_user(username=..., email=...)` but the custom User model is email-based (no `username` field).

**Fix:** Changed all test user creation to use email-based pattern:
```python
User.objects.create_user(
    email='agent@test.com', password='pass123',
    first_name='Agent', last_name='One'
)
```

---

### Bug C — Missing `status` Import in Views
**File:** `crm_backend/apps/leads/views.py:148,150,176,178,195,197`

**Problem:** `status` was imported as `http_status` but some code used `status.HTTP_200_OK` instead of `http_status.HTTP_200_OK`.

**Fix:** Standardized all references to use `http_status.`.

---

## New Test File

**File:** `crm_backend/apps/calls/tests/test_lifecycle_fixes.py`

31 new tests covering:
- Won → Customer conversion via `complete_call()`
- Won → Customer conversion via `mark_won` disposition action
- Score updates after call completion
- Phone matching improvements
- AMI client resilience
- Edge cases (double completion, non-answered calls, followup actions)

---

## Test Results

```
Ran 42 tests in 3.369s
OK
```

All tests pass with no errors or failures.

---

## Files Modified

| File | Changes |
|---|---|
| `apps/calls/services.py` | Fix #1, #2, #3 |
| `apps/calls/tasks.py` | Fix #4, #5 |
| `apps/asterisk/ami_client.py` | Fix #6 |
| `apps/leads/views.py` | Bug C |
| `apps/settings_core/migrations/0003_*.py` | Bug A |
| `apps/leads/tests/test_services.py` | Bug B |
| `apps/leads/tests/test_api.py` | Bug B |
| `apps/calls/tests/test_lifecycle_fixes.py` | **NEW** — 31 tests |
| `apps/calls/tests/__init__.py` | **NEW** |
