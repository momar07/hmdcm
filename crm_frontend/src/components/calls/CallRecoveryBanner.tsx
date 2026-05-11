'use client';

import { useEffect, useState } from 'react';
import { Phone, X, RotateCcw } from 'lucide-react';
import { useSipStore } from '@/store/sipStore';

interface InterruptedCall {
  call_id?:       string | null;
  caller_phone:   string;
  lead_id?:       string | null;
  lead_name?:     string | null;
  direction:      'inbound' | 'outbound';
  started_at:     number;   // epoch ms
}

const STORAGE_KEY = 'hmdcm:active_call';

export function CallRecoveryBanner() {
  const [data, setData] = useState<InterruptedCall | null>(null);
  const { sipStatus, callStatus } = useSipStore();

  useEffect(() => {
    // On mount, check if there was an active call before refresh
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: InterruptedCall = JSON.parse(raw);
      // Only show if call was very recent (< 5 minutes)
      const ageMin = (Date.now() - parsed.started_at) / 60000;
      if (ageMin > 5) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      // And only if we're not currently in another call
      if (callStatus !== 'idle') return;
      setData(parsed);
    } catch (_) {}
  }, []);

  const dismiss = () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    setData(null);
  };

  const resume = () => {
    if (!data || data.direction !== 'outbound') {
      dismiss();
      return;
    }
    // Only outbound calls can be redialed; for inbound, the caller must call again
    window.dispatchEvent(new CustomEvent('sip:dial', {
      detail: { phone: data.caller_phone, leadId: data.lead_id ?? null },
    }));
    dismiss();
  };

  if (!data) return null;

  const elapsedMin = Math.floor((Date.now() - data.started_at) / 60000);
  const elapsedSec = Math.floor((Date.now() - data.started_at) / 1000) % 60;
  const elapsedStr = elapsedMin > 0 ? `${elapsedMin}m ago` : `${elapsedSec}s ago`;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[min(560px,90vw)]
                    bg-amber-50 border border-amber-300 rounded-lg shadow-lg
                    px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top">
      <div className="bg-amber-100 rounded-full p-2 flex-shrink-0">
        <Phone className="w-4 h-4 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">
          Call interrupted by page refresh
        </p>
        <p className="text-xs text-amber-700 truncate">
          {data.direction === 'outbound' ? 'To' : 'From'}{' '}
          <span className="font-mono">{data.caller_phone}</span>
          {data.lead_name ? ` · ${data.lead_name}` : ''}
          {' · '}{elapsedStr}
        </p>
      </div>
      {data.direction === 'outbound' && sipStatus === 'registered' && (
        <button
          onClick={resume}
          className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700
                     text-white rounded-md text-xs font-medium transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Redial
        </button>
      )}
      <button
        onClick={dismiss}
        className="text-amber-700 hover:text-amber-900 p-1"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
