'use client';

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
import { PhoneCall, PhoneIncoming, PhoneOff, Clock } from 'lucide-react';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportsPage() {
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
        { name: 'Answered',  value: summary.answered },
        { name: 'No Answer', value: summary.no_answer },
        { name: 'Busy',      value: summary.busy },
        { name: 'Failed',    value: summary.failed },
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Performance metrics for your call center"
      />

      {/* ── Call Summary Cards ── */}
      {loadingSummary ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : summary && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Calls"
            value={summary.total.toLocaleString()}
            icon={<PhoneCall size={20} />}
            color="blue"
          />
          <StatCard
            title="Answered"
            value={summary.answered.toLocaleString()}
            icon={<PhoneIncoming size={20} />}
            color="green"
            subtitle={`${summary.total
              ? Math.round((summary.answered / summary.total) * 100)
              : 0}% answer rate`}
          />
          <StatCard
            title="No Answer"
            value={summary.no_answer.toLocaleString()}
            icon={<PhoneOff size={20} />}
            color="red"
          />
          <StatCard
            title="Avg Duration"
            value={`${Math.round(summary.avg_duration)}s`}
            icon={<Clock size={20} />}
            color="purple"
          />
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Status Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Call Outcomes
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusChartData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {statusChartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Lead Pipeline Bar */}
        {pipeline && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Lead Pipeline
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pipeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="status__name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Agent Performance Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Agent Performance
          </h3>
        </div>
        <DataTable
          columns={[
            {
              key: 'name', header: 'Agent',
              render: (a: Record<string, unknown>) => (
                <p className="font-medium text-gray-900">
                  {String(a.first_name)} {String(a.last_name)}
                </p>
              ),
            },
            {
              key: 'total_calls', header: 'Total Calls',
              render: (a: Record<string, unknown>) => (
                <span className="font-mono text-sm">{String(a.total_calls)}</span>
              ),
              width: '110px',
            },
            {
              key: 'answered_calls', header: 'Answered',
              render: (a: Record<string, unknown>) => (
                <span className="font-mono text-sm text-green-600">
                  {String(a.answered_calls)}
                </span>
              ),
              width: '100px',
            },
            {
              key: 'avg_duration', header: 'Avg Duration',
              render: (a: Record<string, unknown>) => (
                <span className="font-mono text-sm">
                  {a.avg_duration
                    ? `${Math.round(Number(a.avg_duration))}s`
                    : '—'}
                </span>
              ),
              width: '120px',
            },
            {
              key: 'total_leads', header: 'Leads',
              render: (a: Record<string, unknown>) => (
                <span className="font-mono text-sm">{String(a.total_leads)}</span>
              ),
              width: '80px',
            },
          ]}
          data={agents ?? []}
          keyField="id"
          isLoading={loadingAgents}
          emptyText="No agent data available."
        />
      </div>
    </div>
  );
}
