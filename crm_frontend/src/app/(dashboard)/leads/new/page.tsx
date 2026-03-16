'use client';

import { useState, useEffect }        from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery }      from '@tanstack/react-query';
import { ArrowLeft }    from 'lucide-react';
import toast            from 'react-hot-toast';
import { leadsApi }     from '@/lib/api/leads';
import { customersApi } from '@/lib/api/customers';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { Input }        from '@/components/ui/Input';

export default function NewLeadPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const preCustomer  = searchParams.get('customer') ?? '';

  const [form, setForm] = useState({
    title: '', source: 'manual', description: '',
    value: '', followup_date: '',
    customer_id: preCustomer,
    status_id: '', priority_id: '',
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

  // ← التغيير الأساسي: جيب كل الـ customers مش customer واحد
  const { data: allCustomers } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customersApi.list({ page_size: 200 }).then((r) => r.data),
  });

  useEffect(() => {
    if (statusData?.length && !form.status_id) {
      const def = statusData.find((s: any) => s.is_default) ?? statusData[0];
      setForm((f) => ({ ...f, status_id: def.id }));
    }
  }, [statusData]);

  // اسم الـ customer المختار للـ subtitle
  const selectedCustomer = (allCustomers?.results ?? [])
    .find((c: any) => c.id === form.customer_id);

  const mutation = useMutation({
    mutationFn: () => leadsApi.create({
      title:         form.title,
      customer_id:   form.customer_id,
      status_id:     form.status_id    || undefined,
      priority_id:   form.priority_id  || undefined,
      source:        form.source,
      description:   form.description,
      value:         form.value ? parseFloat(form.value) : undefined,
      followup_date: form.followup_date || undefined,
    } as any),
    onSuccess: (res) => {
      toast.success('Lead created!');
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
        subtitle={selectedCustomer
          ? `For: ${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : 'Create a new lead'}
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>Back</Button>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5 mt-4">

        <Input label="Title *" value={form.title}
               onChange={(e) => set('title', e.target.value)}
               placeholder="Lead title..." />

        {/* ← Customer Dropdown بدل UUID input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer *
          </label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.customer_id}
            onChange={(e) => set('customer_id', e.target.value)}
          >
            <option value="">— Select Customer —</option>
            {(allCustomers?.results ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
                {c.primary_phone ? ` · ${c.primary_phone}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.status_id}
              onChange={(e) => set('status_id', e.target.value)}
            >
              <option value="">— Select Status —</option>
              {(statusData ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.priority_id}
              onChange={(e) => set('priority_id', e.target.value)}
            >
              <option value="">— Select Priority —</option>
              {(priorityData ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
            >
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

          <Input label="Value (EGP)" type="number" value={form.value}
                 onChange={(e) => set('value', e.target.value)}
                 placeholder="0.00" />
        </div>

        <Input label="Follow-up Date" type="datetime-local"
               value={form.followup_date}
               onChange={(e) => set('followup_date', e.target.value)} />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3} value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Lead description..." />
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending}
                  onClick={() => mutation.mutate()}
                  disabled={!form.title || !form.customer_id}>
            Create Lead
          </Button>
        </div>
      </div>
    </div>
  );
}
