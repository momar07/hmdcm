'use client';

import { useState }    from 'react';
import { useQuery }    from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, Legend,
} from 'recharts';
import { reportsApi }  from '@/lib/api/reports';
import { PageHeader }  from '@/components/ui/PageHeader';
import { StatCard }    from '@/components/ui/StatCard';
import { DataTable }   from '@/components/ui/DataTable';
import { Spinner }     from '@/components/ui/Spinner';
import { Button }      from '@/components/ui/Button';
import { Input }       from '@/components/ui/Input';
import { Select }      from '@/components/ui/Select';
import clsx            from 'clsx';
import {
  PhoneCall, PhoneIncoming, PhoneOff, Clock,
  LogIn, LogOut, Coffee, Users, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

type Tab = 'overview' | 'attendance';

function fmtSecs(s: number | null | undefined): string {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Attendance tab ────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function exportToExcel(summary: any[], sessions: any[], dateFrom: string, dateTo: string) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows = summary.map((s: any) => ({
    'Agent':          s.agent_name,
    'Email':          s.agent_email,
    'Sessions':       s.total_sessions,
    'Login Time':     fmtSecs(s.total_login_seconds),
    'Active Time':    fmtSecs(s.total_active_seconds),
    'Break Time':     fmtSecs(s.total_break_seconds),
    'Total Breaks':   s.total_breaks,
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  ws1['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  // Sheet 2: Sessions
  const sessionRows: any[] = [];
  sessions.forEach((s: any) => {
    sessionRows.push({
      'Agent':          s.agent_name,
      'Email':          s.agent_email,
      'Login':          s.login_at ? new Date(s.login_at).toLocaleString() : '—',
      'Logout':         s.logout_at ? new Date(s.logout_at).toLocaleString() : 'Active',
      'Duration':       fmtSecs(s.session_duration_seconds),
      'Break Count':    s.break_count,
      'Break Time':     fmtSecs(s.total_break_seconds),
      'Type':           'SESSION',
    });
    s.breaks?.forEach((b: any) => {
      sessionRows.push({
        'Agent':        '',
        'Email':        '',
        'Login':        b.break_start ? new Date(b.break_start).toLocaleString() : '—',
        'Logout':       b.break_end   ? new Date(b.break_end).toLocaleString()   : 'Ongoing',
        'Duration':     fmtSecs(b.duration_seconds),
        'Break Count':  '',
        'Break Time':   '',
        'Type':         `  ↳ ${b.reason}`,
      });
    });
  });
  const ws2 = XLSX.utils.json_to_sheet(sessionRows);
  ws2['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Sessions');

  XLSX.writeFile(wb, `attendance_${dateFrom}_${dateTo}.xlsx`);
}

function AttendanceReport() {
  const [dateFrom,  setDateFrom]  = useState(today());
  const [dateTo,    setDateTo]    = useState(today());
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [pageSize,  setPageSize]  = useState(25);
  const [page,      setPage]      = useState(1);
  const [searchParams, setSearchParams] = useState<{from: string; to: string} | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['report-attendance', searchParams?.from, searchParams?.to],
    queryFn:  () => reportsApi.agentAttendance({
                      date_from: searchParams!.from,
                      date_to:   searchParams!.to,
                    }).then((r) => r.data),
    enabled:  !!searchParams,
  });

  const summary  = data?.summary  ?? [];
  const sessions = data?.sessions ?? [];

  // Pagination
  const totalPages   = Math.ceil(sessions.length / pageSize);
  const pagedSessions = sessions.slice((page - 1) * pageSize, page * pageSize);

  // Reset page when search changes
  const handleSearch = () => {
    setPage(1);
    setExpanded(null);
    setSearchParams({ from: dateFrom, to: dateTo });
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4">
        <Input
          label="Date From"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-44"
        />
        <Input
          label="Date To"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-44"
        />
        <div className="pb-0.5 flex gap-2">
          <Button variant="primary" onClick={handleSearch} loading={isLoading}>
            Search
          </Button>
          {data && (
            <Button
              variant="secondary"
              onClick={() => exportToExcel(summary, sessions, dateFrom, dateTo)}
            >
              <Download size={14} className="mr-1.5" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Spinner size="lg" /></div>}

      {!isLoading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Total Sessions"
              value={summary.reduce((a: number, s: any) => a + s.total_sessions, 0)}
              icon={<LogIn size={20} />}
              color="blue"
            />
            <StatCard
              title="Agents Tracked"
              value={summary.length}
              icon={<Users size={20} />}
              color="green"
            />
            <StatCard
              title="Total Break Time"
              value={fmtSecs(summary.reduce((a: number, s: any) => a + s.total_break_seconds, 0))}
              icon={<Coffee size={20} />}
              color="yellow"
            />
            <StatCard
              title="Total Active Time"
              value={fmtSecs(summary.reduce((a: number, s: any) => a + s.total_active_seconds, 0))}
              icon={<Clock size={20} />}
              color="purple"
            />
          </div>

          {/* Per-agent summary table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Agent Summary</h3>
            </div>
            <DataTable
              columns={[
                { key: 'agent_name', header: 'Agent',
                  render: (a: any) => <p className="font-medium text-gray-900">{a.agent_name}</p> },
                { key: 'total_sessions', header: 'Sessions',
                  render: (a: any) => <span className="font-mono text-sm">{a.total_sessions}</span>, width: '90px' },
                { key: 'total_login_seconds', header: 'Login Time',
                  render: (a: any) => <span className="font-mono text-sm text-blue-600">{fmtSecs(a.total_login_seconds)}</span>, width: '110px' },
                { key: 'total_active_seconds', header: 'Active Time',
                  render: (a: any) => <span className="font-mono text-sm text-green-600">{fmtSecs(a.total_active_seconds)}</span>, width: '110px' },
                { key: 'total_break_seconds', header: 'Break Time',
                  render: (a: any) => <span className="font-mono text-sm text-yellow-600">{fmtSecs(a.total_break_seconds)}</span>, width: '110px' },
                { key: 'total_breaks', header: 'Breaks',
                  render: (a: any) => <span className="font-mono text-sm">{a.total_breaks}</span>, width: '80px' },
              ]}
              data={summary}
              keyField="agent_id"
              isLoading={false}
              emptyText="No data for selected range."
            />
          </div>

          {/* Session detail — paginated + expandable */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header with page-size selector */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Session Details
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({sessions.length} total)
                </span>
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Rows per page:</span>
                <select
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {pagedSessions.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">No sessions found.</p>
              )}
              {pagedSessions.map((s: any) => (
                <div key={s.session_id}>
                  <button
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpanded(expanded === s.session_id ? null : s.session_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{s.agent_name}</p>
                      <p className="text-xs text-gray-400">{s.agent_email}</p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600 text-xs">
                      <LogIn size={12} />
                      {new Date(s.login_at).toLocaleTimeString()}
                    </div>
                    <div className="flex items-center gap-1 text-red-500 text-xs">
                      <LogOut size={12} />
                      {s.logout_at ? new Date(s.logout_at).toLocaleTimeString() : (
                        <span className="text-green-500 font-medium">Active</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 w-20 text-right">
                      {fmtSecs(s.session_duration_seconds)}
                    </div>
                    <div className="flex items-center gap-1 text-yellow-600 text-xs w-16 text-right">
                      <Coffee size={11} />
                      {s.break_count} breaks
                    </div>
                    <span className="text-gray-400 text-xs ml-2">
                      {expanded === s.session_id ? '▲' : '▼'}
                    </span>
                  </button>

                  {expanded === s.session_id && s.breaks.length > 0 && (
                    <div className="bg-yellow-50 border-t border-yellow-100 px-8 py-3">
                      <p className="text-xs font-semibold text-yellow-700 mb-2">Break Log</p>
                      <div className="space-y-1.5">
                        {s.breaks.map((b: any) => (
                          <div key={b.id} className="flex items-center gap-4 text-xs text-gray-600">
                            <span className="w-20 font-medium text-yellow-700">{b.reason}</span>
                            <span>{b.break_start ? new Date(b.break_start).toLocaleTimeString() : '—'}</span>
                            <span>→</span>
                            <span>{b.break_end ? new Date(b.break_end).toLocaleTimeString() : <span className="text-yellow-600">Ongoing</span>}</span>
                            <span className="ml-auto font-mono">{fmtSecs(b.duration_seconds)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {expanded === s.session_id && s.breaks.length === 0 && (
                    <div className="bg-gray-50 border-t border-gray-100 px-8 py-2 text-xs text-gray-400">
                      No breaks taken in this session.
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sessions.length)} of {sessions.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(1)}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >«</button>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={clsx(
                          'px-2.5 py-1 rounded border text-xs',
                          p === page
                            ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                            : 'border-gray-200 hover:bg-gray-50'
                        )}
                      >{p}</button>
                    );
                  })}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >›</button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(totalPages)}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >»</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!isLoading && !searchParams && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Select a date range and click <strong>Search</strong> to load attendance data.
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['report-call-summary'],
    queryFn:  () => reportsApi.callSummary().then((r) => r.data),
  });

  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ['report-agents'],
    queryFn:  () => reportsApi.agentPerformance().then((r) => r.data),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['report-pipeline'],
    queryFn:  () => reportsApi.leadPipeline().then((r) => r.data),
  });

  const statusChartData = summary
    ? [
        { name: 'Answered',  value: summary.answered  },
        { name: 'No Answer', value: summary.no_answer  },
        { name: 'Busy',      value: summary.busy       },
        { name: 'Failed',    value: summary.failed     },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Performance metrics for your call center"
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'overview',   label: 'Overview',    icon: <PhoneCall size={14} /> },
          { id: 'attendance', label: 'Attendance',  icon: <LogIn     size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Attendance tab */}
      {activeTab === 'attendance' && <AttendanceReport />}

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {loadingSummary ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : summary && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="Total Calls"  value={summary.total.toLocaleString()}
                icon={<PhoneCall size={20} />} color="blue" />
              <StatCard title="Answered"     value={summary.answered.toLocaleString()}
                icon={<PhoneIncoming size={20} />} color="green"
                subtitle={`${summary.total ? Math.round((summary.answered/summary.total)*100) : 0}% answer rate`} />
              <StatCard title="No Answer"    value={summary.no_answer.toLocaleString()}
                icon={<PhoneOff size={20} />} color="red" />
              <StatCard title="Avg Duration" value={`${Math.round(summary.avg_duration)}s`}
                icon={<Clock size={20} />} color="purple" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Call Outcomes</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusChartData} cx="50%" cy="50%" outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                    labelLine={false}>
                    {statusChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {pipeline && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Lead Pipeline</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={pipeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status__name" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Agent Performance</h3>
            </div>
            <DataTable
              columns={[
                { key: 'name',           header: 'Agent',
                  render: (a: any) => <p className="font-medium text-gray-900">{a.first_name} {a.last_name}</p> },
                { key: 'total_calls',    header: 'Total Calls',
                  render: (a: any) => <span className="font-mono text-sm">{a.total_calls}</span>, width: '110px' },
                { key: 'answered_calls', header: 'Answered',
                  render: (a: any) => <span className="font-mono text-sm text-green-600">{a.answered_calls}</span>, width: '100px' },
                { key: 'avg_duration',   header: 'Avg Duration',
                  render: (a: any) => <span className="font-mono text-sm">{a.avg_duration ? `${Math.round(Number(a.avg_duration))}s` : '—'}</span>, width: '120px' },
                { key: 'total_leads',    header: 'Leads',
                  render: (a: any) => <span className="font-mono text-sm">{a.total_leads}</span>, width: '80px' },
              ]}
              data={agents ?? []}
              keyField="id"
              isLoading={loadingAgents}
              emptyText="No agent data available."
            />
          </div>
        </div>
      )}
    </div>
  );
}
