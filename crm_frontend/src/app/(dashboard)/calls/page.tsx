'use client';

import { useState }                   from 'react';
import { useRouter }                  from 'next/navigation';
import { useQuery, useQueryClient }   from '@tanstack/react-query';
import { PhoneOutgoing, CheckCircle } from 'lucide-react';
import toast                          from 'react-hot-toast';
import { callsApi }                   from '@/lib/api/calls';
import { PageHeader }                 from '@/components/ui/PageHeader';
import { DataTable }                  from '@/components/ui/DataTable';
import { Button }                     from '@/components/ui/Button';
import { StatusBadge }                from '@/components/ui/StatusBadge';
import { Modal }                      from '@/components/ui/Modal';
import { Input }                      from '@/components/ui/Input';
import { Select }                     from '@/components/ui/Select';
import { CallCompletionModal }        from '@/components/calls/CallCompletionModal';
import type { Call, Column }          from '@/types';

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CallsPage() {
  const router                              = useRouter();
  const queryClient                         = useQueryClient();
  const [page, setPage]                     = useState(1);
  const [dirFilter, setDirFilter]           = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [dialOpen, setDialOpen]             = useState(false);
  const [dialNumber, setDialNumber]         = useState('');
  const [dialing, setDialing]               = useState(false);
  const [completingCall, setCompletingCall] = useState<Call | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['calls', page, dirFilter, statusFilter],
    queryFn:  () =>
      callsApi.list({
        page,
        direction: dirFilter   || undefined,
        status:    statusFilter || undefined,
        page_size: 25,
      }).then((r) => r.data),
    keepPreviousData: true,
    refetchInterval:  10_000,
  });

  const handleDial = async () => {
    if (!dialNumber.trim()) return;
    setDialing(true);
    try {
      await callsApi.originate({ phone_number: dialNumber.trim() });
      toast.success(`Dialing ${dialNumber}...`);
      setDialOpen(false);
      setDialNumber('');
    } catch {
      toast.error('Failed to originate call.');
    } finally {
      setDialing(false);
    }
  };

  const columns: Column<Call>[] = [
    {
      key: 'direction', header: 'Direction',
      render: (c) => (
        <StatusBadge
          status={c.direction === 'inbound' ? 'available' : 'on_call'}
          label={c.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
          dot
        />
      ),
      width: '120px',
    },
    {
      key: 'caller', header: 'From / To',
      render: (c) => (
        <div>
          <p className="font-mono text-sm text-gray-900">
            {(c as any).caller || (c as any).caller_number || '—'}
          </p>
          <p className="font-mono text-xs text-gray-400">
            → {(c as any).callee || (c as any).callee_number || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'customer_name', header: 'Customer',
      render: (c) => <span className="text-sm text-gray-700">{(c as any).customer_name ?? '—'}</span>,
    },
    {
      key: 'agent_name', header: 'Agent',
      render: (c) => <span className="text-sm text-gray-700">{(c as any).agent_name ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (c) => <StatusBadge status={c.status} />,
      width: '110px',
    },
    {
      key: 'duration', header: 'Duration',
      render: (c) => (
        <span className="font-mono text-sm text-gray-700">{formatDuration(c.duration)}</span>
      ),
      width: '90px',
    },
    {
      key: 'started_at', header: 'Date / Time',
      render: (c) => c.started_at
        ? <span className="text-xs text-gray-500">{new Date(c.started_at).toLocaleString()}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'actions', header: '',
      render: (c) => (c as any).is_completed
        ? <span className="text-xs text-green-600 font-medium">✅ Done</span>
        : c.status === 'answered'
          ? (
            <Button
              variant="primary" size="sm"
              icon={<CheckCircle size={14} />}
              onClick={(e) => { e.stopPropagation(); setCompletingCall(c); }}
            >
              Complete
            </Button>
          )
          : null,
      width: '110px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Call Log"
        subtitle={`${data?.count ?? 0} total calls`}
        actions={
          <Button variant="success" icon={<PhoneOutgoing size={16} />} onClick={() => setDialOpen(true)}>
            Dial
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          options={[
            { value: '',         label: 'All Directions' },
            { value: 'inbound',  label: '↙ Inbound'     },
            { value: 'outbound', label: '↗ Outbound'    },
            { value: 'internal', label: '↔ Internal'    },
          ]}
          value={dirFilter}
          onChange={(e) => { setDirFilter(e.target.value); setPage(1); }}
          className="w-44"
        />
        <Select
          options={[
            { value: '',          label: 'All Statuses' },
            { value: 'answered',  label: 'Answered'     },
            { value: 'no_answer', label: 'No Answer'    },
            { value: 'busy',      label: 'Busy'         },
            { value: 'failed',    label: 'Failed'       },
            { value: 'ringing',   label: 'Ringing'      },
            { value: 'completed', label: 'Completed'    },
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-44"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No call records found."
        onRowClick={(c) => router.push(`/calls/${c.id}`)}
      />

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Modal open={dialOpen} onClose={() => setDialOpen(false)} title="Dial Number" size="sm">
        <div className="space-y-4">
          <Input
            label="Phone Number" type="tel" placeholder="+20100000000"
            value={dialNumber}
            onChange={(e) => setDialNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDial()}
            autoFocus
          />
          <p className="text-xs text-gray-400">
            Your extension will ring first, then the destination will be dialled.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDialOpen(false)}>Cancel</Button>
            <Button variant="success" icon={<PhoneOutgoing size={16} />} loading={dialing} onClick={handleDial}>
              Dial
            </Button>
          </div>
        </div>
      </Modal>

      {completingCall && (
        <CallCompletionModal
          callId={completingCall.id}
          callInfo={{
            caller:   (completingCall as any).caller || (completingCall as any).caller_number,
            callee:   (completingCall as any).callee || (completingCall as any).callee_number,
            duration: completingCall.duration,
          }}
          open={!!completingCall}
          onClose={() => setCompletingCall(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['calls'] });
            setCompletingCall(null);
          }}
        />
      )}
    </div>
  );
}
