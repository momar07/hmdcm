'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { dealsApi } from '@/lib/api/deals';
import { leadsApi } from '@/lib/api/leads';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function EditDealPage() {
  const { id }   = useParams();
  const router   = useRouter();

  const [title,         setTitle]         = useState('');
  const [value,         setValue]         = useState('');
  const [currency,      setCurrency]      = useState('EGP');
  const [description,   setDescription]   = useState('');
  const [expectedClose, setExpectedClose] = useState('');
  const [source,        setSource]        = useState('manual');
  const [stage,         setStage]         = useState('');
  const [ready,         setReady]         = useState(false);

  // fetch deal
  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn:  () => dealsApi.get(id as string),
    enabled:  !!id,
  });

  // fetch stages
  const { data: stagesRaw } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages(),
  });
  const stages = Array.isArray(stagesRaw) ? stagesRaw : (stagesRaw as any)?.results ?? [];

  // prefill form when deal loads
  useEffect(() => {
    if (!deal) return;
    const d = deal as any;
    setTitle(d.title ?? '');
    setValue(d.value ?? '');
    setCurrency(d.currency ?? 'EGP');
    setDescription(d.description ?? '');
    setExpectedClose(d.expected_close_date ?? '');
    setSource(d.source ?? 'manual');
    setStage(d.stage ?? '');
    setReady(true);
  }, [deal]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => dealsApi.update(id as string, payload),
    onSuccess: () => {
      toast.success('Deal updated ✅');
      router.push(`/deals/${id}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed to update'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    updateMutation.mutate({
      title,
      stage:               stage || undefined,
      value:               value ? Number(value) : undefined,
      currency,
      description:         description || undefined,
      expected_close_date: expectedClose || undefined,
      source,
    });
  };

  if (isLoading || !ready) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/deals/${id}`} className="text-sm text-gray-500 hover:text-blue-600">← Deal</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Edit Deal</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Stage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          <select
            value={stage} onChange={(e) => setStage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select Stage —</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Value + Currency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['EGP','USD','EUR','SAR','AED'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Source */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <select
            value={source} onChange={(e) => setSource(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {['manual','call','campaign','referral','web','social','other'].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Expected Close Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close Date</label>
          <input
            type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} placeholder="Optional notes…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <Link
            href={`/deals/${id}`}
            className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>

      </form>
    </div>
  );
}
