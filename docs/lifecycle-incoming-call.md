# Incoming Call Lifecycle

## Overview

This document describes the complete lifecycle of an incoming call in the HMDM CRM system, from the moment a caller dials in through the PBX to the final disposition and post-call actions.

---

## Phase 1: Call Initiation (PBX Layer)

### 1.1 Caller Dials In

- External caller dials the business phone number
- Call reaches the **Issabel/Asterisk PBX** server (192.168.2.222)
- PBX routes the call based on dial plan configuration:
  - **Direct to extension**: Rings a specific agent
  - **To IVR**: Interactive voice response menu
  - **To queue**: Enters a call queue for distribution (ACD)

### 1.2 Asterisk Generates AMI Events

Asterisk fires a sequence of **AMI (Asterisk Manager Interface)** events over the persistent TCP connection:

| Event | Trigger | Key Data |
|---|---|---|
| `Newchannel` | A new channel is created | Channel ID, CallerID, CallerIDNum |
| `Newstate` | Channel state changes | Channel state (Ring, Up, etc.) |
| `QueueCallerJoin` | Caller enters a queue | Queue name, position, CallerID |
| `QueueCallerAbandon` | Caller hangs up while in queue | Queue name, wait time, position |

---

## Phase 2: Backend Event Processing (Django/Celery)

### 2.1 AMI Listener Receives Event

**File:** `crm_backend/apps/asterisk/ami_client.py`

- A persistent TCP socket connection to Asterisk AMI (port 5038) is maintained
- The `AMIClient` reads incoming AMI events line-by-line
- Events are parsed into structured dictionaries
- Each event is dispatched to Celery for async processing

```
AMI Event (raw TCP stream)
    → AMIClient.parse_event()
    → Celery task: process_ami_event(event_dict)
```

### 2.2 Celery Processes the AMI Event

**File:** `crm_backend/apps/calls/tasks.py`

The `process_ami_event` task:

1. **Identifies event type** (Newchannel, AgentConnect, Hangup, etc.)
2. **Looks up or creates a Call record** in PostgreSQL
3. **Matches caller to existing customer** using fuzzy phone matching (last 9 digits)
4. **Updates call status** based on event type
5. **Triggers notification tasks** to push real-time updates to agents

### 2.3 Call Record Creation

**File:** `crm_backend/apps/calls/models.py`

A `Call` record is created with initial data:

| Field | Value |
|---|---|
| `status` | `"ringing"` |
| `direction` | `"inbound"` |
| `caller_phone` | Extracted from AMI CallerIDNum |
| `customer` | Matched customer or `null` |
| `queue` | Queue name (if applicable) |
| `channel` | Asterisk channel identifier |
| `uniqueid` | Asterisk unique call ID |
| `start_time` | Current timestamp |

### 2.4 Customer Matching Logic

The system attempts to match the incoming phone number to an existing customer:

1. **Exact match** on `phone_number` field
2. **Fuzzy match** on last 9 digits (handles +963, 0, and other prefixes)
3. **Match on alternate phone numbers** (mobile, work, secondary)
4. If no match found → `customer` remains `null` (new caller)

---

## Phase 3: Real-Time Notification (WebSocket)

### 3.1 Notify Incoming Call Task

**File:** `crm_backend/apps/calls/tasks.py`

The `notify_incoming_call` Celery task:

1. Serializes call data + customer data into a payload
2. Sends to Django Channels layer via `channel_layer.group_send()`
3. Targets the appropriate WebSocket group:
   - `"agents"` → All online agents (for queue calls)
   - `"agent_{id}"` → Specific agent (for direct extension calls)

### 3.2 WebSocket Event Payload

```json
{
  "type": "incoming_call",
  "call": {
    "id": "uuid-here",
    "caller_phone": "+963912345678",
    "caller_name": "John Doe",
    "queue": "sales_queue",
    "direction": "inbound",
    "status": "ringing",
    "start_time": "2026-05-02T10:30:00Z"
  },
  "customer": {
    "id": "uuid-here",
    "name": "John Doe",
    "company": "Acme Corp",
    "phone_number": "+963912345678"
  }
}
```

### 3.3 Consumer Group Topology

**File:** `crm_backend/apps/integrations/consumers.py`

| Group | Members | Purpose |
|---|---|---|
| `agents` | All authenticated agents | Broadcast queue calls |
| `agent_{id}` | Single specific agent | Direct/routed calls |
| `supervisors` | All supervisors | Escalations, monitoring |
| `user_{id}` | Single user | Personal notifications |

---

## Phase 4: Frontend Reception (Next.js)

### 4.1 WebSocket Hook Receives Event

**File:** `crm_frontend/src/lib/websocket/useWebSocket.ts`

- The `useWebSocket` hook maintains a persistent WebSocket connection
- Receives the `incoming_call` event
- Deduplicates events (prevents duplicate popups from AMI + Channels)
- Passes event data to the call store

### 4.2 Call Store Updates

**File:** `crm_frontend/src/store/callStore.ts`

The Zustand `callStore` updates its state:

```typescript
callStore.setState({
  incomingCall: {
    call: { ...callData },
    customer: { ...customerData }
  },
  screenPop: { ...customerOrLeadData }
});
```

### 4.3 Incoming Call Popup Appears

**File:** `crm_frontend/src/components/calls/IncomingCallPopup.tsx`

The `IncomingCallPopup` component renders:

- **Caller information**: Name, phone number, company
- **Queue information**: Which queue the call came from
- **Customer context**: Previous calls, open leads, tickets (if matched)
- **Action buttons**:
  - **Answer** → Accepts the call
  - **Reject** → Declines the call

### 4.4 Screen Pop

If a matching customer or lead is found, the system performs a **screen pop**:

- Displays the customer/lead record in a side panel
- Shows recent interaction history
- Allows the agent to review context before answering

---

## Phase 5: Call Answer

### 5.1 Agent Clicks "Answer"

**Frontend actions (parallel):**

1. **SIP Layer** (`crm_frontend/src/lib/sip/sipClient.ts`):
   - Calls `answer()` on the JsSIP session
   - Establishes WebRTC audio stream
   - Plays answer tone, stops ringtone

2. **API Call** (`crm_frontend/src/lib/api/calls.ts`):
   - `POST /api/calls/{id}/mark-answered/`
   - Backend updates call `status` to `"answered"`

3. **Store Update**:
   - `callStore.incomingCall` → `callStore.activeCall`
   - Popup transitions to "active call" mode

### 5.2 If Customer Not Found

When no matching customer exists:

- Agent is prompted to create a new customer record
- Redirect to `/customers/new?phone={caller_phone}`
- Customer creation is encouraged before proceeding

### 5.3 AgentConnect AMI Event

When Asterisk confirms the agent is connected:

1. Asterisk fires `AgentConnect` AMI event
2. Backend receives event via AMI listener
3. Backend updates the call record:
   - Sets `agent` field to the connected agent
   - Updates agent status to `"on_call"`
4. WebSocket broadcast updates all dashboards

---

## Phase 6: Active Call

### 6.1 Call Timer

- A live timer displays in the popup showing call duration
- Updates every second via `setInterval`
- Starts from the moment the call is answered

### 6.2 Call Controls

The agent has access to real-time call controls:

| Control | Action | SIP Method |
|---|---|---|
| **Mute** | Toggle microphone mute | JsSIP `muteAudio()` |
| **Hold** | Place caller on hold | SIP REINVITE with sendonly |
| **Transfer** | Blind or attended transfer | SIP REFER |
| **DTMF** | Send DTMF tones | SIP INFO or RFC2833 |

### 6.3 Additional AMI Events During Active Call

| Event | Meaning |
|---|---|
| `Hold` | Caller or agent placed on hold |
| `Unhold` | Hold released |
| `DTMF` | DTMF digit detected |
| `MonitorStart` | Call recording started |
| `MonitorStop` | Call recording stopped |

### 6.4 Call Recording

If recording is enabled:

- Asterisk starts recording via `MixMonitor`
- Recording file saved to configured path
- `CallRecording` record created linking to the `Call`
- Recording URL accessible in the CRM for playback

---

## Phase 7: Call Termination

### 7.1 Hangup Triggers

A call can end in several ways:

| Scenario | Who Hangs Up | AMI Event |
|---|---|---|
| Agent hangs up | Agent | `Hangup` (agent channel) |
| Caller hangs up | Caller | `Hangup` (caller channel) |
| System disconnect | Asterisk | `Hangup` (both channels) |
| Network failure | Either | Timeout + `Hangup` |

### 7.2 SIP Layer Cleanup

**File:** `crm_frontend/src/lib/sip/sipClient.ts`

- JsSIP session is terminated
- WebRTC peer connection is closed
- Audio streams are stopped
- Ringtone/notification sounds are silenced

### 7.3 Backend Hangup Processing

**File:** `crm_backend/apps/calls/tasks.py`

The `Hangup` AMI event triggers:

1. **Calculate call duration** from start_time to end_time
2. **Determine final status**:

   | Condition | Status |
   |---|---|
   | Call was answered | `"completed"` |
   | Caller hung up before answer | `"no_answer"` |
   | Agent was busy | `"busy"` |
   | System error | `"failed"` |

3. **Update call record** with:
   - `end_time`
   - `duration` (in seconds)
   - `status`
   - `hangup_cause` (from Asterisk)

4. **Update agent status** from `"on_call"` to `"available"`

### 7.4 Notify Call Ended

**File:** `crm_backend/apps/calls/tasks.py`

The `notify_call_ended` task:

1. Sends WebSocket event `call_ended` to relevant agents/supervisors
2. Includes final call data (duration, status, disposition_required flag)
3. Frontend removes the active call from the popup

---

## Phase 8: Post-Call Disposition

### 8.1 Disposition Modal Auto-Opens

**File:** `crm_frontend/src/components/calls/DispositionModal.tsx`

After every answered call, the disposition modal appears automatically:

- **Agent cannot skip** this step (call enforcement)
- Displays available dispositions for the agent's team/campaign
- Requires a **note** (minimum 10 characters)
- Shows disposition actions that will be triggered

### 8.2 Disposition Selection

**File:** `crm_backend/apps/calls/models.py`

Each `Disposition` has:

| Field | Description |
|---|---|
| `name` | Display name (e.g., "Interested", "Not Interested") |
| `code` | Machine-readable code |
| `color` | UI color for the disposition |
| `is_final` | Whether this closes the interaction |
| `actions` | List of `DispositionAction` objects |

### 8.3 Disposition Actions

**File:** `crm_backend/apps/calls/models.py`

Each `DispositionAction` defines an automated post-call action:

| Action Type | Description |
|---|---|
| `no_action` | Record only, no automation |
| `create_followup` | Schedule a follow-up reminder |
| `create_lead` | Create a new lead from the customer |
| `create_ticket` | Create a support ticket |
| `change_lead_stage` | Move an existing lead to a new stage |
| `mark_won` | Mark a lead as won (requires amount) |
| `escalate` | Alert supervisors via WebSocket |

### 8.4 Follow-Up Scheduling

If `create_followup` action is configured:

- Agent selects a follow-up date/time
- Optional: follow-up notes
- `Followup` record created in PostgreSQL
- Celery Beat checks for due follow-ups periodically
- WebSocket reminder sent when follow-up is due

---

## Phase 9: Call Completion Service

### 8.5 Backend Processes Disposition

**File:** `crm_backend/apps/calls/services.py`

The `complete_call()` service:

1. **Validates** the disposition and note
2. **Creates a `CallCompletion` record** linking call + disposition + agent + note
3. **Executes each `DispositionAction`** dynamically:

```python
for action in disposition.actions.all():
    if action.action_type == "create_followup":
        Followup.objects.create(...)
    elif action.action_type == "create_lead":
        Lead.objects.create(customer=call.customer, ...)
    elif action.action_type == "create_ticket":
        Ticket.objects.create(customer=call.customer, ...)
    elif action.action_type == "change_lead_stage":
        lead.stage = action.target_stage
        lead.save()
    elif action.action_type == "mark_won":
        lead.status = "won"
        lead.won_amount = amount
        lead.save()
    elif action.action_type == "escalate":
        channel_layer.group_send("supervisors", {...})
```

4. **Creates a `CallEvent`** for audit trail:
   - Event type: `"completed"`
   - Includes disposition code, note, actions taken

### 8.6 Call Enforcement

The system enforces call completion:

- Agent **cannot receive new calls** until disposition is submitted
- Agent status remains `"wrap_up"` during disposition
- If agent goes idle without disposition, supervisor is notified
- QA team can review incomplete dispositions

---

## Phase 10: Post-Call State

### 10.1 Call Record Final State

After completion, the `Call` record contains:

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `direction` | `"inbound"` |
| `status` | `"completed"` |
| `caller_phone` | Caller's phone number |
| `customer` | FK to matched customer (or null) |
| `agent` | FK to assigned agent |
| `queue` | Queue name |
| `start_time` | When call started |
| `end_time` | When call ended |
| `duration` | Duration in seconds |
| `disposition` | FK to selected disposition (via CallCompletion) |
| `recording_url` | URL to call recording (if available) |
| `hangup_cause` | Asterisk hangup cause code |

### 10.2 Related Records Created

Depending on disposition actions, these records may exist:

| Record | Created When |
|---|---|
| `CallCompletion` | Always (on disposition submission) |
| `CallEvent` | Always (audit trail) |
| `Followup` | If `create_followup` action |
| `Lead` | If `create_lead` action |
| `Ticket` | If `create_ticket` action |
| `Note` | If agent added notes to entities |

### 10.3 Agent Status Reset

After disposition is submitted:

- Agent status changes from `"wrap_up"` to `"available"`
- Agent is eligible to receive new calls
- Dashboard updates to reflect availability

---

## Sequence Diagram

```
Caller          PBX/Asterisk        AMI Listener        Celery            Django DB        WebSocket         Frontend
  │                  │                    │                │                  │                │                 │
  │───Dial──────────>│                    │                │                  │                │                 │
  │                  │──Newchannel───────>│                │                  │                │                 │
  │                  │                    │──dispatch─────>│                  │                │                 │
  │                  │                    │                │──Create Call────>│                │                 │
  │                  │                    │                │──Lookup Customer>│                │                 │
  │                  │                    │                │                  │                │                 │
  │                  │                    │                │──notify_call───>│                │                 │
  │                  │                    │                │                  │──WS event──────>│                 │
  │                  │                    │                │                  │                │──Show Popup────│
  │                  │                    │                │                  │                │                 │
  │<──Ring───────────│                    │                │                  │                │                 │
  │                  │                    │                │                  │                │  [Agent clicks] │
  │                  │                    │                │                  │                │   Answer        │
  │                  │<───────────────────│                │                  │                │──markAnswered─>│
  │──Answered───────>│                    │                │                  │                │                 │
  │                  │──AgentConnect─────>│                │                  │                │                 │
  │                  │                    │──dispatch─────>│──Assign Agent───>│                │                 │
  │                  │                    │                │──Update Status──>│                │                 │
  │                  │                    │                │                  │──WS event──────>│──Active Call───│
  │                  │                    │                │                  │                │                 │
  │──[Conversation]──│                    │                │                  │                │                 │
  │                  │                    │                │                  │                │                 │
  │──Hangup─────────>│                    │                │                  │                │                 │
  │                  │──Hangup───────────>│                │                  │                │                 │
  │                  │                    │──dispatch─────>│──Update Call────>│                │                 │
  │                  │                    │                │──notify_ended──>│                │                 │
  │                  │                    │                │                  │──WS event──────>│──Hide Popup────│
  │                  │                    │                │                  │                │                 │
  │                  │                    │                │                  │                │──Show Dispo────│
  │                  │                    │                │                  │                │  [Agent submits]│
  │                  │                    │                │                  │                │──completeCall─>│
  │                  │                    │                │──Execute Actions>│                │                 │
  │                  │                    │                │                  │<───────────────│                 │
  │                  │                    │                │                  │──Agent available│                 │
```

---

## Error Handling

### AMI Connection Loss

- AMI client auto-reconnects with exponential backoff
- Missed events are recovered via CDR (Call Detail Records) polling
- CDR sync runs periodically to catch any gaps

### WebSocket Disconnection

- Frontend auto-reconnects with exponential backoff
- Missed events are reconciled on reconnect via API polling
- Call state is fetched fresh on reconnection

### Database Errors

- Celery tasks retry with exponential backoff
- Failed calls are logged and can be manually reconciled
- Idempotent operations prevent duplicate records

### SIP/WebRTC Failures

- JsSIP handles reconnection to SIP server
- Failed calls are still tracked via AMI events
- Agent can manually log calls if SIP fails

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| PBX | Issabel/Asterisk | Telephony server, AMI events |
| AMI Client | `crm_backend/apps/asterisk/ami_client.py` | Persistent TCP connection, event parsing |
| AMI Tasks | `crm_backend/apps/asterisk/tasks.py` | Long-running listener task |
| Call Models | `crm_backend/apps/calls/models.py` | Call, CallCompletion, Disposition, CallEvent |
| Call Services | `crm_backend/apps/calls/services.py` | `complete_call()` enforcement logic |
| Call Views | `crm_backend/apps/calls/views.py` | API endpoints for call operations |
| Call Tasks | `crm_backend/apps/calls/tasks.py` | notify_incoming_call, notify_call_ended |
| WebSocket | `crm_backend/apps/integrations/consumers.py` | Real-time event broadcasting |
| SIP Client | `crm_frontend/src/lib/sip/sipClient.ts` | JsSIP wrapper for WebRTC |
| Call Store | `crm_frontend/src/store/callStore.ts` | Call state management |
| Incoming Popup | `crm_frontend/src/components/calls/IncomingCallPopup.tsx` | Answer/reject UI |
| Disposition Modal | `crm_frontend/src/components/calls/DispositionModal.tsx` | Post-call disposition UI |
| WebSocket Hook | `crm_frontend/src/lib/websocket/useWebSocket.ts` | WS connection management |
