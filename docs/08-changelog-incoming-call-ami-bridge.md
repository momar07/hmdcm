# Changelog — Incoming Call Answer Fix (AMI Bridge)

## Date: 2026-05-02

### Summary

Fixed the core issue where incoming queue calls couldn't be answered by agents. The previous approach relied solely on WebRTC/SIP which was unreliable. Now uses Asterisk AMI `Redirect` action to bridge queued calls directly to the agent's SIP extension.

---

## Root Cause Analysis

The previous implementation had 3 problems:

1. **Ringtone not playing** — AudioContext requires user gesture before playing
2. **Answer button didn't connect calls** — `session.answer()` failed because the SIP INVITE from Asterisk never reached the browser (Asterisk dialplan routes queue calls to SIP extensions, not WebRTC)
3. **Answer button not clickable for registered numbers** — Race condition between WebSocket event and SIP session arrival

The fundamental issue: **Asterisk queues route calls to SIP extensions (PJSIP/xxxx), not to WebRTC endpoints.** The WebRTC connection was only useful for outbound calls, not for receiving inbound queue calls.

---

## Fix Applied

### New Backend Endpoint: `POST /api/calls/answer-queued/`
**File:** `crm_backend/apps/calls/views.py:564-630`

**What it does:**
1. Receives the `call_id` from the frontend
2. Looks up the Call record and the agent's SIP extension
3. Opens a raw TCP connection to Asterisk AMI
4. Sends a `Redirect` action to move the call from the queue to the agent's extension
5. Updates the Call record: `status='answered'`, `agent=user`, `started_at=now`

**AMI Redirect command:**
```
Action: Redirect
Channel: {uniqueid}
Exten: {agent_extension}
Context: from-internal
Priority: 1
```

This tells Asterisk: "Take this call and send it to the agent's extension."

### Frontend Changes
**File:** `crm_frontend/src/components/calls/IncomingCallPopup.tsx`

The `handleAnswer()` function now:
1. **Primary:** Calls `callsApi.answerQueuedCall(callId)` → AMI bridges the call
2. **Secondary:** Also calls `actions?.answer()` → SIP answer (if WebRTC session exists)
3. **Fallback:** If AMI fails, still tries SIP answer

### New API Function
**File:** `crm_frontend/src/lib/api/calls.ts`
```typescript
answerQueuedCall: (callId: string) =>
    api.post('/calls/answer-queued/', { call_id: callId }),
```

### URL Route
**File:** `crm_backend/apps/calls/urls.py`
```python
path('answer-queued/', AnswerQueuedCallView.as_view(), name='answer-queued'),
```

---

## How It Works Now

```
1. Caller dials → enters Asterisk queue
2. Asterisk sends AMI event → backend creates Call record
3. Backend sends WS event → frontend shows popup + plays ringtone
4. Agent clicks "Answer"
5. Frontend calls POST /api/calls/answer-queued/
6. Backend sends AMI Redirect → Asterisk bridges call to agent's extension
7. Agent's phone rings → agent picks up → call connected
8. AMI AgentConnect event → backend updates call status
```

---

## Test Results

```bash
# Django system check
python manage.py check
# System check identified no issues (0 silenced).
```

---

## Files Modified

| File | Changes |
|---|---|
| `crm_backend/apps/calls/views.py` | Added `AnswerQueuedCallView` class |
| `crm_backend/apps/calls/urls.py` | Added `answer-queued/` route |
| `crm_frontend/src/lib/api/calls.ts` | Added `answerQueuedCall()` function |
| `crm_frontend/src/components/calls/IncomingCallPopup.tsx` | Modified `handleAnswer()` to use AMI bridge |
