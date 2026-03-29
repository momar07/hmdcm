'use client';

import { useState, useEffect }        from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery }      from '@tanstack/react-query';
import { ArrowLeft }    from 'lucide-react';
import toast            from 'react-hot-toast';
import { leadsApi }     from '@/lib/api/leads';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { Input }        from '@/components/ui/Input';

export default function NewLeadPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    title:        '',
    first_name:   '',
    last_name:    '',
    phone:        '',
    email:        '',
    company:      '',
    source:       'manual',
    value:        '',
    followup_date:'',
    description:  '',
    status_id:    '',
    priority_id:  '',
    stage_id:     '',
  });

  const { data: statusData } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn: async () => {
      const r = await leadsApi.statuses();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: priorityData } = useQuery({
    queryKey: ['lead-priorities'],
    queryFn: async () => {
      const r = await leadsApi.priorities();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: stageData } = useQuery({
    queryKey: ['lead-stages'],
    queryFn: async () => {
      const r = await leadsApi.stages();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  useEffect(() => {
    if (statusData?.length && !form.status_id) {
      const def = statusData.find((s: any) => s.is_default) ?? statusData[0];
      if (def) setForm((f) => ({ ...f, status_id: def.id }));
    }
  }, [statusData]);

  const mutation = useMutation({
    mutationFn: () => leadsApi.create({
      title:         form.title,
      first_name:    form.first_name   || undefined,
      last_name:     form.last_name    || undefined,
      phone:         form.phone        || undefined,
      email:         form.email        || undefined,
      company:       form.company      || undefined,
      source:        form.source,
      description:   form.description  || undefined,
      value:         form.value ? parseFloat(form.value) : undefined,
      followup_date: form.followup_date || undefined,
      status_id:     form.status_id    || undefined,
      priority_id:   form.priority_id  || undefined,
      stage_id:      form.stage_id     || undefined,
    } as any),
    onSuccess: (res) => {
      toast.success('Lead created! ✅');
      router.push(`/leads/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data
        ? JSON.stringify(err.response.data)
        : 'Failed to create lead');
    },
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="New Lead"
        subtitle="Create a new lead"
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>Back</Button>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5 mt-4">

        {/* Title */}
        <Input label="Title *" value={form.title}
               onChange={(e) => set('title', e.target.value)}
               placeholder="e.g. Villa Purchase — Ahmed Sayed" />

        {/* Contact Info */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Contact Info</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input type="text" value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                placeholder="Ahmed"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input type="text" value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                placeholder="Sayed"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+201xxxxxxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ahmed@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input type="text" value={form.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Company name (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Lead Details */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Lead Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status_id} onChange={(e) => set('status_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Status —</option>
                {(statusData ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority_id} onChange={(e) => set('priority_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Priority —</option>
                {(priorityData ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select value={form.stage_id} onChange={(e) => set('stage_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Stage —</option>
                {(stageData ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={form.source} onChange={(e) => set('source', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[
                  ['manual',   'Manual'],
                  ['call',     'Inbound Call'],
                  ['web',      'Website'],
                  ['referral', 'Referral'],
                  ['campaign', 'Campaign'],
                  ['social',   'Social Media'],
                  ['walk_in',  'Walk In'],
                  ['email',    'Email'],
                  ['other',    'Other'],
                ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Input label="Value (EGP)" type="number" value={form.value}
                     onChange={(e) => set('value', e.target.value)}
                     placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* Follow-up Date */}
        <Input label="Follow-up Date" type="datetime-local"
               value={form.followup_date}
               onChange={(e) => set('followup_date', e.target.value)} />

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3} value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Lead description..." />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending}
                  onClick={() => mutation.mutate()}
                  disabled={!form.title}>
            Create Lead
          </Button>
        </div>
      </div>
    </div>
  );
}
