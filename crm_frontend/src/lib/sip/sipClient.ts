import JsSIP from 'jssip';

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

export class SipClient {
  private ua:      JsSIP.UA | null = null;
  private session: any             = null;
  private config:  SipConfig;

  private onStatusChange:     StatusCb;
  private onCallStatusChange: CallStatusCb;
  private onIncoming:         IncomingCb;

  constructor(
    config:             SipConfig,
    onStatusChange:     StatusCb,
    onCallStatusChange: CallStatusCb,
    onIncoming:         IncomingCb,
  ) {
    this.config             = config;
    this.onStatusChange     = onStatusChange;
    this.onCallStatusChange = onCallStatusChange;
    this.onIncoming         = onIncoming;
  }

  private _ringAudio: HTMLAudioElement | null = null;

  private _startRinging() {
    if (this._ringAudio) return;
    const audio    = new Audio('/sounds/ringing.ogg');
    audio.loop     = true;
    audio.volume   = 0.7;
    audio.play().catch(e => console.warn('[SIP] Ring audio blocked:', e));
    this._ringAudio = audio;
  }

  private _stopRinging() {
    if (!this._ringAudio) return;
    this._ringAudio.pause();
    this._ringAudio.currentTime = 0;
    this._ringAudio = null;
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
        const from        = session.remote_identity.uri.user;
        const displayName = session.remote_identity.display_name || from;
        this.onIncoming({ from, displayName, session });
        this.onCallStatusChange('incoming');
        this._startRinging();

        session.on('accepted', () => {
          console.log('[SIP] Incoming call accepted');
          this._stopRinging();
          this.onCallStatusChange('active');
          setTimeout(() => this._reattachStream(session), 500);
        });
        session.on('ended',  () => {
          this._stopRinging();
          this.session = null;
          this.onCallStatusChange('idle');
        });
        session.on('failed', (e: any) => {
          console.error('[SIP] Call failed:', e.cause);
          this._stopRinging();
          this.session = null;
          this.onCallStatusChange('idle');
        });
      } else {
        this.onCallStatusChange('ringing');
        session.on('progress',  () => this.onCallStatusChange('ringing'));
        session.on('accepted',  () => {
          this.onCallStatusChange('active');
          setTimeout(() => this._reattachStream(session), 500);
        });
        session.on('ended',  () => { this.session = null; this.onCallStatusChange('idle'); });
        session.on('failed', () => { this.session = null; this.onCallStatusChange('idle'); });
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
    if (!this.session) return;
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

  hangup() {
    this._stopRinging();
    try { this.session?.terminate(); } catch (_) {}
    this.session = null;
    const audio = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (audio) { audio.srcObject = null; }
    this.onCallStatusChange('idle');
  }

  mute(enable: boolean)  { enable ? this.session?.mute()   : this.session?.unmute();  }
  hold(enable: boolean)  {
    enable ? this.session?.hold() : this.session?.unhold();
    this.onCallStatusChange(enable ? 'holding' : 'active');
  }
  sendDtmf(tone: string) { this.session?.sendDTMF(tone); }
  getSession()           { return this.session; }
}
