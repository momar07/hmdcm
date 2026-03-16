'use client';

import { useEffect, useRef } from 'react';
import { useRouter }         from 'next/navigation';
import { PhoneCall, PhoneOff, UserCircle, X } from 'lucide-react';
import { useCallStore }      from '@/store';

export function IncomingCallPopup() {
  const { incomingCall, clearIncoming } = useCallStore();
  const router   = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* Play ringtone while popup is visible */
  useEffect(() => {
    if (incomingCall) {
      audioRef.current = new Audio('/sounds/ring.mp3');
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => {});
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    audioRef.current?.pause();
    clearIncoming();
    if (incomingCall.customer_id) {
      router.push(`/customers/${incomingCall.customer_id}`);
    }
  };

  const handleReject = () => {
    audioRef.current?.pause();
    clearIncoming();
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-80
                 bg-white rounded-2xl shadow-2xl border border-gray-200
                 overflow-hidden animate-slide-in"
      role="alertdialog"
      aria-label="Incoming call"
    >
      {/* Header stripe */}
      <div className="bg-green-500 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <PhoneCall size={16} className="animate-bounce" />
          <span className="text-sm font-semibold">Incoming Call</span>
        </div>
        <button
          onClick={handleReject}
          className="text-green-100 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center
                          justify-center shrink-0">
            <UserCircle size={28} className="text-gray-400" />
          </div>
          <div className="min-w-0">
            {incomingCall.customer_name ? (
              <p className="text-sm font-semibold text-gray-900 truncate">
                {incomingCall.customer_name}
              </p>
            ) : (
              <p className="text-sm font-semibold text-gray-500 italic">
                Unknown Caller
              </p>
            )}
            <p className="text-sm text-gray-600 font-mono">
              {incomingCall.caller}
            </p>
            {incomingCall.queue && (
              <p className="text-xs text-gray-400 mt-0.5">
                Queue: <span className="font-medium">{incomingCall.queue}</span>
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2
                       bg-green-500 hover:bg-green-600 text-white
                       rounded-xl py-2.5 text-sm font-medium
                       transition-colors duration-150"
          >
            <PhoneCall size={16} />
            Answer
          </button>
          <button
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-2
                       bg-red-500 hover:bg-red-600 text-white
                       rounded-xl py-2.5 text-sm font-medium
                       transition-colors duration-150"
          >
            <PhoneOff size={16} />
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
