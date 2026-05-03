'use client';

import { useParams, useRouter }              from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing,
  Clock, User, CheckCircle, Calendar,
} from 'lucide-react';
import toast              from 'react-hot-toast';
import { callsApi }       from '@/lib/api/calls';
import { PageHeader }     from '@/components/ui/PageHeader';
import { Button }         from '@/components/ui/Button';
import { StatusBadge }    from '@/components/ui/StatusBadge';
import { Spinner }        from '@/components/ui/Spinner';
import { CallCompletionModal } from '@/components/calls/CallCompletionModal';
import { useState }       from 'react';

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5
                    border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

export default function CallDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const [completing, setCompleting] = useState(false);

  const { data: call, isLoading } = useQuery({
    queryKey: ['call', id],
    queryFn:  () => callsApi.get(id).then((r) => r.data),
    refetchInterval: 10_000,
  });

  if (isLoading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );
  if (!call) return (
    <div className="text-center py-20 text-gray-400">Call not found.</div>
  );

  const c = call as any;
  const isAnswered   = c.status === 'answered';
  const isCompleted  = c.is_completed;
  const dirIcon      = c.direction === 'inbound'
    ? <PhoneIncoming size={16} className="text-green-500" />
    : <PhoneOutgoing size={16} className="text-blue-500" />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Call Detail"
        subtitle={c.uniqueid}
        actions={
          <div className="flex gap-2">
            {isAnswered && !isCompleted && (
              <Button
                variant="primary"
                icon={<CheckCircle size={15} />}
                onClick={() => setCompleting(true)}
              >
                Complete Call
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<ArrowLeft size={15} />}
              onClick={() => router.back()}
            >
              Back
            </Button>
          </div>
        }
      />

      {/* Status banner */}
      <div className={`rounded-xl p-4 flex items-center gap-3
        ${isCompleted
          ? 'bg-green-50 border border-green-200'
          : isAnswered
            ? 'bg-blue-50 border border-blue-200'
            : 'bg-gray-50 border border-gray-200'}`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center
          ${isCompleted ? 'bg-green-100' : 'bg-white border border-gray-200'}`}>
          {isCompleted
            ? <CheckCircle size={20} className="text-green-600" />
            : <Phone size={20} className="text-gray-500" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} size="sm" />
            {isCompleted && (
              <span className="text-xs text-green-700 font-medium">✅ Completed</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {c.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'} call
          </p>
        </div>
      </div>

      {/* Call info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
          Call Information
        </p>
        <InfoRow label="From"      value={<span className="font-mono">{c.caller || '—'}</span>} />
        <InfoRow label="To"        value={<span className="font-mono">{c.callee || '—'}</span>} />
        <InfoRow label="Direction" value={<span className="flex items-center gap-1">{dirIcon} {c.direction}</span>} />
        <InfoRow label="Duration"  value={formatDuration(c.duration)} />
        <InfoRow label="Agent"     value={c.agent_name || '—'} />
        <InfoRow label="Lead"      value={c.lead_name || '—'} />
        {c.started_at && (
          <InfoRow
            label="Started"
            value={new Date(c.started_at).toLocaleString()}
          />
        )}
        {c.ended_at && (
          <InfoRow
            label="Ended"
            value={new Date(c.ended_at).toLocaleString()}
          />
        )}
        {c.completed_at && (
          <InfoRow
            label="Completed At"
            value={new Date(c.completed_at).toLocaleString()}
          />
        )}
      </div>

      {/* Completion details */}
      {isCompleted && c.completion && (
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
            Completion Summary
          </p>
          <InfoRow label="Disposition"  value={c.completion?.disposition_name || '—'} />
          <InfoRow label="Next Action"  value={c.completion?.next_action?.replace(/_/g, ' ') || '—'} />
          {c.completion?.note && (
            <div className="pt-2.5 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Note</p>
              <p className="text-sm text-gray-700 leading-relaxed">{c.completion.note}</p>
            </div>
          )}
          {c.completion?.followup_required && (
            <div className="mt-3 flex items-center gap-2 text-xs
                            text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
              <Calendar size={13} />
              Follow-up scheduled:{' '}
              <strong>
                {c.completion.followup_due_at
                  ? new Date(c.completion.followup_due_at).toLocaleString()
                  : '—'}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Recording */}
      {c.has_recording && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
            Recording
          </p>
          {c.recording_url ? (
            <audio controls className="w-full" src={c.recording_url}>
              Your browser does not support audio.
            </audio>
          ) : (
            <p className="text-sm text-gray-400">Recording available but URL not set.</p>
          )}
        </div>
      )}

      {/* Complete modal */}
      {completing && (
        <CallCompletionModal
          callId={id}
          callInfo={{
            caller:   c.caller,
            callee:   c.callee,
            duration: c.duration,
          }}
          open={completing}
          onClose={() => setCompleting(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['call', id] });
            qc.invalidateQueries({ queryKey: ['calls'] });
            setCompleting(false);
          }}
        />
      )}
    </div>
  );
}
