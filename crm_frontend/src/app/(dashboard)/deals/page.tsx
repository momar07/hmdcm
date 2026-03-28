'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealsApi } from '@/lib/api/deals';
import { leadsApi } from '@/lib/api/leads';
import { useAuthStore } from '@/store/authStore';
import type { Deal } from '@/types';
import Link from 'next/link';
import toast from 'react-hot-toast';

const LIFECYCLE_COLOR: Record<string, string> = {
  prospect:    'bg-gray-100 text-gray-600',
  opportunity: 'bg-blue-100 text-blue-700',
  won:         'bg-green-100 text-green-700',
  customer:    'bg-emerald-100 text-emerald-700',
  churned:     'bg-red-100 text-red-600',
};

const CLASS_COLOR: Record<string, string> = {
  none:     'bg-gray-100 text-gray-500',
  cold:     'bg-sky-100 text-sky-600',
  warm:     'bg-yellow-100 text-yellow-700',
  hot:      'bg-orange-100 text-orange-700',
  very_hot: 'bg-red-100 text-red-700',
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 86 ? 'bg-red-500' :
    score >= 61 ? 'bg-orange-400' :
    score >= 31 ? 'bg-yellow-400' :
    'bg-sky-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500">{score}</span>
    </div>
  );
}

export default function DealsPage() {
  const user = useAuthStore((s) => s.user);
  const qc   = useQueryClient();
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['deals', search, page],
    queryFn:  () => dealsApi.list({ search, page }),
  });

  const wonMutation = useMutation({
    mutationFn: (id: string) => dealsApi.markWon(id, 0),
    onSuccess:  () => { toast.success('Deal marked as Won ✅'); qc.invalidateQueries({ queryKey: ['deals'] }); },
    onError:    () => toast.error('Failed'),
  });

  const deals: Deal[] = (data as any)?.results ?? data ?? [];
  const total: number = (data as any)?.count ?? deals.length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Deals</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} deal{total !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/deals/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          + New Deal
        </Link>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search deals…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2
                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>
        ) : deals.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">No deals found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Title','Lead','Stage','Classification','Score','Value','Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deals.map((d: Deal) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/deals/${d.id}`} className="hover:text-blue-600">{d.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{(d as any).lead_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {(d as any).stage_name ?? d.stage ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CLASS_COLOR[(d as any).classification ?? 'none'] ?? ''}`}>
                      {(d as any).classification ?? 'none'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={(d as any).score ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {d.value ? `${Number(d.value).toLocaleString()} ${d.currency ?? 'EGP'}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/deals/${d.id}`}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                      >
                        View
                      </Link>
                      {user?.role !== 'agent' && (d as any).stage !== 'won' && (
                        <button
                          onClick={() => wonMutation.mutate(d.id)}
                          className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700"
                        >
                          Won ✓
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center gap-3 justify-end text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-gray-500">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={deals.length < 25}
            className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
