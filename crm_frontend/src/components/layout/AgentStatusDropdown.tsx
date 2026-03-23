'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery }       from '@tanstack/react-query';
import toast                        from 'react-hot-toast';
import { ChevronDown, Loader2 }     from 'lucide-react';
import { agentStatusApi }           from '@/lib/api/users';
import { useAgentStatusStore }      from '@/store';
import { useAuthStore }             from '@/store';
import type { AgentStatus }         from '@/types';

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; bg: string }> = {
  available: { label: 'Available', dot: 'bg-green-500',  bg: 'bg-green-50  text-green-700  border-green-200'  },
  on_call:   { label: 'On Call',   dot: 'bg-blue-500',   bg: 'bg-blue-50   text-blue-700   border-blue-200'   },
  busy:      { label: 'Busy',      dot: 'bg-orange-500', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  away:      { label: 'Break',     dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  offline:   { label: 'Offline',   dot: 'bg-gray-400',   bg: 'bg-gray-50   text-gray-600   border-gray-200'   },
};

// Which actions are available from each status
const ACTIONS: {
  target: AgentStatus;
  label:  string;
  allowedFrom: AgentStatus[];
}[] = [
  { target: 'available', label: '🟢 Go Available', allowedFrom: ['offline', 'away']              },
  { target: 'away',      label: '⏸  Take a Break', allowedFrom: ['available', 'on_call', 'busy'] },
  { target: 'offline',   label: '🔴 Go Offline',   allowedFrom: ['available', 'away', 'on_call', 'busy'] },
];

export function AgentStatusDropdown() {
  const { user }              = useAuthStore();
  const { status, setStatus } = useAgentStatusStore();
  const [open, setOpen]         = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [fastPoll, setFastPoll] = useState(false);
  const fastPollTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Sync status from server — fast poll (1s) right after login, then slow (10s)
  useQuery({
    queryKey: ['my-status'],
    queryFn:  async () => {
      const { data } = await agentStatusApi.get();
      if (data?.status) {
        setStatus(data.status as AgentStatus);
        // stop fast polling once we hit 'available'
        if (data.status === 'available' && fastPoll) {
          setFastPoll(false);
          if (fastPollTimer.current) clearTimeout(fastPollTimer.current);
        }
      }
      return data;
    },
    refetchInterval: fastPoll ? 1_000 : 10_000,
    enabled: mounted,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (target: AgentStatus) => agentStatusApi.set(target),
    onSuccess: (_, target) => {
      setStatus(target);
      toast.success(`Status: ${STATUS_CONFIG[target]?.label ?? target}`);
      setOpen(false);
    },
    onError: () => toast.error('Failed to update status'),
  });

  // Start fast polling on mount (login just happened) — stop after 15s max
  useEffect(() => {
    if (!mounted) return;
    setFastPoll(true);
    fastPollTimer.current = setTimeout(() => {
      setFastPoll(false);
    }, 15_000);
    return () => {
      if (fastPollTimer.current) clearTimeout(fastPollTimer.current);
    };
  }, [mounted]);

  if (!mounted || !user || !['agent', 'supervisor'].includes(user.role)) return null;

  const cfg      = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;
  const actions  = ACTIONS.filter((a) => a.allowedFrom.includes(status));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border
                    text-sm font-medium transition-all hover:opacity-90
                    ${cfg.bg}`}
      >
        {isPending
          ? <Loader2 size={13} className="animate-spin" />
          : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        }
        <span>{cfg.label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl
                          shadow-lg border border-gray-200 py-1 z-20 overflow-hidden">
            {actions.map(({ target, label }) => (
              <button
                key={target}
                disabled={isPending}
                onClick={() => mutate(target)}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors
                           flex items-center gap-2 hover:bg-gray-50 text-gray-700"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0
                                  ${STATUS_CONFIG[target].dot}`} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
