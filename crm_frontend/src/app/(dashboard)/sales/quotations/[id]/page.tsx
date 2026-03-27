'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationsApi } from '@/lib/api/sales';
import { useAuthStore } from '@/store/authStore';
import type { Quotation } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

const STATUS_COLOR: Record<string, string> = {
  draft:            'text-gray-600 bg-gray-100',
  pending_approval: 'text-yellow-700 bg-yellow-100',
  approved:         'text-blue-700 bg-blue-100',
  sent:             'text-purple-700 bg-purple-100',
  accepted:         'text-green-700 bg-green-100',
  rejected:         'text-red-700 bg-red-100',
  expired:          'text-orange-700 bg-orange-100',
  revision:         'text-pink-700 bg-pink-100',
};

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc     = useQueryClient();
  const user   = useAuthStore((s) => s.user);
  const isSupervisorOrAdmin = user?.role === 'supervisor' || user?.role === 'admin';

  const { data: q, isLoading } = useQuery<Quotation>({
    queryKey: ['quotation', id],
    queryFn:  () => quotationsApi.get(id),
    enabled:  !!id,
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: () => quotationsApi.approve(id),
    onSuccess: () => { toast.success('Approved'); qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => quotationsApi.reject(id, 'Rejected'),
    onSuccess: () => { toast.success('Rejected'); qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed'),
  });

  const submitMutation = useMutation({
    mutationFn: () => quotationsApi.submit(id),
    onSuccess: () => { toast.success('Submitted'); qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: () => toast.error('Failed to submit'),
  });

  const markSentMutation = useMutation({
    mutationFn: () => quotationsApi.markSent(id),
    onSuccess: () => { toast.success('Marked as sent'); qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: () => toast.error('Failed'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  if (!q) return <div className="flex items-center justify-center h-64 text-gray-400">Not found</div>;

  const statusColor = STATUS_COLOR[q.status] ?? 'text-gray-600 bg-gray-100';
  const qa = q as any;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-gray-400">
            <Link href="/sales/quotations" className="hover:text-gray-600">Quotations</Link>
            <span>/</span>
            <span>{qa.ref_number}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{q.title || qa.ref_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={['text-xs font-medium px-2.5 py-1 rounded-full', statusColor].join(' ')}>
              {qa.status_display ?? q.status}
            </span>
            <span className="text-xs text-gray-400">{qa.type_display ?? q.quotation_type}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {q.status === 'draft' && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50">
              Submit for Approval
            </button>
          )}
          {isSupervisorOrAdmin && q.status === 'pending_approval' && (
            <>
              <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 disabled:opacity-50">
                Approve
              </button>
              <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {q.status === 'approved' && (
            <button onClick={() => markSentMutation.mutate()} disabled={markSentMutation.isPending}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50">
              Mark as Sent
            </button>
          )}
          {(q.status === 'draft' || q.status === 'revision') && (
            <Link href={'/sales/quotations/' + id + '/edit'}
              className="px-4 py-2 border text-sm rounded-xl hover:bg-gray-50">Edit</Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Agent',       value: qa.agent_name ?? '—' },
          { label: 'Customer',    value: qa.customer_name ?? '—' },
          { label: 'Lead',        value: qa.lead_title ?? '—' },
          { label: 'Valid Until', value: q.valid_until ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
          </div>
        ))}
      </div>

      {q.quotation_type === 'price_quote' && qa.items?.length > 0 && (
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Line Items</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-400">
              <th className="pb-2">Product</th>
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit Price</th>
              <th className="pb-2 text-right">Disc%</th>
              <th className="pb-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {qa.items.map((it: any, i: number) => (
                <tr key={it.id ?? i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{it.product_name || '—'}</td>
                  <td className="py-2 text-gray-500">{it.description || '—'}</td>
                  <td className="py-2 text-right">{it.qty}</td>
                  <td className="py-2 text-right">{Number(it.unit_price).toLocaleString()}</td>
                  <td className="py-2 text-right">{it.discount_pct}%</td>
                  <td className="py-2 text-right font-medium">{Number(it.line_total).toLocaleString()} {q.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col items-end gap-1 mt-4 text-sm">
            <div className="text-gray-500">Subtotal: <span className="font-medium">{Number(qa.subtotal_amount ?? 0).toLocaleString()} {q.currency}</span></div>
            <div className="text-gray-500">Tax ({q.tax_rate}%): <span className="font-medium">{Number(qa.tax_amount ?? 0).toLocaleString()} {q.currency}</span></div>
            <div className="text-base font-bold text-gray-900">Total: {Number(qa.total_amount ?? 0).toLocaleString()} {q.currency}</div>
          </div>
        </div>
      )}

      {q.quotation_type === 'contract' && qa.fields_data?.length > 0 && (
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Contract Fields</h2>
          <dl className="grid grid-cols-2 gap-3">
            {qa.fields_data.map((f: any) => (
              <div key={f.id} className="bg-gray-50 rounded-xl p-3">
                <dt className="text-xs text-gray-400 mb-0.5">{f.key}</dt>
                <dd className="text-sm font-medium text-gray-800">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {q.terms_body && (
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Terms &amp; Conditions</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{q.terms_body}</p>
        </div>
      )}

      {q.internal_note && (
        <div className="bg-yellow-50 rounded-2xl border border-yellow-100 p-5">
          <h2 className="font-semibold text-yellow-800 mb-2 text-sm">Internal Note</h2>
          <p className="text-sm text-yellow-700 whitespace-pre-wrap">{q.internal_note}</p>
        </div>
      )}

      {qa.logs?.length > 0 && (
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Activity Log</h2>
          <ol className="relative border-l border-gray-200 space-y-4 ml-3">
            {qa.logs.map((log: any) => (
              <li key={log.id} className="ml-4">
                <div className="absolute -left-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()} · {log.actor_name}</p>
                <p className="text-sm text-gray-700 mt-0.5">{log.action}</p>
                {log.detail && <p className="text-xs text-gray-400 mt-0.5">{log.detail}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  );
}
