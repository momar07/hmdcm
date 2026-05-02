import JsSIP from 'jssip';
import { getAudioCtx, getRingBuffer, setRingBuffer, startRingtone, stopRingtone } from './audioContext';

export type SipStatus = 'disconnected' | 'connecting' | 'registered' | 'error';
export type CallStatus = 'idle' | 'ringing' | 'incoming' | 'active' | 'holding';

export interface SipConfig {
  wsUrl:       string;
  sipUri:      string;
  password:    string;
  displayName: string;
}

export interface IncomingCallInfo {
  from:        string;
  displayName: string;
  session:     any;
}

type StatusCb     = (s: SipStatus) => void;
type CallStatusCb = (s: CallStatus) => void;
type IncomingCb   = (info: IncomingCallInfo) => void;
type EndCauseCb   = (cause: string) => void;

export class SipClient {
  private ua:      JsSIP.UA | null = null;
  private session: any             = null;
  private config:  SipConfig;

  private onStatusChange:     StatusCb;
  private onCallStatusChange: CallStatusCb;
  private onIncoming:         IncomingCb;
  private onEndCause:         EndCauseCb;

  constructor(
    config:             SipConfig,
    onStatusChange:     StatusCb,
    onCallStatusChange: CallStatusCb,
    onIncoming:         IncomingCb,
    onEndCause:         EndCauseCb,
  ) {
    this.config             = config;
    this.onStatusChange     = onStatusChange;
    this.onCallStatusChange = onCallStatusChange;
    this.onIncoming         = onIncoming;
    this.onEndCause         = onEndCause;
  }

  // ── Ring audio — uses HTML <audio> fallback for reliability ─────────
  private _ringing: boolean = false;

  private _startRinging() {
    this._stopRinging();
    this._ringing = true;
    console.log('[SIP] 🔔 Starting ringtone...');
    startRingtone();
  }

  private _stopRinging() {
    this._ringing = false;
    stopRingtone();
    console.log('[SIP] 🔕 Ringing stopped');
  }

  connect() {
    JsSIP.debug.disable('JsSIP:*');

    const socket = new JsSIP.WebSocketInterface(this.config.wsUrl);

    this.ua = new JsSIP.UA({
      sockets:        [socket],
      uri:            this.config.sipUri,
      password:       this.config.password,
      display_name:   this.config.displayName,
      register:       true,
      session_timers: false,
    });

    this.ua.on('connecting',        () => this.onStatusChange('connecting'));
    this.ua.on('connected',         () => this.onStatusChange('connecting'));
    this.ua.on('registered',        () => this.onStatusChange('registered'));
    this.ua.on('unregistered',      () => this.onStatusChange('disconnected'));
    this.ua.on('registrationFailed', (e: any) => {
      console.error('[SIP] Registration failed:', e.cause);
      this.onStatusChange('error');
    });
    this.ua.on('disconnected', () => this.onStatusChange('disconnected'));

    this.ua.on('newRTCSession', (data: any) => {
      const { session, originator } = data;
      console.log('[SIP] newRTCSession — originator:', originator, 'session:', session);

      // If there's already a pending/active session, terminate it cleanly
      // before accepting the new one (handles re-queue re-ring scenario)
      if (this.session && this.session !== session) {
        try {
          this._stopRinging();
          this.session.terminate();
        } catch (_) {}
        this.session = null;
        this.onCallStatusChange('idle');
      }

      this.session = session;

      // Attach remote audio as soon as track arrives
      session.connection?.addEventListener('track', (e: RTCTrackEvent) => {
        console.log('[SIP] Remote track received:', e.track.kind);
        this._attachStream(e.streams[0]);
      });

      // Also watch for connection state changes
      session.connection?.addEventListener('connectionstatechange', () => {
        console.log('[SIP] PC state:', session.connection?.connectionState);
      });

      session.connection?.addEventListener('iceconnectionstatechange', () => {
        console.log('[SIP] ICE state:', session.connection?.iceConnectionState);
      });

      if (originator === 'remote') {
        // ── INCOMING CALL ──
        const from        = session.remote_identity.uri.user;
        const displayName = session.remote_identity.display_name || from;
        console.log('[SIP] Incoming call from:', from, 'display:', displayName);

        this.onIncoming({ from, displayName, session });
        this.onCallStatusChange('incoming');
        this._startRinging();

        session.on('accepted', () => {
          console.log('[SIP] Incoming call accepted');
          this._stopRinging();
          // Short delay for DTLS negotiation before marking active
          setTimeout(() => {
            this.onCallStatusChange('active');
            setTimeout(() => this._reattachStream(session), 300);
          }, 300);
        });
        session.on('ended',  (e: any) => {
          console.log('[SIP] Incoming call ended');
          this._stopRinging();
          this.session = null;
          this.onEndCause('ended');
          this.onCallStatusChange('idle');
        });
        session.on('failed', (e: any) => {
          console.error('[SIP] Incoming call failed:', e.cause);
          this._stopRinging();
          this.session = null;
          this.onEndCause(e?.cause ?? 'failed');
          this.onCallStatusChange('idle');
        });
      } else {
        // ── OUTGOING CALL ──
        this.onCallStatusChange('ringing');
        session.on('progress',  () => this.onCallStatusChange('ringing'));
        session.on('accepted',  () => {
          this.onCallStatusChange('active');
          setTimeout(() => this._reattachStream(session), 500);
        });
        session.on('ended',  (e: any) => {
          this.session = null;
          this.onEndCause('ended');
          this.onCallStatusChange('idle');
        });
        session.on('failed', (e: any) => {
          this.session = null;
          this.onEndCause(e?.cause ?? 'failed');
          this.onCallStatusChange('idle');
        });
      }
    });

    this.ua.start();
  }

  private _getOrCreateAudio(): HTMLAudioElement {
    let audio = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (!audio) {
      audio          = document.createElement('audio');
      audio.id       = 'sip-remote-audio';
      audio.autoplay = true;
      document.body.appendChild(audio);
      console.log('[SIP] Created remote audio element');
    }
    return audio;
  }

  private _attachStream(stream: MediaStream | undefined) {
    if (!stream) return;
    const audio = this._getOrCreateAudio();
    audio.srcObject = stream;
    audio.play().catch(e => console.warn('[SIP] Audio play failed:', e));
    console.log('[SIP] Remote stream attached, tracks:', stream.getTracks().length);
  }

  private _reattachStream(session: any) {
    const receivers = session.connection?.getReceivers?.() ?? [];
    console.log('[SIP] Reattach — receivers:', receivers.length);
    const streams: MediaStream[] = [];
    session.connection?.getRemoteStreams?.()?.forEach((s: MediaStream) => streams.push(s));
    if (streams.length > 0) {
      this._attachStream(streams[0]);
    } else if (receivers.length > 0) {
      const stream = new MediaStream(receivers.map((r: RTCRtpReceiver) => r.track));
      this._attachStream(stream);
    }
  }

  disconnect() {
    const audio = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (audio) { audio.srcObject = null; }
    this.ua?.stop();
    this.ua = null;
    this.onStatusChange('disconnected');
  }

  call(target: string) {
    if (!this.ua || !target) return;
    const domain = this.config.sipUri.split('@')[1];
    this.ua.call(`sip:${target}@${domain}`, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });
  }

  answer() {
    if (!this.session) {
      console.warn('[SIP] Cannot answer — no session');
      return;
    }

    const sessionStatus = (this.session as any).status;
    console.log('[SIP] answer() called — session status:', sessionStatus);

    // JsSIP session statuses:
    // 1 = STATUS_NULL
    // 2 = STATUS_INVITE_SENT
    // 3 = STATUS_INVITE_RECEIVED (waiting for answer)
    // 4 = STATUS_WAITING_FOR_ANSWER
    // 5 = STATUS_ANSWERED
    // 6 = STATUS_WAITING_FOR_ACK
    // 7 = STATUS_CONFIRMED
    // 8 = STATUS_TERMINATED
    //
    // For incoming calls, we can answer if status is 3, 4, or even 1 (early)
    // Remove the strict guard — let JsSIP handle invalid states internally
    if (sessionStatus === 8 || sessionStatus === 5) {
      console.warn('[SIP] Session already answered or terminated, cannot answer');
      return;
    }

    try {
      this.session.answer({
        mediaConstraints: { audio: true, video: false },
        pcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });
      console.log('[SIP] answer() called successfully');
    } catch (e) {
      console.error('[SIP] answer() failed:', e);
    }
  }

  hangup() {
    this._stopRinging();
    const audio = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (audio) { audio.srcObject = null; }

    if (!this.session) {
      this.onCallStatusChange('idle');
      return;
    }

    const sess = this.session;
    const s    = (sess as any).status;
    console.log('[SIP] hangup() called — session status:', s);

    // Fallback: if session.on("ended") doesn't fire within 3s, force idle
    const fallbackTimer = setTimeout(() => {
      console.warn('[SIP] hangup fallback triggered — session ended event never fired');
      this.session = null;
      this.onCallStatusChange('idle');
    }, 3000);

    sess.once('ended', () => {
      console.log('[SIP] session.ended fired after hangup ✅');
      clearTimeout(fallbackTimer);
      this.session = null;
      this.onCallStatusChange('idle');
    });

    sess.once('failed', () => {
      console.log('[SIP] session.failed fired after hangup');
      clearTimeout(fallbackTimer);
      this.session = null;
      this.onCallStatusChange('idle');
    });

    try {
      if (s === 9 || s === 6) {
        sess.terminate();
      } else if (s === 3 || s === 4) {
        sess.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
      } else {
        sess.terminate();
      }
    } catch (e) {
      console.warn('[SIP] hangup error:', e);
      clearTimeout(fallbackTimer);
      this.session = null;
      this.onCallStatusChange('idle');
    }
  }

  mute(enable: boolean)  { enable ? this.session?.mute()   : this.session?.unmute();  }
  hold(enable: boolean)  {
    enable ? this.session?.hold() : this.session?.unhold();
    this.onCallStatusChange(enable ? 'holding' : 'active');
  }
  sendDtmf(tone: string) { this.session?.sendDTMF(tone); }
  getSession()           { return this.session; }
}
