'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Calendar, Tag, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import toast         from 'react-hot-toast';
import { leadsApi }  from '@/lib/api/leads';
import { dealsApi }  from '@/lib/api/deals';
import { PageHeader }  from '@/components/ui/PageHeader';
import { Button }      from '@/components/ui/Button';
import { Spinner }     from '@/components/ui/Spinner';
import type { LeadEvent } from '@/types';

const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  created:        { label: 'Lead Created',         color: 'bg-blue-100 text-blue-700',   icon: '🆕' },
  stage_changed:  { label: 'Stage Changed',         color: 'bg-purple-100 text-purple-700', icon: '📌' },
  status_changed: { label: 'Status Changed',        color: 'bg-yellow-100 text-yellow-700', icon: '🔄' },
  assigned:       { label: 'Assigned',              color: 'bg-indigo-100 text-indigo-700', icon: '👤' },
  followup_set:   { label: 'Follow-up Scheduled',  color: 'bg-green-100 text-green-700',  icon: '📅' },
  won:            { label: 'Won 🎉',                color: 'bg-green-200 text-green-800',  icon: '🏆' },
  lost:           { label: 'Lost',                  color: 'bg-red-100 text-red-700',     icon: '❌' },
  note:           { label: 'Note Added',            color: 'bg-gray-100 text-gray-700',   icon: '📝' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24)  return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export default function LeadDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const router      = useRouter();
  const qc          = useQueryClient();
  const [showEvents, setShowEvents]       = useState(true);
  const [newFollowupDate, setNewFollowupDate] = useState('');
  const [activeTab, setActiveTab]         = useState<'info'|'deals'|'activity'>('info');

  const { data: dealsData } = useQuery({
    queryKey: ['lead-deals', id],
    queryFn:  () => dealsApi.list({ lead: id }),
    enabled:  !!id,
  });

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn:  () => leadsApi.get(id).then((r) => r.data),
  });

  const { data: statuses } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  async () => {
      const r = await leadsApi.statuses();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: stages } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  async () => {
      const r = await leadsApi.stages();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['lead-events', id],
    queryFn:  () => leadsApi.events(id).then((r) => r.data),
    enabled:  !!id,
  });

  const moveStage = useMutation({
    mutationFn: (stageId: string) => leadsApi.moveStage(id, stageId),
    onSuccess: () => {
      toast.success('Stage updated ✅');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['lead-events', id] });
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const changeStatus = useMutation({
    mutationFn: (status_id: string) => leadsApi.changeStatus(id, status_id),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['lead-events', id] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const setFollowupDate = useMutation({
    mutationFn: (date: string) => leadsApi.setFollowupDate(id, date),
    onSuccess: () => {
      toast.success('Follow-up scheduled ✅');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['lead-events', id] });
      // invalidate followups page cache — يظهر فوراً لما تروح /followups
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
      setNewFollowupDate('');
    },
    onError: (err: any) => toast.error('Error: ' + (err?.response?.data?.followup_date?.[0] || err?.response?.data?.detail || 'Failed to set follow-up date')),
  });

  if (isLoading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );
  if (!lead) return (
    <div className="text-center py-20 text-gray-400">Lead not found.</div>
  );

  const customer = lead.customer_detail ?? lead.customer;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={lead.title}
        subtitle={"Source: " + lead.source}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                    onClick={() => router.back()}>Back</Button>
            <a
              href={`/leads/${id}/edit`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                         border border-gray-300 text-sm font-medium text-gray-700
                         hover:bg-gray-50 transition-colors"
            >
              ✏️ Edit
            </a>
          </div>
        }
      />

      {/* ── Lead Info ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          {lead.status_name && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1
                             rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              <Tag size={12}/> {lead.status_name}
            </span>
          )}
          {lead.priority_name && (
            <span className="inline-flex items-center px-3 py-1
                             rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
              {lead.priority_name}
            </span>
          )}
        </div>

        {lead.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{lead.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {lead.assigned_name && (
            <div className="flex items-center gap-2 text-gray-600">
              <User size={14} className="text-gray-400"/>
              Assigned to: <span className="font-medium">{lead.assigned_name}</span>
            </div>
          )}
          {lead.followup_date && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar size={14} className="text-gray-400"/>
              Follow-up: <span className="font-medium">
                {new Date(lead.followup_date).toLocaleDateString()}
              </span>
            </div>
          )}
          {lead.value && (
            <div className="text-gray-600">
              Value: <span className="font-semibold text-green-600">
                EGP {Number(lead.value).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Current Stage */}
        {lead.stage_name && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: lead.stage_color ?? '#6B7280' }}/>
            <span className="text-sm font-medium text-gray-700">
              Stage: {lead.stage_name}
            </span>
          </div>
        )}

        {/* Move Stage */}
        {stages && stages.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Move Stage</p>
            <div className="flex flex-wrap gap-2">
              {(stages as any[]).map((s: any) => (
                <button key={s.id} onClick={() => moveStage.mutate(s.id)}
                  disabled={moveStage.isPending || lead.stage === s.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full
                             text-xs font-medium border transition-colors
                             disabled:opacity-50 disabled:cursor-default"
                  style={{
                    backgroundColor: lead.stage === s.id ? s.color + '25' : '',
                    borderColor:     lead.stage === s.id ? s.color : '#E5E7EB',
                    color:           lead.stage === s.id ? s.color : '#374151',
                  }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}/>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Change Status */}
        {statuses && statuses.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Change Status</p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s: any) => (
                <button key={s.id} onClick={() => changeStatus.mutate(s.id)}
                  disabled={changeStatus.isPending}
                  className="px-3 py-1 rounded-full text-xs font-medium border
                             border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  style={{
                    backgroundColor: lead.status_name === s.name ? s.color + '20' : '',
                    borderColor: lead.status_name === s.name ? s.color : '',
                    color: lead.status_name === s.name ? s.color : '',
                  }}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Set Follow-up Date */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Schedule Follow-up
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="datetime-local"
              value={newFollowupDate}
              onChange={e => setNewFollowupDate(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Button
              variant="primary" size="sm"
              disabled={!newFollowupDate || setFollowupDate.isPending}
              onClick={() => setFollowupDate.mutate(newFollowupDate.length === 16 ? newFollowupDate + ':00' : newFollowupDate)}
            >
              Set
            </Button>
          </div>
        </div>
      </div>

      {/* ── Customer Info ──────────────────────────────────────── */}
      {customer && typeof customer === 'object' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Customer</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">
                {'first_name' in customer
                  ? customer.first_name + ' ' + customer.last_name
                  : lead.customer_name}
              </p>
              {'primary_phone' in customer && customer.primary_phone && (
                <p className="text-sm text-gray-500 font-mono mt-0.5">
                  {customer.primary_phone}
                </p>
              )}
            </div>
            {'id' in customer && (
              <Button variant="secondary" size="sm"
                      onClick={() => router.push('/customers/' + customer.id)}>
                View Profile
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Contact Info ─────────────────────────────────────── */}
      {(lead as any)?.first_name || (lead as any)?.phone || (lead as any)?.email ? (
        <div className='bg-white rounded-xl border border-gray-200 shadow-sm p-5'>
          <h2 className='text-sm font-semibold text-gray-500 mb-3'>Contact Info</h2>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            {[
              { label: 'Name',    value: `${(lead as any).first_name ?? ''} ${(lead as any).last_name ?? ''}`.trim() },
              { label: 'Phone',   value: (lead as any).phone },
              { label: 'Email',   value: (lead as any).email },
              { label: 'Company', value: (lead as any).company },
              { label: 'City',    value: (lead as any).city },
              { label: 'Country', value: (lead as any).country },
            ].filter((f) => f.value).map(({ label, value }) => (
              <div key={label}>
                <p className='text-xs text-gray-400'>{label}</p>
                <p className='text-sm font-medium text-gray-800 mt-0.5'>{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Lifecycle & Score ────────────────────────────────── */}
      {(() => {
        const lifecycle = (lead as any)?.lifecycle_stage ?? 'prospect';
        const score     = (lead as any)?.score ?? 0;
        const cls       = (lead as any)?.classification ?? 'none';
        const LC: Record<string,string> = {
          prospect:'bg-gray-100 text-gray-600', opportunity:'bg-blue-100 text-blue-700',
          won:'bg-green-100 text-green-700', customer:'bg-emerald-100 text-emerald-700',
          churned:'bg-red-100 text-red-600',
        };
        const CC: Record<string,string> = {
          none:'bg-gray-300', cold:'bg-sky-400', warm:'bg-yellow-400',
          hot:'bg-orange-400', very_hot:'bg-red-500',
        };
        return (
          <div className='bg-white rounded-xl border border-gray-200 shadow-sm p-5'>
            <h2 className='text-sm font-semibold text-gray-500 mb-3'>Lifecycle & Score</h2>
            <div className='flex items-center gap-6 flex-wrap'>
              <div>
                <p className='text-xs text-gray-400 mb-1'>Lifecycle</p>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${LC[lifecycle] ?? 'bg-gray-100 text-gray-500'}`}>{lifecycle}</span>
              </div>
              <div>
                <p className='text-xs text-gray-400 mb-1'>Classification</p>
                <span className='text-sm font-semibold text-gray-700 capitalize'>{cls}</span>
              </div>
              <div>
                <p className='text-xs text-gray-400 mb-1'>Score</p>
                <div className='flex items-center gap-2'>
                  <div className='w-28 h-2 bg-gray-200 rounded-full overflow-hidden'>
                    <div className={`h-full rounded-full ${CC[cls] ?? 'bg-gray-300'}`} style={{width:`${score}%`}} />
                  </div>
                  <span className='text-sm font-semibold text-gray-700'>{score}/100</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Deals ────────────────────────────────────────────── */}
      {(() => {
        const deals = (dealsData as any)?.results ?? dealsData ?? [];
        if (!deals.length) return null;
        return (
          <div className='bg-white rounded-xl border border-gray-200 shadow-sm p-5'>
            <h2 className='text-sm font-semibold text-gray-500 mb-3'>Deals ({deals.length})</h2>
            <div className='space-y-2'>
              {deals.map((d: any) => (
                <div key={d.id} className='flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100'>
                  <div>
                    <p className='text-sm font-medium text-gray-800'>{d.title}</p>
                    <p className='text-xs text-gray-400 mt-0.5'>{d.stage_name ?? d.stage} · {d.value ? Number(d.value).toLocaleString()+' '+(d.currency??'EGP') : '—'}</p>
                  </div>
                  <a href={`/deals/${d.id}`} className='text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200'>View</a>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Audit Trail / Events ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setShowEvents(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4
                     text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl"
        >
          <span className="flex items-center gap-2">
            <Clock size={15} className="text-gray-400"/>
            Activity Timeline
            {events && (
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {(events as LeadEvent[]).length}
              </span>
            )}
          </span>
          {showEvents ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </button>

        {showEvents && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
            {eventsLoading && <div className="flex justify-center py-4"><Spinner size="sm"/></div>}
            {!eventsLoading && (!events || (events as LeadEvent[]).length === 0) && (
              <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
            )}
            {(events as LeadEvent[] | undefined)?.map((ev) => {
              const meta = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, color: 'bg-gray-100 text-gray-600', icon: '•' };
              return (
                <div key={ev.id} className="flex items-start gap-3">
                  <span className="text-base mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={"px-2 py-0.5 rounded-full text-xs font-semibold " + meta.color}>
                        {meta.label}
                      </span>
                      {ev.old_value && ev.new_value && (
                        <span className="text-xs text-gray-500">
                          {ev.old_value} → <span className="font-medium text-gray-700">{ev.new_value}</span>
                        </span>
                      )}
                      {!ev.old_value && ev.new_value && (
                        <span className="text-xs font-medium text-gray-700">{ev.new_value}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      {ev.actor_name && <span>{ev.actor_name}</span>}
                      <span>·</span>
                      <span>{timeAgo(ev.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
