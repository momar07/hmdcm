# Agent Login Flow — Documentation

## Overview

When an agent logs into the CRM, **two separate systems** need to be activated:
1. **SIP/WebRTC Registration** — connects the SoftPhone to Asterisk for making/receiving calls
2. **Queue Login (AMI)** — adds the agent to Asterisk call queues (e.g., queue 901) so they receive routed calls

These two systems are **independent** — one can work while the other fails.

---

## Step-by-Step Flow

### Step 1: Agent enters credentials on login page

**File:** `crm_frontend/src/app/(auth)/login/page.tsx`

User enters email + password → form submits to backend.

---

### Step 2: Backend authenticates and returns JWT token

**File:** `crm_backend/apps/accounts/views.py:9-30`

```python
class LoginView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            # Get user from JWT token
            user = User.objects.select_related('extension').get(pk=user_id)
            if user.role in ('agent', 'supervisor'):
                agent_on_login(user, request=request)  # ← Step 3
        return response
```

**What happens here:**
- Authenticates email/password via JWT
- If user is agent/supervisor → triggers `agent_on_login()`
- Returns access + refresh tokens to frontend

---

### Step 3: Queue Login Sequence (AMI commands)

**File:** `crm_backend/apps/users/agent_state_service.py:416-500`

```python
def agent_on_login(user, request=None) -> dict:
    interface = _get_interface(user)    # → "PJSIP/300"
    queues    = _get_queues(user)       # → ["901"]

    # 1. Remove from queues if already member (clean slate)
    _run_ami([('QueueRemove', {'Queue': q, 'Interface': interface}) for q in queues])

    # 2. Add to all queues (PAUSED with '1' = paused)
    _run_ami([('QueueAdd', {
        'Queue': q, 'Interface': interface,
        'Paused': '1',   # ← Asterisk expects '0' or '1', NOT 'false'/'true'
    }) for q in queues])

    # 3. Create LOGIN break record
    AgentBreak.objects.create(agent=user, reason='LOGIN')

    # 4. Set CRM status to 'away'
    update_user_status(str(user.id), 'away')
    _notify(user, 'away')

    # 5. Background thread: unpause after 5 seconds
    threading.Timer(5.0, _do_unpause, args=[user_id, session_id]).start()
```

**AMI commands sent to Asterisk:**
```
Action: QueueRemove
Queue: 901
Interface: PJSIP/300

Action: QueueAdd
Queue: 901
Interface: PJSIP/300
Paused: 1

... 5 seconds later ...

Action: QueuePause
Queue: 901
Interface: PJSIP/300
Paused: 0   # ← unpause = available
```

**AMI connection settings come from `SystemSetting` model:**
- `ami_host` → `192.168.2.222`
- `ami_port` → `5038`
- `ami_username` → `crmuser`
- `ami_secret` → `123456`

---

### Step 4: Frontend receives JWT, stores it, redirects to dashboard

**Files:**
- `crm_frontend/src/store/authStore.ts` — stores tokens
- `crm_frontend/src/app/(dashboard)/layout.tsx` — layout loads

---

### Step 5: SoftPhone connects via WebSocket (WebRTC)

**File:** `crm_frontend/src/components/softphone/SoftPhone.tsx:43-48`

```tsx
const SIP_WS_URL = process.env.NEXT_PUBLIC_SIP_WS_URL || 'ws://192.168.2.222:8088/ws';
const SIP_DOMAIN = process.env.NEXT_PUBLIC_SIP_DOMAIN || '192.168.2.222';

const sipConfig = (extNumber && sipSecret) ? {
  wsUrl:       SIP_WS_URL,     // ws://192.168.2.222:8088/ws  (HTTP server)
  sipUri:      `sip:${extNumber}@${SIP_DOMAIN}`,
  password:    sipSecret,
  displayName: user?.full_name ?? extNumber,
} : null;
```

**File:** `crm_frontend/src/lib/sip/useSip.ts:29-70`

```tsx
useEffect(() => {
  const client = new SipClient(config, ...);
  client.connect();  // ← creates JsSIP UA, starts WebSocket connection
  
  // Auto-reconnect with exponential backoff (max 10 retries)
  // On 'error' or 'disconnected', calls disconnect() then connect()
  // Delay increases: 5s, 7.5s, 11.25s, ... up to 60s max
  
  return () => { client.disconnect(); };
}, [config?.sipUri]);
```

**File:** `crm_frontend/src/lib/sip/sipClient.ts:106-216`

```tsx
connect() {
  const socket = new JsSIP.WebSocketInterface(this.config.wsUrl);
  this.ua = new JsSIP.UA({
    sockets: [socket],
    uri: this.config.sipUri,
    password: this.config.password,
    register: true,
    session_timers: false,
  });
  this.ua.start();  // ← sends SIP REGISTER over WebSocket
}
```

**What happens:**
- Browser opens WebSocket to `ws://192.168.2.222:8088/ws` (Asterisk HTTP server)
- JsSIP sends SIP REGISTER request
- Asterisk authenticates with `auth300` (password from `pjsip_additional.conf`)
- On success → `registered` event fires → SoftPhone shows "Ready"

> **Important:** The WebSocket connects to Asterisk's HTTP server (port 8088 for `ws`, port 8089 for `wss`), NOT to the PJSIP transport port (5060). The PJSIP WSS transport configuration in `pjsip_transport_additional.conf` binds to port 5060 for SIP signaling, but WebSocket connections for browsers are handled by the HTTP server via `http.conf`.

---

### Step 6: "Available" button — Queue Add on demand

**File:** `crm_frontend/src/components/layout/AgentStatusDropdown.tsx:60-68`

```tsx
const { mutate } = useMutation({
  mutationFn: (target) => agentStatusApi.set(target),
  onSuccess: (response, target) => {
    if (response?.success === false) {
      toast.error(response.message);  // ← shows AMI error
      return;
    }
    setStatus(target);
    toast.success(`${target} (${response.queues.join(', ')})`);
  },
});
```

**API:** `POST /api/users/me/queue-status/` with `{ "status": "available" }`

**Backend:** `crm_backend/apps/users/views.py:149-179` → calls `agent_go_available(user)`

**File:** `crm_backend/apps/users/agent_state_service.py:177-229`

```python
def agent_go_available(user) -> dict:
    interface = _get_interface(user)   # "PJSIP/300"
    queues    = _get_queues(user)      # ["901"]

    # QueueAdd with Paused: '0' (unpaused = available)
    _run_ami([('QueueAdd', {
        'Queue': q, 'Interface': interface, 'Paused': '0',
    }) for q in queues])

    # Check AMI responses for errors
    all_ok, error_msg = _check_ami_success(responses)
    if not all_ok:
        return {'success': False, 'message': f'Failed: {error_msg}'}

    update_user_status(str(user.id), 'available')
    _notify(user, 'available')
    return {'success': True, 'queues': queues}
```

---

## Files Involved (Summary)

| File | Role |
|------|------|
| `crm_backend/apps/accounts/views.py` | LoginView — triggers `agent_on_login()` after JWT auth |
| `crm_backend/apps/users/agent_state_service.py` | All AMI queue operations (login, logout, available, break, offline) |
| `crm_backend/apps/users/views.py` | `AgentQueueStatusView` — handles POST `/users/me/queue-status/` |
| `crm_backend/apps/settings_core/models.py` | `SystemSetting` — stores AMI credentials |
| `crm_frontend/src/components/softphone/SoftPhone.tsx` | SoftPhone UI + SIP config (wsUrl, password) |
| `crm_frontend/src/lib/sip/useSip.ts` | React hook — creates SipClient, manages lifecycle |
| `crm_frontend/src/lib/sip/sipClient.ts` | JsSIP wrapper — connect, disconnect, call, answer, hangup |
| `crm_frontend/src/components/layout/AgentStatusDropdown.tsx` | "Available/Break/Offline" dropdown button |

---

## Current Problems

### Problem 1: AMI credentials were NOT SET in database

**Status:** ✅ **FIXED**

The `SystemSetting` table had no rows for `ami_host`, `ami_port`, `ami_username`, `ami_secret`.
Code fell back to defaults (`127.0.0.1`, `admin`, `admin`) which don't match Asterisk.

**Fix:** Inserted correct values:
- `ami_host` = `192.168.2.222`
- `ami_port` = `5038`
- `ami_username` = `crmuser`
- `ami_secret` = `123456`

---

### Problem 2: `Paused: 'true'/'false'` — wrong format for Asterisk

**Status:** ✅ **FIXED**

Asterisk AMI expects `'0'` (paused) and `'1'` (unpaused), or vice versa depending on command.
The code was sending `'true'` and `'false'` which Asterisk ignores or rejects.

**Fix:** Changed all `Paused` values to `'0'`/`'1'`.

---

### Problem 3: AMI responses never checked

**Status:** ✅ **FIXED**

`agent_go_available()` always returned `{'success': True}` even if Asterisk returned `Response: Error`.

**Fix:** Added `_check_ami_success()` function that inspects AMI responses. If any command fails, returns `{'success': False, 'message': '...'}` and the frontend shows an error toast.

---

### Problem 4: WebSocket URL mismatch

**Status:** ✅ **FIXED (corrected)**

The original diagnosis was wrong. Asterisk's PJSIP WebSocket for WebRTC uses the **HTTP server** (port 8088 for `ws`, port 8089 for `wss`), NOT the PJSIP transport port 5060. The `transport-wss` PJSIP configuration binds to port 5060 for SIP signaling, but WebSocket connections are handled via Asterisk's built-in HTTP server.

Verified by Asterisk logs showing registrations arriving at `LocalAddress="IPV4/WS/192.168.2.222/8088"`.

Correct URLs:
- `ws://192.168.2.222:8088/ws` (insecure — for development/LAN)
- `wss://192.168.2.222:8089/ws` (secure — requires trusted TLS certificate)

**Fix:** Changed `wsUrl` from `wss://192.168.2.222:5060/ws` to `ws://192.168.2.222:8088/ws` via `NEXT_PUBLIC_SIP_WS_URL` env var. This also makes the SIP domain configurable via `NEXT_PUBLIC_SIP_DOMAIN`.

---

### Problem 5: HTTP session limit exceeded (100 sessions)

**Status:** ✅ **FIXED**

Asterisk's HTTP server has `sessionlimit` default of 100. Stale WebRTC WebSocket connections accumulated because:
- Page refreshes without proper cleanup
- Auto-reconnect creates new connections without killing old ones
- `ua.stop()` doesn't always close the WebSocket cleanly

**Fix:**
1. Added `sessionlimit=500` to `/etc/asterisk/http_custom.conf`
2. Improved `disconnect()` in `sipClient.ts` to:
   - Call `ua.unregister({ all: true })` first
   - Force close underlying WebSocket
   - Clear session reference
3. Added `disconnected` flag in `useSip.ts` to prevent reconnect after cleanup

---

### Problem 6: `max_contacts=1` with stale contact

**Status:** ✅ **FIXED**

Extension 300 had `max_contacts=1` and `remove_existing=no`. If a stale contact existed, new REGISTER was rejected with `registrar_attempt_exceeds_maximum_configured_contacts`.

Asterisk logs showed dozens of consecutive registration failures:
```
Registration attempt from endpoint '300' (192.168.2.113:47xxx) to AOR '300' will exceed max contacts of 1
FailedACL: registrar_attempt_exceeds_maximum_configured_contacts
```

**Fix (applied to `/etc/asterisk/pjsip_additional.conf`):**
```ini
[300]
type=aor
max_contacts=5
remove_existing=yes
remove_unavailable=yes
```

Also applied to endpoint 400 (the other WebRTC extension). Both endpoints 300 and 400 also now have `webrtc=yes`, `force_rport=yes`, and `rewrite_contact=yes`.

---

### Problem 7: Endpoint `webrtc=no` (critical for NAT traversal)

**Status:** ✅ **FIXED**

Endpoint 300 had `webrtc=no` with `force_rport=no` and `rewrite_contact=no`. For WebRTC clients behind NAT, both must be `yes` or registration fails because Asterisk can't determine the correct return path.

`webrtc=yes` automatically sets: `force_rport=yes`, `rewrite_contact=yes`, `avpf=yes`, `icesupport=yes`, `rtcp_mux=yes`, `media_encryption=dtls`.

**Fix:** Added `webrtc=yes`, `force_rport=yes`, `rewrite_contact=yes` to endpoint 300 in `/etc/asterisk/pjsip_additional.conf`.

> **Note:** These changes are in `pjsip_additional.conf` which is auto-generated by IssabelPBX GUI. If the GUI regenerates this file, changes will be lost. Consider using the IssabelPBX GUI to make these settings permanent.

---

### Problem 8: Self-signed TLS certificate breaks WSS

**Status:** ⚠️ **NOT FIXED (workaround in place)**

The TLS certificate at `/etc/asterisk/keys/asterisk.pem` is self-signed (`Issuer: CN = 192.168.2.222`). Browsers silently reject WSS connections to endpoints with untrusted certificates — no user-visible error, just a failed connection.

The `http.conf` secure WebSocket server (`wss://192.168.2.222:8089/ws`) uses this certificate.

**Current workaround:** Using `ws://` (port 8088) instead of `wss://` (port 8089). This works on the LAN but sends SIP signaling in plaintext.

**Permanent fix options:**
1. Install a proper TLS certificate (e.g., from Let's Encrypt or an internal CA)
2. Import the self-signed CA into every browser's trust store
3. Use a reverse proxy (nginx) with a trusted certificate that terminates TLS and proxies WebSocket to `ws://192.168.2.222:8088/ws`

---

### Problem 9: HTTP session limit exceeded (100 sessions) — recurring

**Status:** ⚠️ **PARTIALLY FIXED**

Even after increasing `sessionlimit` to 500 in `http_custom.conf`, the SIP reconnect loop creates a storm of WebSocket connections. The original reconnect logic in `useSip.ts` created a new `JsSIP.UA` on every retry without disconnecting the old one, and retried indefinitely with no backoff or max limit.

**Fix applied to frontend:**
1. Reconnect now uses exponential backoff with max retry limit (10 retries, max 60s delay)
2. `disconnect()` is called before `connect()` on retry to prevent UA instance leaks
3. Reset retry counter on successful registration
4. JsSIP debug enabled in development mode for easier troubleshooting

**Remaining risk:** Page refreshes during active calls can still create orphaned connections. The `_do_unpause` background thread on login (5s delay) should also have proper cleanup on logout.

---

### Problem 10: SIP config hardcoded — no environment variable support

**Status:** ✅ **FIXED**

All SIP/WebRTC configuration was hardcoded in source code:
- `wss://192.168.2.222:5060/ws` in `SoftPhone.tsx`
- `192.168.2.222` in `IncomingCallPopup.tsx`
- STUN servers hardcoded in `sipClient.ts`

**Fix:** Added environment variables:
- `NEXT_PUBLIC_SIP_WS_URL` — WebSocket URL (default: `ws://192.168.2.222:8088/ws`)
- `NEXT_PUBLIC_SIP_DOMAIN` — SIP domain (default: `192.168.2.222`)

**Still hardcoded:**
- STUN servers (`stun:stun.l.google.com:19302`) — should be configurable
- No TURN server configured — clients behind symmetric NAT will have one-way audio

---

### Problem 11: AMI configuration split across three sources

**Status:** ⚠️ **NOT FIXED**

AMI credentials exist in three places with conflicting defaults:
1. Django `settings.py`: `AMI_HOST='127.0.0.1'`, `AMI_USERNAME='admin'`, `AMI_SECRET='secret'`
2. Backend `.env`: `AMI_HOST=192.168.2.222`, `AMI_USERNAME=crmuser`, `AMI_SECRET=123456`
3. `SystemSetting` DB (seeded): `ami_host='192.168.2.222'`, `ami_username='admin'`, `ami_secret='admin'`

`agent_state_service.py` reads from `SystemSetting` (DB), while `calls/views.py` originate endpoint reads from Django settings. They could use different credentials.

**Fix needed:** Unify AMI configuration to a single source (preferably `.env`).

---

### Problem 12: Duplicate raw-socket AMI client in calls/views.py

**Status:** ⚠️ **NOT FIXED**

`calls/views.py` implements its own AMI socket connection using raw sockets instead of reusing the `AmiClient` class from `agent_state_service.py`. This is code duplication with inconsistent config sources and error handling.

**Fix needed:** Refactor to use the shared `AmiClient`.

---

### Problem 13: Login unpause uses threading.Timer instead of Celery

**Status:** ⚠️ **NOT FIXED**

`agent_on_login()` uses `threading.Timer(5.0, _do_unpause)` for the 5-second unpause delay. If the Django process is killed, the unpause never happens. Gunicorn workers with a thread-based model may have DB connection issues.

**Fix needed:** Replace with a Celery task.

---

## How to Debug

### Check AMI connection
```bash
cd /home/momar/Desktop/websites/hmdcm/crm_backend
source venv/bin/activate
python manage.py shell -c "
from apps.users.agent_state_service import _get_ami_client
client = _get_ami_client()
client.connect()
client.login()
print('OK')
client.logoff()
"
```

### Check Asterisk queue membership
```bash
asterisk -rx "queue show 901"
```

### Check SIP registration
```bash
asterisk -rx "pjsip show endpoint 300"
asterisk -rx "pjsip show contacts"
```

### Check Django logs for AMI commands
```bash
# Look for [AMI] entries in Django logs
grep '\[AMI\]' /path/to/django/logs
```

### Check AMI credentials in database
```bash
python manage.py shell -c "
from apps.settings_core.models import SystemSetting
for s in SystemSetting.objects.filter(key__startswith='ami_'):
    print(f'{s.key}: {s.value}')
"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│                                                                  │
│  Login Page ──POST──→ LoginView ──→ JWT tokens back              │
│                                                                  │
│  Dashboard loads:                                                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   SoftPhone          │    │  AgentStatusDropdown         │   │
│  │                      │    │                              │   │
│  │  WebSocket ────────→ │    │  POST /queue-status/ ──────→ │   │
│  │  ws://192.168.2.222 │    │  { status: "available" }     │   │
│  │  :8088/ws            │    │                              │   │
│  │                      │    │  Response:                   │   │
│  │  SIP REGISTER        │    │  { success, queues, message }│   │
│  │  SIP REGISTERED      │    │                              │   │
│  └──────────────────────┘    └──────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    WS (port 8088)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Asterisk HTTP Server                         │
│  http.conf: bindaddr=0.0.0.0:8088 (ws) / :8089 (wss)          │
│  PJSIP receives WebSocket frames and routes to endpoint 300     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              PJSIP Internal Routing
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Asterisk / Issabel PBX                        │
│                                                                  │
│  pjsip_additional.conf:                                          │
│    [300] endpoint → webrtc=yes, transport=transport-wss          │
│    [300] aor → max_contacts=5, remove_existing=yes               │
│    [auth300] → password matches extension.secret                 │
│                                                                  │
│  manager.conf:                                                   │
│    [crmuser]                                                     │
│    secret=123456                                                 │
│                                                                  │
│  queues.conf:                                                    │
│    [901] → members include PJSIP/300                             │
└──────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                     Django Backend (CRM)                        │
│                                                                │
│  LoginView:                                                    │
│    → agent_on_login(user) ──→ AMI QueueAdd (paused)           │
│    → threading.Timer(5s) ──→ AMI QueuePause (unpause)         │
│                                                                │
│  AgentQueueStatusView:                                         │
│    → agent_go_available(user) ──→ AMI QueueAdd (unpaused)     │
│    → _check_ami_success() ──→ returns success/failure          │
│                                                                │
│  AMI Connection:                                               │
│    → 192.168.2.222:5038 (crmuser / 123456)                    │
└────────────────────────────────────────────────────────────────┘
```
