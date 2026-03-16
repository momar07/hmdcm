'use client';

import { useState }     from 'react';
import { useRouter }    from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause } from 'lucide-react';
import toast            from 'react-hot-toast';
import { campaignsApi } from '@/lib/api/campaigns';
import { PageHeader }   from '@/components/ui/PageHeader';
import { DataTable }    from '@/components/ui/DataTable';
import { Button }       from '@/components/ui/Button';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import type { Campaign, Column } from '@/types';

export default function CampaignsPage() {
  const router = useRouter();
  const qc     = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn:  () => campaignsApi.list().then((r) => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      campaignsApi.changeStatus(id, status),
    onSuccess: () => {
      toast.success('Campaign status updated.');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error('Failed to update campaign status.'),
  });

  const columns: Column<Campaign>[] = [
    {
      key:    'name',
      header: 'Campaign',
      render: (c) => (
        <div>
          <p className="font-medium text-gray-900">{c.name}</p>
          <p className="text-xs text-gray-400 capitalize">{c.campaign_type}</p>
        </div>
      ),
    },
    {
      key:    'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.status} dot />,
      width:  '110px',
    },
    {
      key:    'member_count',
      header: 'Members',
      render: (c) => (
        <span className="font-mono text-sm text-gray-700">
          {c.member_count.toLocaleString()}
        </span>
      ),
      width: '90px',
    },
    {
      key:    'created_by_name',
      header: 'Created By',
      render: (c) => (
        <span className="text-sm text-gray-600">{c.created_by_name}</span>
      ),
    },
    {
      key:    'start_date',
      header: 'Start Date',
      render: (c) =>
        c.start_date
          ? <span className="text-sm text-gray-600">
              {new Date(c.start_date).toLocaleDateString()}
            </span>
          : <span className="text-gray-400">—</span>,
      width: '110px',
    },
    {
      key:    'actions',
      header: '',
      render: (c) => (
        <div className="flex gap-1.5">
          {c.status === 'active' ? (
            <Button
              variant="ghost"
              size="xs"
              icon={<Pause size={13} />}
              onClick={(e) => {
                e.stopPropagation();
                statusMutation.mutate({ id: c.id, status: 'paused' });
              }}
            >
              Pause
            </Button>
          ) : c.status === 'draft' || c.status === 'paused' ? (
            <Button
              variant="ghost"
              size="xs"
              icon={<Play size={13} />}
              onClick={(e) => {
                e.stopPropagation();
                statusMutation.mutate({ id: c.id, status: 'active' });
              }}
            >
              Start
            </Button>
          ) : null}
        </div>
      ),
      width: '90px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle={`${data?.count ?? 0} campaigns`}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => router.push('/campaigns/new')}
          >
            New Campaign
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No campaigns found. Create your first campaign."
        onRowClick={(c) => router.push(`/campaigns/${c.id}`)}
      />
    </div>
  );
}
