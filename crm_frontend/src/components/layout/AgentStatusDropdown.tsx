'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery }        from '@tanstack/react-query';
import toast                            from 'react-hot-toast';
import { ChevronDown, Loader2 }         from 'lucide-react';
import { agentStatusApi }               from '@/lib/api/users';
import { useAgentStatusStore }          from '@/store';
import { useAuthStore }                 from '@/store';
import type { AgentStatus }             from '@/types';

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; bg: string }> = {
  available: { label: 'Available', dot: 'bg-green-500',  bg: 'bg-green-50  text-green-700  border-green-200'  },
  on_call:   { label: 'On Call',   dot: 'bg-blue-500',   bg: 'bg-blue-50   text-blue-700   border-blue-200'   },
  busy:      { label: 'Busy',      dot: 'bg-orange-500', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  away:      { label: 'Break',     dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  offline:   { label: 'Offline',   dot: 'bg-gray-400',   bg: 'bg-gray-50   text-gray-600   border-gray-200'   },
};

const ACTIONS: { action: 'login'|'open_session'|'pause'|'logoff'; label: string; status: AgentStatus }[] = [
  { action: 'open_session',  label: '🟢 Go Available', status: 'available' },
  { action: 'pause',  label: '⏸  Take a Break',  status: 'away'      },
  { action: 'logoff', label: '🔴 Go Offline',    status: 'offline'   },
];

export function AgentStatusDropdown() {
  const { user }                  = useAuthStore();
  const { status, setStatus }     = useAgentStatusStore();
  const [open, setOpen]           = useState(false);
  const [vicidialUrl, setVicidialUrl] = useState<string | null>(null);
  const [mounted, setMounted]         = useState(false);
  const iframeRef                     = useRef<HTMLIFrameElement>(null);

  // Fix hydration mismatch — only render after client mount
  useEffect(() => { setMounted(true); }, []);

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

  const { mutate, isPending: isLoading } = useMutation({
    mutationFn: ({ action, reason }: { action: 'login'|'open_session'|'pause'|'logoff'; reason?: string }) =>
      agentStatusApi.set(action, reason),
    onSuccess: (res, vars) => {
      const map: Record<string, AgentStatus> = {
        login:        'available',
        open_session: 'available',
        pause:        'away',
        logoff:       'offline',
      };
      const newStatus = map[vars.action] as AgentStatus;
      if (newStatus) {
        setStatus(newStatus);
        toast.success(`Status: ${STATUS_CONFIG[newStatus].label}`);
      }
      setOpen(false);

      // ── VICIdial two-step login flow ────────────────────
      if (vars.action === 'open_session') {
        const url = res?.data?.vicidial_url;
        if (url) {
          setVicidialUrl(url);
          toast.loading('Connecting to VICIdial...', { id: 'vicidial-login' });
          // Wait 5s for iframe to establish VICIdial session, then send RESUME
          setTimeout(() => mutate({ action: 'login' }), 5000);
        } else {
          // No VICIdial URL — no extension assigned
          toast.error('No extension assigned — contact admin');
        }
      }

      // ── Handle login validation result ───────────────────
      if (vars.action === 'login') {
        toast.dismiss('vicidial-login');
        if (!res?.data?.success) {
          // Login failed — revert status and show error
          setStatus('offline');
          toast.error(res?.data?.message ?? 'VICIdial login failed');
          setVicidialUrl(null);
        }
      }

      // ── Clear iframe on logoff ────────────────────────────
      if (vars.action === 'logoff') {
        setVicidialUrl(null);
      }
    },
    onError: () => toast.error('Failed to update status'),
  });

  // Fix hydration + role check
  if (!mounted || !user || !['agent', 'supervisor'].includes(user.role)) return null;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;

  return (
    <div className="relative">
      {/* Hidden VICIdial session iframe */}
      {vicidialUrl && (
        <iframe
          ref={iframeRef}
          src={vicidialUrl}
          style={{ display: 'none', width: 1, height: 1 }}
          title="vicidial-session"
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
      )}
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
