'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api/leads';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function EditLeadPage() {
  const { id }  = useParams();
  const router  = useRouter();

  const [title,        setTitle]        = useState('');
  const [firstName,    setFirstName]    = useState('');
  const [lastName,     setLastName]     = useState('');
  const [phone,        setPhone]        = useState('');
  const [email,        setEmail]        = useState('');
  const [company,      setCompany]      = useState('');
  const [source,       setSource]       = useState('manual');
  const [value,        setValue]        = useState('');
  const [description,  setDescription]  = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [stageId,      setStageId]      = useState('');
  const [statusId,     setStatusId]     = useState('');
  const [priorityId,   setPriorityId]   = useState('');
  const [ready,        setReady]        = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn:  () => leadsApi.get(id as string).then((r) => r.data),
    enabled:  !!id,
  });

  const { data: stagesRaw } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then((r: any) => {
      const raw = r?.data ?? r;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    }),
  });
  const stages = Array.isArray(stagesRaw) ? stagesRaw : [];

  const { data: statusesRaw } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  () => leadsApi.statuses().then((r: any) => {
      const raw = r?.data ?? r;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    }),
  });
  const statuses = Array.isArray(statusesRaw) ? statusesRaw : [];

  const { data: prioritiesRaw } = useQuery({
    queryKey: ['lead-priorities'],
    queryFn:  () => leadsApi.priorities().then((r: any) => {
      const raw = r?.data ?? r;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    }),
  });
  const priorities = Array.isArray(prioritiesRaw) ? prioritiesRaw : [];

  useEffect(() => {
    if (!lead) return;
    const l = lead as any;
    setTitle(l.title ?? '');
    setFirstName(l.first_name ?? '');
    setLastName(l.last_name ?? '');
    setPhone(l.phone ?? '');
    setEmail(l.email ?? '');
    setCompany(l.company ?? '');
    setSource(l.source ?? 'manual');
    setValue(l.value ?? '');
    setDescription(l.description ?? '');
    setFollowupDate(l.followup_date ?? '');
    setStageId(l.stage ?? '');
    setStatusId(l.status ?? '');
    setPriorityId(l.priority ?? '');
    setReady(true);
  }, [lead]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => leadsApi.update(id as string, payload),
    onSuccess: () => {
      toast.success('Lead updated ✅');
      router.push(`/leads/${id}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed to update'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    updateMutation.mutate({
      title,
      first_name:    firstName  || undefined,
      last_name:     lastName   || undefined,
      phone:         phone      || undefined,
      email:         email      || undefined,
      company:       company    || undefined,
      source,
      value:         value ? Number(value) : undefined,
      description:   description || undefined,
      followup_date: followupDate || undefined,
      stage_id:      stageId    || undefined,
      status_id:     statusId   || undefined,
      priority_id:   priorityId || undefined,
    });
  };

  if (isLoading || !ready) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/leads/${id}`} className="text-sm text-gray-500 hover:text-blue-600">← Lead</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Edit Lead</h1>
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

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ahmed"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
              placeholder="Sayed"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+201xxxxxxxxx"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmed@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name (optional)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Status + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={statusId} onChange={(e) => setStatusId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select Status —</option>
              {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={priorityId} onChange={(e) => setPriorityId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select Priority —</option>
              {priorities.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Stage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select Stage —</option>
            {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Source + Value */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['manual','call','campaign','referral','web','social','other'].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value (EGP)</label>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Follow-up Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Date</label>
          <input type="datetime-local" value={followupDate}
            onChange={(e) => setFollowupDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} placeholder="Optional notes…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={updateMutation.isPending}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-50">
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <Link href={`/leads/${id}`}
            className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </Link>
        </div>

      </form>
    </div>
  );
}
