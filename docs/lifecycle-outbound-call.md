# Outbound Call Lifecycle

## Overview

This document describes the complete lifecycle of an outbound call initiated by an agent through the HMDM CRM softphone system.

---

## Phase 1: Call Initiation

### 1.1 Initiation Methods

Agents can initiate outbound calls through:

| Method | Location | Description |
|---|---|---|
| **SoftPhone Dialpad** | SoftPhone component | Manual number entry in the dialpad |
| **Click-to-Call** | Customer detail page | "Call Now" button on customer record |
| **Click-to-Call** | Lead detail page | "Call Now" button on lead record |
| **Campaign Dialer** | Campaign list page | Call from campaign contact list |
| **Follow-up Call** | Follow-up reminder | Click reminder to call back |

### 1.2 SoftPhone Dialpad

**File:** `crm_frontend/src/components/softphone/SoftPhone.tsx`

Agent enters a phone number and presses the call button:

1. Frontend fires a custom event: `sip:dial`
2. Event payload includes the phone number
3. SoftPhone component catches the event
4. Calls `startWebrtcCall()` API

### 1.3 Click-to-Call

From a customer or lead detail page:

1. Agent clicks "Call Now" button
2. Phone number is pre-populated from the record
3. Same `sip:dial` event is fired
4. Call is pre-linked to the customer/lead

---

## Phase 2: Backend Call Record Creation

### 2.1 Start WebRTC Call API

**File:** `crm_backend/apps/calls/views.py`

**API:** `POST /api/calls/start-webrtc-call/`

Request payload:

```json
{
  "phone_number": "+963912345678",
  "customer_id": "uuid-optional",
  "lead_id": "uuid-optional",
  "campaign_id": "uuid-optional"
}
```

The view:

1. **Creates a Call record** immediately:

   | Field | Value |
   |---|---|
   | `direction` | `"outbound"` |
   | `status` | `"dialing"` |
   | `callee_phone` | The dialed number |
   | `customer` | Matched customer (if provided) |
   | `lead` | Associated lead (if provided) |
   | `agent` | The calling agent |
   | `start_time` | Current timestamp |

2. **Returns call data** to the frontend:

```json
{
  "call_id": "uuid-here",
  "status": "dialing",
  "customer": { ... },
  "lead": { ... }
}
```

### 2.2 Customer Lookup (Outbound)

For outbound calls, the system also attempts to match the dialed number:

1. If `customer_id` is provided → use it directly
2. If not provided → fuzzy match on last 9 digits
3. If matched → return customer data for screen pop
4. If not matched → call proceeds without customer link

---

## Phase 3: SIP/WebRTC Call Setup

### 3.1 JsSIP Initiates Call

**File:** `crm_frontend/src/lib/sip/sipClient.ts`

After the API returns successfully:

1. JsSIP `call()` method is invoked with the phone number
2. SIP INVITE is sent to Asterisk via WebSocket
3. Asterisk uses the agent's extension as the calling party
4. **Two-stage dialing**: Agent's extension rings first, then Asterisk dials the destination

### 3.2 Asterisk Call Flow

```
Agent Extension          Asterisk          Destination
      │                     │                  │
      │<──Ring──────────────│                  │
      │──Answer────────────>│                  │
      │                     │──Dial───────────>│
      │                     │                  │
      │                     │<──Answer─────────│
      │                     │                  │
      │<──[Audio Bridge]───>│<──[Audio Bridge]─│
```

### 3.3 Call State Updates

As the call progresses, the frontend updates the UI:

| SIP Event | UI State |
|---|---|
| `progress` | "Ringing..." |
| `accepted` | "Connected" + timer starts |
| `failed` | "Call Failed" + error message |
| `ended` | Call ended + disposition modal |

---

## Phase 4: Active Outbound Call

### 4.1 Call Timer

- Timer starts when the call is accepted (answered by destination)
- Displays in the SoftPhone component
- Updates every second

### 4.2 Call Controls

Same controls as inbound calls:

| Control | Action |
|---|---|
| **Mute** | Toggle microphone |
| **Hold** | Place destination on hold |
| **Transfer** | Transfer to another extension/number |
| **DTMF** | Send DTMF tones (for IVR navigation) |

### 4.3 AMI Events for Outbound Calls

| Event | Meaning |
|---|---|
| `Newchannel` | Outbound channel created |
| `Dial` | Asterisk dialing the destination |
| `DialBegin` | Destination ringing |
| `DialEnd` | Destination answered or failed |
| `AgentConnect` | Agent connected to destination |
| `Hangup` | Call ended |

### 4.4 Backend AMI Processing

AMI events flow through the same pipeline as inbound calls:

1. AMI listener receives events
2. Celery task processes them
3. Call record is updated with real-time status
4. WebSocket events keep frontend in sync

---

## Phase 5: Call Termination

### 5.1 Hangup

Agent or destination can end the call:

1. Agent clicks hangup in SoftPhone
2. JsSIP sends SIP BYE
3. Asterisk fires `Hangup` AMI event
4. Backend processes hangup (same as inbound)

### 5.2 End WebRTC Call API

**File:** `crm_backend/apps/calls/views.py`

**API:** `PATCH /api/calls/{id}/end-webrtc-call/`

The frontend calls this API after hangup:

1. Updates call `status` based on outcome
2. Calculates `duration`
3. Sets `end_time`
4. Returns final call data

### 5.3 Final Status Determination

| Condition | Status |
|---|---|
| Destination answered | `"completed"` |
| No answer / busy | `"no_answer"` |
| Invalid number | `"failed"` |
| Agent hung up before answer | `"cancelled"` |

---

## Phase 6: Post-Call Disposition

### 6.1 Disposition Modal

Same as inbound calls — the disposition modal opens automatically after every answered outbound call:

- Agent selects disposition
- Writes a note (minimum 10 characters)
- Disposition actions are executed

### 6.2 Outbound-Specific Dispositions

Common outbound dispositions:

| Disposition | Typical Actions |
|---|---|
| `Reached - Interested` | create_lead, create_followup |
| `Reached - Not Interested` | no_action |
| `Reached - Callback` | create_followup |
| `No Answer` | create_followup (retry) |
| `Wrong Number` | update_customer_phone |
| `Gatekeeper` | create_followup (try again) |
| `Voicemail` | create_followup (try again) |

### 6.3 Call Completion

The same `complete_call()` service processes outbound call dispositions:

**File:** `crm_backend/apps/calls/services.py`

All disposition actions work identically for outbound calls:
- Create follow-ups
- Create leads
- Create tickets
- Change lead stages
- Mark leads as won
- Escalate to supervisors

---

## Phase 7: Campaign Dialing

### 7.1 Campaign Call Lists

**File:** `crm_backend/apps/campaigns/`

Campaigns have associated call lists:

| Field | Description |
|---|---|
| `campaign` | FK to the campaign |
| `contact` | Contact information |
| `customer` | FK to matched customer (if exists) |
| `status` | Pending, Called, Reached, Unreachable |
| `call_result` | Result of the call attempt |
| `attempts` | Number of call attempts |
| `last_called_at` | Last call timestamp |

### 7.2 Progressive Dialing

For outbound campaigns:

1. Agent clicks "Start Campaign"
2. System fetches next pending contact
3. Auto-dials the contact
4. If reached → disposition flow
5. If not reached → mark and move to next
6. Campaign progress tracked in real-time

### 7.3 VICIdial Integration

**File:** `crm_backend/config/settings.py`

The system integrates with VICIdial for advanced dialing:

- Predictive dialing
- Power dialing
- Preview dialing
- Campaign statistics

VICIdial API calls are made from the backend to:
- Start/stop campaigns
- Get agent campaign status
- Fetch next contact for preview

---

## Sequence Diagram

```
Agent           Frontend            Backend API         SIP/Asterisk        Database        WebSocket
  │                 │                    │                  │                  │                │
  │──Dial number───>│                    │                  │                  │                │
  │                 │──POST start-call──>│                  │                  │                │
  │                 │                    │──Create Call────>│                  │                │
  │                 │                    │  (status=dialing)│                  │                │
  │                 │<──200 OK───────────│                  │                  │                │
  │                 │  (call_id)         │                  │                  │                │
  │                 │                    │                  │                  │                │
  │                 │──JsSIP call()─────>│                  │                  │                │
  │                 │                    │──SIP INVITE─────>│                  │                │
  │                 │                    │                  │──Ring agent──────│                │
  │                 │<───────────────────│                  │                  │                │
  │──Answer────────>│                    │                  │                  │                │
  │                 │                    │                  │──Dial dest──────>│                │
  │                 │                    │                  │                  │                │
  │                 │                    │                  │<──Answer─────────│                │
  │                 │                    │──AMI events─────>│                  │                │
  │                 │                    │                  │──Update Call────>│                │
  │                 │                    │                  │                  │──WS event─────>│
  │                 │<──[Active Call]────│                  │                  │                │
  │                 │                    │                  │                  │                │
  │──[Conversation]─│                    │                  │                  │                │
  │                 │                    │                  │                  │                │
  │──Hangup────────>│                    │                  │                  │                │
  │                 │                    │                  │──Hangup─────────>│                │
  │                 │                    │──AMI Hangup─────>│                  │                │
  │                 │                    │                  │──Update Call────>│                │
  │                 │                    │                  │                  │──WS event─────>│
  │                 │                    │                  │                  │                │
  │                 │──Show Disposition──│                  │                  │                │
  │──Submit────────>│                    │                  │                  │                │
  │                 │──POST complete────>│                  │                  │                │
  │                 │                    │──Execute Actions>│                  │                │
  │                 │<──200 OK───────────│                  │                  │                │
```

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| SoftPhone | `crm_frontend/src/components/softphone/SoftPhone.tsx` | Dialpad and call controls |
| SIP Client | `crm_frontend/src/lib/sip/sipClient.ts` | JsSIP wrapper for WebRTC |
| Call Views | `crm_backend/apps/calls/views.py` | StartWebrtcCallView, EndWebrtcCallView |
| Call Services | `crm_backend/apps/calls/services.py` | complete_call() for disposition |
| Call Models | `crm_backend/apps/calls/models.py` | Call, CallCompletion, Disposition |
| AMI Client | `crm_backend/apps/asterisk/ami_client.py` | AMI event listener |
| Campaign Models | `crm_backend/apps/campaigns/models.py` | Campaign, CampaignList |
| Call Store | `crm_frontend/src/store/callStore.ts` | Call state management |
| Disposition Modal | `crm_frontend/src/components/calls/DispositionModal.tsx` | Post-call disposition UI |
