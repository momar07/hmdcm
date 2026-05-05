# Change Log

## 2026-05-05 — Agent Events, Popup Fix, Multi-Agent Timeout

### Added
- **"Agent Activity" section on Call Detail page** — Shows per-agent events (offered, answered, rejected, timeout, ringhangup) with icons, ring duration, and timestamps
- **Screen-pop fallback** in `IncomingCallPopup` — When SIP rings before the WS event arrives, the popup makes a quick `callsApi.screenPop(phone)` API call to show lead info immediately instead of "Unknown Caller"
- **SIP `incoming` info in `useSipStore`** — Added `incoming: { from, displayName }` to the shared SIP store so the popup can access caller number before the WS event arrives

### Fixed
- **"Unknown Caller" shown for known leads in popup** — Race condition: SIP phone rings → popup shows immediately → but WS event with lead info hasn't arrived yet → shows "Unknown Caller". Fixed by doing a screen-pop API lookup using the SIP caller number as fallback while waiting for the WS event
- **SIP extension number shown as caller name** — Asterisk sends `CallerIDName='300'` (the SIP extension number), which was displayed as the lead name. Now numeric-only `caller_name` values are filtered out in the WS payload, and the popup prefers `lead.title` or `lead.phone` over numeric extensions
- **`AgentCalled` handler only updating agent when `agent__isnull=True`** — Removed this filter. When a call times out on agent A and Asterisk re-queues to agent B, `update(agent=B)` now succeeds. Each agent offered the call gets a `CallAgentEvent(offered)` record
- **`Hangup no_answer` only logging timeout for the last assigned agent** — Now finds ALL agents who had an `offered` event but no `answered` event, and logs a `timeout` for each one. Correctly tracks multi-agent ring scenarios
- **`DispositionModal` React hooks-of-hooks error** — Early return for `__manual__` call IDs was placed before hooks, causing all hooks below it to be called conditionally. Extracted `ManualFallback` into a separate component so hooks always run
- **`tasks.py` IndentationError** — The `if call:` block after `call = Call.objects...filter().first()` was incorrectly indented under the assignment, preventing Celery from starting
- **`lead_display_name` showing phone number instead of title** — When `get_full_name()` returns only a phone number (empty first/last name), the WS payload now falls back to `lead.title` first, then `caller_name` (only if non-numeric), then `lead.phone`

### Changed
- **`notify_incoming_call` WS payload** — `caller_name` now filters out numeric-only SIP extensions (e.g., `'300'` becomes `''`). `lead_display_name` fallback chain changed from `caller_name → title → phone` to `title → caller_name_clean → phone`
- **`IncomingCallPopup`** — Merges WS event data with screen-pop fallback data. When `incomingCall` is null but `callStatus === 'incoming'`, does a `callsApi.screenPop(phone)` lookup. Falls back to SIP `incoming.from`/`incoming.displayName` as last resort
- **`Hangup no_answer` handler** — Replaced single `_log_agent_event(call, call.agent, 'timeout', ...)` with a loop that finds all agents offered but unanswered via `CallAgentEvent` records
- **`sipStore.ts`** — Added `incoming: SipIncoming | null` state and `setIncoming` action for cross-component access to SIP incoming call info

### Files Modified
- `crm_backend/apps/calls/tasks.py` — Removed `agent__isnull=True` from `AgentCalled`; multi-agent timeout logging; `caller_name` cleanup; indentation fix; `lead_display_name` fallback fix
- `crm_frontend/src/components/calls/IncomingCallPopup.tsx` — Screen-pop fallback; SIP `incoming` merge; known/unknown caller logic rewrite
- `crm_frontend/src/components/calls/DispositionModal.tsx` — Extracted `ManualFallback` component; moved all hooks before early return
- `crm_frontend/src/app/(dashboard)/calls/[id]/page.tsx` — Added "Agent Activity" section; added `useQuery` for agent events
- `crm_frontend/src/store/sipStore.ts` — Added `incoming` state and `setIncoming` action
- `crm_frontend/src/lib/sip/useSip.ts` — Sync `incoming` info to `useSipStore`; clear on hangup/answer

## 2026-05-05 — Agent Call Event Tracking

### Added
- **`CallAgentEvent` model** — Tracks each agent interaction with a call: offered, answered, rejected, timeout, ringhangup. Records `call`, `agent`, `event_type`, `ring_duration`, and `note`
- **New LeadEvent types** — `call_offered`, `call_answered`, `call_rejected`, `call_no_answer` now appear in the lead activity timeline with distinct icons and colors
- **`_log_agent_event()` helper** in `tasks.py` — Creates both a `CallAgentEvent` record and a corresponding `LeadEvent` (if the call has a lead) in one call
- **AMI event tracking** — `AgentCalled` creates `offered` event; `AgentConnect` creates `answered` event with ring duration; `AgentRinghangup` creates `ringhangup` event; Hangup with `no_answer` creates `timeout` event
- **`AgentCallStatsView` API** — `GET /api/calls/agent-stats/?days=7&agent_id=uuid` returns per-agent call statistics (offered/answered/rejected/timeout counts and average ring duration)
- **`CallViewSet.agent_events` API** — `GET /api/calls/list/{id}/agent-events/` returns agent events for a specific call
- **`CallAgentEventSerializer`** — Serializes agent events with `agent_name`
- **Frontend `CallAgentEvent` type** — Added to `types/index.ts`
- **Frontend EVENT_LABELS** — Added `call_offered`, `call_answered`, `call_rejected`, `call_no_answer` with icons and colors
- **`callsApi.agentEvents()` and `callsApi.agentStats()`** — Frontend API methods for agent call analytics

### Changed
- **`AgentCalled` handler** — Now creates a `CallAgentEvent(offered)` and `LeadEvent(call_offered)`
- **`AgentConnect` handler** — Now creates a `CallAgentEvent(answered)` with `ring_duration` from AMI `Ringtime` field and `LeadEvent(call_answered)`
- **`AgentRinghangup` handler** — Now creates a `CallAgentEvent(ringhangup)` and `LeadEvent(call_rejected)`
- **Hangup handler** — On `no_answer`, creates a `CallAgentEvent(timeout)` with call duration and `LeadEvent(call_no_answer)`
- **`RejectCallView`** — Creates a `CallAgentEvent(rejected)` when agent rejects a call via the reject button

### Files Modified
- `crm_backend/apps/calls/models.py` — Added `CallAgentEvent` model
- `crm_backend/apps/leads/models.py` — Added 4 new event types to `LeadEvent.EVENT_CHOICES`
- `crm_backend/apps/calls/tasks.py` — Added `_log_agent_event()`, updated AMI handlers
- `crm_backend/apps/calls/serializers.py` — Added `CallAgentEventSerializer`
- `crm_backend/apps/calls/views.py` — Added `AgentCallStatsView`, `agent_events` action, `Count`/`Avg` imports
- `crm_backend/apps/calls/urls.py` — Added `agent-stats` and import for `AgentCallStatsView`
- `crm_backend/apps/leads/migrations/0014_...` — Migration for new event types
- `crm_backend/apps/calls/migrations/0012_...` — Migration for `CallAgentEvent` table
- `crm_frontend/src/types/index.ts` — Added `CallAgentEvent` interface
- `crm_frontend/src/lib/api/calls.ts` — Added `agentEvents()` and `agentStats()` methods
- `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx` — Added call event types to `EVENT_LABELS`

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
