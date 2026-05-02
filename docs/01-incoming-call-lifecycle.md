# Incoming Call Lifecycle

## Overview

This document describes the complete lifecycle of an incoming call from the moment it hits the Asterisk PBX through to call completion and post-call actions.

---

## Phase 1: Call Arrival (Asterisk AMI Events)

### 1.1 Connection Setup

The system maintains a persistent TCP connection to Asterisk's AMI (Asterisk Manager Interface) via a long-running Celery task:

```
apps.asterisk.tasks.start_ami_listener()
    └── AMIClient.run()  # blocking loop with auto-reconnect
```

**File:** `crm_backend/apps/asterisk/ami_client.py`

### 1.2 Event Dispatch

When Asterisk emits an AMI event, the `AMIClient._dispatch()` method filters for relevant events and forwards them to the Celery task `process_ami_event`:

**Relevant events:**
| Event | Purpose |
|---|---|
| `Newchannel` | New trunk call arrives |
| `QueueCallerJoin` | Caller enters a queue |
| `Bridge` | Call is answered (agent ↔ caller connected) |
| `Hangup` / `SoftHangupRequest` | Call ends |
| `AgentCalled` | Agent is being rung |
| `AgentConnect` | Agent answered the call |
| `AgentComplete` / `AgentRinghangup` | Agent finished the call |
| `QueueMemberAdded` | Agent logged into queue |
| `QueueMemberRemoved` | Agent logged off from queue |
| `QueueMemberPaused` | Agent paused/unpaused |

---

## Phase 2: Call Record Creation

### 2.1 Newchannel (Trunk Calls)

**Trigger:** `Newchannel` event with an inbound context (e.g., `from-trunk`, `from-did`, `from-pstn`)

**Actions:**
1. Skip `Local/` channels (internal queue legs)
2. Validate context is in `INBOUND_CONTEXTS` set
3. Extract `caller` (CallerIDNum) and `callee` (Exten/DID)
4. Attempt customer lookup via `CustomerPhone` (last 9 digits match)
5. Create `Call` record:
   - `status = 'ringing'`
   - `direction = 'inbound'`
   - `customer = matched customer (or None)`
   - `agent = None` (not yet assigned)
   - `started_at = now`
6. Fire `notify_incoming_call` Celery task → WebSocket push to agents

**File:** `crm_backend/apps/calls/tasks.py:177-232`

### 2.2 QueueCallerJoin (Queue Calls)

**Trigger:** `QueueCallerJoin` event — **the authoritative event for queue inbound calls**

**Actions:**
1. Extract `caller` (CallerIDNum) and `queue`
2. Customer lookup via `CustomerPhone` (last 9 digits)
3. **Update or create** `Call` record (overwrites any incorrect `Newchannel` record)
4. Always fire `notify_incoming_call` → WebSocket push

**File:** `crm_backend/apps/calls/tasks.py:234-268`

### 2.3 AgentCalled (Agent Ringing)

**Trigger:** `AgentCalled` event — an agent is being rung for a queue call

**Actions:**
1. Extract `MemberName` (extension number)
2. Look up `Extension` → `User`
3. Update the `Call` record: `agent = matched user`

**File:** `crm_backend/apps/calls/tasks.py:402-418`

---

## Phase 3: Call Answered

### 3.1 Bridge Event

**Trigger:** `Bridge` event (Asterisk 11 style — two channels bridged)

**Actions:**
1. Match by `Uniqueid1`, `Uniqueid2`, or `Linkedid`
2. Update `Call.status = 'answered'`
3. Update `Call.started_at = now`

**File:** `crm_backend/apps/calls/tasks.py:270-281`

### 3.2 AgentConnect Event

**Trigger:** `AgentConnect` — agent answered a queue call

**Actions:**
1. Extract `MemberName` → `Extension` → `User`
2. Update `Call`: `agent = user`, `status = 'answered'`, `started_at = now`
3. Update agent's status to `'on_call'` via `update_user_status()`
4. Push status change via WebSocket

**File:** `crm_backend/apps/calls/tasks.py:420-443`

---

## Phase 4: Call Ended

### 4.1 Hangup / SoftHangupRequest

**Trigger:** Call termination event

**Actions:**
1. Skip WebRTC calls (managed by `endWebrtcCall` endpoint)
2. Determine final status based on `Cause` code and current state:

| Cause | Status |
|---|---|
| 16 (Normal Clearing) + was answered | `answered` |
| 16 (Normal Clearing) + never answered | `no_answer` |
| 17 | `busy` |
| 18, 19, 3 | `no_answer` |
| 21 | `failed` |

3. Calculate duration from `started_at` if Asterisk didn't provide it
4. Update `Call`: `status`, `ended_at`, `duration`
5. Fire `notify_call_ended` → WebSocket push

**File:** `crm_backend/apps/calls/tasks.py:283-346`

### 4.2 AgentComplete / AgentRinghangup

**Trigger:** Agent finished handling the call

**Actions:**
1. Extract extension → `User`
2. Set agent status back to `'available'`

**File:** `crm_backend/apps/calls/tasks.py:445-460`

---

## Phase 5: Screen Pop & Lead Matching

### 5.1 WebSocket Notification

When `notify_incoming_call` fires, it pushes a payload to WebSocket groups:

```python
payload = {
    'type': 'incoming_call',
    'call_id': str(call.id),
    'caller': call.caller,
    'direction': call.direction,
    'customer_name': ...,
    'lead_id': ...,
    'lead_title': ...,
}
```

**Groups notified:**
- `supervisors` — always
- `agent_{agent_id}` — if call has an assigned agent
- `agents` — if no agent assigned yet (queue call)

**File:** `crm_backend/apps/calls/tasks.py:12-108`

### 5.2 Lead Search & Auto-Creation

The frontend uses helpers in `calls/services.py` to:

1. **`find_lead_by_phone(phone_number)`** — search by exact, normalized, or suffix match (last 9 digits)
2. **`get_or_create_lead_for_call(...)`** — if no lead found, auto-create one with `source='call'`
3. **`link_call_to_lead(call_id, lead_id)`** — manually link an existing call to a lead

**File:** `crm_backend/apps/calls/services.py:274-367`

---

## Phase 6: Call Completion (Enforcement)

After an answered call ends, the agent **must** complete it via the `complete_call()` service.

### 6.1 Validation Rules

| Rule | Description |
|---|---|
| 1 | Call must have `status = 'answered'` |
| 2 | Call must not already be completed (`is_completed = False`) |
| 3 | A valid `disposition_id` is required |
| 4 | Note is required if `disposition.requires_note = True` (min 10 chars) |
| 5 | `next_action` is required from valid choices |
| 6 | If disposition has `create_followup` action → `followup_due_at` required |
| 7 | If `next_action = 'close_lead'` → call must have a linked lead |
| 8 | If stage is `Won` → `won_amount` required; if `Lost` → `lost_reason` required |

**File:** `crm_backend/apps/calls/services.py:7-90`

### 6.2 What Gets Created

1. **`CallCompletion`** record with:
   - `disposition`, `note`, `next_action`
   - Follow-up details if required
   - Lead stage change info if applicable

2. **`Call`** updated:
   - `is_completed = True`
   - `completed_at = now`

3. **Lead** updated (if linked):
   - `stage` changed if `new_lead_stage_id` provided
   - `won_amount` / `won_at` if won
   - `lost_reason` / `lost_at` if lost

### 6.3 Disposition Actions (Dynamic)

Each `Disposition` can have multiple `DispositionAction` records that execute automatically:

| Action Type | What It Does |
|---|---|
| `create_followup` | Creates a `Followup` record |
| `create_lead` | Auto-creates a `Lead` from customer if none linked |
| `create_ticket` | Creates a `Ticket` for the customer |
| `change_lead_stage` | Moves lead to a configured stage |
| `mark_won` | Sets lead to Won stage with amount |
| `escalate` | Sends WebSocket event to `supervisors` group |
| `no_action` | No automatic action |

**File:** `crm_backend/apps/calls/services.py:137-253`

---

## Call Status State Machine

```
                  ┌─────────┐
                  │ ringing │
                  └────┬────┘
                       │
            ┌──────────┼──────────────────┐
            ▼          ▼                  ▼
      ┌──────────┐ ┌──────┐ ┌─────────────────┐
      │ answered │ │ busy │ │ no_answer       │
      └────┬─────┘ └──────┘ └─────────────────┘
           │                          failed
           ▼
    ┌─────────────┐
    │ completed * │  ← after CallCompletion
    └─────────────┘
```

---

## Key Models

| Model | File | Purpose |
|---|---|---|
| `Call` | `calls/models.py:60` | Core call record |
| `CallCompletion` | `calls/models.py:116` | Post-call enforcement record |
| `Disposition` | `calls/models.py:6` | Predefined call outcomes |
| `DispositionAction` | `calls/models.py:34` | Actions triggered by disposition |
| `CallEvent` | `calls/models.py:165` | Audit trail for call events |
| `CallRecording` | `calls/models.py:175` | Call recording metadata |
| `CallDisposition` | `calls/models.py:188` | Legacy backward-compat model |

---

## Key Services & Tasks

| Function | File | Purpose |
|---|---|---|
| `process_ami_event` | `calls/tasks.py:163` | Main AMI event processor |
| `notify_incoming_call` | `calls/tasks.py:12` | WebSocket push for incoming calls |
| `notify_call_ended` | `calls/tasks.py:113` | WebSocket push for ended calls |
| `complete_call` | `calls/services.py:7` | Call completion enforcement |
| `get_pending_completions` | `calls/services.py:258` | List unanswered completions |
| `find_lead_by_phone` | `calls/services.py:274` | Lead lookup by phone |
| `get_or_create_lead_for_call` | `calls/services.py:312` | Screen pop lead matching |
| `link_call_to_lead` | `calls/services.py:348` | Manual call-lead linking |
| `start_ami_listener` | `asterisk/tasks.py:8` | Persistent AMI connection |
