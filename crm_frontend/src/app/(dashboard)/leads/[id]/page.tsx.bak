'use client';

import { useParams, useRouter }        from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState }                    from 'react';
import {
  ArrowLeft, Phone, Mail, Building2, MapPin,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  FileText, MessageSquare, TrendingUp, Clock,
  Ticket as TicketIcon, Plus, CheckSquare, Edit,
} from 'lucide-react';
import { leadsApi }     from '@/lib/api/leads';
import { dealsApi }     from '@/lib/api/deals';
import { callsApi }     from '@/lib/api/calls';
import { ticketsApi }   from '@/lib/api/tickets';
import { quotationsApi } from '@/lib/api/sales';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import { Spinner }      from '@/components/ui/Spinner';
import { NewTicketModal } from '@/components/tickets/NewTicketModal';
import { PriorityBadge, StatusBadge as TicketStatusBadge } from '@/components/tickets/TicketBadge';
import api              from '@/lib/api/axios';
import toast            from 'react-hot-toast';
import Link             from 'next/link';

function formatDuration(s: number) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function timeAgo(dateStr: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

const LC_COLOR: Record<string, string> = {
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

type Tab = 'timeline' | 'calls' | 'deals' | 'quotations' | 'followups' | 'tickets';

export default function LeadDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const qc       = useQueryClient();
  const [tab, setTab]               = useState<Tab>('timeline');
  const [noteText, setNoteText]     = useState('');
  const [noteOpen, setNoteOpen]     = useState(false);
  const [ticketModal, setTicketModal] = useState(false);
  const [newFollowupDate, setNewFollowupDate] = useState('');

  // ── Lead data ────────────────────────────────────────────────
  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn:  () => leadsApi.get(id).then((r) => r.data),
    enabled:  !!id,
  });

  const { data: stages } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then((r: any) => {
      const raw = r?.data ?? r;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    }),
  });

  const { data: statuses } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  () => leadsApi.statuses().then((r: any) => {
      const raw = r?.data ?? r;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    }),
  });

  // ── Tab data ─────────────────────────────────────────────────
  const { data: callsData } = useQuery({
    queryKey: ['lead-calls', id],
    queryFn:  async () => {
      const r = await callsApi.list({ lead: id, page_size: 50 });
      const d = (r as any)?.data ?? r;
      return { results: Array.isArray(d) ? d : (d?.results ?? []), count: d?.count ?? 0 };
    },
    enabled: !!id && tab === 'calls',
  });

  const { data: dealsData } = useQuery({
    queryKey: ['lead-deals', id],
    queryFn:  () => dealsApi.list({ lead: id }).then((r: any) => {
      const d = r?.data ?? r;
      return { results: Array.isArray(d) ? d : (d?.results ?? []), count: d?.count ?? 0 };
    }),
    enabled: !!id && tab === 'deals',
  });

  const { data: quotationsData } = useQuery({
    queryKey: ['lead-quotations', id],
    queryFn:  () => quotationsApi.list({ lead: id } as any).then((r: any) => {
      const d = r?.data ?? r;
      return { results: Array.isArray(d) ? d : (d?.results ?? []), count: d?.count ?? 0 };
    }),
    enabled: !!id && tab === 'quotations',
  });

  const { data: followupsData } = useQuery({
    queryKey: ['lead-followups', id],
    queryFn:  () => api.get(`/followups/?lead=${id}&page_size=50`).then((r) => {
      const d = r?.data;
      return { results: Array.isArray(d) ? d : (d?.results ?? []), count: d?.count ?? 0 };
    }),
    enabled: !!id && tab === 'followups',
  });

  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['lead-tickets', id],
    queryFn:  () => ticketsApi.list({ lead: id, page_size: 50 } as any).then((r) => r.data),
    enabled:  !!id && tab === 'tickets',
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['lead-events-timeline', id],
    queryFn:  () => leadsApi.events(id).then((r) => r.data),
    enabled:  !!id && tab === 'timeline',
  });

  const { data: scoreHistory } = useQuery({
    queryKey: ['lead-score-events', id],
    queryFn:  () => leadsApi.scoreEvents(id),
    enabled:  !!id,
  });

  // ── Mutations ────────────────────────────────────────────────
  const moveStage = useMutation({
    mutationFn: (stageId: string) => leadsApi.moveStage(id, stageId),
    onSuccess: () => { toast.success('Stage updated ✅'); qc.invalidateQueries({ queryKey: ['lead', id] }); },
    onError: () => toast.error('Failed to update stage'),
  });

  const changeStatus = useMutation({
    mutationFn: (status_id: string) => leadsApi.changeStatus(id, status_id),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['lead', id] }); },
    onError: () => toast.error('Failed to update status'),
  });

  const setFollowupMutation = useMutation({
    mutationFn: (date: string) => leadsApi.setFollowupDate(id, date),
    onSuccess: () => {
      toast.success('Follow-up scheduled ✅');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      setNewFollowupDate('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Failed'),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => api.post('/notes/', { content: noteText, lead: id, is_pinned: false }),
    onSuccess: () => {
      toast.success('Note added ✅');
      setNoteText(''); setNoteOpen(false);
      qc.invalidateQueries({ queryKey: ['lead-events-timeline', id] });
    },
    onError: () => toast.error('Failed to add note'),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!lead)    return <div className="text-center py-20 text-gray-400">Lead not found.</div>;

  const l             = lead as any;
  const lifecycle     = l.lifecycle_stage ?? 'prospect';
  const classification = l.classification ?? 'none';
  const score         = l.score ?? 0;
  const CC: Record<string,string> = { none:'bg-gray-300', cold:'bg-sky-400', warm:'bg-yellow-400', hot:'bg-orange-400', very_hot:'bg-red-500' };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">

      {/* ── Header ────────────────────────────────────────────── */}
      <PageHeader
        title={`${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || lead.title}
        subtitle={l.company || lead.title}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<MessageSquare size={16}/>}
                    onClick={() => setNoteOpen(!noteOpen)}>
              Add Note
            </Button>
            <Button variant="primary" icon={<TicketIcon size={16}/>}
                    onClick={() => setTicketModal(true)}>
              New Ticket
            </Button>
            <Link href={`/leads/${id}/edit`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border
                         border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Edit size={14}/> Edit
            </Link>
            <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                    onClick={() => router.back()}>Back</Button>
          </div>
        }
      />

      {/* ── Info Card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">

        {/* Badges row */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${LC_COLOR[lifecycle] ?? 'bg-gray-100 text-gray-500'}`}>
            {lifecycle}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${CLASS_COLOR[classification]}`}>
            {classification}
          </span>
          {lead.status_name && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {lead.status_name}
            </span>
          )}
          {lead.priority_name && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
              {lead.priority_name}
            </span>
          )}
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Score</span>
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${CC[classification] ?? 'bg-gray-300'}`} style={{width:`${score}%`}} />
          </div>
          <span className="text-sm font-semibold text-gray-700">{score}/100</span>
        </div>

        {/* Contact info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {l.phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone size={14} className="text-gray-400"/> {l.phone}
            </div>
          )}
          {l.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={14} className="text-gray-400"/> {l.email}
            </div>
          )}
          {l.company && (
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 size={14} className="text-gray-400"/> {l.company}
            </div>
          )}
          {(l.city || l.country) && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin size={14} className="text-gray-400"/>
              {[l.city, l.country].filter(Boolean).join(', ')}
            </div>
          )}
          {lead.assigned_name && (
            <div className="text-gray-600">Assigned: <span className="font-medium">{lead.assigned_name}</span></div>
          )}
          {lead.followup_date && (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={14} className="text-gray-400"/>
              Follow-up: <span className="font-medium">{new Date(lead.followup_date).toLocaleDateString()}</span>
            </div>
          )}
          {lead.value && (
            <div className="text-gray-600">
              Value: <span className="font-semibold text-green-600">EGP {Number(lead.value).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Stage */}
        {lead.stage_name && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{backgroundColor: lead.stage_color ?? '#6B7280'}}/>
            <span className="text-sm font-medium text-gray-700">Stage: {lead.stage_name}</span>
          </div>
        )}

        {/* Move Stage */}
        {stages && (stages as any[]).length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Move Stage</p>
            <div className="flex flex-wrap gap-2">
              {(stages as any[]).map((s: any) => (
                <button key={s.id} onClick={() => moveStage.mutate(s.id)}
                  disabled={moveStage.isPending || lead.stage === s.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: lead.stage === s.id ? s.color + '25' : '',
                    borderColor: lead.stage === s.id ? s.color : '#E5E7EB',
                    color: lead.stage === s.id ? s.color : '#374151',
                  }}>
                  <span className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}/>{s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Change Status */}
        {statuses && (statuses as any[]).length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Change Status</p>
            <div className="flex flex-wrap gap-2">
              {(statuses as any[]).map((s: any) => (
                <button key={s.id} onClick={() => changeStatus.mutate(s.id)}
                  disabled={changeStatus.isPending}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
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

        {/* Schedule Follow-up */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Schedule Follow-up</p>
          <div className="flex gap-2 items-center">
            <input type="datetime-local" value={newFollowupDate}
              onChange={(e) => setNewFollowupDate(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            <Button variant="primary" size="sm"
              disabled={!newFollowupDate || setFollowupMutation.isPending}
              onClick={() => setFollowupMutation.mutate(
                newFollowupDate.length === 16 ? newFollowupDate + ':00' : newFollowupDate
              )}>Set</Button>
          </div>
        </div>
      </div>

      {/* ── Add Note ─────────────────────────────────────────── */}
      {noteOpen && (
        <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">📝 Add Note</p>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
            rows={3} placeholder="Write a note about this lead..."
            value={noteText} onChange={(e) => setNoteText(e.target.value)}/>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setNoteOpen(false); setNoteText(''); }}>Cancel</Button>
            <Button variant="primary" size="sm"
              loading={addNoteMutation.isPending} disabled={noteText.trim().length < 3}
              onClick={() => addNoteMutation.mutate()}>Save Note</Button>
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([
          { key: 'timeline',   label: 'Timeline',   icon: <Clock size={14}/> },
          { key: 'calls',      label: 'Calls',      icon: <Phone size={14}/> },
          { key: 'deals',      label: 'Deals',      icon: <TrendingUp size={14}/> },
          { key: 'quotations', label: 'Quotations', icon: <FileText size={14}/> },
          { key: 'followups',  label: 'Follow-ups', icon: <CheckSquare size={14}/> },
          { key: 'tickets',    label: 'Tickets',    icon: <TicketIcon size={14}/> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TIMELINE TAB ─────────────────────────────────────── */}
      {tab === 'timeline' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Activity Timeline</h3>
          </div>
          {eventsLoading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!eventsLoading && !(eventsData as any[])?.length && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No activity yet.</p>
          )}
          <div className="divide-y divide-gray-50">
            {(eventsData as any[] ?? []).map((ev: any) => (
              <div key={ev.id} className="px-5 py-4 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {ev.event_type?.replace(/_/g, ' ')}
                    </span>
                    {ev.old_value && ev.new_value && (
                      <span className="text-xs text-gray-500">
                        {ev.old_value} → <span className="font-medium text-gray-700">{ev.new_value}</span>
                      </span>
                    )}
                  </div>
                  {ev.note && <p className="text-sm text-gray-600 mt-0.5">{ev.note}</p>}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    {ev.actor_name && <span>{ev.actor_name}</span>}
                    <span>·</span>
                    <span>{timeAgo(ev.created_at)}</span>
                  </div>
                </div>
                {/* Score events inline */}
              </div>
            ))}
          </div>
          {/* Score History */}
          {Array.isArray(scoreHistory) && scoreHistory.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Score History</p>
              <div className="space-y-2">
                {(scoreHistory as any[]).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-10 text-right ${e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {e.points > 0 ? '+' : ''}{e.points}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-gray-700 capitalize">{e.event_type?.replace(/_/g, ' ')}</p>
                        {e.reason && <p className="text-xs text-gray-400 mt-0.5">{e.reason}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CALLS TAB ────────────────────────────────────────── */}
      {tab === 'calls' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Calls ({callsData?.count ?? 0})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {!callsData?.results?.length && <p className="px-5 py-8 text-center text-sm text-gray-400">No calls yet.</p>}
            {callsData?.results?.map((call: any) => (
              <div key={call.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/calls/${call.id}`)}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${call.direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    {call.direction === 'inbound'
                      ? <PhoneIncoming size={14} className="text-blue-600"/>
                      : <PhoneOutgoing size={14} className="text-green-600"/>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{call.caller}</span>
                      <StatusBadge status={call.status} size="xs"/>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {call.agent_name || 'No agent'} · {call.started_at ? new Date(call.started_at).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
                {call.duration > 0 && <span className="text-xs text-gray-500 font-mono">{formatDuration(call.duration)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DEALS TAB ────────────────────────────────────────── */}
      {tab === 'deals' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Deals ({dealsData?.count ?? 0})</h3>
            <Link href={`/deals/new?lead=${id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
              <Plus size={12}/> New Deal
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {!dealsData?.results?.length && <p className="px-5 py-8 text-center text-sm text-gray-400">No deals yet.</p>}
            {dealsData?.results?.map((deal: any) => (
              <div key={deal.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/deals/${deal.id}`)}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{deal.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {deal.stage_name ?? deal.stage} · {deal.value ? `${Number(deal.value).toLocaleString()} ${deal.currency ?? 'EGP'}` : '—'}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{deal.stage_name ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUOTATIONS TAB ───────────────────────────────────── */}
      {tab === 'quotations' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Quotations ({quotationsData?.count ?? 0})</h3>
            <Link href={`/sales/quotations/new?lead=${id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
              <Plus size={12}/> New Quotation
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {!quotationsData?.results?.length && <p className="px-5 py-8 text-center text-sm text-gray-400">No quotations yet.</p>}
            {quotationsData?.results?.map((q: any) => (
              <div key={q.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/sales/quotations/${q.id}`)}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.title ?? q.ref_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{q.ref_number} · {q.quotation_type}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${q.status === 'approved' ? 'bg-green-100 text-green-700' :
                    q.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    q.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'}`}>
                  {q.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FOLLOWUPS TAB ────────────────────────────────────── */}
      {tab === 'followups' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Follow-ups ({followupsData?.count ?? 0})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {!followupsData?.results?.length && <p className="px-5 py-8 text-center text-sm text-gray-400">No follow-ups yet.</p>}
            {followupsData?.results?.map((f: any) => (
              <div key={f.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{f.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {f.followup_type} · {f.scheduled_at ? new Date(f.scheduled_at).toLocaleString() : '—'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${f.status === 'completed' ? 'bg-green-100 text-green-700' :
                    f.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                    'bg-yellow-100 text-yellow-700'}`}>
                  {f.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TICKETS TAB ──────────────────────────────────────── */}
      {tab === 'tickets' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Tickets ({ticketsData?.count ?? 0})</h3>
            <Button variant="primary" size="sm" icon={<Plus size={14}/>}
                    onClick={() => setTicketModal(true)}>New Ticket</Button>
          </div>
          {ticketsLoading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!ticketsLoading && !ticketsData?.results?.length && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No tickets yet.</p>
          )}
          <div className="divide-y divide-gray-50">
            {ticketsData?.results?.map((ticket: any) => (
              <div key={ticket.id}
                className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/tickets/${ticket.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-gray-400 font-mono">#{ticket.ticket_number}</span>
                    <PriorityBadge priority={ticket.priority}/>
                    <TicketStatusBadge status={ticket.status}/>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                </div>
                <div className="text-xs text-gray-400 shrink-0">{timeAgo(ticket.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      <NewTicketModal
        open={ticketModal}
        onClose={() => setTicketModal(false)}
        onCreated={() => { setTicketModal(false); refetchTickets(); setTab('tickets'); }}
        defaultCustomerId={id}
      />

    </div>
  );
}
