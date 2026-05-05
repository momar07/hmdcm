'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, User, Calendar, Tag, Clock, ChevronDown, ChevronUp, Phone,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Ticket as TicketIcon,
  FileText, MessageSquare, TrendingUp, Plus, Mail, Building2, MapPin,
  DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsApi } from '@/lib/api/leads';
import { callsApi } from '@/lib/api/calls';
import { ticketsApi } from '@/lib/api/tickets';
import { followupsApi } from '@/lib/api/followups';
import { quotationsApi } from '@/lib/api/sales';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NewTicketModal } from '@/components/tickets/NewTicketModal';
import { PriorityBadge, StatusBadge as TicketStatusBadge } from '@/components/tickets/TicketBadge';
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
  call_offered:   { label: 'Call Offered',          color: 'bg-sky-100 text-sky-700',     icon: '📞' },
  call_answered:  { label: 'Call Answered',          color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
  call_rejected:  { label: 'Call Rejected',          color: 'bg-red-100 text-red-700',     icon: '🚫' },
  call_no_answer: { label: 'No Answer',              color: 'bg-amber-100 text-amber-700', icon: '⏰' },
};

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

type Tab = 'activity' | 'calls' | 'tickets' | 'followups' | 'quotations';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('activity');
  const [showEvents, setShowEvents] = useState(true);
  const [newFollowupDate, setNewFollowupDate] = useState('');
  const [ticketModal, setTicketModal] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id).then((r) => r.data),
  });

  const { data: statuses } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn: async () => {
      const r = await leadsApi.statuses();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: stages } = useQuery({
    queryKey: ['lead-stages'],
    queryFn: async () => {
      const r = await leadsApi.stages();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });
  const stageList = Array.isArray(stages) ? stages : [];

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['lead-events', id],
    queryFn: () => leadsApi.events(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: callsData } = useQuery({
    queryKey: ['lead-calls', id],
    queryFn: async () => {
      const r = await callsApi.list({ lead: id, page_size: 50 });
      const d = (r as any)?.data ?? r;
      const results = Array.isArray(d) ? d : (d?.results ?? []);
      const count = d?.count ?? results.length;
      return { results, count };
    },
    enabled: !!id && tab === 'calls',
    staleTime: 30_000,
  });

  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['lead-tickets', id],
    queryFn: () => ticketsApi.list({ lead: id, page_size: 50 }).then(r => r.data),
    enabled: !!id && tab === 'tickets',
  });

  const { data: followupsData, isLoading: followupsLoading } = useQuery({
    queryKey: ['lead-followups', id],
    queryFn: () => followupsApi.list({ lead: id, page_size: 50 }).then(r => r.data),
    enabled: !!id && tab === 'followups',
    staleTime: 30_000,
  });

  const { data: quotationsData, isLoading: quotationsLoading } = useQuery({
    queryKey: ['lead-quotations', id],
    queryFn: () => quotationsApi.list({ lead: id, page_size: 50 }),
    enabled: !!id && tab === 'quotations',
    staleTime: 30_000,
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

  const setFollowupDateMutation = useMutation({
    mutationFn: (date: string) => leadsApi.setFollowupDate(id, date),
    onSuccess: () => {
      toast.success('Follow-up scheduled ✅');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['lead-events', id] });
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

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.title;
  const ticketCount = ticketsData?.count ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Header ────────────────────────────────────────────── */}
      <PageHeader
        title={fullName}
        subtitle={lead.company || lead.source}
        actions={
          <div className="flex gap-2">
            <Button variant="primary" icon={<TicketIcon size={16}/>}
                    onClick={() => setTicketModal(true)}>
              New Ticket
            </Button>
            <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                    onClick={() => router.back()}>Back</Button>
            {lead.phone && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('sip:dial', {
                  detail: { phone: lead.phone, leadId: id, customerId: null },
                }))}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
              >
                <Phone size={16} />
                Call Now
              </button>
            )}
          </div>
        }
      />

      {/* ── Info Card ─────────────────────────────────────────── */}
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
          {lead.stage_name && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: lead.stage_color ?? '#6B7280' }}>
              {lead.stage_name}
            </span>
          )}
        </div>

        {lead.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{lead.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {lead.assigned_name && (
            <div className="flex items-center gap-2 text-gray-600">
              <User size={14} className="text-gray-400"/>
              Assigned: <span className="font-medium">{lead.assigned_name}</span>
            </div>
          )}
          {lead.value && (
            <div className="flex items-center gap-2 text-gray-600">
              <DollarSign size={14} className="text-gray-400"/>
              Value: <span className="font-semibold text-green-600">
                EGP {Number(lead.value).toLocaleString()}
              </span>
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
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Phone size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <p className="font-medium text-gray-900 font-mono text-sm">
                {lead.phone || '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium text-gray-900 text-sm">
                {lead.email || '—'}
              </p>
            </div>
          </div>
          {lead.company && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                <Building2 size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Company</p>
                <p className="font-medium text-gray-900 text-sm">{lead.company}</p>
              </div>
            </div>
          )}
          {(lead.city || lead.country) && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                <MapPin size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Location</p>
                <p className="font-medium text-gray-900 text-sm">
                  {[lead.city, lead.country].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Move Stage */}
        {stageList.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Move Stage</p>
            <div className="flex flex-wrap gap-2">
              {stageList.map((s: any) => (
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

        {/* Schedule Follow-up */}
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
              disabled={!newFollowupDate || setFollowupDateMutation.isPending}
              onClick={() => setFollowupDateMutation.mutate(newFollowupDate.length === 16 ? newFollowupDate + ':00' : newFollowupDate)}
            >
              Set
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { key: 'activity',    label: 'Activity',    icon: <Clock size={14}/> },
          { key: 'calls',       label: 'Calls',       icon: <Phone size={14}/> },
          { key: 'tickets',     label: 'Tickets',     icon: <TicketIcon size={14}/>,
            badge: ticketCount > 0 ? ticketCount : null },
          { key: 'followups',   label: 'Follow-ups',  icon: <Calendar size={14}/> },
          { key: 'quotations',  label: 'Quotations',  icon: <FileText size={14}/> },
        ] as { key: Tab; label: string; icon: React.ReactNode; badge?: number | null }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
            {t.badge != null && (
              <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-semibold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ACTIVITY TAB ──────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <button
            onClick={() => setShowEvents(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4
                       text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl"
          >
            <span className="flex items-center gap-2">
              <MessageSquare size={15} className="text-gray-400"/>
              Lead Events
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
      )}

      {/* ── CALLS TAB ─────────────────────────────────────────── */}
      {tab === 'calls' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              All Calls ({callsData?.count ?? 0})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {!callsData?.results?.length && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No calls yet.</p>
            )}
            {callsData?.results?.map((call: any) => (
              <div key={call.id}
                   className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                   onClick={() => router.push(`/calls/${call.id}`)}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                    ${call.direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    {call.direction === 'inbound'
                      ? <PhoneIncoming size={14} className="text-blue-600" />
                      : call.status === 'no_answer'
                      ? <PhoneMissed size={14} className="text-red-500" />
                      : <PhoneOutgoing size={14} className="text-green-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{call.caller_number || call.caller}</span>
                      <StatusBadge status={call.status} size="xs" />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {call.agent_name || 'No agent'} ·{'  '}
                      {call.started_at ? new Date(call.started_at).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
                {call.duration > 0 && (
                  <span className="text-xs text-gray-500 font-mono">{formatDuration(call.duration)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TICKETS TAB ───────────────────────────────────────── */}
      {tab === 'tickets' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              All Tickets ({ticketsData?.count ?? 0})
            </h3>
            <Button variant="primary" size="sm" icon={<Plus size={14}/>}
                    onClick={() => setTicketModal(true)}>
              New Ticket
            </Button>
          </div>

          {ticketsLoading && <div className="flex justify-center py-10"><Spinner /></div>}

          {!ticketsLoading && !ticketsData?.results?.length && (
            <div className="px-5 py-10 text-center">
              <TicketIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No tickets yet for this lead.</p>
              <button onClick={() => setTicketModal(true)}
                className="mt-3 text-sm text-blue-600 hover:underline">
                Create the first ticket →
              </button>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {ticketsData?.results?.map((ticket: any) => (
              <div key={ticket.id}
                   className="px-5 py-4 flex items-start justify-between gap-4
                     hover:bg-gray-50 cursor-pointer transition-colors"
                   onClick={() => router.push(`/tickets/${ticket.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-gray-400 font-mono">#{ticket.ticket_number}</span>
                    <PriorityBadge priority={ticket.priority} />
                    <TicketStatusBadge status={ticket.status} />
                    {ticket.sla_breached && (
                      <span className="text-xs text-red-600 font-medium">⚠ SLA</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                  {ticket.category && (
                    <p className="text-xs text-gray-400 mt-0.5">{ticket.category}</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {timeAgo(ticket.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FOLLOW-UPS TAB ────────────────────────────────────── */}
      {tab === 'followups' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Follow-ups ({followupsData?.count ?? 0})
            </h3>
          </div>

          {followupsLoading && <div className="flex justify-center py-10"><Spinner /></div>}

          {!followupsLoading && !followupsData?.results?.length && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No follow-ups yet.</p>
          )}

          <div className="divide-y divide-gray-50">
            {followupsData?.results?.map((fu: any) => (
              <div key={fu.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-gray-900">{fu.title}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
                      ${fu.status === 'completed'  ? 'bg-green-100 text-green-700'
                      : fu.status === 'cancelled'  ? 'bg-gray-100 text-gray-500'
                      : fu.status === 'rescheduled' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-100 text-blue-700'}`}>
                      {fu.status}
                    </span>
                    <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-0.5 rounded-full">
                      {fu.followup_type}
                    </span>
                  </div>
                  {fu.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{fu.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {fu.assigned_to_name ? `Assigned to ${fu.assigned_to_name}` : 'Unassigned'}
                    {fu.scheduled_at ? ` · Due: ${new Date(fu.scheduled_at).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUOTATIONS TAB ────────────────────────────────────── */}
      {tab === 'quotations' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Quotations ({quotationsData?.count ?? 0})
            </h3>
            <Button variant="primary" size="sm" icon={<Plus size={14}/>}
                    onClick={() => router.push(`/sales/new?lead=${id}`)}>
              New Quotation
            </Button>
          </div>

          {quotationsLoading && <div className="flex justify-center py-10"><Spinner /></div>}

          {!quotationsLoading && !quotationsData?.results?.length && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No quotations yet.</p>
          )}

          <div className="divide-y divide-gray-50">
            {quotationsData?.results?.map((q: any) => (
              <div key={q.id}
                   className="px-5 py-4 flex items-start justify-between gap-4
                     hover:bg-gray-50 cursor-pointer transition-colors"
                   onClick={() => router.push(`/sales/${q.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-gray-400 font-mono">{q.ref_number}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
                      ${q.status === 'accepted'   ? 'bg-green-100 text-green-700'
                      : q.status === 'rejected'   ? 'bg-red-100 text-red-600'
                      : q.status === 'approved'   ? 'bg-blue-100 text-blue-700'
                      : q.status === 'sent'       ? 'bg-purple-100 text-purple-700'
                      : q.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-500'}`}>
                      {q.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-0.5 rounded-full">
                      {q.quotation_type}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                  {q.total_amount && (
                    <p className="text-xs text-green-600 font-semibold mt-0.5">
                      {q.currency || 'EGP'} {Number(q.total_amount).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {timeAgo(q.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── New Ticket Modal ──────────────────────────────────── */}
      <NewTicketModal
        open={ticketModal}
        onClose={() => setTicketModal(false)}
        onCreated={() => {
          setTicketModal(false);
          refetchTickets();
          if (tab !== 'tickets') setTab('tickets');
        }}
        defaultLeadId={id}
      />
    </div>
  );
}
