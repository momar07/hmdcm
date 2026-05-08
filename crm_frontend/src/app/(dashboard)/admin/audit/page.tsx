'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, RefreshCw, Download, Filter, X, ChevronLeft, ChevronRight,
  User as UserIcon, Activity as ActivityIcon, Clock,
} from 'lucide-react';
import { auditApi } from '@/lib/api/audit';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/store';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

type LogTab = 'activity' | 'audit';

const VERB_OPTIONS = [
  { value: '',                label: 'All actions' },
  { value: 'lead.created',    label: 'Lead created' },
  { value: 'lead.updated',    label: 'Lead updated' },
  { value: 'lead.archived',   label: 'Lead archived' },
  { value: 'lead.restored',   label: 'Lead restored' },
  { value: 'lead.deleted',    label: 'Lead deleted (permanent)' },
  { value: 'lead.assigned',   label: 'Lead assigned' },
  { value: 'lead.stage_changed',  label: 'Lead stage changed' },
  { value: 'lead.status_changed', label: 'Lead status changed' },
];

const ACTION_OPTIONS = [
  { value: '',        label: 'All HTTP actions' },
  { value: 'create',  label: 'Create' },
  { value: 'update',  label: 'Update' },
  { value: 'delete',  label: 'Delete' },
  { value: 'login',   label: 'Login' },
  { value: 'logout',  label: 'Logout' },
  { value: 'export',  label: 'Export' },
  { value: 'call',    label: 'Call' },
];

function formatTime(ts: string) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditLogsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Admin-only guard
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const [tab, setTab]           = useState<LogTab>('activity');
  const [userFilter, setUser]   = useState('');
  const [verbFilter, setVerb]   = useState('');
  const [actionFilter, setAct]  = useState('');
  const [page, setPage]         = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reset filters/page when switching tab
  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [tab, userFilter, verbFilter, actionFilter]);

  // Users dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-for-audit-filter'],
    queryFn:  () => usersApi.list({ page_size: 200 }),
    enabled:  user?.role === 'admin',
  });
  const users = useMemo(() => {
    const raw = (usersData as any)?.results ?? (usersData as any)?.data?.results ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [usersData]);

  // Logs query
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit-logs', tab, userFilter, verbFilter, actionFilter, page],
    queryFn:  async () => {
      const params: any = { page };
      if (userFilter) params.user = userFilter;
      if (tab === 'activity') {
        if (verbFilter) params.verb = verbFilter;
        const r = await auditApi.activityLogs(params);
        return r.data;
      } else {
        if (actionFilter) params.action = actionFilter;
        const r = await auditApi.auditLogs(params);
        return r.data;
      }
    },
    enabled: user?.role === 'admin',
    placeholderData: (prev: any) => prev,
  });

  const logs    = data?.results ?? [];
  const total   = data?.count ?? 0;
  const hasNext = !!data?.next;
  const hasPrev = !!data?.previous;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setUser(''); setVerb(''); setAct(''); setPage(1);
  };

  const exportCsv = () => {
    if (!logs.length) return;
    const headers = tab === 'activity'
      ? ['Timestamp', 'User', 'Verb', 'Description', 'Lead', 'Extra']
      : ['Timestamp', 'User', 'Action', 'Model', 'Object', 'IP', 'Changes'];
    const rows = logs.map((l: any) => tab === 'activity'
      ? [l.timestamp, l.user_name || '', l.verb || '', l.description || '',
         l.lead || '', JSON.stringify(l.extra || {})]
      : [l.timestamp, l.user_name || '', l.action || '', l.model_name || '',
         l.object_repr || l.object_id || '', l.ip_address || '',
         JSON.stringify(l.changes || {})]
    );
    const csv = [headers, ...rows].map(r =>
      r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${tab}_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtersActive =
    !!userFilter || (tab === 'activity' ? !!verbFilter : !!actionFilter);

  if (user && user.role !== 'admin') {
    return null;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Logs"
        subtitle={`${total} ${tab === 'activity' ? 'business events' : 'HTTP audit entries'}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14}/>}
                    onClick={() => refetch()}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" icon={<Download size={14}/>}
                    onClick={exportCsv} disabled={!logs.length}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Tabs: Activity (business) vs Audit (HTTP) */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'activity'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <ActivityIcon size={14}/> Business Activity
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'audit'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShieldCheck size={14}/> HTTP Audit
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
            <select value={userFilter}
              onChange={e => setUser(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All users</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {tab === 'activity' ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Verb</label>
              <select value={verbFilter}
                onChange={e => setVerb(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                {VERB_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
              <select value={actionFilter}
                onChange={e => setAct(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ACTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            {filtersActive && (
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-gray-500
                           hover:text-red-600 px-2 py-2">
                <X size={12}/> Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Logs list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No logs found{filtersActive ? ' for the current filters' : ''}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2 w-44">Time</th>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">{tab === 'activity' ? 'Verb' : 'Action'}</th>
                <th className="text-left px-3 py-2">{tab === 'activity' ? 'Description' : 'Target'}</th>
                <th className="text-left px-3 py-2 w-32">{tab === 'activity' ? '' : 'IP'}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l: any) => {
                const isOpen = expanded.has(l.id);
                const extraOrChanges = tab === 'activity' ? l.extra : l.changes;
                return (
                  <>
                    <tr key={l.id} className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpand(l.id)}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">
                        <Clock size={11} className="inline mr-1 text-gray-400"/>
                        {formatTime(l.timestamp)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <UserIcon size={12} className="text-gray-400"/>
                          <span className="font-medium">{l.user_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs
                                       font-medium bg-blue-50 text-blue-700">
                          {tab === 'activity' ? l.verb : l.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 truncate max-w-md">
                        {tab === 'activity'
                          ? (l.description || '—')
                          : (l.object_repr || l.model_name || '—')}
                      </td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                        {tab === 'activity' ? '' : (l.ip_address || '—')}
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs">
                        {extraOrChanges && Object.keys(extraOrChanges).length > 0
                          ? (isOpen ? '▼' : '▶') : ''}
                      </td>
                    </tr>
                    {isOpen && extraOrChanges && Object.keys(extraOrChanges).length > 0 && (
                      <tr key={l.id + '-detail'} className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-3">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap
                                          font-mono overflow-x-auto">
                            {JSON.stringify(extraOrChanges, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {logs.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2
                          bg-gray-50 border-t border-gray-200 text-sm">
            <span className="text-gray-500 text-xs">
              Page {page} · {total} total {isFetching && '(refreshing…)'}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!hasPrev}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40
                           hover:bg-white">
                <ChevronLeft size={14}/>
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNext}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40
                           hover:bg-white">
                <ChevronRight size={14}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
