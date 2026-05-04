# Change Log

## 2026-05-04 — Unknown Caller Popup & Lead Matching Fix

### Fixed
- **Unknown callers shown as known leads in popup** — When an unknown number calls, the popup now displays "Unknown Caller" (or the CallerID name from Asterisk if available) with an amber "New Caller — Create Lead" badge, instead of showing a fake lead with stage "New"
- **Routing for unknown callers** — Unknown callers now route to `/leads/new?phone=...&uniqueid=...&caller_name=...` with first/last name pre-filled from CallerIDName
- **Duplicate lead creation** — `_find_lead_by_phone` now uses `normalize_phone()` and tries exact match with all phone variants before falling back to suffix matching; results ordered by `updated_at` to prefer the most recently updated lead
- **Duplicate AMI events** — AMI listener in `AsteriskConfig.ready()` now only starts in Daphne (web server), not in Celery workers, preventing duplicate event processing
- **Call-lead link on new lead creation** — `LeadDetailSerializer.create()` now always updates the call's lead reference (removed `lead__isnull=True` filter), so creating a new lead from a call correctly links even if the call already had a stale lead
- **Lead name in WS payload** — When a lead's `get_full_name()` returns just a phone number (i.e., auto-created lead with no real name), the WS payload now falls back to `caller_name` (CallerIDName from Asterisk) for the `lead_name` field

### Changed
- **`_find_lead_by_phone`** — Rewrote to use `normalize_phone()` with exact-match-first strategy using all phone number variants (normalized, international, suffix), then suffix-match fallback. Orders results by `updated_at` to return the most recently updated lead when duplicates exist
- **`Newchannel` / `QueueCallerJoin` AMI handlers** — Now capture `CallerIDName` from AMI events and store in `caller_name` field on Call model
- **`notify_incoming_call` WS payload** — Added `caller_name` field; improved `lead_name` to fall back to `caller_name` when lead has no real name
- **`IncomingCallPopup.tsx`** — Distinguishes known leads (blue avatar, shows stage/company) from unknown callers (amber avatar, shows "Unknown Caller" or CallerIDName + "New Caller — Create Lead" badge); routing uses `!!incomingCall?.lead_id` instead of `lead_id && lead_name`; passes `caller_name` to new lead URL
- **`leads/new/page.tsx`** — Accepts `caller_name` URL param; splits it into `first_name`/`last_name` for pre-fill
- **`IncomingCallEvent` type** — Added `caller_name: string` field
- **`Call` model** — Added `caller_name` field (CharField, max_length=200, blank=True, default='')
- **`CallListSerializer`** — Added `caller_name` to fields list
- **`ami_client.py`** — Changed from `process_ami_event.apply()` to `process_ami_event.apply_async()` for proper async dispatch to Celery
- **`asterisk/apps.py`** — AMI listener thread now only starts in Daphne (skipped in Celery workers) to prevent duplicate event processing
- **`asterisk/tasks.py`** — `start_ami_listener` task now skips unless `AMI_STANDALONE=1` env var is set

### Added
- Migration `0011_add_caller_name` — adds `caller_name` column to `calls` table

### Files Modified
- `crm_backend/apps/calls/models.py` — Added `caller_name` field
- `crm_backend/apps/calls/tasks.py` — `_find_lead_by_phone` rewrite; `caller_name` capture; WS payload update; logging
- `crm_backend/apps/calls/serializers.py` — Added `caller_name` to `CallListSerializer`
- `crm_backend/apps/leads/serializers.py` — Added `call_uniqueid` to `fields` list; removed `lead__isnull=True` filter on call update
- `crm_backend/apps/asterisk/ami_client.py` — `.apply_async()` instead of `.apply()`
- `crm_backend/apps/asterisk/apps.py` — Skip AMI listener in Celery workers
- `crm_backend/apps/asterisk/tasks.py` — Guard `start_ami_listener` with `AMI_STANDALONE` check
- `crm_frontend/src/types/index.ts` — Added `caller_name` to `IncomingCallEvent`
- `crm_frontend/src/components/calls/IncomingCallPopup.tsx` — Known/unknown caller distinction, amber/blue avatars, caller_name support, routing with caller_name
- `crm_frontend/src/app/(dashboard)/leads/new/page.tsx` — `caller_name` URL param for first/last name pre-fill

## 2026-05-04 — Incoming Call Workflow Fixes

### Changed
- **DispositionModal** — Merged all features from unused `CallCompletionModal` into the active `DispositionModal`:
  - Next action selector (callback, quotation, follow-up, close, no action)
  - Lead stage update with won/lost handling (amount + reason)
  - Follow-up scheduling with type and assignee selection
  - Field validation with inline error display
- **NewLeadPage** — Pre-fills title (`Lead from call — {phone}`) and source (`call`) when navigated from incoming call
- **layout.tsx** — Added `call_ended` WebSocket event handler as primary disposition trigger
- **layout.tsx** — Added manual fallback when pending completions retry loop exhausts (shows informative modal)
- **tasks.py** — `_get_or_create_lead()` now uses `CallerIDName` from Asterisk for meaningful lead titles

### Added
- `call_uniqueid` field on lead creation API — links Call record to newly created Lead
- `__manual__` callId handling in DispositionModal — shows "complete from Call History" guidance when auto-lookup fails

### Files Modified
- `crm_backend/apps/leads/serializers.py` — Added `call_uniqueid` write-only field; links Call→Lead on creation
- `crm_backend/apps/calls/tasks.py` — Enriched auto-created leads with CallerIDName
- `crm_backend/apps/calls/views.py` — `MarkCallAnsweredView` now auto-assigns lead to answering agent
- `crm_frontend/src/app/(dashboard)/leads/new/page.tsx` — Passes `call_uniqueid`; pre-fills title/source from call; defensive `stageItems` array check
- `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx` — Defensive `stageList` array check
- `crm_frontend/src/components/calls/DispositionModal.tsx` — Merged features + manual fallback UI
- `crm_frontend/src/app/(dashboard)/layout.tsx` — Added `call_ended` WS handler + retry exhaustion fallback

## 2026-05-04 — Bug Fixes: Lead Not Found + Stage Map Error

### Fixed
- **Lead "not found" after answer (persistent)** — `LeadViewSet.get_queryset()` now bypasses `assigned_to` filter for `retrieve` (detail) action. Agents can view any active lead by ID, which is necessary when navigating from an incoming call before the assignment propagates. List view remains filtered.
- **Lead 300 "not found" after answer** — `MarkCallAnsweredView` now auto-assigns the lead to the answering agent at answer time, eliminating the race condition where the agent navigates to the lead page before the `AgentConnect` AMI event assigns it
- **`TypeError: .map is not a function` on stage dropdown** — Added defensive `Array.isArray()` check on `stageData`/`stages` query results in both new lead and lead detail pages

## 2026-05-04 — Bug Fixes: Ghost Popup + New Lead Routing

### Fixed
- **Ghost popup showing "Phone system not connected" after call ends** — Changed `callStatus === 'idle'` condition to hide popup immediately instead of waiting for `incomingCall` to clear. Previously, the popup would re-render the incoming UI with `sipNotReady=true` between call end and state cleanup.
- **Unknown numbers showing as "existing leads" in popup** — Root cause: `_get_or_create_lead()` auto-created a lead the moment the AMI event arrived, before the agent even saw the popup. Unknown callers appeared as existing leads with stage "New". Fix: Replaced `_get_or_create_lead()` with `_find_lead()` (lookup only). Unknown callers now have `lead_id: null` in the WS payload and correctly route to `/leads/new`. Leads are only created when the agent explicitly submits the new lead form.
