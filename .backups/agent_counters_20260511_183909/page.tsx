'use client';

import { useQuery }     from '@tanstack/react-query';
import { PhoneCall, Users, BookOpen, ClipboardList,
         PhoneIncoming, PhoneOutgoing, Clock } from 'lucide-react';
import { dashboardApi } from '@/lib/api/dashboard';
import { StatCard }     from '@/components/ui/StatCard';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Spinner }      from '@/components/ui/Spinner';
import { useAuthStore } from '@/store';
import type { AgentDashboard, SupervisorDashboard, AdminDashboard } from '@/types';

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => dashboardApi.get().then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.first_name ?? 'User'}`}
        subtitle={`Your ${data.role} overview — live data`}
      />

      {data.role === 'agent' && <AgentDashboardView data={data as AgentDashboard} />}
      {data.role === 'supervisor' && <SupervisorDashboardView data={data as SupervisorDashboard} />}
      {data.role === 'admin' && <AdminDashboardView data={data as AdminDashboard} />}
    </div>
  );
}

/* ── Agent View ─────────────────────────────────────────────────────────── */
function AgentDashboardView({ data }: { data: AgentDashboard }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <StatCard
        title="Calls Today"
        value={data.calls_today}
        icon={<PhoneCall size={20} />}
        color="blue"
        subtitle={`${data.answered_today} answered`}
      />
      <StatCard
        title="Avg Duration"
        value={`${Math.round(data.avg_duration_today)}s`}
        icon={<Clock size={20} />}
        color="purple"
        subtitle="per call today"
      />
      <StatCard
        title="Open Leads"
        value={data.open_leads}
        icon={<BookOpen size={20} />}
        color="green"
      />
      <StatCard
        title="Pending Follow-ups"
        value={data.pending_followups}
        icon={<ClipboardList size={20} />}
        color="yellow"
        subtitle={`${data.due_followups} due now`}
        trend={data.due_followups > 0 ? 'down' : 'neutral'}
        trendValue={data.due_followups > 0 ? `${data.due_followups} overdue` : 'All on track'}
      />
    </div>
  );
}

/* ── Supervisor View ────────────────────────────────────────────────────── */
function SupervisorDashboardView({ data }: { data: SupervisorDashboard }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Agents Available"
          value={`${data.agents_available} / ${data.team_size}`}
          icon={<Users size={20} />}
          color="green"
        />
        <StatCard
          title="Agents On Call"
          value={data.agents_on_call}
          icon={<PhoneCall size={20} />}
          color="blue"
        />
        <StatCard
          title="Calls Today"
          value={data.calls_today}
          icon={<PhoneIncoming size={20} />}
          color="purple"
          subtitle={`${data.answered_today} answered`}
        />
        <StatCard
          title="Avg Duration"
          value={`${Math.round(data.avg_duration_today)}s`}
          icon={<Clock size={20} />}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Active Calls (Live)"
          value={data.active_calls}
          icon={<PhoneOutgoing size={20} />}
          color="red"
          subtitle="Currently in progress"
        />
        <StatCard
          title="Team Size"
          value={data.team_size}
          icon={<Users size={20} />}
          color="gray"
        />
      </div>
    </div>
  );
}

/* ── Admin View ─────────────────────────────────────────────────────────── */
function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <StatCard
        title="Total Leads"
        value={data.total_leads.toLocaleString()}
        icon={<BookOpen size={20} />}
        color="green"
      />
      <StatCard
        title="Calls Today"
        value={data.calls_today}
        icon={<PhoneCall size={20} />}
        color="purple"
      />
      <StatCard
        title="Calls This Week"
        value={data.calls_this_week}
        icon={<PhoneIncoming size={20} />}
        color="yellow"
      />
      <StatCard
        title="Active Agents"
        value={`${data.active_agents} / ${data.total_agents}`}
        icon={<Users size={20} />}
        color="green"
        subtitle="Currently online"
      />
    </div>
  );
}
