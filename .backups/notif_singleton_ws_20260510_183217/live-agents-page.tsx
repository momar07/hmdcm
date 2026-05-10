'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient }       from '@tanstack/react-query';
import {
  Phone, Coffee, WifiOff, Wifi, RefreshCw, ShieldAlert, Eye, EyeOff,
  Search, Filter as FilterIcon, LayoutGrid, List as ListIcon,
} from 'lucide-react';
import { agentStatusApi }                 from '@/lib/api/users';
import { PageHeader }                     from '@/components/ui/PageHeader';
import { useAuthStore }                   from '@/store';
import { useAppSocket }                   from '@/lib/ws/useAppSocket';
import toast                              from 'react-hot-toast';
import { AgentDetailsDrawer }             from './AgentDetailsDrawer';

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

const STATUS_CFG: Record<string, {
  label: string; dot: string; row: string; icon: React.ReactNode;
}> = {
  available: { label: 'Available', dot: 'bg-green-500',
    row: 'border-l-4 border-l-green-400 bg-green-50/30',
    icon: <Wifi size={15} className="text-green-500" /> },
  on_call:   { label: 'On Call', dot: 'bg-blue-500',
    row: 'border-l-4 border-l-blue-400 bg-blue-50/30',
    icon: <Phone size={15} className="text-blue-500" /> },
  away:      { label: 'Break', dot: 'bg-yellow-500',
    row: 'border-l-4 border-l-yellow-400 bg-yellow-50/30',
    icon: <Coffee size={15} className="text-yellow-500" /> },
  busy:      { label: 'Busy', dot: 'bg-orange-500',
    row: 'border-l-4 border-l-orange-400 bg-orange-50/30',
    icon: <Phone size={15} className="text-orange-500" /> },
  offline:   { label: 'Offline', dot: 'bg-gray-400',
    row: 'border-l-4 border-l-gray-200 bg-white opacity-60',
    icon: <WifiOff size={15} className="text-gray-400" /> },
};

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

function SummaryCard({ label, value, color, active, onClick }: {
  label: string; value: number; color: string;
  active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border p-4 text-center transition-all
                  ${color}
                  ${onClick ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}
                  ${active ? 'ring-2 ring-offset-1 ring-blue-400 shadow-md' : ''}`}
    >
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-0.5 opacity-80">{label}</p>
    </button>
  );
}

function AgentCard({ agent, now, onClick }: {
  agent: AgentRow; now: number; onClick?: () => void;
}) {
  const cfg      = STATUS_CFG[agent.status] ?? STATUS_CFG.offline;
  const duration = formatDuration(agent.status_since, now);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl
                  border border-gray-100 shadow-sm transition-all
                  ${cfg.row}
                  ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br
                        from-blue-500 to-blue-700 flex items-center
                        justify-center text-white font-bold text-sm">
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5
                          rounded-full ring-2 ring-white ${cfg.dot}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
        <p className="text-xs text-gray-400 truncate">
          {agent.email}
          {agent.team_name && <span className="text-gray-300"> · {agent.team_name}</span>}
        </p>
      </div>

      {agent.extension && (
        <span className="hidden sm:inline text-xs font-mono
                         bg-white border border-gray-200
                         text-gray-600 px-2 py-0.5 rounded-lg shrink-0">
          Ext {agent.extension}
        </span>
      )}

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


function AgentTile({ agent, now, onClick }: {
  agent: AgentRow; now: number; onClick?: () => void;
}) {
  const cfg      = STATUS_CFG[agent.status] ?? STATUS_CFG.offline;
  const duration = formatDuration(agent.status_since, now);

  // compact card colors by status
  const ringByStatus: Record<string, string> = {
    available: 'ring-green-200 hover:ring-green-300',
    on_call:   'ring-blue-200 hover:ring-blue-300',
    busy:      'ring-orange-200 hover:ring-orange-300',
    away:      'ring-yellow-200 hover:ring-yellow-300',
    offline:   'ring-gray-200 hover:ring-gray-300',
  };
  const ring = ringByStatus[agent.status] ?? ringByStatus.offline;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-xl border border-gray-100
                  shadow-sm hover:shadow-md transition-all p-4
                  flex flex-col items-center text-center gap-2
                  ring-1 ${ring}
                  ${onClick ? 'cursor-pointer' : ''}
                  ${agent.status === 'offline' ? 'opacity-60' : ''}`}
    >
      {/* Top status bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${cfg.dot}`} />

      {/* Avatar with status dot */}
      <div className="relative mt-1">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br
                        from-blue-500 to-blue-700 flex items-center
                        justify-center text-white font-bold text-lg">
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4
                          rounded-full ring-2 ring-white ${cfg.dot}`} />
      </div>

      {/* Name */}
      <div className="w-full min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {agent.name}
        </p>
        {agent.team_name && (
          <p className="text-[10px] text-gray-400 truncate">{agent.team_name}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-50">
        {cfg.icon}
        <span className="text-xs font-medium text-gray-700">{cfg.label}</span>
      </div>

      {/* Duration + Extension row */}
      <div className="w-full flex items-center justify-between text-[11px] text-gray-400 mt-1">
        {agent.extension ? (
          <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">
            Ext {agent.extension}
          </span>
        ) : <span/>}
        {duration && <span className="font-mono">{duration}</span>}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
type StatusFilter = 'all' | 'available' | 'on_call' | 'busy' | 'away' | 'offline';

export default function LiveAgentsPage() {
  const { user } = useAuthStore();
  const qc       = useQueryClient();

  // tick + server-time sync
  const [now, setNow] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // UI state
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [groupByTeam,    setGroupByTeam]    = useState(false);
  const [drawerAgentId,  setDrawerAgentId]  = useState<string | null>(null);

  // View mode (cards | list) — persisted in localStorage
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem('liveAgents.viewMode') : null;
    if (saved === 'cards' || saved === 'list') setViewMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined')
      localStorage.setItem('liveAgents.viewMode', viewMode);
  }, [viewMode]);

  const { data, isLoading, isFetching, refetch } = useQuery<LiveData>({
    queryKey:        ['live-agents'],
    queryFn:         () => agentStatusApi.live().then((r) => r.data),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (data?.server_now) {
      const serverMs = new Date(data.server_now).getTime();
      setServerOffset(serverMs - Date.now());
    }
  }, [data?.server_now]);

  const syncedNow = now + serverOffset;

  // WebSocket — real-time status updates
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

  // Permission gate
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

  // Single-agent view
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

  const summary = data?.summary ?? {
    available: 0, on_call: 0, away: 0, busy: 0, offline: 0, total: 0,
  };

  const ORDER  = ['on_call', 'available', 'busy', 'away', 'offline'];
  const filtered = useMemo(() => {
    const list = [...(data?.agents ?? [])];
    const q = search.trim().toLowerCase();
    return list
      .filter(a => statusFilter === 'all' ? true : a.status === statusFilter)
      .filter(a => statusFilter === 'all' && a.status === 'offline' ? false : true)
      // ^ when filter is 'all', still hide offline by default UNLESS user clicked Offline card
      .filter(a => {
        if (!q) return true;
        return a.name.toLowerCase().includes(q)
            || a.email.toLowerCase().includes(q)
            || (a.extension || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ra = ORDER.indexOf(a.status); const rb = ORDER.indexOf(b.status);
        if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        return a.name.localeCompare(b.name);
      });
  }, [data?.agents, search, statusFilter]);

  // When user clicks Offline summary card, set filter explicitly
  // (the filter chain above hides offline only when statusFilter==='all')
  const visible = statusFilter === 'offline'
    ? (data?.agents ?? []).filter(a => a.status === 'offline'
        && (!search || a.name.toLowerCase().includes(search.toLowerCase())
                    || a.email.toLowerCase().includes(search.toLowerCase())))
    : filtered;

  // Group by team
  const grouped = useMemo(() => {
    if (!groupByTeam) return null;
    const map = new Map<string, { name: string; agents: AgentRow[] }>();
    visible.forEach(a => {
      const key = a.team_id || 'no-team';
      const name = a.team_name || 'No Team';
      if (!map.has(key)) map.set(key, { name, agents: [] });
      map.get(key)!.agents.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [visible, groupByTeam]);

  const busyCount = summary.busy ?? (data?.agents ?? []).filter(a => a.status === 'busy').length;

  const handleRefresh = async () => {
    await refetch();
    toast.success('Refreshed', { duration: 1500 });
  };

  // detect if any team info exists for grouping toggle
  const hasTeams = (data?.agents ?? []).some(a => a.team_name);

  return (
    <div>
      <PageHeader
        title="Live Agents"
        subtitle={`${summary.total} agents · auto-refresh every 10s`}
        actions={
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex border border-gray-200 rounded-lg p-0.5 bg-white">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'}`}
                title="Cards view"
              >
                <LayoutGrid size={14}/>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'}`}
                title="List view"
              >
                <ListIcon size={14}/>
              </button>
            </div>

            {hasTeams && (
              <button
                onClick={() => setGroupByTeam(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                           text-xs font-medium border transition-colors
                           ${groupByTeam
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <FilterIcon size={14}/>
                {groupByTeam ? 'Grouped' : 'Group by team'}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         text-xs font-medium border border-gray-200
                         hover:bg-gray-50 transition-colors text-gray-600
                         disabled:opacity-50"
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

      {/* Summary cards (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <SummaryCard
          label="All" value={summary.total}
          color="bg-white border-gray-200 text-gray-700"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <SummaryCard
          label="Available"  value={summary.available}
          color="bg-green-50 border-green-100 text-green-700"
          active={statusFilter === 'available'}
          onClick={() => setStatusFilter('available')}
        />
        <SummaryCard
          label="On Call"    value={summary.on_call}
          color="bg-blue-50 border-blue-100 text-blue-700"
          active={statusFilter === 'on_call'}
          onClick={() => setStatusFilter('on_call')}
        />
        <SummaryCard
          label="Busy"       value={busyCount}
          color="bg-orange-50 border-orange-100 text-orange-700"
          active={statusFilter === 'busy'}
          onClick={() => setStatusFilter('busy')}
        />
        <SummaryCard
          label="On Break"   value={summary.away}
          color="bg-yellow-50 border-yellow-100 text-yellow-700"
          active={statusFilter === 'away'}
          onClick={() => setStatusFilter('away')}
        />
        <SummaryCard
          label="Offline"    value={summary.offline}
          color="bg-gray-50 border-gray-100 text-gray-600"
          active={statusFilter === 'offline'}
          onClick={() => setStatusFilter('offline')}
        />
      </div>

      {/* Search bar */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or extension..."
          className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg
                     focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          >
            ×
          </button>
        )}
      </div>

      {/* Active filter banner */}
      {(statusFilter !== 'all' || search) && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span>Showing:</span>
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             bg-blue-100 text-blue-700">
              {STATUS_CFG[statusFilter]?.label || statusFilter}
              <button onClick={() => setStatusFilter('all')}>×</button>
            </span>
          )}
          {search && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             bg-gray-100 text-gray-700">
              "{search}"
              <button onClick={() => setSearch('')}>×</button>
            </span>
          )}
          <span className="ml-auto text-gray-400">{visible.length} result{visible.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Agents list */}
      {isLoading ? (
        viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3
                          lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <WifiOff size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-lg font-medium">No agents match your filters</p>
          {(statusFilter !== 'all' || search) && (
            <button
              onClick={() => { setStatusFilter('all'); setSearch(''); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : groupByTeam && grouped ? (
        <div className="space-y-5">
          {grouped.map(([teamId, group]) => (
            <div key={teamId}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">
                {group.name} ({group.agents.length})
              </h3>
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3
                                lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {group.agents.map(a => (
                    <AgentTile key={a.id} agent={a} now={syncedNow}
                               onClick={() => setDrawerAgentId(a.id)}/>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {group.agents.map(a => (
                    <AgentCard key={a.id} agent={a} now={syncedNow}
                               onClick={() => setDrawerAgentId(a.id)}/>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3
                        lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visible.map((a) => (
            <AgentTile key={a.id} agent={a} now={syncedNow}
                       onClick={() => setDrawerAgentId(a.id)}/>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <AgentCard key={a.id} agent={a} now={syncedNow}
                       onClick={() => setDrawerAgentId(a.id)}/>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerAgentId && (
        <AgentDetailsDrawer
          agentId={drawerAgentId}
          onClose={() => setDrawerAgentId(null)}
        />
      )}
    </div>
  );
}
