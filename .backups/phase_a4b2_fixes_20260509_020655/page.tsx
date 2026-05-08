'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, LayoutGrid, Search, Filter, Download, X,
  Users, Flame, TrendingUp, Trophy, DollarSign,
  Phone, MessageCircle, Mail, MoreHorizontal,
  ChevronUp, ChevronDown, List as ListIcon, Grid as GridIcon,
} from 'lucide-react';
import { leadsApi } from '@/lib/api/leads';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/store';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Spinner } from '@/components/ui/Spinner';
import type { Lead } from '@/types';
import { getLeadDisplayName } from '@/lib/leads';

const SOURCE_LABELS: Record<string, string> = {
  call: 'Inbound Call', web: 'Website', referral: 'Referral',
  campaign: 'Campaign',  social: 'Social Media', manual: 'Manual',
};

// ── Helpers ─────────────────────────────────────────────────
function timeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(name: string): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
}

function getAvatarColor(id: string): string {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
    'bg-teal-100 text-teal-700',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function isStale(dateStr: string | null, days = 7): boolean {
  if (!dateStr) return true;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff > days * 24 * 60 * 60 * 1000;
}

type SortKey = 'created_at' | 'updated_at' | 'value' | 'full_name' | null;
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

export default function LeadsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';

  // ── State ──────────────────────────────────────────────
  const [search, setSearch]            = useState('');
  const [archivedFilter, setArchivedFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter]   = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [agentFilter, setAgentFilter]   = useState('');
  const [page, setPage]                 = useState(1);
  const [showFilters, setShowFilters]   = useState(false);
  const [sortKey, setSortKey]           = useState<SortKey>('created_at');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [viewMode, setViewMode]         = useState<ViewMode>('table');

  // ── Filter sources ──────────────────────────────────────
  const { data: statusData = [] } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  async () => (await leadsApi.statuses()).data,
  });

  const { data: stageData = [] } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  async () => (await leadsApi.stages()).data,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-for-filter'],
    queryFn:  () => usersApi.list({ role: 'agent', page_size: 100 }),
    enabled:  isAdminOrSupervisor,
  });

  const agents = useMemo(() => {
    const raw = (agentsData as any)?.results ?? (agentsData as any)?.data?.results ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [agentsData]);

  // ── Build query params ──────────────────────────────────
  const queryParams = useMemo(() => {
    const params: Record<string, any> = {
      page,
      page_size: 25,
    };
    if (search.trim())  params.search    = search.trim();
    if (statusFilter)   params.status    = statusFilter;
    if (stageFilter)    params.stage     = stageFilter;
    if (sourceFilter)   params.source    = sourceFilter;
    if (agentFilter)    params.assigned_to = agentFilter;
    if (sortKey)        params.ordering = (sortDir === 'desc' ? '-' : '') + sortKey;
        if (archivedFilter !== 'active') params.archived = archivedFilter;
    return params;
  }, [page, search, statusFilter, stageFilter, sourceFilter, agentFilter, sortKey, sortDir, archivedFilter]);

  // ── Leads query ─────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn:  () => leadsApi.list(queryParams).then(r => r.data),
    placeholderData: (prev: any) => prev,
  });

  const leads: Lead[] = data?.results ?? [];

  // ── KPI calculations ────────────────────────────────────
  const kpis = useMemo(() => {
    const totalCount   = data?.count ?? 0;
    const newThisWeek  = leads.filter(l => !isStale(l.created_at, 7)).length;
    const hot          = leads.filter(l =>
      l.priority_name?.toLowerCase().includes('high') ||
      l.priority_name?.toLowerCase().includes('hot')
    ).length;
    const wonStages    = (stageData as any[]).filter(s => s.is_won).map(s => s.id);
    const won          = leads.filter(l => l.stage && wonStages.includes(l.stage)).length;
    const totalValue   = leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
    return { totalCount, newThisWeek, hot, won, totalValue };
  }, [leads, data, stageData]);

  // ── Active filters count ────────────────────────────────
  const activeFiltersCount = [statusFilter, stageFilter, sourceFilter, agentFilter, search.trim()].filter(Boolean).length;

  // ── Handlers ────────────────────────────────────────────
  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setStageFilter('');
    setSourceFilter(''); setAgentFilter(''); setPage(1);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  const handleQuickCall = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.phone) return;
    window.dispatchEvent(new CustomEvent('sip:dial', {
      detail: { phone: lead.phone, leadId: lead.id, customerId: null },
    }));
  };

  const handleQuickWhatsApp = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.phone) return;
    const cleaned = lead.phone.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleaned}`, '_blank');
  };

  const exportCsv = () => {
    if (!leads.length) return;
    const headers = ['Name', 'Phone', 'Email', 'Company', 'Status', 'Stage', 'Source', 'Assigned', 'Value', 'Created'];
    const rows = leads.map(l => [
      getLeadDisplayName(l), l.phone || '', l.email || '', l.company || '',
      l.status_name || '', l.stage_name || '', l.source || '',
      l.assigned_name || '', l.value || '', l.created_at || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `leads_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Sortable header ─────────────────────────────────────
  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors">
      {label}
      {sortKey === k && (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}
    </button>
  );

  // ── Render: Lead Card (Mobile / Cards view) ────────────
  const LeadCard = ({ lead }: { lead: Lead }) => (
    <div onClick={() => router.push(`/leads/${lead.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md
                 transition-shadow cursor-pointer space-y-3">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected.has(lead.id)}
          onClick={e => e.stopPropagation()}
          onChange={() => toggleSelect(lead.id)}
          className="mt-1 rounded border-gray-300 text-blue-600 shrink-0"/>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center
                         font-semibold text-sm shrink-0 ${getAvatarColor(lead.id)}`}>
          {getInitials(getLeadDisplayName(lead))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{getLeadDisplayName(lead)}</p>
            {!lead.is_active && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700 shrink-0">
                Archived
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{lead.phone || '—'}</p>
          {lead.company && <p className="text-xs text-gray-400 truncate">{lead.company}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {lead.stage_name && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: lead.stage_color ?? '#6B7280' }}>
            {lead.stage_name}
          </span>
        )}
        {lead.status_name && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {lead.status_name}
          </span>
        )}
        {!isStale(lead.updated_at, 1) && lead.priority_name?.toLowerCase().includes('high') && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            🔥 Hot
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
        <span>{lead.assigned_name || 'Unassigned'}</span>
        <span className={isStale(lead.updated_at, 7) ? 'text-red-500 font-medium' : ''}>
          {timeAgo(lead.updated_at)}
        </span>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        {lead.phone && (
          <>
            <button onClick={e => handleQuickCall(e, lead)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                         bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-xs font-medium">
              <Phone size={12}/> Call
            </button>
            <button onClick={e => handleQuickWhatsApp(e, lead)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                         bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-xs font-medium">
              <MessageCircle size={12}/> WhatsApp
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Page Header ─────────────────────────────────── */}
      <PageHeader
        title="Leads"
        subtitle={`${data?.count ?? 0} total · ${selected.size > 0 ? `${selected.size} selected` : 'Manage your sales pipeline'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download size={16}/>} onClick={exportCsv} size="sm">
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button variant="secondary" icon={<LayoutGrid size={16}/>}
                    onClick={() => router.push('/leads/pipeline')} size="sm">
              <span className="hidden sm:inline">Pipeline</span>
            </Button>
            <Button variant="primary" icon={<Plus size={16}/>}
                    onClick={() => router.push('/leads/new')} size="sm">
              New Lead
            </Button>
          </div>
        }
      />

      {/* ── KPI Cards (Admin/Supervisor only) ─────────────── */}
      {isAdminOrSupervisor && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard title="Total" value={kpis.totalCount}
            icon={<Users size={18}/>} color="blue"/>
          <StatCard title="New (7d)" value={kpis.newThisWeek}
            icon={<TrendingUp size={18}/>} color="green"/>
          <StatCard title="Hot" value={kpis.hot}
            icon={<Flame size={18}/>} color="red"/>
          <StatCard title="Won" value={kpis.won}
            icon={<Trophy size={18}/>} color="yellow"/>
          <StatCard title="Pipeline (EGP)"
            value={kpis.totalValue.toLocaleString()}
            icon={<DollarSign size={18}/>} color="purple"
            className="col-span-2 md:col-span-1"/>
        </div>
      )}

      {/* ── Active / Archived / All Filter Tabs ───────────── */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {(['active', 'archived', 'all'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => { setArchivedFilter(opt); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              archivedFilter === opt
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            {opt === 'active'   && 'Active'}
            {opt === 'archived' && 'Archived'}
            {opt === 'all'      && 'All'}
          </button>
        ))}
      </div>

      {/* ── Search + Filter Toggle + View Mode ─────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input type="search" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
        </div>

        <Button variant="secondary" size="sm"
          icon={<Filter size={14}/>}
          onClick={() => setShowFilters(v => !v)}
          className={showFilters ? 'ring-2 ring-blue-200' : ''}>
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-semibold">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {/* View toggle - hidden on mobile (cards always) */}
        <div className="hidden md:flex border border-gray-300 rounded-lg p-0.5 bg-white">
          <button onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}
            title="Table view">
            <ListIcon size={14}/>
          </button>
          <button onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}
            title="Cards view">
            <GridIcon size={14}/>
          </button>
        </div>
      </div>

      {/* ── Filters Panel ─────────────────────────────────── */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All</option>
                {(statusData as any[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
              <select value={stageFilter}
                onChange={e => { setStageFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All</option>
                {(stageData as any[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select value={sourceFilter}
                onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {isAdminOrSupervisor && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Agent</label>
                <select value={agentFilter}
                  onChange={e => { setAgentFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Agents</option>
                  {agents.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <div className="flex justify-end pt-1">
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
                <X size={12}/> Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Bulk Actions Bar (when selection exists) ──────── */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5
                        flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-blue-800 font-medium">
            {selected.size} lead{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={exportCsv}>Export selected</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* ── Mobile: always cards / Desktop: depends on viewMode ── */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg"/></div>
        ) : leads.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            No leads found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {leads.map(lead => <LeadCard key={lead.id} lead={lead}/>)}
          </div>
        )}
      </div>

      {/* ── Desktop ──────────────────────────────────────── */}
      <div className="hidden md:block">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg"/></div>
        ) : leads.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Users size={40} className="text-gray-300 mx-auto mb-3"/>
            <p className="text-sm text-gray-500 mb-1">No leads match your filters.</p>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
                Clear filters →
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leads.map(lead => <LeadCard key={lead.id} lead={lead}/>)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox"
                        checked={leads.length > 0 && selected.size === leads.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-blue-600"/>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <SortHeader k="full_name" label="Lead"/>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <SortHeader k="value" label="Value"/>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <SortHeader k="updated_at" label="Last Activity"/>
                    </th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr key={lead.id}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors group">
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-gray-300 text-blue-600"/>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                           font-semibold text-xs shrink-0 ${getAvatarColor(lead.id)}`}>
                            {getInitials(getLeadDisplayName(lead))}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate max-w-xs">{getLeadDisplayName(lead)}</p>
                            <p className="text-xs text-gray-400 font-mono">{lead.phone || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.stage_name ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                style={{ backgroundColor: lead.stage_color ?? '#6B7280' }}>
                            {lead.stage_name}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {lead.status_name ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {lead.status_name}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                        {lead.value ? `EGP ${Number(lead.value).toLocaleString()}` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.assigned_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={isStale(lead.updated_at, 7) ? 'text-red-500 font-medium' : 'text-gray-500'}>
                          {timeAgo(lead.updated_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {lead.phone && (
                            <>
                              <button onClick={e => handleQuickCall(e, lead)}
                                title="Call"
                                className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                                <Phone size={12}/>
                              </button>
                              <button onClick={e => handleQuickWhatsApp(e, lead)}
                                title="WhatsApp"
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                <MessageCircle size={12}/>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────── */}
      {data && data.count > 25 && (
        <div className="flex items-center justify-between text-sm text-gray-500 flex-wrap gap-2">
          <span>
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.count)} of {data.count}
            {isFetching && <span className="ml-2 text-blue-500">↻</span>}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              disabled={!data.previous}
              onClick={() => setPage(p => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="secondary" size="sm"
              disabled={!data.next}
              onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
