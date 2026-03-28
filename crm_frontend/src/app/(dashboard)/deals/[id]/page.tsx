'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealsApi } from '@/lib/api/deals';
import { useAuthStore } from '@/store/authStore';
import type { Deal } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

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
    score >= 31 ? 'bg-yellow-400' : 'bg-sky-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700">{score} / 100</span>
    </div>
  );
}

export default function DealDetailPage() {
  const { id }  = useParams();
  const router  = useRouter();
  const qc      = useQueryClient();
  const user    = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ['deal', id],
    queryFn:  () => dealsApi.get(id as string),
    enabled:  !!id,
  });

  const wonMutation = useMutation({
    mutationFn: (amount: number) => dealsApi.markWon(id as string, amount),
    onSuccess:  () => { toast.success('Deal marked as Won ✅'); qc.invalidateQueries({ queryKey: ['deal', id] }); },
    onError:    () => toast.error('Failed'),
  });

  const lostMutation = useMutation({
    mutationFn: (reason: string) => dealsApi.markLost(id as string, reason),
    onSuccess:  () => { toast.success('Deal marked as Lost'); qc.invalidateQueries({ queryKey: ['deal', id] }); },
    onError:    () => toast.error('Failed'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
  );
  if (!deal) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Deal not found</div>
  );

  const d = deal as any;
  const classification = d.classification ?? 'none';
  const score          = d.score ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/deals" className="hover:text-blue-600">Deals</Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">{deal.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && d.stage !== 'won' && d.stage !== 'lost' && (
            <>
              <button
                onClick={() => {
                  const amt = prompt('Won amount (EGP):');
                  if (amt !== null) wonMutation.mutate(Number(amt));
                }}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
              >
                Mark Won ✓
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Lost reason:');
                  if (reason) lostMutation.mutate(reason);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
              >
                Mark Lost ✗
              </button>
            </>
          )}
          <Link
            href={`/deals/${id}/edit`}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Title + badges */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">{deal.title}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            {d.stage_name ?? d.stage ?? '—'}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${CLASS_COLOR[classification]}`}>
            {classification}
          </span>
        </div>
        <ScoreBadge score={score} />
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Lead',        value: d.lead_name ?? '—' },
          { label: 'Assigned To', value: d.assigned_name ?? '—' },
          { label: 'Value',       value: deal.value ? `${Number(deal.value).toLocaleString()} ${deal.currency ?? 'EGP'}` : '—' },
          { label: 'Expected Close', value: d.expected_close_date ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {deal.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">Description</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{deal.description}</p>
        </div>
      )}

      {/* Won / Lost info */}
      {(d.stage === 'won' || d.stage === 'lost') && (
        <div className={`rounded-xl border p-5 ${d.stage === 'won' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h2 className="text-sm font-semibold mb-2">{d.stage === 'won' ? '🏆 Won Details' : '❌ Lost Details'}</h2>
          {d.stage === 'won' && d.won_amount && (
            <p className="text-sm text-green-800">Won Amount: <strong>{Number(d.won_amount).toLocaleString()} {deal.currency ?? 'EGP'}</strong></p>
          )}
          {d.stage === 'lost' && d.lost_reason && (
            <p className="text-sm text-red-800">Reason: <strong>{d.lost_reason}</strong></p>
          )}
        </div>
      )}

      {/* Activity Log */}
      {d.logs && d.logs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Activity Log</h2>
          <ul className="space-y-3">
            {d.logs.map((log: any) => (
              <li key={log.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <div>
                  <p className="text-gray-700">{log.action}</p>
                  <p className="text-xs text-gray-400">{log.actor_name} · {new Date(log.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
