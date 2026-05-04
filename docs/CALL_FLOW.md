# Call Flow — Incoming Call to Agent Hangup

## Overview

This document traces a complete inbound call from the moment it hits the Asterisk PBX through to the agent hanging up and filling the call disposition.

---

## Phase 1: Asterisk — Call Enters Queue 901

```
PSTN Caller → Trunk → DID → Queue(901) → Ring Agent 300
```

Asterisk generates these AMI events (sent over TCP port 5038):

| # | AMI Event | Key Fields | Meaning |
|---|-----------|------------|---------|
| 1 | `Newchannel` | `CallerIDNum`, `Exten`, `Context` | Caller hits the trunk/DID |
| 2 | `QueueCallerJoin` | `Queue: 901`, `CallerIDNum`, `Uniqueid` | Caller enters queue 901 |
| 3 | `AgentCalled` | `MemberName: 300`, `Linkedid` | Queue rings extension 300 |
| 4 | `AgentConnect` | `MemberName: 300`, `Linkedid` | Agent 300 answers |
| 5 | `Bridge` | `Uniqueid1`, `Uniqueid2` | Caller and agent bridged |
| 6 | `Hangup` | `Uniqueid`, `Cause`, `Duration` | Call ends |

---

## Phase 2: Backend — AMI Listener Receives Events

### 2a. AMI Listener Thread (starts at Django boot)

**File:** `crm_backend/apps/asterisk/apps.py:28-35`

```python
def _start_ami_thread(self):
    from apps.asterisk.ami_client import AMIClient
    client = AMIClient()
    t = threading.Thread(target=client.run, daemon=True, name='ami-listener')
    t.start()
```

### 2b. Persistent TCP Socket — Reads AMI Events

**File:** `crm_backend/apps/asterisk/ami_client.py:88-131`

```python
def run(self):
    while self._running:
        chunk = self.sock.recv(BUFFER_SIZE)     # blocking read
        buffer += chunk
        while '\r\n\r\n' in buffer:
            block, buffer = buffer.split('\r\n\r\n', 1)
            event = self._parse_event(block)
            if event.get('Event'):
                self._dispatch(event)
```

### 2c. Dispatch — Filters Relevant Events → Celery

**File:** `crm_backend/apps/asterisk/ami_client.py:138-170`

```python
@staticmethod
def _dispatch(event: dict):
    relevant = {
        'Newchannel', 'Bridge', 'Hangup', 'SoftHangupRequest', 'Dial',
        'QueueCallerJoin', 'QueueCallerLeave',
        'QueueMemberAdded', 'QueueMemberRemoved', 'QueueMemberPaused',
        'QueueMemberStatus', 'AgentLogin', 'AgentLogoff',
        'AgentCalled', 'AgentConnect', 'AgentComplete', 'AgentRinghangup',
    }
    name = event.get('Event', '')
    if name in relevant:
        from apps.calls.tasks import process_ami_event
        process_ami_event.apply(args=[event])
```

### 2d. Celery Task — Central Event Processor

**File:** `crm_backend/apps/calls/tasks.py:154-497`

#### Event: `QueueCallerJoin` — Caller enters queue

```python
# tasks.py:276-303
elif event_name == 'QueueCallerJoin':
    caller = event.get('CallerIDNum', '')
    queue  = event.get('Queue', '')          # "901"
    lead = _get_or_create_lead(caller)       # auto-create Lead if not found
    call, created = Call.objects.update_or_create(
        uniqueid=uniqueid,
        defaults={
            'caller': caller, 'callee': queue, 'direction': 'inbound',
            'status': 'ringing', 'queue': queue, 'lead': lead,
            'started_at': timezone.now(),
        }
    )
    if created:
        _create_call_activity(call, status='in_progress')
    notify_incoming_call.delay(str(call.id))  # ← triggers WebSocket push
    handle_vip_call.delay(str(call.id))       # VIP alert if applicable
```

#### Event: `AgentCalled` — Queue selects agent 300

```python
# tasks.py:434-448
elif event_name == 'AgentCalled':
    member_name = event.get('MemberName', '')  # "300"
    linkedid    = event.get('Linkedid', '')
    ext_obj = Extension.objects.get(number=member_name, is_active=True)
    agent = ext_obj.user
    Call.objects.filter(uniqueid=linkedid, agent__isnull=True).update(agent=agent)
```

#### Event: `AgentConnect` — Agent answers

```python
# tasks.py:450-478
elif event_name == 'AgentConnect':
    member_name = event.get('MemberName', '')  # "300"
    linkedid    = event.get('Linkedid', '')
    ext_obj = Extension.objects.get(number=member_name, is_active=True)
    agent = ext_obj.user
    Call.objects.filter(uniqueid=linkedid).update(
        agent=agent, status='answered', started_at=timezone.now(),
    )
    call_obj = Call.objects.filter(uniqueid=linkedid).select_related('lead').first()
    if call_obj:
        _assign_lead_to_agent(call_obj, agent)  # auto-assign lead
    update_user_status(str(agent.id), 'on_call')  # agent status → on_call
```

#### Event: `Hangup` — Call ends

```python
# tasks.py:317-385
elif event_name in ('Hangup', 'SoftHangupRequest'):
    cause = str(event.get('Cause', '16'))
    cause_status_map = {'17': 'busy', '19': 'no_answer', '21': 'failed', ...}
    Call.objects.filter(uniqueid=uniqueid, is_completed=False).update(
        status=status, ended_at=now, duration=duration,
    )
    notify_call_ended.delay(str(call.id), status)  # ← WebSocket push
    if status == 'no_answer':
        handle_missed_call.delay(str(call.id))     # auto-create callback
```

---

## Phase 3: Backend → Frontend — WebSocket Notification

### 3a. `notify_incoming_call` Celery Task

**File:** `crm_backend/apps/calls/tasks.py:11-100`

```python
@shared_task(bind=True, max_retries=3)
def notify_incoming_call(self, call_id: str):
    call = Call.objects.select_related('agent', 'lead').get(pk=call_id)
    lead = call.lead
    payload = {
        'type': 'incoming_call',
        'call_id': str(call.id),
        'uniqueid': call.uniqueid,
        'caller': call.caller,
        'queue': call.queue or '',
        'lead_id': str(lead.id),
        'lead_name': lead.get_full_name(),
        'lead_phone': lead.phone,
        'lead_stage': lead.stage.name,
        'lead_company': lead.company,
    }
    channel_layer = get_channel_layer()
    groups = ['supervisors']
    if call.agent_id:
        groups.append(f'agent_{call.agent_id}')
    else:
        groups.append('agents')  # queue call — notify ALL agents
    for group in groups:
        await channel_layer.group_send(group, {
            'type': 'call_event',
            'payload': payload,
        })
```

### 3b. Django Channels WebSocket Consumer

**File:** `crm_backend/apps/integrations/consumers.py:8-102`

```python
class CallEventConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.personal_group = f'agent_{self.user.id}'
        await self.channel_layer.group_add(self.personal_group, self.channel_name)
        await self.channel_layer.group_add('agents', self.channel_name)
        if self.user.role in ('admin', 'supervisor'):
            await self.channel_layer.group_add('supervisors', self.channel_name)
        await self.accept()

    async def call_event(self, event):
        await self.send(text_data=json.dumps(event.get('payload', {})))
```

**WebSocket URL:** `ws://<host>/ws/calls/?token=<jwt>`

---

## Phase 4: Frontend — React Receives and Displays

### 4a. WebSocket Hook

**File:** `crm_frontend/src/lib/websocket/useWebSocket.ts:37-53`

```typescript
const ws = new WebSocket(`${WS_URL}/ws/calls/?token=${token}`);
ws.onmessage = (e) => {
    const data = JSON.parse(e.data) as WSEvent;
    onEventRef.current(data);  // → callback in layout.tsx
};
```

### 4b. Dashboard Layout Handles `incoming_call` Event

**File:** `crm_frontend/src/app/(dashboard)/layout.tsx:94-105`

```typescript
useWebSocket((event: WSEvent) => {
    if (event.type === 'incoming_call') {
        const { user: currentUser } = useAuthStore.getState();
        const hasExtension = !!(currentUser as any)?.extension;
        const isAgent = currentUser?.role === 'agent';
        if (!isAgent || !hasExtension) return;

        setIncomingCall(event as any);
        setRingKey(k => k + 1);
    }
});
```

### 4c. Zustand Store

**File:** `crm_frontend/src/store/callStore.ts:28-33`

```typescript
setIncomingCall: (call) => set({ incomingCall: call, screenPopOpen: !!call }),
clearIncoming:   () => set({ incomingCall: null, screenPopOpen: false }),
```

### 4d. IncomingCallPopup Renders

**File:** `crm_frontend/src/components/calls/IncomingCallPopup.tsx:150-155`

```typescript
useEffect(() => {
    if (incomingCall && agentStatus !== 'away') {
        setVisible(true);
    }
}, [incomingCall, agentStatus]);
```

Popup shows:
- Lead name, phone, stage, company, queue number
- **Green Answer button**
- **Red Reject button**

---

## Phase 5: Agent Clicks "Answer"

### 5a. handleAnswer in IncomingCallPopup

**File:** `crm_frontend/src/components/calls/IncomingCallPopup.tsx:101-133`

```typescript
const handleAnswer = useCallback(() => {
    // 1. Mark as answered in DB
    callsApi.markCallAnswered(callId)
        .then(() => console.log('[Answer] markCallAnswered OK'));

    // 2. Answer the SIP/WebRTC session
    actions.answer();  // → SipClient.answer()

    // 3. Screen-pop: navigate to lead page or new lead form
    if (call?.lead_id) {
        router.push(`/leads/${call.lead_id}`);
    } else {
        router.push(`/leads/new?phone=${phone}&uniqueid=${uniqueid}`);
    }
}, [actions]);
```

### 5b. SipClient.answer() — Sends SIP 200 OK

**File:** `crm_frontend/src/lib/sip/sipClient.ts:366-391`

```typescript
answer() {
    this.session.answer({
        mediaConstraints: { audio: true, video: false },
    });
    // Sends SIP 200 OK with SDP answer to Asterisk
}
```

### 5c. Session Events After Answer

**File:** `crm_frontend/src/lib/sip/sipClient.ts:241-256`

```typescript
session.on('accepted', () => {
    this._stopRinging();
    setTimeout(() => {
        this.onCallStatusChange('active');
        setTimeout(() => this._reattachStream(session), 300);
    }, 300);
});
```

### 5d. Status Propagates → UI Updates

```
SipClient → callback → useSip.ts → setCallStatus('active') → useSipStore → UI shows active call
```

---

## Phase 6: Agent Clicks "Hangup"

### 6a. SipClient.hangup() — Sends SIP BYE

**File:** `crm_frontend/src/lib/sip/sipClient.ts:393-446`

```typescript
hangup() {
    this._stopRinging();
    sess.terminate();  // sends SIP BYE to Asterisk
    sess.once('ended', () => {
        this.session = null;
        this.onCallStatusChange('idle');
    });
}
```

### 6b. Status Goes Idle → DispositionModal Appears

**File:** `crm_frontend/src/app/(dashboard)/layout.tsx:51-91`

```typescript
useEffect(() => {
    const wasInCall = prevCallStatus.current === 'active' || ...;
    if (wasInCall && callStatus === 'idle') {
        callsApi.pendingCompletions().then(res => {
            if (pending.length > 0) {
                setDispModal({ callId: latest.id, ... });
            }
        });
    }
}, [callStatus]);
```

### 6c. Agent Fills Disposition

**File:** `crm_backend/apps/calls/services.py:6-250`

```python
def complete_call(call_id, agent, data):
    completion = CallCompletion.objects.create(
        call=call,
        disposition=disposition,
        note=note,
        next_action=next_action,
    )
    call.is_completed = True
    call.completed_at = timezone.now()
    call.save()
    # Executes disposition actions:
    # - create_followup
    # - create_ticket
    # - change_lead_stage
```

---

## Phase 7: Call Record Timeline

| Event | When | Where |
|-------|------|-------|
| **Call created** | `QueueCallerJoin` AMI event | `tasks.py:282-293` |
| **Lead auto-created** | If phone not found | `tasks.py:184-201` |
| **Agent assigned** | `AgentCalled` AMI event | `tasks.py:443` |
| **Status → answered** | `AgentConnect` AMI event | `tasks.py:460-463` |
| **Status → ended** | `Hangup` AMI event | `tasks.py:356-363` |
| **Activity created** | On call creation | `tasks.py:203-215` |
| **Activity completed** | On hangup | `tasks.py:369-377` |

---

## Complete Flow Diagram

```
┌──────────────┐     AMI Events      ┌──────────────────┐     Celery Task      ┌─────────────────┐
│              │  QueueCallerJoin    │                  │  process_ami_event  │                 │
│   PSTN       │────────────────────▶│  AMI Listener    │────────────────────▶│  Django DB      │
│   Caller     │  AgentCalled        │  (ami_client.py) │                     │  (Call model)   │
│              │  AgentConnect       │                  │                     │                 │
│              │  Hangup             │                  │                     │                 │
└──────────────┘                     └──────────────────┘                     └────────┬────────┘
                                                                                      │
                                                                                      │ notify_incoming_call
                                                                                      ▼
                                                                          ┌───────────────────────┐
                                                                          │  Channels Layer       │
                                                                          │  group_send()         │
                                                                          │  → agent_300 group    │
                                                                          │  → supervisors group  │
                                                                          └──────────┬────────────┘
                                                                                     │ WebSocket
                                                                                     ▼
                                                                          ┌───────────────────────┐
                                                                          │  CallEventConsumer    │
                                                                          │  (consumers.py)       │
                                                                          └──────────┬────────────┘
                                                                                     │ ws://host/ws/calls/
                                                                                     ▼
┌──────────────────────────────────────────────────────────────────────┐  ┌────────────────────┐
│  React Frontend (Browser — Extension 300)                            │  │                    │
│                                                                      │  │  Asterisk          │
│  useWebSocket.ts  ←────────── WSEvent {type:'incoming_call'}         │  │  (WebRTC/SIP)      │
│       │                                                              │  │                    │
│       ▼                                                              │  │  SIP INVITE        │
│  layout.tsx: setIncomingCall(event)                                  │  │  ←──────────────── │
│       │                                                              │  │  (via JsSIP WS)    │
│       ▼                                                              │  │                    │
│  callStore.ts (Zustand)                                              │  │  200 OK (answer)   │
│       │                                                              │  │  ────────────────▶ │
│       ▼                                                              │  │                    │
│  IncomingCallPopup.tsx  →  shows popup with lead info               │  │  RTP Media         │
│       │                                                              │  │  ◄──────────────► │
│       │  [Agent clicks Answer]                                       │  │                    │
│       ▼                                                              │  │  SIP BYE (hangup)  │
│  sipClient.ts: session.answer()  →  SIP 200 OK                       │  │  ────────────────▶ │
│       │                                                              │  │                    │
│       ▼                                                              │  └────────────────────┘
│  callsApi.markCallAnswered(callId)  →  PATCH /api/calls/...
│       │
│       ▼
│  callStatus → 'active'  →  screen-pop to /leads/{id}
│
│  [Agent clicks Hangup]
│       │
│       ▼
│  sipClient.ts: session.terminate()  →  SIP BYE
│  callStatus → 'idle'
│       │
│       ▼
│  layout.tsx: fetch pendingCompletions()  →  show DispositionModal
│       │
│       ▼
│  Agent fills disposition + note  →  POST /api/calls/complete/{id}/
│       │
│       ▼
│  CallCompletion created, Call.is_completed = true
└──────────────────────────────────────────────────────────────────────┘
```
