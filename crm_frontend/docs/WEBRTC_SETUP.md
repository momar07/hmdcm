# WebRTC Softphone Integration — Issabel/Asterisk + JsSIP

## Architecture

```
Agent Browser (localhost:3000)
  └── JsSIP (WebRTC)
        └── WSS: wss://192.168.2.222:8089/ws
              └── Asterisk 18 (Issabel)
                    └── Queue 901
```

---

## 1. Asterisk PJSIP Configuration

**File:** `/etc/asterisk/pjsip_additional.conf`

Add these settings under endpoint [300]:

```ini
webrtc=yes
dtls_auto_generate_cert=yes
dtls_verify=no
dtls_setup=actpass
dtls_cert_file=/etc/asterisk/keys/asterisk.pem
dtls_private_key=/etc/asterisk/keys/asterisk.pem
ice_support=yes
use_avpf=yes
rtcp_mux=yes
media_encryption=dtls
transport=transport-wss
force_rport=yes
rtp_symmetric=yes
rewrite_contact=yes
direct_media=no
media_use_received_transport=yes
```

---

## 2. SSL Certificate Generation

```bash
mkdir -p /etc/asterisk/keys
openssl req -x509 -newkey rsa:2048 \
    -keyout /tmp/ast.key \
    -out /tmp/ast.crt \
    -days 3650 -nodes \
    -subj "/CN=192.168.2.222"

cat /tmp/ast.key /tmp/ast.crt > /etc/asterisk/keys/asterisk.pem
chmod 640 /etc/asterisk/keys/asterisk.pem

# Verify (must show 2)
grep -c "BEGIN" /etc/asterisk/keys/asterisk.pem
```

---

## 3. STUN Server Configuration

**File:** `/etc/asterisk/rtp_custom.conf`

```ini
[general]
stunaddr=stun.l.google.com:19302
```

---

## 4. Reload Asterisk

```bash
asterisk -rx "module reload res_pjsip.so"
asterisk -rx "module reload res_rtp_asterisk.so"
asterisk -rx "pjsip show endpoint 300" | grep -E "webrtc|transport|ice|media_enc"
```

---

## 5. Frontend — JsSIP Configuration

**File:** `src/components/softphone/SoftPhone.tsx`

```ts
const extNumber = user?.extension as string | null;
const sipConfig = extNumber ? {
  wsUrl:       'wss://192.168.2.222:8089/ws',
  sipUri:      `sip:${extNumber}@192.168.2.222`,
  password:    'sip123456',
  displayName: user?.full_name ?? extNumber,
} : null;
```

---

## 6. Remote Audio Fix (One-way Audio)

In `src/lib/sip/useSip.ts`, attach the remote stream after ICE with a delay:

```ts
setTimeout(() => {
  const connection = session.connection;
  const receivers = connection.getReceivers();
  if (receivers.length > 0) {
    const stream = new MediaStream(receivers.map(r => r.track));
    remoteAudioRef.current.srcObject = stream;
    remoteAudioRef.current.play().catch(() => {});
  }
}, 500);
```

---

## 7. Ringtone Autoplay Fix

In `src/components/softphone/SoftPhone.tsx`, unlock audio on first user interaction:

```ts
useEffect(() => {
  const unlock = () => {
    const audio = new Audio('/sounds/ringing.mp3');
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; })
         .catch(() => {});
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
}, []);
```

**Sound file location:** `public/sounds/ringing.mp3`

---

## 8. WebSocket URL

Use `wss://` (port 8089) NOT `ws://` (port 8088):

| Wrong | Correct |
|-------|---------|
| `ws://192.168.2.222:8088/ws` | `wss://192.168.2.222:8089/ws` |

---

## 9. Common Problems & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| `webrtc: no` after reload | Issabel GUI overwrites config | Use `pjsip_custom_post.conf` loaded last |
| Duplicate endpoint error | `[300]` defined in 2 files | Remove from custom, keep only in `pjsip_additional.conf` |
| PEM key error | key and cert in separate files | Combine: `cat ast.key ast.crt > asterisk.pem` |
| One-way audio (hear caller, they cant hear you reversed) | Remote stream not attached after ICE | Add 500ms delay before `getReceivers()` |
| No ring sound | Autoplay blocked by browser | Unlock on first user click/keypress |
| 404 on ringing.ogg | Wrong filename | Use `ringing.mp3` in `public/sounds/` |
| Call drops immediately | dtls_verify=Yes with self-signed cert | Set `dtls_verify=no` |
| No microphone in LAN | Chrome blocks mic on non-HTTPS | Open app on `localhost` not LAN IP |

---

## 10. Frontend Files Structure

```
src/
  lib/sip/
    sipClient.ts     # JsSIP wrapper class
    useSip.ts        # React hook
  components/softphone/
    SoftPhone.tsx    # Floating softphone UI
public/
  sounds/
    ringing.mp3      # Ringtone
```

---

## 11. Verify Registration

```bash
# Check endpoint is registered (should show Available, not Invalid)
asterisk -rx "pjsip show endpoints" | grep 300

# Enable RTP debug during call
asterisk -rx "rtp set debug on"
tail -f /var/log/asterisk/full | grep -E "RTP|DTLS|ERROR"
```

---

*Generated: WebRTC softphone integration with Issabel 5 / Asterisk 18*
