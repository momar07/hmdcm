'use client';

import { useState }     from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing,
  Clock, User, Mic, MicOff, ClipboardList,
} from 'lucide-react';
import toast            from 'react-hot-toast';
import { callsApi }     from '@/lib/api/calls';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import { Modal }        from '@/components/ui/Modal';
import { Select }       from '@/components/ui/Select';

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-gray-100 last:border-0">
      <span className="w-36 shrink-0 text-xs text-gray-400 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  );
}

export default function CallDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const [dispOpen, setDispOpen]   = useState(false);
  const [dispId,   setDispId]     = useState('');
  const [dispNote, setDispNote]   = useState('');

  const { data: call, isLoading } = useQuery({
    queryKey: ['call', id],
    queryFn:  () => callsApi.get(id).then((r) => r.data),
  });

  const { data: dispositions } = useQuery({
    queryKey: ['dispositions'],
    queryFn:  () => callsApi.dispositions().then((r) =>
      Array.isArray(r.data) ? r.data : (r.data as any).results ?? []
    ),
  });

  const dispMutation = useMutation({
    mutationFn: () => callsApi.addDisposition(id, {
      disposition_id: dispId,
      notes:          dispNote,
    }),
    onSuccess: () => {
      toast.success('Disposition saved!');
      setDispOpen(false);
      qc.invalidateQueries({ queryKey: ['call', id] });
      qc.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: () => toast.error('Failed to save disposition'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (!call) return (
    <div className="text-center text-gray-500 mt-20">Call not found.</div>
  );

  const dispOptions = [
    { value: '', label: 'Select disposition…' },
    ...(dispositions ?? []).map((d: any) => ({ value: d.id, label: d.name })),
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500
                   hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Back to Calls
      </button>

      <PageHeader
        title={`Call — ${call.caller_number}`}
        subtitle={call.started_at
          ? new Date(call.started_at).toLocaleString()
          : 'Unknown time'}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<ClipboardList size={14} />}
            onClick={() => setDispOpen(true)}
          >
            Add Disposition
          </Button>
        }
      />

      {/* Status + Direction */}
      <div className="flex items-center gap-3 mt-4 mb-6">
        <StatusBadge status={call.status} size="md" />
        <div className="flex items-center gap-1 text-sm text-gray-500">
          {call.direction === 'inbound'
            ? <><PhoneIncoming size={14} className="text-blue-500" /> Inbound</>
            : <><PhoneOutgoing size={14} className="text-green-500" /> Outbound</>
          }
        </div>
        {call.has_recording && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Mic size={12} /> Recorded
          </span>
        )}
      </div>

      {/* Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <InfoRow label="From"        value={<span className="font-mono">{call.caller_number}</span>} />
        <InfoRow label="To"          value={<span className="font-mono">{call.callee_number}</span>} />
        <InfoRow label="Customer"    value={call.customer_name ?? '—'} />
        <InfoRow label="Agent"       value={call.agent_name    ?? '—'} />
        <InfoRow label="Duration"    value={
          <span className="flex items-center gap-1">
            <Clock size={13} className="text-gray-400" />
            {formatDuration(call.duration)}
          </span>
        } />
        <InfoRow label="Started At"  value={
          call.started_at
            ? new Date(call.started_at).toLocaleString()
            : '—'
        } />
        <InfoRow label="Ended At"    value={
          call.ended_at
            ? new Date(call.ended_at).toLocaleString()
            : '—'
        } />
        <InfoRow label="Unique ID"   value={
          <span className="font-mono text-xs text-gray-500">{call.uniqueid}</span>
        } />
      </div>

      {/* Recording */}
      {call.has_recording && call.recording_url && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Mic size={14} /> Recording
          </p>
          <audio controls className="w-full" src={call.recording_url}>
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* Disposition Modal */}
      <Modal
        open={dispOpen}
        onClose={() => setDispOpen(false)}
        title="Add Disposition"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Disposition *</label>
            <Select
              options={dispOptions}
              value={dispId}
              onChange={(e) => setDispId(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              rows={3}
              value={dispNote}
              onChange={(e) => setDispNote(e.target.value)}
              placeholder="Optional notes about this call…"
              className="input"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDispOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!dispId}
              loading={dispMutation.isPending}
              onClick={() => dispMutation.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
