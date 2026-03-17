'use client';

import { useEffect, useRef }              from 'react';
import { useQuery, useQueryClient }       from '@tanstack/react-query';
import { Phone, Coffee, WifiOff, Wifi }   from 'lucide-react';
import { agentStatusApi }                 from '@/lib/api/users';
import { PageHeader }                     from '@/components/ui/PageHeader';
import { useAuthStore }                   from '@/store';

// ── Types ─────────────────────────────────────────────────────
interface AgentRow {
  id:        string;
  name:      string;
  email:     string;
  role:      string;
  status:    string;
  extension: string | null;
}

interface LiveData {
  agents:  AgentRow[];
  summary: {
    available: number;
    on_call:   number;
    away:      number;
    offline:   number;
    total:     number;
  };
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CFG: Record<string, {
  label: string; dot: string; row: string; icon: React.ReactNode;
}> = {
  available: {
    label: 'Available',
    dot:   'bg-green-500',
    row:   'border-l-4 border-l-green-400 bg-green-50/30',
    icon:  <Wifi      size={15} className="text-green-500" />,
  },
  on_call: {
    label: 'On Call',
    dot:   'bg-blue-500',
    row:   'border-l-4 border-l-blue-400 bg-blue-50/30',
    icon:  <Phone     size={15} className="text-blue-500" />,
  },
  away: {
    label: 'Break',
    dot:   'bg-yellow-500',
    row:   'border-l-4 border-l-yellow-400 bg-yellow-50/30',
    icon:  <Coffee    size={15} className="text-yellow-500" />,
  },
  busy: {
    label: 'Busy',
    dot:   'bg-orange-500',
    row:   'border-l-4 border-l-orange-400 bg-orange-50/30',
    icon:  <Phone     size={15} className="text-orange-500" />,
  },
  offline: {
    label: 'Offline',
    dot:   'bg-gray-400',
    row:   'border-l-4 border-l-gray-200 bg-white opacity-60',
    icon:  <WifiOff   size={15} className="text-gray-400" />,
  },
};

// ── Summary Card ──────────────────────────────────────────────
function SummaryCard({ label, value, color }: {
  label: string; value: number; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 text-center ${color}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-0.5 opacity-80">{label}</p>
    </div>
  );
}

// ── Agent Row ─────────────────────────────────────────────────
function AgentCard({ agent }: { agent: AgentRow }) {
  const cfg = STATUS_CFG[agent.status] ?? STATUS_CFG.offline;
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl
                     border border-gray-100 shadow-sm transition-all ${cfg.row}`}>
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br
                        from-blue-500 to-blue-700 flex items-center
                        justify-center text-white font-bold text-sm">
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5
                          rounded-full ring-2 ring-white ${cfg.dot}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {agent.name}
        </p>
        <p className="text-xs text-gray-400 truncate">{agent.email}</p>
      </div>

      {/* Extension */}
      {agent.extension && (
        <span className="hidden sm:inline text-xs font-mono
                         bg-white border border-gray-200
                         text-gray-600 px-2 py-0.5 rounded-lg shrink-0">
          Ext {agent.extension}
        </span>
      )}

      {/* Status */}
      <div className="flex items-center gap-1.5 shrink-0">
        {cfg.icon}
        <span className="text-xs font-medium text-gray-700">{cfg.label}</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function LiveAgentsPage() {
  const { user }   = useAuthStore();
  const qc         = useQueryClient();
  const wsRef      = useRef<WebSocket | null>(null);

  // fetch live agents every 10s
  const { data, isLoading } = useQuery<LiveData>({
    queryKey:       ['live-agents'],
    queryFn:        () => agentStatusApi.live().then((r) => r.data),
    refetchInterval: 10_000,
  });

  // WebSocket — real-time status updates
  useEffect(() => {
    const token = localStorage.getItem('access_token') ||
      (() => {
        try {
          const auth = JSON.parse(localStorage.getItem('crm-auth') || '{}');
          return auth?.state?.user ? sessionStorage.getItem('access_token') : null;
        } catch { return null; }
      })();

    const wsUrl = `ws://localhost:8000/ws/calls/?token=${token ?? ''}`;
    const ws    = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen    = () => console.log('[WS] Live agents connected');
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'agent_status_update') {
          // refresh live agents list immediately
          qc.invalidateQueries({ queryKey: ['live-agents'] });
        }
      } catch {}
    };
    ws.onerror   = (e) => console.warn('[WS] error', e);

    return () => ws.close();
  }, [qc]);

  // only admin/supervisor
  if (user && !['admin', 'supervisor'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Access restricted to admins and supervisors.
      </div>
    );
  }

  const summary = data?.summary ?? {
    available: 0, on_call: 0, away: 0, offline: 0, total: 0,
  };

  // group by status priority
  const ORDER  = ['on_call', 'available', 'busy', 'away', 'offline'];
  const agents = [...(data?.agents ?? [])].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
  );

  return (
    <div>
      <PageHeader
        title="Live Agents"
        subtitle={`${summary.total} agents · updates every 10s`}
        actions={
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Available"  value={summary.available}
          color="bg-green-50  border-green-100  text-green-700"
        />
        <SummaryCard
          label="On Call"    value={summary.on_call}
          color="bg-blue-50   border-blue-100   text-blue-700"
        />
        <SummaryCard
          label="On Break"   value={summary.away}
          color="bg-yellow-50 border-yellow-100 text-yellow-700"
        />
        <SummaryCard
          label="Offline"    value={summary.offline}
          color="bg-gray-50   border-gray-100   text-gray-600"
        />
      </div>

      {/* Agents list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}
              className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <WifiOff size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-lg font-medium">No agents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}
