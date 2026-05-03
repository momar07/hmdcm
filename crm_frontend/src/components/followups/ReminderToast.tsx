'use client';

import { useEffect, useRef } from 'react';
import toast                  from 'react-hot-toast';
import { Bell, Phone, ExternalLink } from 'lucide-react';
import { useSipStore }         from '@/store/sipStore';

interface ReminderEvent {
  followup_id:    string;
  title:          string;
  followup_type:  string;
  scheduled_at:   string;
  lead_name:      string;
  lead_phone:     string | null;
  lead_id:        string | null;
}

/**
 * Mounts once in layout.tsx.
 * Listens for 'followup:reminder' DOM events (dispatched by the WS handler)
 * and shows a rich toast with Call Now + View buttons.
 */
export function ReminderToastListener() {
  const sipActions = useSipStore(s => s.actions);
  const sipStatus  = useSipStore(s => s.sipStatus);
  const callStatus = useSipStore(s => s.callStatus);

  // Keep latest refs so toast callbacks don't go stale
  const actionsRef    = useRef(sipActions);
  const sipStatusRef  = useRef(sipStatus);
  const callStatusRef = useRef(callStatus);
  useEffect(() => { actionsRef.current    = sipActions;  }, [sipActions]);
  useEffect(() => { sipStatusRef.current  = sipStatus;   }, [sipStatus]);
  useEffect(() => { callStatusRef.current = callStatus;  }, [callStatus]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<ReminderEvent>).detail;
      if (!ev?.followup_id) return;

      const toastId = `reminder-${ev.followup_id}`;

      toast.custom(
        (t) => (
          <div
            className={`max-w-sm w-full bg-white shadow-xl rounded-2xl border border-blue-100
                        pointer-events-auto flex flex-col gap-0 overflow-hidden
                        ${t.visible ? 'animate-slide-up' : 'opacity-0'}`}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2 bg-blue-50 border-b border-blue-100">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                <Bell size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                  Follow-up Reminder
                </p>
                <p className="text-sm font-bold text-gray-900 truncate">{ev.title}</p>
              </div>
              <button
                onClick={() => toast.dismiss(toastId)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-1">
              {ev.lead_name && (
                <p className="text-sm text-gray-700">
                  👤 <span className="font-medium">{ev.lead_name}</span>
                </p>
              )}
              {ev.lead_phone && (
                <p className="text-xs text-gray-500 font-mono">{ev.lead_phone}</p>
              )}
              <p className="text-xs text-blue-600 font-medium">
                🕐 {(() => {
                  if (!ev.scheduled_at) return 'Scheduled';
                  const d = new Date(ev.scheduled_at);
                  if (isNaN(d.getTime())) return ev.scheduled_at;
                  return d.toLocaleString('en-GB', {
                    hour: '2-digit', minute: '2-digit',
                    day: '2-digit', month: 'short',
                  });
                })()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-4 pb-4">
              {ev.lead_phone && sipStatusRef.current === 'registered' && callStatusRef.current === 'idle' && (
                <button
                  onClick={() => {
                    toast.dismiss(toastId);
                    window.dispatchEvent(new CustomEvent('sip:dial', {
                      detail: {
                        phone:      ev.lead_phone,
                        leadId:     ev.lead_id,
                      },
                    }));
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5
                             bg-blue-600 hover:bg-blue-700 text-white
                             rounded-xl py-2 text-xs font-semibold transition-colors"
                >
                  <Phone size={13} /> Call Now
                </button>
              )}
              <button
                onClick={() => {
                  toast.dismiss(toastId);
                  window.location.href = '/followups';
                }}
                className="flex-1 flex items-center justify-center gap-1.5
                           bg-gray-100 hover:bg-gray-200 text-gray-700
                           rounded-xl py-2 text-xs font-semibold transition-colors"
              >
                <ExternalLink size={13} /> View
              </button>
            </div>
          </div>
        ),
        {
          id:       toastId,
          duration: 30_000,   // 30 seconds — long enough to act
          position: 'top-right',
        }
      );
    };

    window.addEventListener('followup:reminder', handler);
    return () => window.removeEventListener('followup:reminder', handler);
  }, []);

  return null;   // renders nothing — side-effect only
}
