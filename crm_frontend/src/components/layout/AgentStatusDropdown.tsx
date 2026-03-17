'use client';

import { useState }              from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast                     from 'react-hot-toast';
import { ChevronDown, Loader2 }  from 'lucide-react';
import { agentStatusApi }        from '@/lib/api/users';
import { useAgentStatusStore }   from '@/store';
import { useAuthStore }          from '@/store';
import type { AgentStatus }      from '@/types';

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; bg: string }> = {
  available: { label: 'Available', dot: 'bg-green-500',  bg: 'bg-green-50  text-green-700  border-green-200'  },
  on_call:   { label: 'On Call',   dot: 'bg-blue-500',   bg: 'bg-blue-50   text-blue-700   border-blue-200'   },
  busy:      { label: 'Busy',      dot: 'bg-orange-500', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  away:      { label: 'Break',     dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  offline:   { label: 'Offline',   dot: 'bg-gray-400',   bg: 'bg-gray-50   text-gray-600   border-gray-200'   },
};

const ACTIONS: { action: 'login'|'pause'|'logoff'; label: string; status: AgentStatus }[] = [
  { action: 'login',  label: '🟢 Go Available', status: 'available' },
  { action: 'pause',  label: '⏸  Take a Break',  status: 'away'      },
  { action: 'logoff', label: '🔴 Go Offline',    status: 'offline'   },
];

export function AgentStatusDropdown() {
  const { user }                  = useAuthStore();
  const { status, setStatus }     = useAgentStatusStore();
  const [open, setOpen]           = useState(false);

  // sync status from server on mount
  useQuery({
    queryKey: ['my-status'],
    queryFn:  async () => {
      const { data } = await agentStatusApi.get();
      setStatus(data.status as AgentStatus);
      return data;
    },
    refetchInterval: 30_000,
  });

  const { mutate, isLoading } = useMutation({
    mutationFn: ({ action, reason }: { action: 'login'|'pause'|'logoff'; reason?: string }) =>
      agentStatusApi.set(action, reason),
    onSuccess: (_, vars) => {
      const map: Record<string, AgentStatus> = {
        login: 'available', pause: 'away', logoff: 'offline',
      };
      const newStatus = map[vars.action] as AgentStatus;
      setStatus(newStatus);
      toast.success(`Status: ${STATUS_CONFIG[newStatus].label}`);
      setOpen(false);
    },
    onError: () => toast.error('Failed to update status'),
  });

  // only agents see this
  if (!user || !['agent', 'supervisor'].includes(user.role)) return null;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isLoading}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border
                    text-sm font-medium transition-all hover:opacity-90
                    ${cfg.bg}`}
      >
        {isLoading
          ? <Loader2 size={13} className="animate-spin" />
          : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        }
        <span>{cfg.label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          {/* dropdown */}
          <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl
                          shadow-lg border border-gray-200 py-1 z-20 overflow-hidden">
            {ACTIONS.map(({ action, label, status: targetStatus }) => (
              <button
                key={action}
                disabled={status === targetStatus || isLoading}
                onClick={() => mutate({ action })}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  flex items-center gap-2
                  ${status === targetStatus
                    ? 'bg-gray-50 text-gray-400 cursor-default'
                    : 'hover:bg-gray-50 text-gray-700'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0
                  ${STATUS_CONFIG[targetStatus].dot}`} />
                {label}
                {status === targetStatus && (
                  <span className="ml-auto text-xs text-gray-400">current</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
