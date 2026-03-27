'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationsApi } from '@/lib/api/sales';
import { useAuthStore } from '@/store/authStore';
import type { Quotation, QuotationStatus } from '@/types';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string }> = {
  draft:            { label: 'Draft',            color: 'text-gray-600 bg-gray-100' },
  pending_approval: { label: 'Pending Approval', color: 'text-yellow-700 bg-yellow-100' },
  approved:         { label: 'Approved',         color: 'text-blue-700 bg-blue-100' },
  sent:             { label: 'Sent',             color: 'text-purple-700 bg-purple-100' },
  accepted:         { label: 'Accepted',         color: 'text-green-700 bg-green-100' },
  rejected:         { label: 'Rejected',         color: 'text-red-700 bg-red-100' },
  expired:          { label: 'Expired',          color: 'text-orange-700 bg-orange-100' },
  revision:         { label: 'Revision',         color: 'text-pink-700 bg-pink-100' },
};

export default function QuotationsPage() {
  const { user }  = useAuthStore();
  const router    = useRouter();
  const qc        = useQueryClient();
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'admin';

  const [filter, setFilter] = useState({ status: '', quotation_type: '', search: '', page: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', filter],
    queryFn: () => quotationsApi.list({
      status:         filter.status         || undefined,
      quotation_type: filter.quotation_type || undefined,
      search:         filter.search         || undefined,
      page:           filter.page,
      page_size:      25,
    }),
    refetchInterval: 30_000,
  });

  const quotations: Quotation[] = (data as any)?.results ?? [];
  const total = (data as any)?.count ?? 0;
  const totalPages = Math.ceil(total / 25);

  const submitMutation = useMutation({
    mutationFn: (id: string) => quotationsApi.submit(id),
    onSuccess: () => { toast.success('Submitted for approval'); qc.invalidateQueries({ queryKey: ['quotations'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to submit'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => quotationsApi.approve(id),
    onSuccess: () => { toast.success('Quotation approved ✅'); qc.invalidateQueries({ queryKey: ['quotations'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to approve'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => quotationsApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quotations'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📄 Quotations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} quotation{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => router.push('/sales/quotations/new')}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 shadow font-medium"
        >
          + New Quotation
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          placeholder="🔍 Search ref, title..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value, page: 1 }))}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="revision">Revision</option>
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filter.quotation_type}
          onChange={e => setFilter(f => ({ ...f, quotation_type: e.target.value, page: 1 }))}
        >
          <option value="">All Types</option>
          <option value="price_quote">Price Quotation</option>
          <option value="contract">Contract</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📄</div>
          <p className="font-medium">No quotations found</p>
          <p className="text-sm mt-1">Create your first quotation to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valid Until</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.map(q => {
                const statusCfg = STATUS_CONFIG[q.status] ?? { label: q.status, color: 'text-gray-600 bg-gray-100' };
                return (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/sales/quotations/${q.id}`}
                        className="font-medium text-blue-600 hover:underline">
                        {q.ref_number}
                        {q.version > 1 && <span className="ml-1 text-xs text-gray-400">v{q.version}</span>}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {q.quotation_type === 'price_quote' ? '📄 Quote' : '📋 Contract'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{q.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{q.agent_name}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {q.quotation_type === 'price_quote'
                        ? `${Number(q.total_amount).toLocaleString()} ${q.currency}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {q.valid_until
                        ? new Date(q.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      {q.is_expired && q.status !== 'expired' && (
                        <span className="ml-1 text-xs text-orange-500">⚠ Expired</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a href={`/sales/quotations/${q.id}`}
                          className="text-xs px-2 py-1 border rounded-lg text-gray-600 hover:bg-gray-50">
                          View
                        </a>
                        {(q.status === 'draft' || q.status === 'revision') && (
                          <>
                            <a href={`/sales/quotations/${q.id}/edit`}
                              className="text-xs px-2 py-1 border rounded-lg text-gray-600 hover:bg-gray-50">
                              Edit
                            </a>
                            <button
                              onClick={() => submitMutation.mutate(q.id)}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                              Submit
                            </button>
                          </>
                        )}
                        {isSupervisor && q.status === 'pending_approval' && (
                          <button
                            onClick={() => approveMutation.mutate(q.id)}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">
                            ✓ Approve
                          </button>
                        )}
                        {q.status === 'draft' && (
                          <button
                            onClick={() => { if (confirm('Delete this quotation?')) deleteMutation.mutate(q.id); }}
                            className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">Page {filter.page} of {totalPages} · {total} total</p>
              <div className="flex gap-2">
                <button disabled={filter.page <= 1}
                  onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}
                  className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100">
                  ← Prev
                </button>
                <button disabled={filter.page >= totalPages}
                  onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}
                  className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
