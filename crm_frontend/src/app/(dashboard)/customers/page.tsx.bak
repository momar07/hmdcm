'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@/types';
import Link from 'next/link';

const CLASS_COLOR: Record<string, string> = {
  none:     'bg-gray-100 text-gray-500',
  cold:     'bg-sky-100 text-sky-600',
  warm:     'bg-yellow-100 text-yellow-700',
  hot:      'bg-orange-100 text-orange-700',
  very_hot: 'bg-red-100 text-red-700',
};

function ScoreBar({ score, cls }: { score: number; cls: string }) {
  const color =
    cls === 'very_hot' ? 'bg-red-500' :
    cls === 'hot'      ? 'bg-orange-400' :
    cls === 'warm'     ? 'bg-yellow-400' : 'bg-sky-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500">{score}</span>
    </div>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn:  () => leadsApi.list({
      page,
      search:          search || undefined,
      lifecycle_stage: 'customer',
    }),
  });

  const payload = (data as any)?.data ?? data;
  const leads: Lead[] = Array.isArray(payload) ? payload : (payload?.results ?? []);
  const total: number = payload?.count ?? leads.length;

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} customer{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search customers…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2
                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <span className="text-3xl">🏆</span>
            <p className="text-sm">No customers yet — win a deal to see them here!</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Name','Phone','Email','Company','Classification','Score','Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l: Lead) => {
                const ld = l as any;
                const name = `${ld.first_name ?? ''} ${ld.last_name ?? ''}`.trim() || ld.title || '—';
                const cls  = ld.classification ?? 'none';
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/leads/${l.id}`} className="hover:text-blue-600">{name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ld.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{ld.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{ld.company || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CLASS_COLOR[cls]}`}>
                        {cls}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar score={ld.score ?? 0} cls={cls} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/leads/${l.id}`}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                        >
                          View
                        </Link>
                        <Link
                          href={`/deals/new?lead=${l.id}`}
                          className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
                        >
                          + Deal
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            disabled={leads.length < 25}
            className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}

    </div>
  );
}
