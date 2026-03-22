'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff,
  PauseCircle, PlayCircle, PhoneForwarded, X, User,
} from 'lucide-react';
import { useCallStore }  from '@/store';
import { useSipStore }   from '@/store/sipStore';
import { useRouter }     from 'next/navigation';

/* ─────────────────────────────────────────────────────────
   Transfer Modal — simple blind transfer via DTMF / Refer
───────────────────────────────────────────────────────── */
function TransferModal({
  onTransfer,
  onClose,
}: { onTransfer: (ext: string) => void; onClose: () => void }) {
  const [ext, setExt] = useState('');
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-72 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Transfer to Extension</p>
          <input
            autoFocus
            type="tel"
            placeholder="e.g. 200"
            value={ext}
            onChange={e => setExt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ext && onTransfer(ext)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5
                       text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-gray-200
                         text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={!ext}
              onClick={() => ext && onTransfer(ext)}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700
                         disabled:bg-gray-200 text-white text-sm font-semibold"
            >
              Transfer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────── */
export function IncomingCallPopup() {
  const { incomingCall, clearIncoming } = useCallStore();
  const {
    actions, callStatus,
    isMuted, isOnHold, callTimer,
  } = useSipStore();
  const router = useRouter();

  const [visible,      setVisible]      = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* helpers */
  const clearCount = useCallback(() => {
    if (countRef.current) { clearInterval(countRef.current); countRef.current = null; }
  }, []);

  const stopRing = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  /* format mm:ss */
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  /* ── Reject ───────────────────────────────────────────── */
  const handleDismiss = useCallback(() => {
    clearCount(); stopRing(); setVisible(false); clearIncoming();
  }, [clearCount, stopRing, clearIncoming]);

  /* ── Answer ───────────────────────────────────────────── */
  const handleAnswer = useCallback(() => {
    clearCount(); stopRing();

    if (!incomingCall?.customer_id) {
      // Unknown caller — answer SIP first, then go to new-customer form
      actions?.answer();
      const caller   = incomingCall?.caller   || '';
      const uniqueid = incomingCall?.uniqueid  || '';
      setTimeout(() => {
        setVisible(false);
        router.push(
          `/customers/new?phone=${encodeURIComponent(caller)}&uniqueid=${encodeURIComponent(uniqueid)}`
        );
      }, 300);
    } else {
      actions?.answer();
      // UI expands to call-control — navigation via callStatus='active' effect
    }
  }, [clearCount, stopRing, actions, incomingCall, router]);

  /* ── Transfer ─────────────────────────────────────────── */
  const handleTransfer = useCallback((ext: string) => {
    // Blind transfer via DTMF *2 + extension (Asterisk feature code)
    // or use session.refer() if supported
    const session = (actions as any)?.getSession?.();
    if (session?.refer) {
      const domain = session.remote_identity?.uri?.host || '192.168.2.222';
      session.refer(`sip:${ext}@${domain}`);
    } else {
      // fallback: DTMF
      actions?.hangup?.();
    }
    setShowTransfer(false);
    setVisible(false);
    clearIncoming();
  }, [actions, clearIncoming]);

  /* ── React to callStatus ──────────────────────────────── */
  useEffect(() => {
    if (callStatus === 'incoming') {
      if (incomingCall) setVisible(true);
      try {
        const audio = new Audio('/sounds/ringing.mp3');
        audio.loop = true; audio.volume = 0.7;
        audio.play().catch(() => {});
        audioRef.current = audio;
      } catch {}
      clearCount();
      countRef.current = setInterval(() => {}, 1000);
      return () => { clearCount(); stopRing(); };
    }

    if (callStatus === 'active') {
      clearCount(); stopRing();
      setVisible(true); // stay visible as call-control
      if (incomingCall?.customer_id) {
        router.push(`/customers/${incomingCall.customer_id}`);
      }
    }

    if (callStatus === 'idle') {
      clearCount(); stopRing(); setVisible(false);
      // clearIncoming handled by layout after disposition modal
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  if (!visible) return null;

  const callerName    = incomingCall?.customer_name ?? incomingCall?.caller ?? 'Unknown Caller';
  const callerPhone   = incomingCall?.caller ?? '';
  const callerCompany = incomingCall?.customer_company ?? null;
  const isActive      = callStatus === 'active' || callStatus === 'holding';

  /* ════════════════════════════════════════════════════════
     INCOMING state — compact card (answer / reject)
  ════════════════════════════════════════════════════════ */
  if (!isActive) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
        <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden
                        border border-gray-100">
          {/* top bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-1">
            <p className="text-xs text-gray-400 font-medium tracking-wide">
              Incoming Call
            </p>
            <button onClick={handleDismiss}
                    className="text-gray-300 hover:text-gray-500 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* caller info */}
          <div className="flex items-center gap-4 px-5 py-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center
                            justify-center shrink-0 border border-gray-200">
              <User size={26} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-gray-900 truncate leading-tight">
                {callerName}
              </p>
              {callerPhone && callerPhone !== callerName && (
                <p className="text-sm text-gray-400 mt-0.5">Mobile&nbsp; {callerPhone}</p>
              )}
              {callerCompany && (
                <p className="text-xs text-gray-400 truncate">{callerCompany}</p>
              )}
              {incomingCall?.queue && (
                <p className="text-xs text-gray-400">
                  Queue <span className="font-medium text-gray-600">{incomingCall.queue}</span>
                </p>
              )}
            </div>
          </div>

          {/* actions */}
          <div className="flex items-center justify-end gap-4 px-5 pb-5 pt-2">
            <button onClick={handleDismiss}
                    className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600
                               flex items-center justify-center shadow-md
                               transition-all active:scale-95"
                    title="Reject">
              <PhoneOff size={20} className="text-white" />
            </button>
            <button onClick={handleAnswer}
                    className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600
                               flex items-center justify-center shadow-md
                               transition-all active:scale-95"
                    title="Answer">
              <Phone size={20} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     ACTIVE / HOLDING state — expanded call control
  ════════════════════════════════════════════════════════ */
  return (
    <>
      {showTransfer && (
        <TransferModal
          onTransfer={handleTransfer}
          onClose={() => setShowTransfer(false)}
        />
      )}

      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-96 overflow-hidden
                        border border-gray-100">

          {/* Header — green when active, yellow when holding */}
          <div className={`px-5 py-3 flex items-center justify-between
            ${isOnHold ? 'bg-yellow-500' : 'bg-green-600'}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm truncate max-w-[180px]">
                  {callerName}
                </p>
                {callerPhone && callerPhone !== callerName && (
                  <p className="text-white/70 text-xs">{callerPhone}</p>
                )}
              </div>
            </div>
            {/* Timer */}
            <div className="text-right">
              <p className="text-white font-mono font-bold text-lg">{fmt(callTimer)}</p>
              <p className="text-white/70 text-xs">
                {isOnHold ? '⏸ On Hold' : '🔴 In Call'}
              </p>
            </div>
          </div>

          {/* Queue / Company info */}
          {(callerCompany || incomingCall?.queue) && (
            <div className="px-5 py-2 bg-gray-50 border-b border-gray-100
                            flex items-center gap-3 text-xs text-gray-500">
              {callerCompany && <span>🏢 {callerCompany}</span>}
              {incomingCall?.queue && (
                <span>Queue <span className="font-medium text-gray-700">{incomingCall.queue}</span></span>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="p-5 space-y-3">
            {/* Row 1: Mute | Hold | Transfer */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => actions?.toggleMute?.()}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl
                            text-xs font-medium transition-all
                            ${isMuted
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {isMuted
                  ? <><MicOff size={18} /><span>Unmute</span></>
                  : <><Mic    size={18} /><span>Mute</span></>}
              </button>

              <button
                onClick={() => actions?.toggleHold?.()}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl
                            text-xs font-medium transition-all
                            ${isOnHold
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {isOnHold
                  ? <><PlayCircle  size={18} /><span>Resume</span></>
                  : <><PauseCircle size={18} /><span>Hold</span></>}
              </button>

              <button
                onClick={() => setShowTransfer(true)}
                className="flex flex-col items-center gap-1 py-3 rounded-xl
                           bg-blue-50 text-blue-700 hover:bg-blue-100
                           text-xs font-medium transition-all"
              >
                <PhoneForwarded size={18} />
                <span>Transfer</span>
              </button>
            </div>

            {/* Row 2: End Call */}
            <button
              onClick={() => {
                // hangup() sends SIP BYE to Asterisk — visible state
                // will be set to false automatically when callStatus → idle
                actions?.hangup?.();
              }}
              className="w-full flex items-center justify-center gap-2
                         bg-red-500 hover:bg-red-600 active:scale-95
                         text-white rounded-xl py-3
                         text-sm font-semibold transition-all shadow-sm"
            >
              <PhoneOff size={18} />
              End Call
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
