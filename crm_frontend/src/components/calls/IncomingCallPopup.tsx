'use client';

import { useEffect, useState } from 'react';
import { Phone, PhoneOff, User } from 'lucide-react';
import { useCallStore }  from '@/store';
import { useAuthStore }  from '@/store';
import { callsApi }      from '@/lib/api/calls';
import toast             from 'react-hot-toast';

export function IncomingCallPopup() {
  const { incomingCall, clearIncoming } = useCallStore();
  const user = useAuthStore((s) => s.user);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (incomingCall) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        clearIncoming();
      }, 30_000);
      return () => clearTimeout(t);
    }
  }, [incomingCall, clearIncoming]);

  if (!visible || !incomingCall) return null;

  const handleAnswer = async () => {
    try {
      if (user?.extension) {
        await callsApi.originate({
          phone_number: incomingCall.caller,
          customer_id:  incomingCall.customer_id ?? undefined,
        });
        toast.success(`Answering call from ${incomingCall.caller}`);
      }
    } catch {
      toast.error('Failed to connect call');
    } finally {
      setVisible(false);
      clearIncoming();
    }
  };

  const handleReject = () => {
    setVisible(false);
    clearIncoming();
    toast('Call dismissed', { icon: '📵' });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl
                    shadow-2xl border border-gray-200 w-80 p-5 animate-slide-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <Phone size={18} className="text-green-600 animate-pulse" />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Incoming Call</p>
          <p className="font-semibold text-gray-900">{incomingCall.caller}</p>
        </div>
      </div>

      {incomingCall.customer_name && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-lg">
          <User size={14} className="text-gray-400" />
          <span className="text-sm text-gray-700">{incomingCall.customer_name}</span>
        </div>
      )}

      {incomingCall.queue && (
        <p className="text-xs text-gray-400 mb-4">
          Queue: <span className="text-gray-600 font-medium">{incomingCall.queue}</span>
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleAnswer}
          className="flex-1 flex items-center justify-center gap-2
                     bg-green-500 hover:bg-green-600 text-white
                     rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          <Phone size={15} /> Answer
        </button>
        <button
          onClick={handleReject}
          className="flex-1 flex items-center justify-center gap-2
                     bg-red-500 hover:bg-red-600 text-white
                     rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          <PhoneOff size={15} /> Dismiss
        </button>
      </div>
    </div>
  );
}
