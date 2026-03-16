'use client';

import { useState }      from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle }  from 'lucide-react';
import toast             from 'react-hot-toast';
import { followupsApi }  from '@/lib/api/followups';
import { PageHeader }    from '@/components/ui/PageHeader';
import { DataTable }     from '@/components/ui/DataTable';
import { Button }        from '@/components/ui/Button';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { Select }        from '@/components/ui/Select';
import type { Followup, Column } from '@/types';

export default function FollowupsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage]                 = useState(1);
  const qc                              = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['followups', page, statusFilter],
    queryFn:  () =>
      followupsApi.list({
        page,
        status:    statusFilter || undefined,
        page_size: 25,
      }).then((r) => r.data),
    keepPreviousData: true,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => followupsApi.complete(id),
    onSuccess:  () => {
      toast.success('Follow-up marked complete.');
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
    onError: () => toast.error('Failed to complete follow-up.'),
  });

  const columns: Column<Followup>[] = [
    {
      key:    'title',
      header: 'Title',
      render: (f) => (
        <div>
          <p className="font-medium text-gray-900">{f.title}</p>
          <p className="text-xs text-gray-400">{f.customer_name}</p>
        </div>
      ),
    },
    {
      key:    'followup_type',
      header: 'Type',
      render: (f) => (
        <span className="capitalize text-sm text-gray-700">{f.followup_type}</span>
      ),
      width: '90px',
    },
    {
      key:    'status',
      header: 'Status',
      render: (f) => <StatusBadge status={f.status} dot />,
      width:  '110px',
    },
    {
      key:    'scheduled_at',
      header: 'Scheduled',
      render: (f) => {
        const date    = new Date(f.scheduled_at);
        const overdue = f.status === 'pending' && date < new Date();
        return (
          <span className={overdue ? 'text-red-600 font-medium text-sm' : 'text-sm text-gray-700'}>
            {date.toLocaleString()}
            {overdue && ' ⚠️'}
          </span>
        );
      },
    },
    {
      key:    'assigned_name',
      header: 'Assigned To',
      render: (f) => (
        <span className="text-sm text-gray-600">{f.assigned_name}</span>
      ),
    },
    {
      key:    'actions',
      header: '',
      render: (f) =>
        f.status === 'pending' ? (
          <Button
            variant="ghost"
            size="xs"
            icon={<CheckCircle size={14} />}
            loading={completeMutation.isPending}
            onClick={(e) => { e.stopPropagation(); completeMutation.mutate(f.id); }}
          >
            Done
          </Button>
        ) : null,
      width: '80px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${data?.count ?? 0} total follow-ups`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />}>
            New Follow-up
          </Button>
        }
      />

      <div className="mb-4">
        <Select
          options={[
            { value: '',            label: 'All Statuses' },
            { value: 'pending',     label: 'Pending' },
            { value: 'completed',   label: 'Completed' },
            { value: 'cancelled',   label: 'Cancelled' },
            { value: 'rescheduled', label: 'Rescheduled' },
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-48"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No follow-ups found."
      />

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–
            {Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
                    disabled={!data.previous}
                    onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm"
                    disabled={!data.next}
                    onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
