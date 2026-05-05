# Incoming Call Lifecycle — A to Z

## Overview

This document describes the complete lifecycle of an incoming call in the CRM system, from the moment a caller dials in to the final disposition after the call ends.

---

## Architecture

```
Caller → PSTN/Trunk → Asterisk PBX → AMI Events → Celery Tasks → WebSocket → Frontend
```

| Component | Role |
|-----------|------|
| **Asterisk PBX** | Handles SIP signaling, routing, and call bridging |
| **AMI (Asterisk Manager Interface)** | Pushes real-time events to the backend |
| **Celery** | Processes AMI events asynchronously |
| **Django Channels** | Broadcasts events to frontend via WebSocket |
| **Frontend (Next.js)** | Displays popup, handles answer/reject, manages routing |

---

## Phase 1: Call Arrival

### 1.1 Caller Dials In

```
Caller → PSTN/Trunk → Asterisk PBX
```

- Caller dials the business number
- Asterisk receives the call on a trunk channel
- Asterisk determines the DID (Direct Inbound Dialing) and routes to a queue or extension

### 1.2 AMI Event: `Newchannel` or `QueueCallerJoin`

Asterisk fires an AMI event. The backend listener (`ami_client.py`) catches it and dispatches to Celery:

```python
# apps/calls/tasks.py — process_ami_event()
```

**`Newchannel` event** (direct trunk call):
- Fields: `CallerIDNum`, `CallerIDName`, `Context`, `Exten`, `Uniqueid`
- Context must be in `INBOUND_CONTEXTS` set (`from-trunk`, `from-pstn`, `from-did`, etc.)

**`QueueCallerJoin` event** (call enters a queue):
- Fields: `CallerIDNum`, `CallerIDName`, `Queue`, `Uniqueid`
- Always triggers VIP check after processing

### 1.3 Lead Lookup

```python
lead = _find_lead(caller)  # Lookup only — NO auto-creation
```

- Searches for existing lead by normalized phone number (exact match first, then suffix fallback)
- **Known number:** Returns existing lead
- **Unknown number:** Returns `None` — lead will be created later by the agent

### 1.4 Call Record Creation

```python
call, created = Call.objects.get_or_create(
    uniqueid=uniqueid,
    defaults={
        'caller': caller,
        'caller_name': caller_name,  # From CallerIDName AMI field
        'callee': exten_or_queue,
        'direction': 'inbound',
        'status': 'ringing',
        'lead': lead,           # None for unknown callers
        'agent': None,
        'started_at': timezone.now(),
    }
)
```

- `uniqueid` is Asterisk's unique call identifier
- Status starts as `ringing`
- `caller_name` stores the AMI `CallerIDName` for unknown callers
- `lead` is `None` for unknown callers

### 1.5 Activity Record (Optional)

If the call is new (`created=True`), an Activity record is created linked to the lead (if one exists).

### 1.6 WebSocket Notification

```python
notify_incoming_call.delay(str(call.id))
```

Celery task builds the payload and pushes to WebSocket groups:

| Scenario | WebSocket Groups |
|----------|-----------------|
| Call assigned to specific agent | `supervisors`, `agent_{id}` |
| Queue call (unassigned) | `supervisors`, `agents` |

**Payload structure:**
```json
{
  "type": "incoming_call",
  "call_id": "uuid",
  "uniqueid": "asterisk-unique-id",
  "caller": "01012345678",
  "caller_name": "John Doe",
  "callee": "901",
  "queue": "901",
  "direction": "inbound",
  "lead_id": "uuid-or-null",
  "lead_name": "John Doe-or-null",
  "lead_phone": "01012345678-or-null",
  "lead_stage": "New-or-null",
  "lead_status": "Open-or-null",
  "lead_company": "Acme Corp-or-null",
  "lead_email": "john@example.com-or-null"
}
```

**Unknown caller payload (lead_id = null):**
```json
{
  "type": "incoming_call",
  "call_id": "uuid",
  "uniqueid": "asterisk-unique-id",
  "caller": "01012345678",
  "caller_name": "John Doe or empty",
  "callee": "901",
  "queue": "901",
  "direction": "inbound",
  "lead_id": null,
  "lead_title": null,
  "lead_phone": "01012345678",
  "lead_stage": null,
  "lead_status": null,
  "lead_assigned": null,
  "lead_value": null,
  "lead_source": "call",
  "lead_name": null,
  "lead_company": null,
  "lead_email": null
}
```

---

## Phase 2: Popup Display

### 2.1 Frontend Receives WS Event

```typescript
// layout.tsx — useWebSocket callback
if (event.type === 'incoming_call') {
  setIncomingCall(event);
}
```

### 2.2 Popup Renders

```typescript
// IncomingCallPopup.tsx
```

The popup shows:
- **Known lead:** Name, phone, stage, company, email (blue avatar icon)
- **Unknown caller:** Caller ID name (or "Unknown Caller"), phone number, "New Caller — Create Lead" badge (amber avatar icon)

**Race condition handling:**
When SIP rings before the WS event arrives, `incomingCall` is null. The popup uses a **screen-pop fallback** — it calls `callsApi.screenPop(phone)` using the SIP caller number to look up the lead immediately.

```typescript
// Data priority: WS event > screen-pop API > SIP incoming info
const hasWs    = !!wsData?.lead_id;
const isKnownLead = hasWs ? !!wsData.lead_id : !!spData;

if (hasWs) {
  leadName  = wsData?.lead_name ?? wsData?.lead_title ?? wsData?.caller ?? 'Unknown';
  leadPhone = wsData?.lead_phone ?? wsData?.caller ?? '';
  leadStage = wsData?.lead_stage ?? null;
} else if (spData) {
  const fullName = [spData.first_name, spData.last_name].filter(Boolean).join(' ').trim();
  leadName   = fullName || spData.title || sipIncoming?.from || 'Unknown';
  leadPhone  = spData.phone || sipIncoming?.from || '';
  leadStage  = spData.stage_name ?? null;
} else {
  leadName   = 'Unknown Caller';
  leadPhone  = sipIncoming?.from || wsData?.caller || '';
}
```

**`caller_name` filtering:**
Asterisk sends `CallerIDName='300'` (SIP extension number) which is not a useful name. The backend now filters out numeric-only `caller_name` values:
```python
caller_name_clean = ''
if call.caller_name and not call.caller_name.isdigit():
    caller_name_clean = call.caller_name
```

When `get_full_name()` returns just a phone number (lead has no first_name/last_name), the WS payload prefers `title` over the numeric extension:
```python
if lead_display_name and lead.phone and lead_display_name.strip() == lead.phone.strip():
    lead_display_name = lead.title or caller_name_clean or lead.phone
```

### 2.3 Agent States

| Agent Status | Popup Behavior |
|-------------|----------------|
| `available` | Shows popup with Answer + Reject buttons |
| `on_call` | Shows popup (can handle multiple calls) |
| `away` | Popup hidden — call goes to next available agent |

---

## Phase 3: Agent Answers

### 3.1 Agent Clicks "Answer"

```typescript
// IncomingCallPopup.tsx — handleAnswer()
```

1. Calls `callsApi.markCallAnswered(callId)` — updates DB:
   - Sets `status = 'answered'`
   - Sets `agent = current_user`
   - Sets `started_at = now`
   - **Auto-assigns lead** to agent if not already assigned

2. Calls SIP `actions.answer()` — establishes audio

### 3.2 SIP Session Accepted

```typescript
// sipClient.ts — session.on('accepted')
```

- Ringing stops
- `callStatus` changes to `'active'`

### 3.3 Frontend Routing

```typescript
// IncomingCallPopup.tsx — useEffect on callStatus
```

**Routing decision:**
```typescript
const isKnownLead = !!incomingCall?.lead_id;

if (isKnownLead) {
  router.push(`/leads/${incomingCall.lead_id}`);
} else {
  router.push(`/leads/new?phone=${phone}&uniqueid=${uniqueid}&caller_name=${callerName}`);
}
```

| Scenario | Route |
|----------|-------|
| Known lead (exists in DB) | `/leads/{id}` — lead detail page |
| Unknown caller (no lead) | `/leads/new?phone=...&uniqueid=...&caller_name=...` — new lead form |

### 3.4 New Lead Form Pre-fills

```typescript
// leads/new/page.tsx
```

When navigated from an incoming call:
- `phone` field pre-filled from URL param
- `first_name` pre-filled: first part of `caller_name` (if available)
- `last_name` pre-filled: last part of `caller_name` (if available)
- `title` pre-filled: `Lead from call — {phone}`
- `source` pre-selected: `call` (Inbound Call)
- `call_uniqueid` passed to API on submit — links the Call record to the new Lead

---

## Phase 4: Active Call

### 4.1 Call Controls

The active call popup shows:
- **Mute** — toggle microphone
- **Hold** — toggle call hold
- **Transfer** — transfer to another extension
- **End Call** — hang up
- **Call timer** — elapsed time display

### 4.2 AMI Event: `Bridge`

When the call is bridged (agent connected to caller), Asterisk fires a `Bridge` event:

```python
# tasks.py — Bridge handler
Call.objects.filter(uniqueid=uid, status='ringing').update(
    status='answered',
    started_at=timezone.now(),
)
```

This is a safety net — the status should already be `answered` from `markCallAnswered`.

### 4.3 AMI Event: `AgentConnect` (Queue Calls)

For queue calls, Asterisk fires `AgentConnect`:

```python
# tasks.py — AgentConnect handler
Call.objects.filter(uniqueid=linkedid).update(
    agent=agent,
    status='answered',
    started_at=timezone.now(),
)
_assign_lead_to_agent(call_obj, agent)  # Auto-assign lead
```

---

## Phase 5: Call Ends

### 5.1 Agent Hangs Up

```typescript
// sipClient.ts — session.on('ended')
callStatus = 'idle';
```

### 5.2 AMI Event: `Hangup`

Asterisk fires `Hangup` event with cause code:

```python
# tasks.py — Hangup handler
```

**Cause code mapping:**

| Cause | Status |
|-------|--------|
| 17 | `busy` |
| 19, 3, 18 | `no_answer` |
| 21 | `failed` |
| answered call | `answered` |

**Updates:**
- Sets `ended_at`, `duration`, `status` on Call record
- Updates Activity record to `completed`
- **Finds all agents offered but never answered** and logs `timeout` events for each
- Triggers `notify_call_ended.delay()`
- If `no_answer`, triggers `handle_missed_call.delay()` (auto-creates callback follow-up)

### Agent Event Tracking

Each AMI event creates `CallAgentEvent` and `LeadEvent` records:

| AMI Event | CallAgentEvent | LeadEvent | Notes |
|-----------|---------------|-----------|-------|
| `AgentCalled` | `offered` | `call_offered` | Call offered to agent (phone ringing) |
| `AgentConnect` | `answered` | `call_answered` | Agent answered, includes `ring_duration` from AMI `Ringtime` |
| `AgentRinghangup` | `ringhangup` | `call_rejected` | Agent hung up while phone was ringing |
| `Hangup` (no_answer) | `timeout` (per agent) | `call_no_answer` | Finds ALL agents offered but unanswered |
| Frontend reject button | `rejected` | — | Agent clicked Reject in popup |

**Multi-agent re-queue scenario:**
When agent A doesn't answer and Asterisk re-queues to agent B:
1. `AgentCalled` for agent A → `CallAgentEvent(offered)` for agent A
2. `AgentCalled` for agent B → `CallAgentEvent(offered)` for agent B, `call.agent` updated to B
3. `AgentConnect` for agent B → `CallAgentEvent(answered)` for agent B
4. `Hangup no_answer` → Only agent A gets `timeout` (no matching `answered` event)

The `AgentCalled` handler no longer filters by `agent__isnull=True`, so it correctly updates the call's agent field even when re-routing.

### 5.3 WebSocket: `call_ended` Event

Backend pushes `call_ended` event to the agent's WebSocket group.

### 5.4 Frontend Detects Call End

```typescript
// layout.tsx — useEffect on callStatus
```

Two triggers:
1. **Primary:** `call_ended` WS event stores `call_id`
2. **Fallback:** SIP `callStatus` transitions from `active`/`holding`/`incoming` → `idle`

### 5.5 Disposition Modal Opens

```typescript
// layout.tsx — tryFetchPending()
```

1. Calls `callsApi.pendingCompletions()` — returns answered, uncompleted calls
2. Retry logic: 800ms → 1.8s → 3s → 5s (handles slow networks)
3. Opens `DispositionModal` with call data

**Fallback:** If all retries exhaust, shows manual fallback modal:
> "The call was logged, but the disposition form couldn't be loaded automatically. You can complete this call later from the Call History."

---

## Phase 6: Disposition

### 6.1 Agent Completes Disposition

```typescript
// DispositionModal.tsx
```

**Required fields:**
- **Disposition** — select from configured dispositions (filtered by call direction)
- **Note** — minimum 10 characters (if disposition requires it)

**Optional fields:**
- **Next Action** — callback, quotation, follow-up, close, no action
- **Update Lead Stage** — checkbox to change stage
  - Won stage → requires amount
  - Lost stage → requires reason
- **Schedule Follow-up** — checkbox
  - Due date & time
  - Follow-up type (call, email, meeting, WhatsApp)
  - Assign to (same agent or another)

### 6.2 Backend Processing

```python
# apps/calls/services.py — complete_call()
```

**Validation rules:**
1. Call must be `answered`
2. Cannot complete twice
3. Disposition required
4. Note required (min 10 chars) if disposition requires it
5. Next action required
6. Follow-up date required if `create_followup` action
7. Lead must exist for `close_lead`
8. Won amount required for won stage

**Actions executed:**
- Creates `CallCompletion` record
- Updates lead stage/won/lost
- Executes disposition actions: `create_followup`, `create_lead`, `create_ticket`, `mark_won`, `escalate`, `change_lead_stage`

### 6.3 Call Marked Complete

```python
Call.objects.filter(pk=call_id).update(
    is_completed=True,
    completed_at=timezone.now(),
)
```

---

## Data Flow Diagram

```
┌──────────┐     AMI      ┌──────────┐    Celery     ┌──────────┐
│ Asterisk │ ──────────→ │  Backend  │ ─────────→ │  Django   │
│   PBX    │   Event     │  Listener │   Task       │  Channels │
└──────────┘             └──────────┘              └────┬─────┘
                                                        │ WS
                                                        ▼
                                               ┌──────────────┐
                                               │   Frontend   │
                                               │  (Next.js)   │
                                               └──────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `crm_backend/apps/calls/tasks.py` | AMI event processing, lead lookup, WS notifications, agent event tracking |
| `crm_backend/apps/calls/models.py` | Call, CallAgentEvent models |
| `crm_backend/apps/calls/views.py` | API endpoints (mark-answered, complete, pending-completions, agent-events, agent-stats) |
| `crm_backend/apps/calls/services.py` | Call completion logic and validation |
| `crm_backend/apps/leads/models.py` | LeadEvent model with call_* event types |
| `crm_frontend/src/components/calls/IncomingCallPopup.tsx` | Popup UI, answer/reject, routing, screen-pop fallback |
| `crm_frontend/src/app/(dashboard)/calls/[id]/page.tsx` | Call detail page with Agent Activity section |
| `crm_frontend/src/app/(dashboard)/leads/new/page.tsx` | New lead form with call pre-fill |
| `crm_frontend/src/components/calls/DispositionModal.tsx` | Post-call disposition form |
| `crm_frontend/src/app/(dashboard)/layout.tsx` | WS event handling, disposition modal trigger |
| `crm_frontend/src/store/sipStore.ts` | Shared SIP state including incoming call info |

---

## Known Issues & Resolutions

### Issue: Lead Auto-Created Before Popup (RESOLVED)

**Problem:** Unknown numbers appeared in the popup as "existing leads" with stage "New" before the agent even answered. The system auto-created a lead the moment the AMI event arrived.

**Root Cause:** `_get_or_create_lead()` in `tasks.py` auto-created a lead immediately when the `Newchannel` or `QueueCallerJoin` AMI event was processed. This happened before the WebSocket notification was sent, so by the time the popup rendered, the lead already existed in the database with stage "New".

**Impact:**
- Unknown callers appeared as known leads in the popup
- Agents were confused seeing "existing" leads for numbers they'd never seen
- Routing logic couldn't distinguish between truly known leads and auto-created ones
- Database was filled with orphan leads from missed/abandoned calls

**Resolution:** Replaced `_get_or_create_lead()` with `_find_lead()` (lookup only, no auto-creation), and improved the popup and routing logic:

1. **Backend:** `_find_lead()` returns `None` for unknown callers — no auto-creation
2. **Backend:** `_find_lead_by_phone()` now uses `normalize_phone()` and tries exact match first with all phone variants before falling back to suffix matching, preventing false matches
3. **Backend:** `CallerIDName` from AMI is now captured on the Call model (`caller_name` field)
4. **WebSocket:** Payload includes `caller_name` and sends `lead_*` fields as `null` for unknown callers
5. **Frontend:** Popup distinguishes known leads (blue avatar, shows stage/company) from unknown callers (amber avatar, shows "Unknown Caller" or caller ID name, "New Caller — Create Lead" badge)
6. **Frontend:** Routing uses `!!incomingCall.lead_id` (not `lead_id && lead_name`) to decide known vs unknown
7. **Frontend:** New lead form pre-fills `first_name`/`last_name` from `caller_name` URL param

**Result:**
- Known numbers: Found in DB → popup shows lead details with stage → routes to `/leads/{id}`
- Unknown numbers: Not found → popup shows "Unknown Caller" (or CallerIDName if available) with amber badge → routes to `/leads/new?phone=...&uniqueid=...&caller_name=...`
- Leads for unknown callers are only created when the agent explicitly submits the new lead form
