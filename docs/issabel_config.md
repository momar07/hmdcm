# Issabel PBX Configuration — WebRTC Extensions

## Extension 300 (WebRTC Agent Phone)

Go to **IssabelPBX GUI → Extensions → 300 → Advanced Settings / PJSIP Settings**:

| Setting | Current (Broken) | Change To |
|---------|------------------|-----------|
| `max_contacts` | 1 | 5 |
| `remove_existing` | no | yes |
| `remove_unavailable` | no | yes |
| `webrtc` | no | yes |
| `force_rport` | no | yes |
| `rewrite_contact` | no | yes |

> **Note:** The `webrtc=yes` flag auto-enables: `ice_support`, `avpf`, `rtcp_mux`, `media_encryption=dtls`, `force_rport`, `rewrite_contact`. These should already be on, but confirm them.

---

## Extension 400 (WebRTC Agent Phone — if used)

Same settings as 300:

| Setting | Current (Broken) | Change To |
|---------|------------------|-----------|
| `max_contacts` | 1 | 5 |
| `remove_existing` | no | yes |
| `remove_unavailable` | no | yes |
| `webrtc` | no | yes |
| `force_rport` | no | yes |
| `rewrite_contact` | no | yes |

---

## After Making Changes

1. Click **Submit** in Issabel GUI
2. Click **Apply Config** (top bar)
3. Verify in Asterisk CLI:
   ```bash
   asterisk -rx "pjsip show endpoint 300"
   asterisk -rx "pjsip show aor 300"
   ```
4. Confirm `max_contacts=5` and `webrtc=yes` appear in the output
