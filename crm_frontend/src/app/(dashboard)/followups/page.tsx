'use client';

import { useState }                                from 'react';
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, Calendar,
  PhoneCall, Mail, Users, MessageSquare,
  RefreshCw, Plus, Filter,
} from 'lucide-react';
import toast                   from 'react-hot-toast';
import { followupsApi }        from '@/lib/api/followups';
import { PageHeader }          from '@/components/ui/PageHeader';
import { Button }              from '@/components/ui/Button';
import { Select }              from '@/components/ui/Select';
import { StatusBadge }         from '@/components/ui/StatusBadge';
import { Modal }               from '@/components/ui/Modal';
import { Input }               from '@/components/ui/Input';
import type { Followup }       from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ReactNode> = {
  call:    <PhoneCall    size={14} className="text-blue-500"   />,
  email:   <Mail         size={14} className="text-green-500"  />,
  meeting: <Users        size={14} className="text-purple-500" />,
  sms:     <MessageSquare size={14} className="text-orange-500"/>,
  other:   <Clock        size={14} className="text-gray-400"   />,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / 1000 / 60; // minutes

  if (diff < -60 * 24)  return { label: d.toLocaleDateString(), overdue: true };
  if (diff < 0)         return { label: 'Overdue', overdue: true };
  if (diff < 60)        return { label: `In ${Math.round(diff)}m`, overdue: false };
  if (diff < 60 * 24)   return { label: `In ${Math.round(diff / 60)}h`, overdue: false };
  return { label: d.toLocaleDateString(), overdue: false };
}

// ── Reschedule Modal ──────────────────────────────────────────────────────
function RescheduleModal({
  followup, onClose,
}: { followup: Followup; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(
    followup.scheduled_at ? followup.scheduled_at.split('T')[0] : ''
  );
  const [time, setTime] = useState(
    followup.scheduled_at ? followup.scheduled_at.split('T')[1]?.slice(0, 5) || '09:00' : '09:00'
  );

  const { mutate, isPending: isLoading } = useMutation({
    mutationFn: () =>
      followupsApi.reschedule(followup.id, `${date}T${time}:00`),
    onSuccess: () => {
      toast.success('Follow-up rescheduled ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      onClose();
    },
    onError: () => toast.error('Failed to reschedule'),
  });

  return (
    <Modal open onClose={onClose} title="Reschedule Follow-up" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 font-medium">{followup.title}</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
            <input
              type="time"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<RefreshCw size={14} />}
            loading={isLoading}
            onClick={() => mutate()}
            disabled={!date || !time}
          >
            Reschedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Followup Card ─────────────────────────────────────────────────────────
function FollowupCard({
  f,
  onComplete,
  onCancel,
  onReschedule,
  completing,
  cancelling,
}: {
  f:           Followup;
  onComplete:  (id: string) => void;
  onCancel:    (id: string) => void;
  onReschedule:(f: Followup) => void;
  completing:  string | null;
  cancelling:  string | null;
}) {
  const { label, overdue } = formatDate(f.scheduled_at);
  const isPending = f.status === 'pending';

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3
        transition-all hover:shadow-md
        ${overdue && isPending ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span>{TYPE_ICON[f.followup_type] ?? TYPE_ICON.other}</span>
          <p className="text-sm font-semibold text-gray-900 truncate">{f.title}</p>
        </div>
        <StatusBadge status={f.status} size="xs" />
      </div>

      {/* meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {f.lead_title && (
          <span className="flex items-center gap-1">
            <Users size={11} />
            {f.lead_title}
          </span>
        )}
        <span
          className={`flex items-center gap-1 font-medium
            ${overdue && isPending ? 'text-red-600' : 'text-gray-600'}`}
        >
          <Calendar size={11} />
          {label}
        </span>
        {f.assigned_to_name && (
          <span className="flex items-center gap-1">
            👤 {f.assigned_to_name}
          </span>
        )}
      </div>

      {/* description */}
      {f.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{f.description}</p>
      )}

      {/* actions */}
      {isPending && (
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <Button
            variant="success" size="sm"
            icon={<CheckCircle size={13} />}
            loading={completing === f.id}
            onClick={() => onComplete(f.id)}
            className="flex-1"
          >
            Done
          </Button>
          <Button
            variant="secondary" size="sm"
            icon={<RefreshCw size={13} />}
            onClick={() => onReschedule(f)}
          >
            Reschedule
          </Button>
          <Button
            variant="danger" size="sm"
            icon={<XCircle size={13} />}
            loading={cancelling === f.id}
            onClick={() => onCancel(f.id)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function FollowupsPage() {
  const qc = useQueryClient();

  const [statusFilter,   setStatusFilter]   = useState('pending');
  const [typeFilter,     setTypeFilter]     = useState('');
  const [page,           setPage]           = useState(1);
  const [rescheduling,   setRescheduling]   = useState<Followup | null>(null);
  const [completing,     setCompleting]     = useState<string | null>(null);
  const [cancelling,     setCancelling]     = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['followups', statusFilter, typeFilter, page],
    queryFn:  () =>
      followupsApi.list({
        status:        statusFilter  || undefined,
        followup_type: typeFilter    || undefined,
        page,
        page_size:     20,
      }).then((r) => r.data),
    placeholderData: (prev: any) => prev,
    refetchInterval:  30_000,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => {
      setCompleting(id);
      return followupsApi.complete(id);
    },
    onSuccess: () => {
      toast.success('Follow-up marked as completed ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
    onError:   () => toast.error('Failed to complete follow-up'),
    onSettled: () => setCompleting(null),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => {
      setCancelling(id);
      return followupsApi.cancel(id);
    },
    onSuccess: () => {
      toast.success('Follow-up cancelled');
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
    onError:   () => toast.error('Failed to cancel follow-up'),
    onSettled: () => setCancelling(null),
  });

  const results    = data?.results ?? [];
  const totalCount = data?.count   ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  // ── stats strip ──────────────────────────────────────────────────────
  const pendingCount = results.filter((f) => f.status === 'pending').length;
  const overdueCount = results.filter((f) => {
    if (f.status !== 'pending') return false;
    return new Date(f.scheduled_at) < new Date();
  }).length;

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${totalCount} total`}
        actions={
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <RefreshCw size={14} className="animate-spin text-gray-400" />
            )}
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pending',   value: pendingCount,               color: 'yellow' },
          { label: 'Overdue',   value: overdueCount,               color: 'red'    },
          { label: 'This page', value: results.length,             color: 'blue'   },
          { label: 'Total',     value: totalCount,                 color: 'gray'   },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-${s.color}-50 border border-${s.color}-100
              rounded-xl p-3 text-center`}
          >
            <p className={`text-2xl font-bold text-${s.color}-700`}>{s.value}</p>
            <p className={`text-xs text-${s.color}-600 mt-0.5`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Select
          options={[
            { value: '',           label: 'All Statuses'  },
            { value: 'pending',    label: '🟡 Pending'    },
            { value: 'completed',  label: '✅ Completed'  },
            { value: 'cancelled',  label: '❌ Cancelled'  },
            { value: 'rescheduled',label: '🔄 Rescheduled'},
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-44"
        />
        <Select
          options={[
            { value: '',        label: 'All Types'  },
            { value: 'call',    label: '📞 Call'    },
            { value: 'email',   label: '✉️ Email'   },
            { value: 'meeting', label: '🤝 Meeting' },
            { value: 'sms',     label: '💬 SMS'     },
            { value: 'other',   label: '📌 Other'   },
          ]}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200
              shadow-sm p-4 animate-pulse h-36" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-lg font-medium text-gray-500">No follow-ups found</p>
          <p className="text-sm mt-1">
            {statusFilter === 'pending'
              ? 'Great! No pending follow-ups.'
              : 'Try changing the filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((f) => (
            <FollowupCard
              key={f.id}
              f={f}
              completing={completing}
              cancelling={cancelling}
              onComplete={(id) => completeMutation.mutate(id)}
              onCancel={(id)   => cancelMutation.mutate(id)}
              onReschedule={(fu) => setRescheduling(fu)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary" size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary" size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduling && (
        <RescheduleModal
          followup={rescheduling}
          onClose={() => setRescheduling(null)}
        />
      )}
    </div>
  );
}
