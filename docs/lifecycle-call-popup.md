# Incoming Call Popup Lifecycle

## Overview

This document describes the complete lifecycle of the Incoming Call Popup component in the HMDM CRM frontend. The popup is the primary interface agents use to interact with incoming calls — answering, rejecting, managing active calls, and transferring.

---

## Phase 1: Component Mount & Audio Preparation

### 1.1 Component Registration

**File:** `crm_frontend/src/app/(dashboard)/layout.tsx`

The `IncomingCallPopup` component is mounted globally in the dashboard layout, ensuring it is always present regardless of the current page:

```tsx
<IncomingCallPopup />
```

This means the popup is:
- Available on every authenticated page
- Not tied to any specific route
- Always listening for incoming call events

### 1.2 Audio Context Initialization

**File:** `crm_frontend/src/lib/sip/audioContext.ts`

The popup re-exports `unlockAudio` which is triggered on the first user interaction anywhere in the app:

```typescript
export { unlockAudioCtx as unlockAudio } from '@/lib/sip/audioContext';
```

**Audio unlock flow:**

1. User clicks anywhere in the dashboard
2. `unlockAudioCtx()` is called
3. Creates a shared `AudioContext` singleton
4. Calls `ctx.resume()` to satisfy Chrome's autoplay policy
5. Pre-fetches and decodes `/sounds/ringing.mp3` into an `AudioBuffer`
6. Ring buffer is cached for instant playback on first call

**Why this matters:** Browsers block audio playback without user gesture. The unlock ensures the ringtone plays immediately when the first call arrives.

### 1.3 Store Subscriptions

On mount, the component subscribes to three Zustand stores:

| Store | Subscribed State | Purpose |
|---|---|---|
| `callStore` | `incomingCall`, `clearIncoming` | Incoming call data and dismissal |
| `sipStore` | `actions`, `callStatus`, `isMuted`, `isOnHold`, `callTimer` | SIP state and call controls |
| `agentStatusStore` | `status` | Agent availability status |

---

## Phase 2: Incoming Call Detection

### 2.1 Trigger Conditions

The popup becomes visible when **both** conditions are met:

```typescript
if (incomingCall && agentStatus !== 'away') {
  setVisible(true);
}
```

| Condition | Source | Description |
|---|---|---|
| `incomingCall` is set | `callStore.incomingCall` | WebSocket event delivered call data |
| `agentStatus` is NOT `away` | `agentStatusStore.status` | Agent must be available or on break |

### 2.2 Incoming Call Data Structure

**File:** `crm_frontend/src/types/index.ts`

The `IncomingCallEvent` type:

```typescript
interface IncomingCallEvent {
  call_id: string;           // Backend call record UUID
  caller: string;            // Caller phone number or name
  customer_id: string | null; // Matched customer UUID (if found)
  customer_name: string | null; // Customer full name
  customer_company: string | null; // Customer company name
  queue: string | null;      // Queue name (e.g., "sales_queue")
  uniqueid: string;          // Asterisk unique call ID
}
```

### 2.3 Visibility State Management

The component uses local React state for visibility:

```typescript
const [visible, setVisible] = useState(false);
```

Visibility is controlled by three effects:

| Trigger | Condition | Action |
|---|---|---|
| `incomingCall` changes | `incomingCall && agentStatus !== 'away'` | `setVisible(true)` |
| `callStatus` = `'incoming'` | `agentStatus !== 'away'` | `setVisible(true)` |
| `callStatus` = `'active'` | `agentStatus !== 'away'` | `setVisible(true)` + navigate to customer |
| `callStatus` = `'idle'` | Always | `setVisible(false)` |

### 2.4 Stale Closure Prevention

A `useRef` is used to always have access to the latest `incomingCall` value inside callbacks:

```typescript
const incomingCallRef = useRef(incomingCall);
useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
```

This prevents stale closures in `handleAnswer` and `handleDismiss` which are memoized with `useCallback`.

---

## Phase 3: Ringing State (Incoming View)

### 3.1 Visual Layout

When `callStatus` is not `'active'`, the popup renders the **incoming call view**:

```
┌─────────────────────────────────────┐
│ Incoming Call                    ✕  │  ← Header with dismiss (X)
├─────────────────────────────────────┤
│  ┌──────┐                           │
│  │  👤  │  John Doe                 │  ← Caller avatar + name
│  └──────┘  Mobile +963912345678     │  ← Phone number
│            Acme Corp                │  ← Company (if available)
│            Queue sales_queue        │  ← Queue (if applicable)
├─────────────────────────────────────┤
│                        [📕] [📗]    │  ← Reject (red) / Answer (green)
└─────────────────────────────────────┘
```

**Styling:**
- Position: `fixed bottom-6 right-6`
- Animation: `animate-slide-up`
- Width: `w-80` (320px)
- Z-index: `z-50`
- Shadow: `shadow-2xl`

### 3.2 Displayed Information

| Field | Source | Fallback |
|---|---|---|
| Caller Name | `incomingCall.customer_name` | `incomingCall.caller` → `'Unknown Caller'` |
| Phone Number | `incomingCall.caller` | Hidden if same as name |
| Company | `incomingCall.customer_company` | Hidden if null |
| Queue | `incomingCall.queue` | Hidden if null |

### 3.3 Ring Audio

Ring audio is managed exclusively by `SipClient._startRinging()` in `sipClient.ts`, not by the popup component. The popup only controls visibility.

---

## Phase 4: Answer Action

### 4.1 Answer Flow

When the agent clicks the green **Answer** button:

```typescript
const handleAnswer = useCallback(() => {
  const call = incomingCallRef.current;
  const callId     = call?.call_id     || null;
  const customerId = call?.customer_id || null;
  const caller     = call?.caller      || '';
  const uniqueid   = call?.uniqueid    || '';
```

### 4.2 Step-by-Step Execution

**Step 1: Capture data before SIP answer**

Critical: Data is captured **before** calling `actions.answer()` because the SIP session may be cleared immediately:

```typescript
const callId     = call?.call_id     || null;
const customerId = call?.customer_id || null;
const caller     = call?.caller      || '';
const uniqueid   = call?.uniqueid    || '';
```

**Step 2: Mark call as answered in backend (async)**

```typescript
if (callId) {
  callsApi.markCallAnswered(callId)
    .then(() => console.log('[Answer] markCallAnswered OK'))
    .catch((e) => console.error('[Answer] markCallAnswered FAILED:', e));
}
```

This is a fire-and-forget API call — the answer proceeds regardless of success.

**Step 3: Answer via SIP**

```typescript
actions?.answer();
```

This triggers `SipClient.answer()` which:
- Accepts the JsSIP session
- Establishes WebRTC audio stream
- Stops ringtone
- Updates `sipStore.callStatus` to `'active'`

**Step 4: Handle unmatched customer**

If no customer was matched:

```typescript
if (!customerId) {
  setVisible(false);
  router.push(`/customers/new?phone=${encodeURIComponent(caller)}&uniqueid=${encodeURIComponent(uniqueid)}`);
}
```

The agent is redirected to create a new customer record, with the caller's phone and Asterisk unique ID pre-filled.

### 4.3 No Customer Match Flow

```
Agent clicks Answer
    │
    ├── customerId exists → popup stays visible, transitions to active view
    │
    └── customerId is null → popup hides, redirect to /customers/new
                              │
                              └── phone and uniqueid pre-filled in form
```

---

## Phase 5: Active Call State (Active View)

### 5.1 Transition to Active View

The popup transitions to the active call view when:

```typescript
const isActive = callStatus === 'active' || callStatus === 'holding';
```

### 5.2 Automatic Customer Navigation

When the call becomes active and a customer is matched:

```typescript
if (callStatus === 'active' && agentStatus !== 'away') {
  setVisible(true);
  const call = incomingCallRef.current;
  if (call?.customer_id) {
    const path = window.location.pathname;
    if (!path.includes('/customers/') && !path.includes('/calls/')) {
      router.push(`/customers/${call.customer_id}`);
    }
  }
}
```

This **screen pop** behavior:
- Only triggers if not already on a customer or call page
- Navigates to the matched customer's detail page
- Gives the agent context about the caller

### 5.3 Visual Layout

```
┌─────────────────────────────────────────────┐
│  👤 John Doe              02:34             │  ← Green header (or yellow if on hold)
│     +963912345678          🔴 In Call       │  ← Timer + status
├─────────────────────────────────────────────┤
│ 🏢 Acme Corp   Queue sales_queue            │  ← Context bar (gray)
├─────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐          │
│  │  🎤    │ │  ⏸    │ │  📞    │          │
│  │  Mute  │ │  Hold  │ │ Transfer│          │  ← Control buttons
│  └────────┘ └────────┘ └────────┘          │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │         📕  End Call                │   │  ← Full-width hangup button
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Styling:**
- Position: `fixed bottom-6 right-6`
- Width: `w-96` (384px) — wider than incoming view
- Z-index: `z-50`
- Header color: `bg-green-600` (active) or `bg-yellow-500` (on hold)

### 5.4 Call Timer

The timer is sourced from `sipStore.callTimer` and formatted as `MM:SS`:

```typescript
const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
```

The timer is incremented by the SIP client every second while the call is active.

### 5.5 Header Status Indicators

| State | Header Color | Status Text |
|---|---|---|
| Active | Green (`bg-green-600`) | `🔴 In Call` |
| Holding | Yellow (`bg-yellow-500`) | `⏸ On Hold` |

---

## Phase 6: Active Call Controls

### 6.1 Mute Toggle

```typescript
<button onClick={() => actions?.toggleMute?.()}
  className={isMuted
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }>
  {isMuted ? <MicOff /> : <Mic />}
  {isMuted ? 'Unmute' : 'Mute'}
</button>
```

**Behavior:**
- Toggles microphone on/off via JsSIP `muteAudio()`
- Visual feedback: red background when muted
- State tracked in `sipStore.isMuted`

### 6.2 Hold Toggle

```typescript
<button onClick={() => actions?.toggleHold?.()}
  className={isOnHold
    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }>
  {isOnHold ? <PlayCircle /> : <PauseCircle />}
  {isOnHold ? 'Resume' : 'Hold'}
</button>
```

**Behavior:**
- Places caller on hold or resumes
- Visual feedback: yellow background when on hold
- Header color changes to yellow when on hold
- State tracked in `sipStore.isOnHold`

### 6.3 Transfer

```typescript
<button onClick={() => setShowTransfer(true)}>
  <PhoneForwarded />
  <span>Transfer</span>
</button>
```

Opens the **Transfer Modal** for blind transfer.

### 6.4 End Call

```typescript
<button onClick={() => actions?.hangup?.()}>
  <PhoneOff />
  End Call
</button>
```

**Behavior:**
- Hangs up the SIP session via JsSIP
- Triggers Asterisk `Hangup` AMI event
- Backend processes hangup (same as inbound call lifecycle)
- `callStatus` transitions to `'idle'`
- Popup hides automatically

---

## Phase 7: Transfer Modal

### 7.1 Modal Structure

**File:** `IncomingCallPopup.tsx` — `TransferModal` component

```
┌──────────────────────────┐
│ Transfer to Extension    │
├──────────────────────────┤
│ [ e.g. 200          ]    │  ← Extension input (auto-focused)
├──────────────────────────┤
│ [  Cancel  ] [Transfer]  │  ← Transfer disabled if empty
└──────────────────────────┘
```

### 7.2 Transfer Execution

```typescript
const handleTransfer = useCallback((ext: string) => {
  const session = (actions as any)?.getSession?.();
  if (session?.refer) {
    const domain = session.remote_identity?.uri?.host || '192.168.2.222';
    session.refer(`sip:${ext}@${domain}`);
  } else {
    actions?.hangup?.();
  }
  setShowTransfer(false);
  setVisible(false);
  clearIncoming();
}, [actions, clearIncoming]);
```

**Transfer flow:**

1. Gets the current JsSIP session
2. Uses SIP `REFER` method for blind transfer
3. Constructs SIP URI: `sip:{extension}@{domain}`
4. Domain defaults to `192.168.2.222` (PBX IP)
5. If `refer` is not available, falls back to hangup
6. Closes modal and popup

### 7.3 Transfer Type

The current implementation uses **blind transfer** (SIP REFER):
- Caller is transferred immediately without agent consultation
- Agent does not announce the transfer to the destination
- Agent's call ends after the transfer

---

## Phase 8: Dismiss / Reject Action

### 8.1 Dismiss Flow

When the agent clicks the red **Reject** button or the close (X) button:

```typescript
const handleDismiss = useCallback(() => {
  const call = incomingCallRef.current;
  actions?.hangup?.();
  setVisible(false);
  clearIncoming();
  if (call?.call_id) {
    callsApi.rejectCall(call.call_id).catch(() => {});
  }
}, [actions, clearIncoming]);
```

### 8.2 Step-by-Step Execution

**Step 1: Hangup via SIP**

```typescript
actions?.hangup?.();
```

Sends SIP BYE to reject the incoming call.

**Step 2: Hide popup and clear store**

```typescript
setVisible(false);
clearIncoming();
```

**Step 3: Mark as no_answer in backend (async)**

```typescript
callsApi.rejectCall(call.call_id).catch(() => {});
```

Fire-and-forget API call to update the call record status to `"no_answer"`.

---

## Phase 9: Popup Dismissal & Cleanup

### 9.1 Automatic Dismissal Conditions

The popup hides automatically when:

| Condition | Trigger |
|---|---|
| `callStatus === 'idle'` | SIP session ended |
| Agent clicks Reject | Manual dismissal |
| Agent clicks End Call | Active call ended |
| Agent transfers call | Transfer completed |
| Component unmounts | Navigation away (rare) |

### 9.2 Store Cleanup

When the popup is dismissed:

```typescript
clearIncoming(); // Sets incomingCall to null, screenPopOpen to false
```

The `callStore` state resets:

```typescript
clearIncoming: () => set({ incomingCall: null, screenPopOpen: false }),
```

### 9.3 Post-Call Flow

After the popup hides (call ended):

1. `callStatus` transitions to `'idle'`
2. `DispositionModal` auto-opens (triggered by dashboard layout)
3. Agent completes call disposition
4. Agent status returns to `'available'`

---

## Phase 10: Agent Status Integration

### 10.1 Status-Based Filtering

The popup only shows when the agent is **not away**:

```typescript
if (incomingCall && agentStatus !== 'away') {
  setVisible(true);
}
```

| Agent Status | Popup Shows? | Rationale |
|---|---|---|
| `available` | Yes | Agent is ready to take calls |
| `on_call` | No | Agent is already on a call |
| `wrap_up` | No | Agent is completing disposition |
| `away` | No | Agent is not available |
| `break` | No | Agent is on break |

### 10.2 Status Changes During Call

If an agent changes status to `away` while a call is ringing:

- The popup will not appear (condition check fails)
- The call will ring until timeout or another agent answers
- The caller may be routed to voicemail or another queue member

---

## State Machine Diagram

```
                    ┌─────────────┐
                    │   MOUNTED   │
                    │  (hidden)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ incoming │ │  active  │ │  idle    │
        │  call    │ │   call   │ │ (hidden) │
        │ received │ │          │ │          │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
      ┌──────┼──────┐     │      ┌─────┼──────┐
      │      │      │     │      │     │      │
      ▼      ▼      ▼     ▼      ▼     ▼      ▼
   Answer  Reject  Close  Mute  Hold  Transfer End
      │      │      │     │     │      │      │
      ▼      ▼      ▼     │     │      │      ▼
   ┌──────┐ ┌──────┐ ┌──────┐  │     │   ┌──────────┐
   │active│ │ idle │ │ idle │  │     │   │   idle   │
   │ view │ │      │ │      │  │     │   │          │
   └──┬───┘ └──────┘ └──────┘  │     │   └────┬─────┘
      │                        │     │        │
      ▼                        ▼     ▼        ▼
   ┌──────────────────────────────────────────────┐
   │              DISPOSITION MODAL               │
   └──────────────────────────────────────────────┘
```

---

## Component Dependency Graph

```
IncomingCallPopup
    │
    ├── Zustand Stores
    │   ├── callStore (incomingCall, clearIncoming)
    │   ├── sipStore (actions, callStatus, isMuted, isOnHold, callTimer)
    │   └── agentStatusStore (status)
    │
    ├── SIP Client (via sipStore.actions)
    │   ├── answer()
    │   ├── hangup()
    │   ├── toggleMute()
    │   ├── toggleHold()
    │   └── getSession() → refer()
    │
    ├── API Clients (lazy-loaded)
    │   ├── callsApi.markCallAnswered()
    │   └── callsApi.rejectCall()
    │
    ├── Audio Context
    │   └── unlockAudioCtx() (re-exported)
    │
    ├── Next.js Router
    │   ├── router.push(/customers/new) — no match
    │   └── router.push(/customers/{id}) — screen pop
    │
    └── Sub-components
        └── TransferModal
```

---

## Error Handling

### 11.1 No call_id on Answer

```typescript
if (callId) {
  callsApi.markCallAnswered(callId)...
} else {
  console.warn('[Answer] No call_id found — markCallAnswered skipped');
}
```

Gracefully skips the API call if `call_id` is missing. The SIP answer still proceeds.

### 11.2 API Call Failures

Both `markCallAnswered` and `rejectCall` use `.catch(() => {})` — failures are silently ignored to prevent blocking the user experience. The call state is ultimately reconciled via AMI events.

### 11.3 Transfer Fallback

If the JsSIP session doesn't support `refer`:

```typescript
if (session?.refer) {
  session.refer(`sip:${ext}@${domain}`);
} else {
  actions?.hangup?.();
}
```

Falls back to hanging up the call.

### 11.4 Stale Closure Protection

The `incomingCallRef` ensures that `handleAnswer` and `handleDismiss` always access the latest incoming call data, even if the callbacks were created with an older value.

---

## Key Files Reference

| File | Purpose |
|---|---|
| `crm_frontend/src/components/calls/IncomingCallPopup.tsx` | Main popup component (286 lines) |
| `crm_frontend/src/store/callStore.ts` | Call state management (45 lines) |
| `crm_frontend/src/store/sipStore.ts` | SIP state and actions (50 lines) |
| `crm_frontend/src/store/agentStatusStore.ts` | Agent availability status |
| `crm_frontend/src/lib/sip/sipClient.ts` | JsSIP wrapper — answer, hangup, mute, hold, transfer |
| `crm_frontend/src/lib/sip/audioContext.ts` | Shared AudioContext + ring buffer |
| `crm_frontend/src/lib/api/calls.ts` | Calls API client — markCallAnswered, rejectCall |
| `crm_frontend/src/app/(dashboard)/layout.tsx` | Dashboard shell — mounts popup, triggers DispositionModal |
| `crm_frontend/src/lib/websocket/useWebSocket.ts` | WebSocket hook — delivers incoming_call events |
| `crm_frontend/src/types/index.ts` | TypeScript types — IncomingCallEvent, Call |
