'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { agentStatusApi } from '@/lib/api/users';
import { useAuthStore } from '@/store';
import {
  X, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Clock, Coffee, Mail, User as UserIcon, Hash, Users as UsersIcon,
  ChevronDown, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface RecentCall {
  id:         string;
  lead_name:  string | null;
  caller:     string | null;
  direction:  string;
  status:     string;
  duration:   number | null;
  created_at: string;
}

interface AgentDetails {
  id:           string;
  name:         string;
  email:        string;
  role:         string;
  status:       string;
  status_since: string | null;
  extension:    string | null;
  team_name:    string | null;
  session: {
    login_at: string | null;
    duration_seconds: number | null;
  };
  today_stats: {
    total:         number;
    answered:      number;
    missed:        number;
    avg_duration:  number;
    break_seconds: number;
    break_count:   number;
  };
  recent_calls: RecentCall[];
  server_now:   string;
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CallIcon({ direction, status }: { direction: string; status: string }) {
  if (status === 'missed' || status === 'no_answer')
    return <PhoneMissed size={14} className="text-red-500" />;
  if (direction === 'inbound')
    return <PhoneIncoming size={14} className="text-blue-500" />;
  return <PhoneOutgoing size={14} className="text-green-500" />;
}

export function AgentDetailsDrawer({
  agentId, onClose,
}: { agentId: string; onClose: () => void }) {
  const { user } = useAuthStore();
  const qc       = useQueryClient();
  const [forceMenuOpen, setForceMenuOpen] = useState(false);

  const { data, isLoading, error } = useQuery<AgentDetails>({
    queryKey:        ['agent-details', agentId],
    queryFn:         () => agentStatusApi.agentDetails(agentId).then(r => r.data),
    refetchInterval: 15_000,
  });

  const forceMut = useMutation({
    mutationFn: ({ status, reason }: { status: 'available' | 'away' | 'offline'; reason?: string }) =>
      agentStatusApi.forceStatus(agentId, status, reason),
    onSuccess: (_d, vars) => {
      toast.success(`Status changed to ${vars.status}`);
      qc.invalidateQueries({ queryKey: ['live-agents'] });
      qc.invalidateQueries({ queryKey: ['agent-details', agentId] });
      setForceMenuOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to change status');
    },
  });

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canForce = !!user && (user.role === 'admin' || user.role === 'supervisor');
  const isSelf   = !!user && user.id === agentId;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl
                      z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {data?.name ?? 'Agent details'}
            </h2>
            {data?.email && (
              <p className="text-xs text-gray-500 truncate">{data.email}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-gray-300" />
            </div>
          )}

          {error && (
            <div className="px-5 py-10 text-center text-sm text-red-500">
              Failed to load agent details.
            </div>
          )}

          {data && (
            <div className="p-5 space-y-5">
              {/* Quick info rows */}
              <div className="space-y-2 text-sm">
                <InfoRow icon={<UserIcon size={14}/>} label="Role" value={data.role}/>
                {data.extension && (
                  <InfoRow icon={<Hash size={14}/>} label="Extension" value={data.extension}/>
                )}
                {data.team_name && (
                  <InfoRow icon={<UsersIcon size={14}/>} label="Team" value={data.team_name}/>
                )}
                <InfoRow icon={<Mail size={14}/>} label="Email" value={data.email}/>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <StatusPill status={data.status} />
                {data.status_since && (
                  <span className="text-xs text-gray-400">
                    since {fmtTime(data.status_since)}
                  </span>
                )}
              </div>

              {/* Force status (supervisors/admins, not self) */}
              {canForce && !isSelf && (
                <div className="relative">
                  <button
                    onClick={() => setForceMenuOpen(v => !v)}
                    disabled={forceMut.isPending}
                    className="w-full flex items-center justify-between px-3 py-2
                               border border-amber-200 bg-amber-50 hover:bg-amber-100
                               rounded-lg text-sm text-amber-800 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      {forceMut.isPending && <Loader2 size={14} className="animate-spin"/>}
                      Force status change
                    </span>
                    <ChevronDown size={14}/>
                  </button>

                  {forceMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border
                                    border-gray-200 rounded-lg shadow-lg z-10 py-1">
                      {(['available', 'away', 'offline'] as const).map(s => (
                        <button
                          key={s}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 capitalize"
                          onClick={() => forceMut.mutate({
                            status: s,
                            reason: `Forced by ${user?.first_name} ${user?.last_name}`,
                          })}
                        >
                          Set to {s === 'away' ? 'Break' : s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Today's stats */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Today's activity
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <StatBox label="Total calls"   value={data.today_stats.total}/>
                  <StatBox label="Answered"      value={data.today_stats.answered}/>
                  <StatBox label="Missed"        value={data.today_stats.missed}
                           color={data.today_stats.missed > 0 ? 'text-red-600' : ''}/>
                  <StatBox label="Avg duration"  value={fmtDuration(data.today_stats.avg_duration)}/>
                  <StatBox label="Break time"
                           value={fmtDuration(data.today_stats.break_seconds)}
                           icon={<Coffee size={12} className="text-yellow-500"/>}/>
                  <StatBox label="Break count"   value={data.today_stats.break_count}/>
                </div>
              </div>

              {/* Session */}
              {data.session.login_at && (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg
                                px-3 py-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12}/> Session started
                  </span>
                  <span className="font-mono">{fmtTime(data.session.login_at)}</span>
                </div>
              )}

              {/* Recent calls */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Recent calls ({data.recent_calls.length})
                </h3>
                {data.recent_calls.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 border
                                  border-dashed border-gray-200 rounded-lg">
                    No calls today
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {data.recent_calls.map(c => (
                      <div key={c.id}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50
                                   rounded-lg text-xs">
                        <CallIcon direction={c.direction} status={c.status}/>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">
                            {c.lead_name || c.caller || '—'}
                          </p>
                          <p className="text-gray-400">
                            {fmtTime(c.created_at)} · {c.status}
                          </p>
                        </div>
                        {c.duration && (
                          <span className="font-mono text-gray-500 shrink-0">
                            {fmtDuration(c.duration)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon, label, value }: {
  icon: React.ReactNode; label: string; value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-gray-600">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-gray-400 w-20">{label}</span>
      <span className="font-medium text-gray-800 truncate">{value}</span>
    </div>
  );
}

function StatBox({ label, value, color, icon }: {
  label: string; value: string | number; color?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
        {icon} {label}
      </div>
      <div className={`text-base font-bold mt-0.5 ${color || 'text-gray-800'}`}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    available: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Available' },
    on_call:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'On Call' },
    busy:      { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Busy' },
    away:      { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Break' },
    offline:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Offline' },
  };
  const c = cfg[status] ?? cfg.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                      text-xs font-medium ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current"/>
      {c.label}
    </span>
  );
}
