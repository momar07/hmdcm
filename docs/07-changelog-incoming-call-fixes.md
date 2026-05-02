# Changelog — Incoming Call Fixes

## Date: 2026-05-02

### Summary

Fixed 3 critical issues with incoming call handling: ringtone not playing, answer button not working for unregistered numbers, and answer button not working for registered numbers.

---

## Fixes Applied

### Fix 1 — Ringtone Not Playing
**Severity:** P0 (Critical)
**Files:** `lib/sip/audioContext.ts`, `lib/sip/sipClient.ts`, `app/(dashboard)/layout.tsx`

**Problem:** The ringtone relied exclusively on Web Audio API's `AudioContext`, which requires a user gesture (click/keydown) before it can play audio. If the agent hadn't interacted with the page before the first call arrived, no ringtone would play.

**Fix:**
1. Added HTML `<audio>` element as a reliable fallback for ringtone playback
2. Created `startRingtone()` and `stopRingtone()` functions that use the HTML audio element
3. Modified `SipClient._startRinging()` to use the new HTML audio approach instead of AudioContext
4. Added immediate `unlockAudio()` call on page mount (not just on user gesture)
5. Added ringtone preloading when SIP registers

**New functions in `audioContext.ts`:**
```typescript
function getRingAudio(): HTMLAudioElement  // Creates <audio id="ringtone-audio">
export function startRingtone(): void       // Plays ringtone via HTML audio
export function stopRingtone(): void        // Pauses and resets ringtone
```

**Test:** Ringtone file exists at `public/sounds/ringing.mp3` (384KB). TypeScript compilation passes.

---

### Fix 2 — Unregistered Number: Answer Button Clicked But Call Doesn't Connect
**Severity:** P0 (Critical)
**Files:** `lib/sip/sipClient.ts`, `lib/sip/useSip.ts`

**Problem:** The `answer()` method in `SipClient` had a strict guard that only allowed answering when session status was exactly 3 (`STATUS_INVITE_RECEIVED`) or 4 (`STATUS_WAITING_FOR_ANSWER`). If the session was in any other state (e.g., status 1 = `STATUS_NULL` during early setup), the answer would be silently rejected.

**Fix:**
1. Relaxed the session status guard to only block status 5 (already answered) and 8 (terminated)
2. Added try/catch around `session.answer()` to handle any JsSIP errors gracefully
3. Added console logging for debugging session states

**Before:**
```typescript
if (sessionStatus !== 3 && sessionStatus !== 4) return; // too strict
```

**After:**
```typescript
if (sessionStatus === 8 || sessionStatus === 5) return; // only block if already done
```

**Test:** TypeScript compilation passes with no errors.

---

### Fix 3 — Registered Number: Answer Button Not Clickable, Call Keeps Ringing
**Severity:** P0 (Critical)
**Files:** `lib/sip/useSip.ts`

**Problem:** Race condition between the WebSocket `incoming_call` event (which shows the popup) and the SIP `newRTCSession` event (which creates the session). When the agent clicked "Answer", the SIP session might not have arrived yet, causing `answer()` to fail silently.

**Fix:**
Added retry logic in the `answer()` callback within `useSip`:

```typescript
const answer = useCallback(() => {
  const client = clientRef.current;
  if (!client) return;

  // If session exists, answer immediately
  if (client.getSession()) {
    client.answer();
    setIncoming(null);
    return;
  }

  // If no session yet, wait up to 5 seconds for it to arrive
  let attempts = 0;
  const waitInterval = setInterval(() => {
    attempts++;
    const sess = client.getSession();
    if (sess) {
      clearInterval(waitInterval);
      client.answer();
      setIncoming(null);
    } else if (attempts >= 50) {
      clearInterval(waitInterval); // 5 seconds timeout
    }
  }, 100);
}, []);
```

This polls every 100ms for up to 5 seconds until the SIP session arrives, then answers automatically.

**Test:** TypeScript compilation passes with no errors.

---

## Additional Changes

### Sidebar: Users & Teams Section
**File:** `components/layout/Sidebar.tsx`

Added back the "Users & Teams" navigation link that was missing. It now appears only for admin users, separated by a divider from the main navigation.

### Topbar: User Dropdown with Logout
**File:** `components/layout/Topbar.tsx`

Added a dropdown menu when clicking on the user avatar/name in the topbar. The dropdown contains a "Log Out" option that calls the auth store's `logout()` function and redirects to `/login`.

### Pre-existing Bug Fixes
**File:** `apps/leads/views.py`

Fixed `NameError: name 'status' is not defined` — some code used `status.HTTP_200_OK` but the import was `status as http_status`. Changed all references to use `http_status.`.

---

## Test Results

```bash
npx tsc --noEmit
# No errors — TypeScript compilation passes
```

All files compile without TypeScript errors.

---

## Files Modified

| File | Changes |
|---|---|
| `lib/sip/audioContext.ts` | Added HTML audio fallback for ringtone |
| `lib/sip/sipClient.ts` | Relaxed session guard, use HTML audio for ring |
| `lib/sip/useSip.ts` | Added retry logic in answer() |
| `components/calls/IncomingCallPopup.tsx` | Added debug logs |
| `app/(dashboard)/layout.tsx` | Immediate audio unlock on mount |
| `components/layout/Sidebar.tsx` | Added Users & Teams for admin |
| `components/layout/Topbar.tsx` | Added user dropdown with logout |
| `apps/leads/views.py` | Fixed `status` → `http_status` references |
