'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Phone, PhoneOff, User, Briefcase, Tag, ExternalLink } from 'lucide-react';
import { useCallStore }  from '@/store';
import { useSipStore }   from '@/store/sipStore';
import { useRouter }     from 'next/navigation';

export function IncomingCallPopup() {
  const { incomingCall, clearIncoming } = useCallStore();
  const { actions, callStatus }         = useSipStore();
  const router = useRouter();

  const [visible,   setVisible]   = useState(false);
  const [countdown, setCountdown] = useState(30);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const clearCount = useCallback(() => {
    if (countRef.current) {
      clearInterval(countRef.current);
      countRef.current = null;
    }
  }, []);

  const stopRing = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const handleDismiss = useCallback(() => {
    clearCount();
    stopRing();
    setVisible(false);
    clearIncoming();
  }, [clearCount, stopRing, clearIncoming]);

  const handleAnswer = useCallback(() => {
    clearCount();
    stopRing();
    actions?.answer();
    if (!incomingCall?.customer_id) {
      clearIncoming();
    }
  }, [clearCount, stopRing, actions, incomingCall, clearIncoming]);

  // PRIMARY TRIGGER — JsSIP callStatus goes to 'incoming'
  // This fires reliably on every ring regardless of WS event timing
  useEffect(() => {
    if (callStatus === 'incoming') {
      setVisible(true);
      setCountdown(30);

      // ring sound
      try {
        const audio = new Audio('/sounds/ringing.mp3');
        audio.loop  = true;
        audio.volume = 0.7;
        audio.play().catch(() => {});
        audioRef.current = audio;
      } catch {}

      // countdown — use setTimeout chain to avoid render-phase setState
      clearCount();
      const tick = () => {
        setCountdown(c => {
          if (c <= 1) {
            // schedule dismiss outside render
            setTimeout(handleDismiss, 0);
            return 0;
          }
          return c - 1;
        });
      };
      countRef.current = setInterval(tick, 1000);

      return () => { clearCount(); stopRing(); };
    }

    // Call became active (answered)
    if (callStatus === 'active') {
      clearCount();
      stopRing();
      setVisible(false);
      if (incomingCall?.customer_id) {
        router.push(`/customers/${incomingCall.customer_id}`);
      }
      clearIncoming();
    }

    // Call ended/failed/idle — hide popup
    if (callStatus === 'idle') {
      clearCount();
      stopRing();
      setVisible(false);
    }
  }, [callStatus]);

  if (!visible) return null;

  const isInbound = !incomingCall?.direction || incomingCall.direction === 'inbound';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
           onClick={handleDismiss} />

      <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl
                      shadow-2xl border border-gray-100 w-88 max-w-[calc(100vw-3rem)]
                      overflow-hidden animate-slide-up">

        {/* Header */}
        <div className={`px-5 py-4 flex items-center gap-3
                         ${isInbound ? 'bg-green-500' : 'bg-blue-500'}`}>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Phone size={18} className="text-white animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 uppercase tracking-wide font-medium">
              {isInbound ? '\u2199 Incoming Call' : '\u2197 Outgoing Call'}
            </p>
            <p className="font-bold text-white text-lg truncate">
              {incomingCall?.caller ?? 'Unknown'}
            </p>
          </div>
          <div className="shrink-0 w-9 h-9 rounded-full border-2 border-white/40
                          flex items-center justify-center">
            <span className="text-white text-sm font-bold">{countdown}</span>
          </div>
        </div>

        {/* Customer info */}
        <div className="px-5 py-4 space-y-3">
          {incomingCall?.customer_name ? (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center
                              justify-center shrink-0 mt-0.5">
                <User size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{incomingCall.customer_name}</p>
                {incomingCall.customer_phone && (
                  <p className="text-xs text-gray-400 font-mono">{incomingCall.customer_phone}</p>
                )}
              </div>
              {incomingCall.customer_id && (
                <button
                  onClick={() => router.push(`/customers/${incomingCall.customer_id!}`)}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100
                             text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <User size={16} className="text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-500">
                  {incomingCall?.caller ? incomingCall.caller : 'Incoming Call'}
                </p>
                <p className="text-xs text-gray-400">Unknown Caller</p>
              </div>
            </div>
          )}

          {incomingCall?.customer_company && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Briefcase size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{incomingCall.customer_company}</span>
            </div>
          )}

          {incomingCall?.lead_title && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Tag size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{incomingCall.lead_title}</span>
            </div>
          )}

          {incomingCall?.queue && (
            <p className="text-xs text-gray-400">
              Queue: <span className="text-gray-600 font-medium">{incomingCall.queue}</span>
            </p>
          )}
        </div>

        {/* Answer / Reject */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 flex items-center justify-center gap-2
                       bg-red-100 hover:bg-red-200 text-red-700
                       rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            <PhoneOff size={16} /> Reject
          </button>
          <button
            onClick={handleAnswer}
            className="flex-1 flex items-center justify-center gap-2
                       bg-green-500 hover:bg-green-600 text-white
                       rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            <Phone size={16} /> Answer
          </button>
        </div>
      </div>
    </>
  );
}
