# WebRTC SIP Call — ICE/DTLS Failure Fix

## Symptom

Incoming SIP calls from queue 901 to WebRTC extension 300 would ring, but when answered in the browser:
- ICE state stayed `checking` indefinitely, never reaching `connected`
- DTLS handshake never completed
- Call showed "connecting" then dropped after ~15s with CANCEL/487
- Asterisk never received the 200 OK SDP answer from the browser
- No audio in either direction

## Root Causes

### 1. `getUserMedia` pre-check in `answer()` (PRIMARY CAUSE)

The `answer()` method was `async` and called `await navigator.mediaDevices.getUserMedia()` before `session.answer()`. This pre-check:

- **Delayed the 200 OK** — the async `getUserMedia` call added latency before `session.answer()` could send the SIP 200 OK response
- **Killed the media tracks** — after the pre-check, `stream.getTracks().forEach(t => t.stop())` released the audio tracks. When JsSIP then called `getUserMedia` internally, it got fresh tracks, but the PeerConnection created during the pre-check was already torn down
- **Asterisk saw INVITE stay in EARLY state** — it never received a 200 OK, only 180 Ringing

The tcpdump capture confirmed **zero UDP packets from browser IP 192.168.2.113** on RTP ports.

### 2. Google STUN servers on a LAN (SECONDARY CAUSE)

Both `call()` and `answer()` specified `stun:stun.l.google.com:19302` as ICE servers. On a LAN:

- STUN lookups generated **srflx candidates with public IPs** (e.g., `102.188.122.186`)
- STUN lookups also added **candidates from VPN adapters** (`192.168.194.16`, `10.243.207.230`)
- These irrelevant candidates confused ICE priority ordering
- Only 2 STUN packets from VPN interfaces actually reached Asterisk, and both were to wrong ports

### 3. BUNDLE mismatch (CONTRIBUTING CAUSE)

Asterisk had `bundle=yes` but Chrome's BUNDLE negotiation couldn't complete because the SDP answer never arrived. Setting `bundle=no` simplified the media negotiation.

## Fix

### Frontend (`sipClient.ts`)

**Before (broken):**
```ts
async answer() {
    // ... status checks ...

    // Pre-check microphone access before answering
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(t => t.stop()); // <-- kills tracks!

    this.session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });
}
```

**After (fixed):**
```ts
answer() {  // synchronous, no async
    // ... status checks ...
    // No getUserMedia pre-check — JsSIP handles it internally
    this.session.answer({
      mediaConstraints: { audio: true, video: false },
      // No pcConfig/iceServers — LAN doesn't need STUN
    });
}
```

### Asterisk PJSIP config (`pjsip_additional.conf`)

For extensions 300 and 400:

```ini
# Changed from bundle=yes to bundle=no
bundle=no

# Added explicit media address
media_address=192.168.2.222

# Previously fixed (kept):
webrtc=no           # prevents preset from overriding dtls_verify
force_avp=yes
dtls_verify=no
ice_support=yes
rtcp_mux=yes
use_avpf=yes
transport=transport-ws
media_encryption=dtls
dtls_setup=actpass
dtls_cert_file=/etc/asterisk/keys/asterisk.pem
dtls_private_key=/etc/asterisk/keys/asterisk.pem
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
direct_media=no
media_use_received_transport=yes
```

### Queue timeout (`queues_additional.conf`)

```ini
# Increased from 20 to 45 seconds to give ICE more time
timeout=45
```

## Verification

After fix:
- Browser sends 200 OK with SDP answer immediately
- Asterisk receives it (INVITE state: CONFIRMED)
- ICE completes: `checking` → `connected`
- DTLS handshake succeeds
- Two-way audio established

## Key Lesson

**Never add async delays (especially `getUserMedia`) before `session.answer()` in JsSIP.** The SIP 200 OK must be sent as fast as possible after the user clicks "answer." JsSIP internally handles `getUserMedia` — calling it yourself before `session.answer()` delays the response and can kill the media tracks.