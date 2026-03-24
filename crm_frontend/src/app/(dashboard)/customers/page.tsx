'use client';

import { useState, useMemo }  from 'react';
import { useRouter }          from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, UserCheck, ToggleLeft, ToggleRight, Download, X, CheckSquare } from 'lucide-react';
import toast                  from 'react-hot-toast';
import { customersApi }       from '@/lib/api/customers';
import { PageHeader }         from '@/components/ui/PageHeader';
import { DataTable }          from '@/components/ui/DataTable';
import { Button }             from '@/components/ui/Button';
import { Input }              from '@/components/ui/Input';
import { StatusBadge }        from '@/components/ui/StatusBadge';
import { Modal }              from '@/components/ui/Modal';
import { Select }             from '@/components/ui/Select';
import type { Customer, Column, PaginatedResponse } from '@/types';

/* ── helpers ─────────────────────────────────────────────────────── */
function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = String(r[h] ?? '').replace(/"/g, '""');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v;
      }).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── main page ───────────────────────────────────────────────────── */
export default function CustomersPage() {
  const router      = useRouter();
  const qc          = useQueryClient();
  const [search, setSearch]         = useState('');
  const [page,   setPage]           = useState(1);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [assignModal, setAssignModal] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');

  /* ── data ── */
  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', page, search],
    queryFn:  () => customersApi.list({ page, search, page_size: 25 }).then(r => r.data),
    placeholderData: (prev: PaginatedResponse<Customer> | undefined) => prev,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-list'],
    queryFn:  () => import('@/lib/api/axios').then(({ default: api }) =>
      api.get('/users/?role=agent&page_size=100').then(r => r.data)
    ),
    enabled: assignModal,
  });

  /* ── bulk mutation ── */
  const bulkMutation = useMutation({
    mutationFn: customersApi.bulkAction,
    onSuccess: (res, vars) => {
      const d = (res as any).data;
      if (vars.action === 'export') {
        downloadCSV(d.data, `customers_export_${Date.now()}.csv`);
        toast.success(`Exported ${d.count} customers ✅`);
      } else {
        toast.success(`${d.updated} customers updated ✅`);
        qc.invalidateQueries({ queryKey: ['customers'] });
      }
      setSelected(new Set());
      setAssignModal(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Bulk action failed');
    },
  });

  /* ── selection helpers ── */
  const allIds      = useMemo(() => (data?.results ?? []).map(c => c.id), [data]);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
    }
  };
  const toggleOne = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  /* ── filtered agents ── */
  const agents = useMemo(() => {
    const list = (agentsData as any)?.results ?? [];
    if (!agentSearch) return list;
    const q = agentSearch.toLowerCase();
    return list.filter((a: any) =>
      a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q)
    );
  }, [agentsData, agentSearch]);

  /* ── columns ── */
  const columns: Column<Customer>[] = [
    {
      key: 'select', header: '',
      render: (c) => (
        <input
          type="checkbox"
          checked={selected.has(c.id)}
          onChange={() => toggleOne(c.id)}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 text-blue-600
                     focus:ring-blue-500 cursor-pointer"
        />
      ),
      width: '44px',
    },
    {
      key: 'name', header: 'Name',
      render: (c) => (
        <div>
          <p className="font-medium text-gray-900">{c.first_name} {c.last_name}</p>
          {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
        </div>
      ),
    },
    {
      key: 'primary_phone', header: 'Phone',
      render: (c) => (
        <span className="font-mono text-sm text-gray-700">{c.primary_phone ?? '—'}</span>
      ),
    },
    {
      key: 'email', header: 'Email',
      render: (c) => <span className="text-sm text-gray-600">{c.email || '—'}</span>,
    },
    {
      key: 'tags', header: 'Tags',
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 3).map(tag => (
            <span key={tag.id}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}>
              {tag.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'is_active', header: 'Status',
      render: (c) => (
        <StatusBadge status={c.is_active ? 'active' : 'offline'}
          label={c.is_active ? 'Active' : 'Inactive'} dot />
      ),
      width: '100px',
    },
  ];

  const selectedArr = Array.from(selected);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${data?.count ?? 0} total customers`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />}
                  onClick={() => router.push('/customers/new')}>
            New Customer
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search by name, phone, email..."
          leftIcon={<Search size={16} />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {/* ── Bulk Action Bar ─────────────────────────────────────── */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50
                        border border-blue-200 rounded-xl flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <CheckSquare size={16} className="text-blue-600" />
            {selected.size} selected
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <Button variant="secondary" size="sm"
                    icon={<UserCheck size={14} />}
                    loading={bulkMutation.isPending && (bulkMutation.variables as any)?.action === 'assign'}
                    onClick={() => setAssignModal(true)}>
              Assign Agent
            </Button>
            <Button variant="secondary" size="sm"
                    icon={<ToggleRight size={14} />}
                    loading={bulkMutation.isPending && (bulkMutation.variables as any)?.action === 'activate'}
                    onClick={() => bulkMutation.mutate({ ids: selectedArr, action: 'activate' })}>
              Activate
            </Button>
            <Button variant="secondary" size="sm"
                    icon={<ToggleLeft size={14} />}
                    loading={bulkMutation.isPending && (bulkMutation.variables as any)?.action === 'deactivate'}
                    onClick={() => bulkMutation.mutate({ ids: selectedArr, action: 'deactivate' })}>
              Deactivate
            </Button>
            <Button variant="secondary" size="sm"
                    icon={<Download size={14} />}
                    loading={bulkMutation.isPending && (bulkMutation.variables as any)?.action === 'export'}
                    onClick={() => bulkMutation.mutate({ ids: selectedArr, action: 'export' })}>
              Export CSV
            </Button>
            <button onClick={() => setSelected(new Set())}
                    className="text-gray-400 hover:text-gray-600 transition-colors ml-1">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Select-all row */}
      {(data?.results?.length ?? 0) > 0 && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <input type="checkbox" checked={allSelected}
                 onChange={toggleAll}
                 className="w-4 h-4 rounded border-gray-300 text-blue-600
                            focus:ring-blue-500 cursor-pointer" />
          <span className="text-xs text-gray-500">
            {allSelected ? 'Deselect all on this page' : 'Select all on this page'}
          </span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No customers found. Add your first customer."
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
      />

      {/* Pagination */}
      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!data.previous}
                    onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={!data.next}
                    onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)}
             title="Assign Agent" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Assign <span className="font-semibold text-gray-900">{selected.size} customers</span> to:
          </p>
          <Input placeholder="Search agents..."
                 value={agentSearch}
                 onChange={e => setAgentSearch(e.target.value)}
                 leftIcon={<Search size={14} />} />
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-200">
            {agents.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No agents found</p>
            )}
            {agents.map((agent: any) => (
              <button key={agent.id}
                className="w-full flex items-center gap-3 px-4 py-3
                           hover:bg-blue-50 transition-colors text-left"
                onClick={() => bulkMutation.mutate({
                  ids: selectedArr, action: 'assign', assigned_to: agent.id,
                })}>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center
                                justify-center text-blue-700 text-sm font-bold shrink-0">
                  {agent.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{agent.full_name}</p>
                  <p className="text-xs text-gray-400">{agent.email}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setAssignModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
