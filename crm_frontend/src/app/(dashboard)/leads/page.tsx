'use client';

import { useState }     from 'react';
import { useRouter }    from 'next/navigation';
import { useQuery }     from '@tanstack/react-query';
import { Plus, LayoutGrid } from 'lucide-react';
import { leadsApi }     from '@/lib/api/leads';
import { PageHeader }   from '@/components/ui/PageHeader';
import { DataTable }    from '@/components/ui/DataTable';
import { Button }       from '@/components/ui/Button';
import { Select }       from '@/components/ui/Select';
import type { Lead, Column } from '@/types';

const SOURCE_LABELS: Record<string, string> = {
  call: 'Inbound Call', web: 'Website', referral: 'Referral',
  campaign: 'Campaign',  social: 'Social Media', manual: 'Manual',
};

export default function LeadsPage() {
  const router                          = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);

  // ── statuses ────────────────────────────────────────────────
  const { data: statusData } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  async () => {
      const r = await leadsApi.statuses();
      // handle both array and paginated { results: [] }
      const raw = r.data as any;
      if (Array.isArray(raw))        return raw;
      if (Array.isArray(raw?.results)) return raw.results;
      return [];
    },
  });

  // ── leads list ───────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['leads', page, statusFilter],
    queryFn:  () =>
      leadsApi.list({
        page,
        status:    statusFilter || undefined,
        page_size: 25,
      }).then((r) => r.data),
    placeholderData: (prev: any) => prev,
  });

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    ...((Array.isArray(statusData) ? statusData : []).map((s: any) => ({
      value: s.id,
      label: s.name,
    }))),
  ];

  const columns: Column<Lead>[] = [
    {
      key:    'title',
      header: 'Title',
      render: (l) => (
        <div>
          <p className="font-medium text-gray-900 truncate max-w-xs">{l.title}</p>
          <p className="text-xs text-gray-400">{l.customer_name}</p>
        </div>
      ),
    },
    {
      key:    'status',
      header: 'Status',
      render: (l) =>
        l.status_name ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {l.status_name}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
      width: '120px',
    },
    {
      key:    'priority',
      header: 'Priority',
      render: (l) =>
        l.priority_name ? (
          <span className="text-xs font-medium text-gray-700">{l.priority_name}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
      width: '100px',
    },
    {
      key:    'source',
      header: 'Source',
      render: (l) => (
        <span className="text-xs text-gray-600">
          {SOURCE_LABELS[l.source] ?? l.source}
        </span>
      ),
      width: '120px',
    },
    {
      key:    'assigned_name',
      header: 'Assigned To',
      render: (l) => (
        <span className="text-sm text-gray-600">{l.assigned_name || '—'}</span>
      ),
    },
    {
      key:    'followup_date',
      header: 'Follow-up',
      render: (l) =>
        l.followup_date ? (
          <span className="text-xs text-gray-600">
            {new Date(l.followup_date).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
      width: '110px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${data?.count ?? 0} total leads`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<LayoutGrid size={16} />}
              onClick={() => router.push('/leads/pipeline')}
            >
              Pipeline
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => router.push('/leads/new')}
            >
              New Lead
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <Select
          options={statusOptions}
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
        emptyText="No leads found."
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
      />

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–
            {Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary" size="sm"
              disabled={!data.previous}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary" size="sm"
              disabled={!data.next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
