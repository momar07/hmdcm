import JsSIP from 'jssip';
import { getAudioCtx, getRingBuffer, setRingBuffer } from './audioContext';

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

  // ── Ring audio — uses shared AudioContext from audioContext.ts ─────────
  private _ringSource: AudioBufferSourceNode | null = null;
  private _ringing:    boolean                      = false;

  private _startRinging() {
    this._stopRinging();
    this._ringing = true;

    const play = (buf: AudioBuffer) => {
      if (!this._ringing) return;
      const ctx    = getAudioCtx();               // shared, already unlocked
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop   = true;

      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      source.connect(gain);
      gain.connect(ctx.destination);

      // ctx.state should already be 'running' after unlockAudioCtx()
      if (ctx.state === 'running') {
        source.start(0);
        this._ringSource = source;
        console.log('[SIP] 🔔 Ringing started');
      } else {
        ctx.resume().then(() => {
          if (!this._ringing) { try { source.stop(); } catch (_) {} return; }
          source.start(0);
          this._ringSource = source;
          console.log('[SIP] 🔔 Ringing started (after resume)');
        }).catch(e => console.warn('[SIP] AudioContext resume failed:', e));
      }
    };

    const cached = getRingBuffer();
    if (cached) {
      play(cached);
    } else {
      const ctx = getAudioCtx();
      fetch('/sounds/ringing.mp3')
        .then(r  => r.arrayBuffer())
        .then(arr => ctx.decodeAudioData(arr))
        .then(buf => { setRingBuffer(buf); play(buf); })
        .catch(e  => console.warn('[SIP] Ring fetch failed:', e));
    }
  }

  private _stopRinging() {
    this._ringing = false;
    if (this._ringSource) {
      try { this._ringSource.stop(); } catch (_) {}
      this._ringSource = null;
    }
    console.log('[SIP] 🔕 Ringing stopped');
  }

  connect() {
    if (process.env.NODE_ENV === 'development') {
      JsSIP.debug.enable('JsSIP:*');
    } else {
      JsSIP.debug.disable('JsSIP:*');
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      console.error('[SIP] *** NOT A SECURE CONTEXT ***');
      console.error('[SIP] getUserMedia (microphone) REQUIRES HTTPS or localhost.');
      console.error('[SIP] Current origin:', window.location.origin);
      console.error('[SIP] Any incoming call will FAIL to answer because mic access will be denied.');
      console.error('[SIP] FIX: Access the app via https://localhost:3000 or http://localhost:3000');
    } else {
      console.log('[SIP] Secure context confirmed. Microphone access should work.');
    }

    const socket = new JsSIP.WebSocketInterface(this.config.wsUrl);
    console.log('[SIP] Connecting to:', this.config.wsUrl, 'as', this.config.sipUri);

    this.ua = new JsSIP.UA({
      sockets:        [socket],
      uri:            this.config.sipUri,
      password:       this.config.password,
      display_name:   this.config.displayName,
      register:       true,
      session_timers: false,
    });

    this.ua.on('connecting',        () => { console.log('[SIP] Connecting...'); this.onStatusChange('connecting'); });
    this.ua.on('connected',         () => { console.log('[SIP] Connected to WebSocket'); this.onStatusChange('connecting'); });
    this.ua.on('registered',        () => { console.log('[SIP] ✅ Registered'); this.onStatusChange('registered'); });
    this.ua.on('unregistered',      (e: any) => { console.log('[SIP] Unregistered:', e?.cause); this.onStatusChange('disconnected'); });
    this.ua.on('registrationFailed', (e: any) => {
      console.error('[SIP] ❌ Registration failed:', e.cause, e);
      this.onStatusChange('error');
    });
    this.ua.on('disconnected', (e: any) => {
      console.log('[SIP] Disconnected:', e?.cause || 'unknown');
      this.onStatusChange('disconnected');
    });

    this.ua.on('newRTCSession', (data: any) => {
      const { session, originator } = data;
      console.log('[SIP] newRTCSession — originator:', originator, 'session:', !!session);

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

      session.on('peerconnection', () => {
        const pc = session.connection;
        if (!pc) { console.warn('[SIP] peerconnection event but no PC!'); return; }
        console.log('[SIP] PeerConnection created, ICE state:', pc.iceConnectionState,
          'signaling:', pc.signalingState,
          'connectionState:', pc.connectionState);
        if (pc.remoteDescription?.sdp) {
          console.log('[SIP] Remote SDP (offer):', pc.remoteDescription.sdp.substring(0, 800));
        }
        pc.addEventListener('iceconnectionstatechange', () => {
          console.log('[SIP] ICE state:', pc.iceConnectionState,
            'gathering:', pc.iceGatheringState,
            'signaling:', pc.signalingState);
        });
        pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
          if (e.candidate) {
            console.log('[SIP] ICE candidate:', e.candidate.candidate);
          } else {
            console.log('[SIP] ICE gathering complete (null candidate)');
          }
        });
        pc.addEventListener('icecandidateerror', (e: RTCPeerConnectionIceErrorEvent) => {
          console.error('[SIP] ICE candidate error:', e.errorCode, e.errorText, e.url);
        });
        pc.addEventListener('connectionstatechange', () => {
          console.log('[SIP] PC state:', pc.connectionState);
        });
        pc.addEventListener('negotiationneeded', () => {
          console.log('[SIP] Negotiation needed');
        });
        pc.addEventListener('track', (e: RTCTrackEvent) => {
          console.log('[SIP] Remote track received:', e.track.kind,
            'enabled:', e.track.enabled, 'muted:', e.track.muted);
          this._attachStream(e.streams[0]);
        });
        pc.addEventListener('signalingstatechange', () => {
          console.log('[SIP] Signaling state:', pc.signalingState);
        });
        pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => {
          console.log('[SIP] DataChannel event:', e.channel.label);
        });
        // Monitor for DTLS errors via iceconnectionstatechange failures
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'failed') {
            console.error('[SIP] *** PC connectionState FAILED — RTCPeerConnection failed ***');
            console.error('[SIP] ICE state at failure:', pc.iceConnectionState,
              'signaling:', pc.signalingState);
          } else if (pc.connectionState === 'disconnected') {
            console.warn('[SIP] PC connectionState DISCONNECTED');
          }
        });
      });

      if (originator === 'remote') {
        const from        = session.remote_identity.uri.user;
        const displayName = session.remote_identity.display_name || from;
        this.onIncoming({ from, displayName, session });
        this.onCallStatusChange('incoming');
        this._startRinging();

        session.on('connecting', () => {
          console.log('[SIP] *** INCOMING CALL CONNECTING *** — 200 OK with SDP answer is being sent');
          const pc = session.connection;
          if (pc) {
            console.log('[SIP] PC at connecting — ICE:', pc.iceConnectionState,
              'signaling:', pc.signalingState, 'connection:', pc.connectionState);
            if (pc.localDescription) {
              console.log('[SIP] Local SDP type:', pc.localDescription.type,
                'length:', pc.localDescription.sdp?.length);
            } else {
              console.warn('[SIP] *** NO LOCAL DESCRIPTION at connecting ***');
            }
          } else {
            console.warn('[SIP] *** NO PeerConnection at connecting event ***');
          }
        });
        session.on('accepted', () => {
          console.log('[SIP] Incoming call accepted (200 OK confirmed)');
          this._stopRinging();
          const pc = session.connection;
          if (pc) {
            console.log('[SIP] After accepted — ICE state:', pc.iceConnectionState,
              'signaling:', pc.signalingState,
              'connectionState:', pc.connectionState);
          }
          setTimeout(() => {
            this.onCallStatusChange('active');
            setTimeout(() => this._reattachStream(session), 300);
          }, 300);
        });
        session.on('confirmed', () => {
          console.log('[SIP] Incoming call confirmed (ACK received)');
        });
        session.on('ended',  (e: any) => {
          console.log('[SIP] Call ended, cause:', e.cause, 'originator:', e.originator);
          this._stopRinging();
          this.session = null;
          this.onEndCause('ended');
          this.onCallStatusChange('idle');
        });
        session.on('failed', (e: any) => {
          console.error('[SIP] Call failed — cause:', e.cause, 'originator:', e.originator,
            'status:', (session as any).status,
            'message:', e.message);
          if (e.cause === 'User Denied Media Access') {
            console.error('[SIP] *** MICROPHONE PERMISSION DENIED ***');
          }
          this._stopRinging();
          this.session = null;
          this.onEndCause(e?.cause ?? 'failed');
          this.onCallStatusChange('idle');
        });
      } else {
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
    console.log('[SIP] disconnect() called');
    this._stopRinging();
    const audio = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (audio) { audio.srcObject = null; }

    if (this.ua) {
      try {
        // Unregister first, then stop
        this.ua.unregister({ all: true });
      } catch (_) {}
      try {
        this.ua.stop();
      } catch (_) {}
      // Force close underlying WebSocket if it exists
      const socket = (this.ua as any)._socket;
      if (socket) {
        try { socket.close(); } catch (_) {}
      }
    }
    this.ua = null;
    this.session = null;
    this.onStatusChange('disconnected');
  }

  call(target: string) {
    if (!this.ua || !target) return;
    const domain = this.config.sipUri.split('@')[1];
    this.ua.call(`sip:${target}@${domain}`, {
      mediaConstraints: { audio: true, video: false },
    });
  }

  answer() {
    if (!this.session) {
      console.warn('[SIP] Cannot answer — no session exists');
      return;
    }

    const sessionStatus = (this.session as any).status;
    console.log('[SIP] answer() called — session status:', sessionStatus);

    if (sessionStatus !== undefined && sessionStatus !== 3 && sessionStatus !== 4) {
      console.warn('[SIP] Cannot answer — invalid session status:', sessionStatus);
      return;
    }

    try {
      console.log('[SIP] Calling session.answer()...');
      this.session.answer({
        mediaConstraints: { audio: true, video: false },
      });
      console.log('[SIP] session.answer() called successfully');
    } catch (err: any) {
      console.error('[SIP] session.answer() threw exception:', err?.message || err);
      this.session = null;
      this.onCallStatusChange('idle');
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

    // Override ended/failed to clear the fallback timer
    const origEnded  = sess._events?.ended;
    const origFailed = sess._events?.failed;

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
