/**
 * Shared AudioContext + HTML Audio fallback for ringtone.
 *
 * Chrome only allows AudioContext to play after a user gesture.
 * We use BOTH AudioContext (primary) and an HTML <audio> element (fallback)
 * to ensure the ringtone always plays.
 */

let _ctx: AudioContext | null = null;
let _ringBuffer: AudioBuffer | null = null;
let _unlocked = false;
let _ringAudio: HTMLAudioElement | null = null;

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

/**
 * Get or create the HTML <audio> fallback element for ringtone.
 * This is more reliable than AudioContext for simple playback.
 */
function getRingAudio(): HTMLAudioElement {
  if (!_ringAudio) {
    _ringAudio = document.getElementById('ringtone-audio') as HTMLAudioElement;
    if (!_ringAudio) {
      _ringAudio = document.createElement('audio');
      _ringAudio.id = 'ringtone-audio';
      _ringAudio.src = '/sounds/ringing.mp3';
      _ringAudio.loop = true;
      _ringAudio.preload = 'auto';
      _ringAudio.volume = 0.7;
      document.body.appendChild(_ringAudio);
      console.log('[Audio] 🔔 Created HTML ringtone element');
    }
  }
  return _ringAudio;
}

/**
 * Start ringtone using HTML <audio> fallback.
 * This is called by SipClient when AudioContext might not be ready.
 */
export function startRingtone(): void {
  stopRingtone();
  const audio = getRingAudio();
  audio.currentTime = 0;
  audio.play().then(() => {
    console.log('[Audio] 🔔 Ringtone started (HTML audio)');
  }).catch(e => {
    console.warn('[Audio] Ringtone play failed:', e);
    // Try unlocking context and retry
    unlockAudioCtx();
    setTimeout(() => {
      audio.play().catch(e2 => console.warn('[Audio] Ringtone retry failed:', e2));
    }, 100);
  });
}

/**
 * Stop ringtone.
 */
export function stopRingtone(): void {
  if (_ringAudio) {
    _ringAudio.pause();
    _ringAudio.currentTime = 0;
    console.log('[Audio] 🔕 Ringtone stopped');
  }
}

/** Returns cached ring buffer (or null if not ready yet) */
export function getRingBuffer(): AudioBuffer | null {
  return _ringBuffer;
}

/** Store ring buffer externally (used by sipClient after fetch) */
export function setRingBuffer(buf: AudioBuffer): void {
  _ringBuffer = buf;
}
