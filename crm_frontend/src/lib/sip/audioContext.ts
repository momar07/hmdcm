/**
 * Shared AudioContext singleton.
 *
 * Chrome only allows AudioContext to play after a user gesture.
 * We create ONE context, resume it on the first user interaction,
 * and reuse it everywhere (sipClient ring, etc.).
 */

let _ctx: AudioContext | null = null;
let _ringBuffer: AudioBuffer | null = null;
let _unlocked = false;

/** Returns (or creates) the shared AudioContext */
export function getAudioCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return _ctx;
}

/**
 * Call once on first user gesture (click / keydown / touchend).
 * Resumes the shared context so later programmatic play() calls work.
 */
export function unlockAudioCtx(): void {
  if (_unlocked) return;
  try {
    const ctx = getAudioCtx();
    ctx.resume().then(() => {
      _unlocked = true;
      console.log('[Audio] ✅ AudioContext unlocked, state:', ctx.state);
      // Pre-fetch ring buffer so first ring is instant
      if (!_ringBuffer) {
        fetch('/sounds/ringing.mp3')
          .then(r => r.arrayBuffer())
          .then(arr => ctx.decodeAudioData(arr))
          .then(buf => {
            _ringBuffer = buf;
            console.log('[Audio] 🎵 Ring buffer cached');
          })
          .catch(e => console.warn('[Audio] Ring preload failed:', e));
      }
    }).catch(() => {});
  } catch {}
}

/** Returns cached ring buffer (or null if not ready yet) */
export function getRingBuffer(): AudioBuffer | null {
  return _ringBuffer;
}

/** Store ring buffer externally (used by sipClient after fetch) */
export function setRingBuffer(buf: AudioBuffer): void {
  _ringBuffer = buf;
}
