'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Phone, PhoneOff, X, User } from 'lucide-react';
import { useCallStore }  from '@/store';
import { useSipStore }   from '@/store/sipStore';
import { useRouter }     from 'next/navigation';

export function IncomingCallPopup() {
  const { incomingCall, clearIncoming } = useCallStore();
  const { actions, callStatus }         = useSipStore();
  const router = useRouter();

  const [visible,   setVisible]   = useState(false);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const handleDismiss = useCallback(() => {
    clearCount(); stopRing(); setVisible(false); clearIncoming();
  }, [clearCount, stopRing, clearIncoming]);

  const handleAnswer = useCallback(() => {
    clearCount(); stopRing();

    if (!incomingCall?.customer_id) {
      // ── Unknown caller ──────────────────────────────────────────
      // Do NOT answer the SIP session — just terminate it cleanly,
      // then open the new-customer form with the caller number & call uniqueid.
      // The agent will create the customer, the call record will be linked,
      // and the disposition modal will appear after page load.
      try { actions?.hangup?.(); } catch (_) {}
      const caller   = incomingCall?.caller   || '';
      const uniqueid = incomingCall?.uniqueid  || '';
      clearIncoming();
      router.push(
        `/customers/new?phone=${encodeURIComponent(caller)}&uniqueid=${encodeURIComponent(uniqueid)}`
      );
    } else {
      // ── Known customer ───────────────────────────────────────────
      // Answer the SIP session normally; navigation happens via
      // the callStatus='active' useEffect once Asterisk confirms.
      actions?.answer();
    }
  }, [clearCount, stopRing, actions, incomingCall, clearIncoming, router]);

  useEffect(() => {
    if (callStatus === 'incoming') {
      setVisible(true);
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
      clearCount(); stopRing(); setVisible(false);
      if (incomingCall?.customer_id) router.push(`/customers/${incomingCall.customer_id}`);
      clearIncoming();
    }
    if (callStatus === 'idle') {
      clearCount(); stopRing(); setVisible(false);
    }
  }, [callStatus]);

  if (!visible) return null;

  const callerName   = incomingCall?.customer_name ?? incomingCall?.caller ?? 'Unknown Caller';
  const callerPhone  = incomingCall?.caller ?? '';
  const callerCompany = incomingCall?.customer_company ?? null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden
                      border border-gray-100">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <p className="text-xs text-gray-400 font-medium tracking-wide">
            Incoming Call
          </p>
          <button
            onClick={handleDismiss}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Caller info */}
        <div className="flex items-center gap-4 px-5 py-3">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center
                          justify-center shrink-0 border border-gray-200">
            <User size={26} className="text-gray-400" />
          </div>

          {/* Name + phone */}
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-gray-900 truncate leading-tight">
              {callerName}
            </p>
            {callerPhone && callerPhone !== callerName && (
              <p className="text-sm text-gray-400 mt-0.5">
                Mobile&nbsp; {callerPhone}
              </p>
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

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-4 px-5 pb-5 pt-2">
          {/* Reject */}
          <button
            onClick={handleDismiss}
            className="w-13 h-13 w-12 h-12 rounded-full bg-red-500 hover:bg-red-600
                       flex items-center justify-center shadow-md
                       transition-all active:scale-95"
            title="Reject"
          >
            <PhoneOff size={20} className="text-white" />
          </button>

          {/* Answer */}
          <button
            onClick={handleAnswer}
            className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600
                       flex items-center justify-center shadow-md
                       transition-all active:scale-95"
            title="Answer"
          >
            <Phone size={20} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
