'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronDown, ChevronUp, User, Building2,
  GitBranch, Briefcase,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsApi } from '@/lib/api/leads';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// ── Egyptian phone validation (very permissive) ───────────────
const EG_PHONE = /^(\+?20|0)?1[0125]\d{8}$/;

interface SectionProps {
  title:    string;
  icon:     React.ReactNode;
  children: React.ReactNode;
  open:     boolean;
  onToggle: () => void;
}

function Section({ title, icon, children, open, onToggle }: SectionProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3
                   hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-blue-600">{icon}</span>
          <span className="font-semibold text-gray-900">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400"/>
              : <ChevronDown size={16} className="text-gray-400"/>}
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-gray-100 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}


export default function NewLeadPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const prePhone      = searchParams.get('phone')       ?? '';
  const preUniqueid   = searchParams.get('uniqueid')    ?? '';
  const preCallerName = searchParams.get('caller_name') ?? '';

  // ── Form state ─────────────────────────────────────
  const [form, setForm] = useState({
    full_name:     preCallerName,
    phone:         prePhone,
    email:         '',
    company:       '',
    city:          '',
    country:       'Egypt',
    address:       '',
    status_id:     '',
    priority_id:   '',
    stage_id:      '',
    source:        prePhone ? 'call' : 'manual',
    value:         '',
    followup_date: '',
    description:   '',
  });

  // ── Section open state ─────────────────────────────
  const [open, setOpen] = useState({
    identity: true,
    company:  false,
    pipeline: true,
    business: false,
  });
  const toggle = (k: keyof typeof open) =>
    setOpen(o => ({ ...o, [k]: !o[k] }));

  // ── Validation ─────────────────────────────────────
  const phoneError = useMemo(() => {
    if (!form.phone) return null;
    return EG_PHONE.test(form.phone.replace(/\s/g, ''))
      ? null
      : 'Invalid Egyptian phone number';
  }, [form.phone]);

  const canSubmit = !!form.full_name.trim() && !!form.phone.trim() && !phoneError;

  // ── Queries ────────────────────────────────────────
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

  const stageItems = Array.isArray(stageData) ? stageData : [];

  useEffect(() => {
    if (statusData?.length && !form.status_id) {
      const def = statusData.find((s: any) => s.is_default) ?? statusData[0];
      setForm((f) => ({ ...f, status_id: def.id }));
    }
  }, [statusData]);

  // ── Submit mutation ────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => leadsApi.create({
      full_name:     form.full_name.trim(),
      phone:         form.phone.trim() || undefined,
      email:         form.email || undefined,
      company:       form.company || undefined,
      city:          form.city || undefined,
      country:       form.country || undefined,
      address:       form.address || undefined,
      status_id:     form.status_id   || undefined,
      priority_id:   form.priority_id || undefined,
      source:        form.source,
      description:   form.description,
      value:         form.value ? parseFloat(form.value) : undefined,
      followup_date: form.followup_date || undefined,
      stage_id:      form.stage_id || undefined,
      call_uniqueid: preUniqueid || undefined,
    } as any),
    onSuccess: async (res) => {
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
    <div className="max-w-3xl mx-auto pb-24">
      <PageHeader
        title="New Lead"
        subtitle="Create a new lead — only Name and Phone are required"
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>Back</Button>
        }
      />

      <div className="space-y-3 mt-4">

        {/* ── 1. Identity & Contact ───────────────────── */}
        <Section title="Identity & Contact" icon={<User size={16}/>}
                 open={open.identity} onToggle={() => toggle('identity')}>
          <Input label="Full Name *" value={form.full_name}
                 onChange={(e) => set('full_name', e.target.value)}
                 placeholder="e.g. Ahmed Mohamed"
                 autoFocus />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input label="Phone *" type="tel" value={form.phone}
                     onChange={(e) => set('phone', e.target.value)}
                     placeholder="01001234567" />
              {phoneError && (
                <p className="mt-1 text-xs text-red-600">{phoneError}</p>
              )}
            </div>
            <Input label="Email" type="email" value={form.email}
                   onChange={(e) => set('email', e.target.value)}
                   placeholder="email@example.com" />
          </div>
        </Section>

        {/* ── 2. Company & Location ──────────────────── */}
        <Section title="Company & Location" icon={<Building2 size={16}/>}
                 open={open.company} onToggle={() => toggle('company')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Company" value={form.company}
                   onChange={(e) => set('company', e.target.value)}
                   placeholder="Company name" />
            <Input label="City" value={form.city}
                   onChange={(e) => set('city', e.target.value)}
                   placeholder="Cairo" />
          </div>
          <Input label="Country" value={form.country}
                 onChange={(e) => set('country', e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2} value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Street, district..." />
          </div>
        </Section>

        {/* ── 3. Pipeline ────────────────────────────── */}
        <Section title="Pipeline" icon={<GitBranch size={16}/>}
                 open={open.pipeline} onToggle={() => toggle('pipeline')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2
                           text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.stage_id}
                onChange={(e) => set('stage_id', e.target.value)}>
                <option value="">— Select Stage —</option>
                {stageItems.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2
                           text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.status_id}
                onChange={(e) => set('status_id', e.target.value)}>
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
                onChange={(e) => set('priority_id', e.target.value)}>
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
                onChange={(e) => set('source', e.target.value)}>
                {[
                  ['manual',   'Manual'],
                  ['call',     'Inbound Call'],
                  ['web',      'Website'],
                  ['referral', 'Referral'],
                  ['campaign', 'Campaign'],
                  ['other',    'Other'],
                ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* ── 4. Business Details ────────────────────── */}
        <Section title="Business Details" icon={<Briefcase size={16}/>}
                 open={open.business} onToggle={() => toggle('business')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Value (EGP)" type="number" value={form.value}
                   onChange={(e) => set('value', e.target.value)}
                   placeholder="0.00" />
            <Input label="Follow-up Date" type="datetime-local"
                   value={form.followup_date}
                   onChange={(e) => set('followup_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3} value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Lead description, notes, requirements..." />
          </div>
        </Section>

      </div>

      {/* ── Sticky footer ──────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                      px-4 py-3 shadow-lg md:left-64 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500 truncate">
            {form.full_name.trim() ? (
              <>Will create: <span className="font-semibold text-gray-900">
                {form.full_name.trim()}
              </span></>
            ) : (
              <span className="text-gray-400">Enter Name and Phone to continue</span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button variant="primary" loading={mutation.isPending}
                    onClick={() => mutation.mutate()}
                    disabled={!canSubmit}>
              Create Lead
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
