'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient }       from '@tanstack/react-query';
import {
  Phone, Coffee, WifiOff, Wifi, RefreshCw, ShieldAlert, Eye, EyeOff,
} from 'lucide-react';
import { agentStatusApi }                 from '@/lib/api/users';
import { PageHeader }                     from '@/components/ui/PageHeader';
import { useAuthStore }                   from '@/store';
import { useAppSocket }                   from '@/lib/ws/useAppSocket';
import toast                              from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────
interface AgentRow {
  id:           string;
  name:         string;
  email:        string;
  role:         string;
  status:       string;
  status_since: string | null;
  extension:    string | null;
  team_id?:     string | null;
  team_name?:   string | null;
}

interface LiveData {
  agents:  AgentRow[];
  summary: {
    available: number;
    on_call:   number;
    away:      number;
    busy?:     number;
    offline:   number;
    total:     number;
  };
  server_now?: string;
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CFG: Record<string, {
  label: string; dot: string; row: string; icon: React.ReactNode;
}> = {
  available: {
    label: 'Available',
    dot:   'bg-green-500',
    row:   'border-l-4 border-l-green-400 bg-green-50/30',
    icon:  <Wifi size={15} className="text-green-500" />,
  },
  on_call: {
    label: 'On Call',
    dot:   'bg-blue-500',
    row:   'border-l-4 border-l-blue-400 bg-blue-50/30',
    icon:  <Phone size={15} className="text-blue-500" />,
  },
  away: {
    label: 'Break',
    dot:   'bg-yellow-500',
    row:   'border-l-4 border-l-yellow-400 bg-yellow-50/30',
    icon:  <Coffee size={15} className="text-yellow-500" />,
  },
  busy: {
    label: 'Busy',
    dot:   'bg-orange-500',
    row:   'border-l-4 border-l-orange-400 bg-orange-50/30',
    icon:  <Phone size={15} className="text-orange-500" />,
  },
  offline: {
    label: 'Offline',
    dot:   'bg-gray-400',
    row:   'border-l-4 border-l-gray-200 bg-white opacity-60',
    icon:  <WifiOff size={15} className="text-gray-400" />,
  },
};

// ── Format duration helper (pure, no hooks) ──────────────────
function formatDuration(since: string | null, now: number): string {
  if (!since) return '';
  const elapsed = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  if (elapsed === 0) return '';
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

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
function AgentCard({ agent, now }: { agent: AgentRow; now: number }) {
  const cfg      = STATUS_CFG[agent.status] ?? STATUS_CFG.offline;
  const duration = formatDuration(agent.status_since, now);
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

      {/* Status + Duration */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1.5">
          {cfg.icon}
          <span className="text-xs font-medium text-gray-700">{cfg.label}</span>
        </div>
        {duration && (
          <span className="text-xs font-mono text-gray-400">{duration}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function LiveAgentsPage() {
  const { user } = useAuthStore();
  const qc       = useQueryClient();

  // single page-wide tick (1s) — server-synced via server_now offset
  const [now, setNow] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // UI state
  const [showOffline, setShowOffline] = useState(false);

  // fetch live agents every 10s
  const { data, isLoading, isFetching, refetch } = useQuery<LiveData>({
    queryKey:        ['live-agents'],
    queryFn:         () => agentStatusApi.live().then((r) => r.data),
    refetchInterval: 10_000,
  });

  // Recompute server-time offset whenever fresh data arrives
  useEffect(() => {
    if (data?.server_now) {
      const serverMs = new Date(data.server_now).getTime();
      setServerOffset(serverMs - Date.now());
    }
  }, [data?.server_now]);

  // WebSocket — real-time status updates (auto-reconnect + cookie auth)
  useAppSocket({
    path:    '/ws/calls/',
    enabled: !!user,
    onOpen:    () => console.log('[WS] Live agents connected'),
    onMessage: (msg) => {
      if (msg?.type === 'agent_status_update') {
        qc.invalidateQueries({ queryKey: ['live-agents'] });
      }
    },
    onError: (e) => console.warn('[WS] error', e),
  });

  // Permission gate — only admins / supervisors / agents may view
  const allowed = !!user && ['admin', 'supervisor', 'agent'].includes(user.role);
  if (user && !allowed) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <ShieldAlert size={48} className="text-amber-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-800">Access Restricted</h2>
        <p className="text-sm text-gray-500 mt-1">
          You do not have permission to view live agent status.
        </p>
      </div>
    );
  }

  // Agent sees only themselves — show simplified single-agent view
  if (user && user.role === 'agent') {
    const me  = data?.agents?.find((a) => a.id === user.id);
    return (
      <div>
        <PageHeader title="My Status" subtitle="Your current queue status" />
        {me ? (
          <div className="max-w-sm">
            <AgentCard agent={me} now={syncedNow} />
          </div>
        ) : (
          <div className="text-gray-400 text-sm">Loading...</div>
        )}
      </div>
    );
  }

  const syncedNow = now + serverOffset;

  const summary = data?.summary ?? {
    available: 0, on_call: 0, away: 0, busy: 0, offline: 0, total: 0,
  };

  // group by status priority
  const ORDER  = ['on_call', 'available', 'busy', 'away', 'offline'];
  const agents = useMemo(() => {
    const list = [...(data?.agents ?? [])];
    return list
      .filter((a) => showOffline || a.status !== 'offline')
      .sort((a, b) => {
        const ra = ORDER.indexOf(a.status); const rb = ORDER.indexOf(b.status);
        if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        return a.name.localeCompare(b.name);
      });
  }, [data?.agents, showOffline]);

  // busy count fallback (some backends may not include it)
  const busyCount = summary.busy ?? (data?.agents ?? []).filter(a => a.status === 'busy').length;

  const handleRefresh = async () => {
    await refetch();
    toast.success('Refreshed', { duration: 1500 });
  };

  return (
    <div>
      <PageHeader
        title="Live Agents"
        subtitle={`${summary.total} agents · auto-refresh every 10s`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOffline(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         text-xs font-medium border border-gray-200
                         hover:bg-gray-50 transition-colors text-gray-600"
              title={showOffline ? 'Hide offline agents' : 'Show offline agents'}
            >
              {showOffline ? <EyeOff size={14}/> : <Eye size={14}/>}
              {showOffline ? 'Hide offline' : 'Show offline'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         text-xs font-medium border border-gray-200
                         hover:bg-gray-50 transition-colors text-gray-600
                         disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''}/>
              Refresh
            </button>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </div>
          </div>
        }
      />

      {/* Summary strip — 5 cards including Busy */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <SummaryCard
          label="Available"  value={summary.available}
          color="bg-green-50  border-green-100  text-green-700"
        />
        <SummaryCard
          label="On Call"    value={summary.on_call}
          color="bg-blue-50   border-blue-100   text-blue-700"
        />
        <SummaryCard
          label="Busy"       value={busyCount}
          color="bg-orange-50 border-orange-100 text-orange-700"
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
          <p className="text-lg font-medium">
            {showOffline ? 'No agents found' : 'No active agents'}
          </p>
          {!showOffline && summary.offline > 0 && (
            <button
              onClick={() => setShowOffline(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Show {summary.offline} offline agent{summary.offline > 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} now={syncedNow} />
          ))}
        </div>
      )}
    </div>
  );
}
