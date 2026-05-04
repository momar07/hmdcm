# Error Fix Log

## 2026-05-04 — Unknown Caller Shown as Known Lead in Popup

### Issue 10: New/unknown callers displayed as existing leads with pipeline stage
**Problem:** When a number not in the leads database calls in, the popup displays it as an existing lead — showing a stage (e.g., "New") and lead details. After the agent creates a lead for that caller, subsequent calls from the same number still route to `/leads/new` instead of showing the known lead.

**Root causes (3 issues):**

1. **No CallerIDName captured or displayed** — The AMI `CallerIDName` field (e.g., "nesma") was ignored. The popup only had the phone number and a fallback to `lead_name` (which for auto-created leads was just the phone number).

2. **Frontend routing used `lead_id && lead_name` to detect known leads** — When a lead has no real name (first_name/last_name empty), `get_full_name()` returns the phone number. The check `incomingCall?.lead_id && incomingCall?.lead_name` would fail because `lead_name` looked like a phone number, not null — but the display still showed "lead-like" data. Conversely, for auto-created leads from before the fix, `lead_name` was set but with just a phone number string.

3. **`_find_lead_by_phone` used simple suffix matching** — The old implementation used only `phone__endswith=suffix[-9:]` which could return stale/old leads instead of the most recently updated one when duplicates existed. It also didn't use the `normalize_phone()` utility, so numbers like `2010012345678` (with country code) wouldn't match `01001234567` stored in the DB.

4. **Duplicate AMI listeners** — Both Daphne and Celery workers started AMI listener threads, causing every event to be dispatched twice (seen as duplicate `[AMI] Dispatching:` logs in both DAPHNE and CELERY outputs).

5. **Call-lead link lost on new lead creation** — `LeadDetailSerializer.create()` had `Call.objects.filter(uniqueid=call_uniqueid, lead__isnull=True).update(lead=lead)`, which meant if the Call already had a lead (the old auto-created one), the new lead wouldn't be linked.

**Fixes:**

1. **Added `caller_name` field to Call model** — New `CharField(max_length=200, blank=True, default='')` stores Asterisk's `CallerIDName` event field. Both `Newchannel` and `QueueCallerJoin` handlers now capture and save it:
   ```python
   caller_name = event.get('CallerIDName', '') or ''
   # ... stored in Call record and included in WS payload
   ```

2. **Frontend now uses `!!incomingCall?.lead_id` for known/unknown detection** — The routing logic changed from:
   ```typescript
   // OLD: wrong for auto-created leads where lead_name is just a phone number
   const isKnownLead = incomingCall?.lead_id && incomingCall?.lead_name;
   ```
   to:
   ```typescript
   // NEW: simply check if lead exists in DB
   const isKnownLead = !!incomingCall?.lead_id;
   ```

3. **Popup display distinguishes known vs unknown callers:**
   - **Known lead** (blue avatar): shows `lead_name`, phone, stage, company
   - **Unknown caller** (amber avatar): shows `caller_name` or "Unknown Caller", phone, "New Caller — Create Lead" badge
   ```typescript
   if (isKnownLead) {
     leadName = incomingCall?.lead_name ?? incomingCall?.lead_title ?? incomingCall?.caller ?? 'Unknown';
   } else {
     leadName = incomingCall?.caller_name?.trim() || 'Unknown Caller';
   }
   ```

4. **Rewrote `_find_lead_by_phone` with `normalize_phone()`:**
   ```python
   def _find_lead_by_phone(phone: str):
       normalized = normalize_phone(phone)
       variants = {normalized, digits, '+20'+digits, '20'+digits, ...}
       # Try exact match first (ordered by most recently updated)
       match = Lead.objects.filter(phone__in=variants, is_active=True).order_by('-updated_at').first()
       if match:
           return match
       # Fallback to suffix match
       match = Lead.objects.filter(phone__endswith=..., is_active=True).order_by('-updated_at').first()
       return match
   ```

5. **Fixed duplicate AMI events** — `AsteriskConfig.ready()` now skips starting AMI listener in Celery workers (detected by checking `sys.argv` for 'celery'). Only the Daphne process runs the listener. `ami_client.py` changed from `.apply()` to `.apply_async()` so events are properly dispatched to Celery queue.

6. **Fixed call-lead link on new lead creation** — Removed the `lead__isnull=True` filter:
   ```python
   # OLD: only linked if call had no lead
   Call.objects.filter(uniqueid=call_uniqueid, lead__isnull=True).update(lead=lead)
   # NEW: always link the call to the newly created lead
   Call.objects.filter(uniqueid=call_uniqueid).update(lead=lead)
   ```

7. **WS payload `lead_name` improvement** — When a lead's `get_full_name()` returns only a phone number (auto-created lead with no real name), fall back to `caller_name`:
   ```python
   lead_display_name = lead.get_full_name()
   if lead_display_name and lead.phone and lead_display_name == lead.phone:
       lead_display_name = call.caller_name or lead.title or lead.phone
   ```

8. **New lead form pre-fills first/last name from CallerIDName** — URL now includes `caller_name` param:
   ```
   /leads/new?phone=01007525599&uniqueid=...&caller_name=nesma
   ```
   Form pre-fills:
   ```typescript
   first_name: preCallerName ? preCallerName.split(' ').slice(0, -1).join(' ') || preCallerName : '',
   last_name: preCallerName ? preCallerName.split(' ').slice(-1).join('') : '',
   ```

**Data cleanup:** Hard-deleted 3 orphan auto-created leads (created by old `_get_or_create_lead` code, no associated calls). Merged 2 remaining duplicates for phone `01007525599` — moved calls/activities to the newer agent-created lead, soft-deleted the old auto-created lead.

**Migration:** `0011_add_caller_name` adds `caller_name` column to `calls` table.

## 2026-05-04 — Incoming Call Workflow Issues

### Issue 1: `uniqueid` not linked to new lead
**Problem:** When an unknown caller creates a new lead from the incoming call popup, the `uniqueid` is passed via URL params (`/leads/new?phone=...&uniqueid=...`) but never sent to `leadsApi.create()`. The call-lead link is lost.

**Fix:**
1. Added `call_uniqueid` write-only field to `LeadDetailSerializer` (`crm_backend/apps/leads/serializers.py`)
2. In the serializer's `create()` method, after creating the Lead, link any Call with matching `uniqueid` and no existing lead:
   ```python
   if call_uniqueid:
       from apps.calls.models import Call
       Call.objects.filter(uniqueid=call_uniqueid, lead__isnull=True).update(lead=lead)
   ```
3. Frontend now passes `call_uniqueid: preUniqueid || undefined` in the create payload (`crm_frontend/src/app/(dashboard)/leads/new/page.tsx`)

### Issue 2: Two disposition modals, only one wired up
**Problem:** `CallCompletionModal` has richer features (stage updates, won/lost, follow-up assignment) but is unused. The active `DispositionModal` is basic.

**Fix:** Merged all features from `CallCompletionModal` into `DispositionModal`:
- Next action selector
- Lead stage update checkbox with conditional won amount / lost reason fields
- Follow-up scheduling with type and assignee dropdowns
- Validation with inline error display
- Deleted the unused `CallCompletionModal` (no longer imported anywhere)

### Issue 3: `call_ended` WebSocket event ignored
**Problem:** Backend sends `call_ended` events via `notify_call_ended` (`tasks.py`), but frontend `useWebSocket` handler in `layout.tsx` has no handler for it. Call end detection relies solely on SIP `callStatus` changing to `'idle'`, which could desync from backend.

**Fix:** Added handler in `layout.tsx`:
```typescript
if (event.type === 'call_ended') {
  const evt = event as any;
  if (evt.call_id) {
    pendingCallIdRef.current = evt.call_id;
  }
}
```
This stores the call ID from the WS event so the SIP state transition can cross-reference it.

### Issue 4: Race condition on disposition modal timing
**Problem:** The retry logic (800ms→1.8s→3s→5s) may fail on slow networks if the backend Hangup processing hasn't finished. After max retries, the disposition modal never opens and the agent has no way to complete the call.

**Fix:**
1. When all retries exhaust, open the modal with `callId: '__manual__'`
2. `DispositionModal` detects `__manual__` and shows a fallback UI:
   - "The call was logged, but the disposition form couldn't be loaded automatically."
   - "You can complete this call later from the Call History."
   - Close button to dismiss

### Issue 5: Auto-created leads have generic titles
**Problem:** When `_get_or_create_lead` creates a lead (`tasks.py`), the title is `'Lead from call — {phone}'` — no use of Asterisk's `CallerIDName` which may contain the caller's actual name.

**Fix:**
1. Updated `_get_or_create_lead()` to accept `caller_id_name` parameter
2. Title format changed to `'{name} ({phone})'` when name is available, falls back to `'Lead from call — {phone}'`
3. Both `Newchannel` and `QueueCallerJoin` handlers now extract `CallerIDName` from the AMI event and pass it to the function

## 2026-05-04 — Bug Fixes: Lead Not Found + Stage Map Error

### Issue 6: Lead "not found" after answering call
**Problem:** When an agent answers an incoming call for an auto-created lead (e.g., lead 300), the popup shows lead info correctly. But clicking "Answer" redirects to `/leads/300` which shows "Lead not found."

**Root cause:** `get_all_leads()` in `selectors.py` filters by `assigned_to=user` for agents. Auto-created leads have `assigned_to=None`. The lead is only assigned later via the `AgentConnect` AMI event from Asterisk — but the frontend navigates to the lead page *before* that event fires. Race condition.

**Fix (attempt 1):** Modified `MarkCallAnsweredView` (`crm_backend/apps/calls/views.py`) to auto-assign the lead to the answering agent at answer time:
```python
# Auto-assign lead to answering agent so they can view it immediately
if call.lead_id and not call.lead.assigned_to_id:
    call.lead.assigned_to = request.user
    call.lead.save(update_fields=['assigned_to'])
```
**Result:** Still failed — the frontend navigates before the API call completes.

**Fix (attempt 2 — working):** Modified `LeadViewSet.get_queryset()` (`crm_backend/apps/leads/views.py`) to bypass the `assigned_to` filter for the `retrieve` (detail) action:
```python
def get_queryset(self):
    if self.action == 'retrieve':
        # Detail view: allow viewing any active lead by ID
        return Lead.objects.select_related(...).filter(is_active=True)
    return get_all_leads(user=self.request.user)
```
Agents can now view any active lead by ID. List view remains filtered by assignment.

### Issue 7: `TypeError: .map is not a function` on stage dropdown
**Problem:** On `/leads/new`, the stage dropdown throws:
```
TypeError: (intermediate value).map is not a function
Source: src/app/(dashboard)/leads/new/page.tsx (197:32)
```

**Root cause:** Despite `leadsApi.stages()` wrapping data with `toArray()`, the `useQuery` result `stageData` can occasionally be a non-array value (response object, cached stale data, or unexpected API shape). The `(stageData ?? [])` nullish coalescing only handles `null`/`undefined`, not objects.

**Fix:** Added explicit `Array.isArray()` guard in both affected pages:
- `crm_frontend/src/app/(dashboard)/leads/new/page.tsx`:
  ```typescript
  const stageItems = Array.isArray(stageData) ? stageData : [];
  ```
- `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx`:
  ```typescript
  const stageList = Array.isArray(stages) ? stages : [];
  ```

## 2026-05-04 — Bug Fixes: Ghost Popup + New Lead Routing

### Issue 8: Ghost popup showing "Phone system not connected" after call ends
**Problem:** After a call ends, a popup briefly appears showing "⚠ Phone system not connected — cannot answer calls" before disappearing.

**Root cause:** When the call ends, `callStatus` becomes `'idle'` but `incomingCall` is still set (not cleared yet). The popup's visibility condition `if (!visible) return null` passes because `visible` is still `true`. The incoming call UI renders with `sipNotReady = !actions || callStatus === 'idle'` — since `callStatus === 'idle'`, `sipNotReady` is `true`, showing the warning. The cleanup effect `if (callStatus === 'idle' && !incomingCall)` doesn't fire because `incomingCall` is still set.

**Fix:** Changed the cleanup condition from `if (callStatus === 'idle' && !incomingCall)` to `if (callStatus === 'idle')`. The popup now hides immediately when the call ends, regardless of whether `incomingCall` has been cleared.

### Issue 9: Unknown numbers showing as "existing leads" in popup before agent answers
**Problem:** When an unknown number calls in, the popup shows it as an already-existing lead with stage "New" — before the agent even answers or creates a lead.

**Root cause:** `_get_or_create_lead()` in `tasks.py` auto-created a lead the moment the AMI `Newchannel`/`QueueCallerJoin` event arrived. This happened before the agent saw the popup. The WS payload always had `lead_id` set, so the popup displayed lead info (stage "New") as if it were a known lead.

**Fix:** Replaced `_get_or_create_lead()` with `_find_lead()` (lookup only, no auto-creation):
```python
def _find_lead(phone: str):
    """Lookup existing Lead by phone only. Does NOT auto-create."""
    return _find_lead_by_phone(phone)
```
- **Known numbers:** Found in DB → `lead_id` set, popup shows lead details → routes to `/leads/{id}`
- **Unknown numbers:** Not found → `lead_id: null`, popup shows caller info only → routes to `/leads/new?phone=...`

Leads for unknown callers are now only created when the agent explicitly submits the new lead form.

Also cleaned up: removed stale `incomingCallRef` and unused `sessionStorage` logic from `handleAnswer`.
