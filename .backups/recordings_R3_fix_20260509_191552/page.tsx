'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, User as UserIcon, Calendar, Clock, Phone,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Ticket as TicketIcon,
  FileText, MessageSquare, Plus, Mail, Building2, MapPin,
  DollarSign, MoreVertical, MessageCircle, ChevronRight,
  Check, Lightbulb, X, TrendingUp,
  Archive, RotateCcw, Trash2, Mic, Download as DownloadIcon, Play, Pause
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsApi } from '@/lib/api/leads';
import { callsApi } from '@/lib/api/calls';
import { ticketsApi } from '@/lib/api/tickets';
import { followupsApi } from '@/lib/api/followups';
import { quotationsApi } from '@/lib/api/sales';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NewTicketModal } from '@/components/tickets/NewTicketModal';
import { PriorityBadge, StatusBadge as TicketStatusBadge } from '@/components/tickets/TicketBadge';
import type { LeadEvent } from '@/types';
import { getLeadDisplayName } from '@/lib/leads';
import { session } from '@/lib/auth/session';

// ── Helpers ───────────────────────────────────────────────────
const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  created:        { label: 'Lead Created',         color: 'bg-blue-100 text-blue-700',     icon: '🆕' },
  stage_changed:  { label: 'Stage Changed',        color: 'bg-purple-100 text-purple-700', icon: '📌' },
  status_changed: { label: 'Status Changed',       color: 'bg-yellow-100 text-yellow-700', icon: '🔄' },
  assigned:       { label: 'Assigned',             color: 'bg-indigo-100 text-indigo-700', icon: '👤' },
  followup_set:   { label: 'Follow-up Scheduled',  color: 'bg-green-100 text-green-700',   icon: '📅' },
  won:            { label: 'Won 🎉',               color: 'bg-green-200 text-green-800',   icon: '🏆' },
  lost:           { label: 'Lost',                 color: 'bg-red-100 text-red-700',       icon: '❌' },
  note:           { label: 'Note Added',           color: 'bg-gray-100 text-gray-700',     icon: '📝' },
  call_offered:   { label: 'Call Offered',         color: 'bg-sky-100 text-sky-700',       icon: '📞' },
  call_answered:  { label: 'Call Answered',        color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
  call_rejected:  { label: 'Call Rejected',        color: 'bg-red-100 text-red-700',       icon: '🚫' },
  call_no_answer: { label: 'No Answer',            color: 'bg-amber-100 text-amber-700',   icon: '⏰' },
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
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(name: string): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
}

function getAvatarColor(id: string): string {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
    'bg-teal-100 text-teal-700',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function SOURCE_LABEL(s: string): string {
  const m: Record<string, string> = {
    call: 'Inbound Call', web: 'Website', referral: 'Referral',
    campaign: 'Campaign', social: 'Social Media', manual: 'Manual',
  };
  return m[s] || s || '—';
}

type Tab = 'timeline' | 'calls' | 'tickets' | 'followups' | 'quotations' | 'recordings';

interface TimelineItem {
  id:        string;
  type:      'event' | 'call' | 'ticket' | 'followup';
  timestamp: string;
  data:      any;
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('timeline');
  const [newFollowupDate, setNewFollowupDate] = useState('');
  const [ticketModal, setTicketModal] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const currentUser = session.getUser();
  const isAdmin = currentUser?.role === 'admin';

  // ── Queries ──
  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn:  () => leadsApi.get(id).then((r) => r.data),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  async () => {
      const r = await leadsApi.statuses();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  async () => {
      const r = await leadsApi.stages();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const stageList = (Array.isArray(stages) ? stages : []) as any[];
  const statusList = (Array.isArray(statuses) ? statuses : []) as any[];

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['lead-events', id],
    queryFn:  () => leadsApi.events(id).then((r) => r.data),
    enabled:  !!id,
  });

  const { data: callsData } = useQuery({
    queryKey: ['lead-calls', id],
    queryFn:  async () => {
      const r = await callsApi.list({ lead: id, page_size: 50 });
      const d = (r as any)?.data ?? r;
      const results = Array.isArray(d) ? d : (d?.results ?? []);
      const count = d?.count ?? results.length;
      return { results, count };
    },
    enabled:   !!id,
    staleTime: 30_000,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['lead-tickets', id],
    queryFn:  () => ticketsApi.list({ lead: id, page_size: 50 }).then(r => r.data),
    enabled:  !!id,
  });

  const { data: followupsData, isLoading: followupsLoading } = useQuery({
    queryKey:  ['lead-followups', id],
    queryFn:   () => followupsApi.list({ lead: id, page_size: 50 }).then(r => r.data),
    enabled:   !!id,
    staleTime: 30_000,
  });

  const { data: quotationsData, isLoading: quotationsLoading } = useQuery({
    queryKey:  ['lead-quotations', id],
    queryFn:   () => quotationsApi.list({ lead: id, page_size: 50 }),
    enabled:   !!id && tab === 'quotations',
    staleTime: 30_000,
  });

  // ── Mutations ──
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
      setStatusMenuOpen(false);
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
      qc.invalidateQueries({ queryKey: ['lead-followups', id] });
      setNewFollowupDate('');
    },
    onError: (err: any) => toast.error('Error: ' + (
      err?.response?.data?.followup_date?.[0] ||
      err?.response?.data?.detail || 'Failed to set follow-up date'
    )),
  });

  const archiveMutation = useMutation({
    mutationFn: () => leadsApi.archive(id),
    onSuccess: () => {
      toast.success('Lead archived');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      setActionsOpen(false);
    },
    onError: (err: any) => toast.error(
      err?.response?.data?.detail || 'Failed to archive lead'
    ),
  });

  const restoreMutation = useMutation({
    mutationFn: () => leadsApi.restore(id),
    onSuccess: () => {
      toast.success('Lead restored');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      setActionsOpen(false);
    },
    onError: (err: any) => toast.error(
      err?.response?.data?.detail || 'Failed to restore lead'
    ),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: () => leadsApi.permanentDelete(id),
    onSuccess: () => {
      toast.success('Lead permanently deleted');
      qc.invalidateQueries({ queryKey: ['leads'] });
      setDeleteModalOpen(false);
      setDeleteConfirmText('');
      router.push('/leads');
    },
    onError: (err: any) => toast.error(
      err?.response?.data?.detail || 'Failed to delete lead'
    ),
  });

  // ── Unified timeline ──
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    // Filter out noisy / duplicate events:
    //   call_*  → already shown as their own call row
    //   unknown → skip (avoids raw "popup_shown" labels etc.)
    const HIDDEN_EVENT_TYPES = new Set([
      'call_offered', 'call_answered', 'call_rejected', 'call_no_answer',
    ]);
    const KNOWN_EVENT_TYPES = new Set(Object.keys(EVENT_LABELS));
    (events as LeadEvent[]).forEach(e => {
      if (HIDDEN_EVENT_TYPES.has(e.event_type)) return;
      if (!KNOWN_EVENT_TYPES.has(e.event_type)) return;
      items.push({ id: `ev-${e.id}`, type: 'event', timestamp: e.created_at, data: e });
    });
    ((callsData?.results as any[]) ?? []).forEach(c => {
      items.push({ id: `call-${c.id}`, type: 'call', timestamp: c.started_at || c.created_at, data: c });
    });
    ((ticketsData?.results as any[]) ?? []).forEach(t => {
      items.push({ id: `tk-${t.id}`, type: 'ticket', timestamp: t.created_at, data: t });
    });
    ((followupsData?.results as any[]) ?? []).forEach(f => {
      items.push({ id: `fu-${f.id}`, type: 'followup', timestamp: f.scheduled_at || f.created_at, data: f });
    });

    return items
      .filter(i => i.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events, callsData, ticketsData, followupsData]);

  // ── Quick follow-up helpers ──
  const quickFollowup = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 19);
    setFollowupDateMutation.mutate(iso);
  };

  // ── Quick action handlers ──
  const handleCallNow = () => {
    if (!lead?.phone) return;
    window.dispatchEvent(new CustomEvent('sip:dial', {
      detail: { phone: lead.phone, leadId: id, customerId: null },
    }));
  };

  const handleWhatsApp = () => {
    if (!lead?.phone) return;
    const cleaned = lead.phone.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleaned}`, '_blank');
  };

  const handleEmail = () => {
    if (!lead?.email) return;
    window.location.href = `mailto:${lead.email}`;
  };

  // ── Next Best Action logic ──
  const nextBestAction = useMemo(() => {
    if (!lead) return null;
    const lastCall = (callsData?.results as any[])?.[0];
    const lastCallDate = lastCall?.started_at;
    const daysSinceCall = lastCallDate
      ? Math.floor((Date.now() - new Date(lastCallDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const pendingFollowup = (followupsData?.results as any[])?.find(
      (f: any) => f.status === 'pending'
    );

    if (lead.followup_date && new Date(lead.followup_date) < new Date()) {
      return { text: 'Follow-up overdue — call now', color: 'red' };
    }
    if (pendingFollowup) {
      return { text: `Pending follow-up: ${new Date(pendingFollowup.scheduled_at).toLocaleDateString()}`, color: 'blue' };
    }
    if (daysSinceCall === null) {
      return { text: 'No calls yet — make first contact', color: 'amber' };
    }
    if (daysSinceCall > 7) {
      return { text: `${daysSinceCall} days since last call — follow up`, color: 'amber' };
    }
    return { text: 'Lead is active — keep engaging', color: 'green' };
  }, [lead, callsData, followupsData]);

  // ── Loading / Not found ──
  if (isLoading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );
  if (!lead) return (
    <div className="text-center py-20 text-gray-400">Lead not found.</div>
  );

  const fullName = getLeadDisplayName(lead);
  const ticketCount    = ticketsData?.count    ?? 0;
  const callCount      = callsData?.count      ?? 0;
  const followupCount  = followupsData?.count  ?? 0;
  const quotationCount = (quotationsData as any)?.count ?? 0;
  const currentStageIdx = stageList.findIndex((s: any) => s.id === lead.stage);

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
              <ArrowLeft size={18} className="text-gray-600"/>
            </button>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center
                             font-bold text-base shrink-0 ${getAvatarColor(lead.id)}`}>
              {getInitials(fullName)}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{fullName}</h1>
              <p className="text-xs text-gray-500 truncate">
                {lead.company || SOURCE_LABEL(lead.source)} {lead.phone && `· ${lead.phone}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lead.phone && (
              <button onClick={handleCallNow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                           bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors">
                <Phone size={14}/>
                <span className="hidden sm:inline">Call</span>
              </button>
            )}
            <Button variant="primary" size="sm" icon={<TicketIcon size={14}/>}
              onClick={() => setTicketModal(true)}>
              <span className="hidden sm:inline">Ticket</span>
            </Button>
            <div className="relative">
              <button onClick={() => setActionsOpen(v => !v)}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
                <MoreVertical size={16} className="text-gray-600"/>
              </button>
              {actionsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)}/>
                  <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1">
                    <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => { setActionsOpen(false); toast('Edit not implemented yet', { icon: 'ℹ️' }); }}>
                      <UserIcon size={14}/> Edit Info
                    </button>
                    <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => { setActionsOpen(false); router.push('/leads/pipeline'); }}>
                      <ChevronRight size={14}/> View in Pipeline
                    </button>
                    <div className="border-t border-gray-100 my-1"/>

                    {lead.is_active ? (
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2 disabled:opacity-50"
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate()}>
                        <Archive size={14}/>
                        {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
                      </button>
                    ) : (
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 text-green-700 flex items-center gap-2 disabled:opacity-50"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate()}>
                        <RotateCcw size={14}/>
                        {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <div className="border-t border-gray-100 my-1"/>
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                          onClick={() => { setActionsOpen(false); setDeleteModalOpen(true); }}>
                          <Trash2 size={14}/> Delete Permanently
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stage Progress */}
        {stageList.length > 0 && (
          <div className="px-5 pb-4 border-t border-gray-100 pt-3 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {stageList.map((s: any, idx: number) => {
                const isActive   = idx <  currentStageIdx;
                const isCurrent  = idx === currentStageIdx;
                const isFuture   = idx >  currentStageIdx;
                return (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      onClick={() => moveStage.mutate(s.id)}
                      disabled={moveStage.isPending || isCurrent}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                  transition-all whitespace-nowrap
                                  ${isCurrent ? 'shadow-md ring-2 ring-offset-1' :
                                   isActive   ? 'opacity-90' :
                                                'opacity-50 hover:opacity-100'}
                                  disabled:cursor-default`}
                      style={{
                        backgroundColor: isCurrent ? s.color
                                       : isActive  ? s.color + '30'
                                                   : '#F3F4F6',
                        color:           isCurrent ? '#FFF'
                                       : isActive  ? s.color
                                                   : '#6B7280',
                      }}>
                      {isActive && <Check size={11}/>}
                      {s.name}
                    </button>
                    {idx < stageList.length - 1 && (
                      <div className={`w-3 h-0.5 ${isFuture ? 'bg-gray-200' : 'bg-gray-300'}`}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* LEFT: Tabs */}
        <div className="space-y-4 min-w-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {([
              { key: 'timeline',    label: 'Timeline',    icon: <Clock size={14}/>,        badge: timelineItems.length },
              { key: 'calls',       label: 'Calls',       icon: <Phone size={14}/>,        badge: callCount },
              { key: 'tickets',     label: 'Tickets',     icon: <TicketIcon size={14}/>,   badge: ticketCount },
              { key: 'followups',   label: 'Follow-ups',  icon: <Calendar size={14}/>,     badge: followupCount },
              { key: 'quotations',  label: 'Quotes',      icon: <FileText size={14}/>,     badge: quotationCount },
            ] as { key: Tab; label: string; icon: React.ReactNode; badge: number }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm
                           font-medium transition-all whitespace-nowrap shrink-0
                  ${tab === t.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}>
                {t.icon}{t.label}
                {t.badge > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full font-semibold
                    ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* TIMELINE TAB */}
          {tab === 'timeline' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MessageSquare size={14} className="text-gray-400"/>
                  Activity Timeline
                </h3>
                <span className="text-xs text-gray-400">{timelineItems.length} items</span>
              </div>
              {(eventsLoading || ticketsLoading || followupsLoading) && timelineItems.length === 0 && (
                <div className="flex justify-center py-10"><Spinner size="sm"/></div>
              )}
              {timelineItems.length === 0 && !eventsLoading && (
                <div className="px-5 py-12 text-center">
                  <Clock size={36} className="text-gray-300 mx-auto mb-2"/>
                  <p className="text-sm text-gray-400">No activity yet.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Make your first call or schedule a follow-up to get started.
                  </p>
                </div>
              )}
              {timelineItems.length > 0 && (
                <div className="px-5 py-4 space-y-3">
                  {timelineItems.map((item) => <TimelineRow key={item.id} item={item} router={router}/>)}
                </div>
              )}
            </div>
          )}

          {/* CALLS TAB */}
          {tab === 'calls' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">All Calls ({callCount})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {!callsData?.results?.length && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">No calls yet.</p>
                )}
                {(callsData?.results as any[])?.map((call) => (
                  <div key={call.id}
                    className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/calls/${call.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                        ${call.direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50'}`}>
                        {call.direction === 'inbound'
                          ? <PhoneIncoming size={14} className="text-blue-600"/>
                          : call.status === 'no_answer'
                          ? <PhoneMissed size={14} className="text-red-500"/>
                          : <PhoneOutgoing size={14} className="text-green-600"/>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-900">{call.caller_number || call.caller}</span>
                          <StatusBadge status={call.status} size="xs"/>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {call.agent_name || 'No agent'} ·{' '}
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

          {/* TICKETS TAB */}
          {tab === 'tickets' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Tickets ({ticketCount})</h3>
                <Button variant="primary" size="sm" icon={<Plus size={12}/>}
                  onClick={() => setTicketModal(true)}>New</Button>
              </div>
              {ticketsLoading && <div className="flex justify-center py-10"><Spinner/></div>}
              {!ticketsLoading && !ticketsData?.results?.length && (
                <div className="px-5 py-10 text-center">
                  <TicketIcon className="h-10 w-10 text-gray-300 mx-auto mb-2"/>
                  <p className="text-sm text-gray-400">No tickets yet.</p>
                  <button onClick={() => setTicketModal(true)}
                    className="mt-3 text-sm text-blue-600 hover:underline">
                    Create the first ticket →
                  </button>
                </div>
              )}
              <div className="divide-y divide-gray-50">
                {(ticketsData?.results as any[])?.map((ticket) => (
                  <div key={ticket.id}
                    className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/tickets/${ticket.id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-gray-400 font-mono">#{ticket.ticket_number}</span>
                        <PriorityBadge priority={ticket.priority}/>
                        <TicketStatusBadge status={ticket.status}/>
                        {ticket.sla_breached && (
                          <span className="text-xs text-red-600 font-medium">⚠ SLA</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">{timeAgo(ticket.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FOLLOW-UPS TAB */}
          {tab === 'followups' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Follow-ups ({followupCount})</h3>
              </div>
              {followupsLoading && <div className="flex justify-center py-10"><Spinner/></div>}
              {!followupsLoading && !followupsData?.results?.length && (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No follow-ups yet.</p>
              )}
              <div className="divide-y divide-gray-50">
                {(followupsData?.results as any[])?.map((fu) => (
                  <div key={fu.id} className="px-5 py-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-gray-900">{fu.title}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
                        ${fu.status === 'completed'    ? 'bg-green-100 text-green-700'
                        : fu.status === 'cancelled'    ? 'bg-gray-100 text-gray-500'
                        : fu.status === 'rescheduled'  ? 'bg-yellow-100 text-yellow-700'
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
                ))}
              </div>
            </div>
          )}

          {/* QUOTATIONS TAB */}
          {tab === 'quotations' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Quotations ({quotationCount})</h3>
                <Button variant="primary" size="sm" icon={<Plus size={12}/>}
                  onClick={() => router.push(`/sales/quotations/new?lead=${id}`)}>New</Button>
              </div>
              {quotationsLoading && <div className="flex justify-center py-10"><Spinner/></div>}
              {!quotationsLoading && !(quotationsData as any)?.results?.length && (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No quotations yet.</p>
              )}
              <div className="divide-y divide-gray-50">
                {((quotationsData as any)?.results as any[])?.map((q) => (
                  <div key={q.id}
                    className="px-5 py-4 flex items-start justify-between hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/sales/quotations/${q.id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-gray-400 font-mono">{q.ref_number}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
                          ${q.status === 'accepted'  ? 'bg-green-100 text-green-700'
                          : q.status === 'rejected'  ? 'bg-red-100 text-red-600'
                                                     : 'bg-blue-100 text-blue-700'}`}>
                          {q.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        EGP {Number(q.total ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400">{timeAgo(q.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

      {tab === 'recordings' && (
        <RecordingsTab calls={callsData?.results || []} />
      )}
        </div>

        {/* RIGHT: Sticky Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Actions</h3>
            <button onClick={handleCallNow} disabled={!lead.phone}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 hover:bg-green-100
                         text-green-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Phone size={14}/> Call Now
            </button>
            <button onClick={handleWhatsApp} disabled={!lead.phone}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100
                         text-emerald-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <MessageCircle size={14}/> WhatsApp
            </button>
            <button onClick={handleEmail} disabled={!lead.email}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100
                         text-blue-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Mail size={14}/> Send Email
            </button>
          </div>

          {/* Quick Follow-up */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Schedule Follow-up</h3>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => quickFollowup(1)}
                className="px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-gray-700 transition-colors">
                In 1 hour
              </button>
              <button onClick={() => quickFollowup(24)}
                className="px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-gray-700 transition-colors">
                Tomorrow
              </button>
              <button onClick={() => quickFollowup(72)}
                className="px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-gray-700 transition-colors">
                In 3 days
              </button>
              <button onClick={() => quickFollowup(168)}
                className="px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium text-gray-700 transition-colors">
                Next week
              </button>
            </div>
            <div className="flex gap-1 pt-1">
              <input type="datetime-local" value={newFollowupDate}
                onChange={e => setNewFollowupDate(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              <Button variant="primary" size="sm"
                disabled={!newFollowupDate || setFollowupDateMutation.isPending}
                onClick={() => setFollowupDateMutation.mutate(
                  newFollowupDate.length === 16 ? newFollowupDate + ':00' : newFollowupDate
                )}>Set</Button>
            </div>
          </div>

          {/* Next Best Action */}
          {nextBestAction && (
            <div className={`rounded-xl border p-4 flex items-start gap-3
              ${nextBestAction.color === 'red'   ? 'bg-red-50 border-red-200'
              : nextBestAction.color === 'amber' ? 'bg-amber-50 border-amber-200'
              : nextBestAction.color === 'blue'  ? 'bg-blue-50 border-blue-200'
                                                  : 'bg-green-50 border-green-200'}`}>
              <Lightbulb size={16} className={`mt-0.5 shrink-0
                ${nextBestAction.color === 'red'   ? 'text-red-600'
                : nextBestAction.color === 'amber' ? 'text-amber-600'
                : nextBestAction.color === 'blue'  ? 'text-blue-600'
                                                    : 'text-green-600'}`}/>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700 mb-0.5">Suggested Next Action</p>
                <p className="text-xs text-gray-600">{nextBestAction.text}</p>
              </div>
            </div>
          )}

          {/* Lead Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Info</h3>

            {lead.value && (
              <div className="flex items-start gap-2">
                <DollarSign size={14} className="text-gray-400 mt-0.5 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Value</p>
                  <p className="text-sm font-semibold text-green-600">EGP {Number(lead.value).toLocaleString()}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Phone size={14} className="text-gray-400 mt-0.5 shrink-0"/>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Phone</p>
                <p className="text-sm font-mono text-gray-900 truncate">{lead.phone || '—'}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Mail size={14} className="text-gray-400 mt-0.5 shrink-0"/>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-gray-900 truncate">{lead.email || '—'}</p>
              </div>
            </div>

            {lead.company && (
              <div className="flex items-start gap-2">
                <Building2 size={14} className="text-gray-400 mt-0.5 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Company</p>
                  <p className="text-sm text-gray-900 truncate">{lead.company}</p>
                </div>
              </div>
            )}

            {(lead.city || lead.country) && (
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Location</p>
                  <p className="text-sm text-gray-900 truncate">{[lead.city, lead.country].filter(Boolean).join(', ')}</p>
                </div>
              </div>
            )}

            {lead.assigned_name && (
              <div className="flex items-start gap-2">
                <UserIcon size={14} className="text-gray-400 mt-0.5 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Assigned</p>
                  <p className="text-sm text-gray-900 truncate">{lead.assigned_name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <TrendingUp size={14} className="text-gray-400 mt-0.5 shrink-0"/>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Source</p>
                <p className="text-sm text-gray-900">{SOURCE_LABEL(lead.source)}</p>
              </div>
            </div>
          </div>

          {/* Status changer */}
          {statusList.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</h3>
              <div className="relative">
                <button onClick={() => setStatusMenuOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                             border border-gray-200 hover:bg-gray-50 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"/>
                    {lead.status_name || 'No status'}
                  </span>
                  <ChevronRight size={14} className={`text-gray-400 transition-transform
                    ${statusMenuOpen ? 'rotate-90' : ''}`}/>
                </button>
                {statusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)}/>
                    <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1">
                      {statusList.map((s: any) => (
                        <button key={s.id} onClick={() => changeStatus.mutate(s.id)}
                          disabled={changeStatus.isPending}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }}/>
                          {s.name}
                          {lead.status_name === s.name && <Check size={12} className="ml-auto text-blue-600"/>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {lead.description && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{lead.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal — uses correct props */}
      <NewTicketModal
        open={ticketModal}
        onClose={() => setTicketModal(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['lead-tickets', id] });
          toast.success('Ticket created ✅');
        }}
        defaultLeadId={id}
      />

      {/* Permanent Delete Confirmation Modal (admin only) */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
             onClick={() => setDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600"/>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900">Delete lead permanently?</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  This will permanently remove <span className="font-semibold">{fullName}</span>
                  {' '}and cannot be undone. The audit log will keep a record of the deletion.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-red-700">
                Type <span className="font-mono font-bold">DELETE</span> below to confirm.
              </p>
            </div>

            <input
              type="text"
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); }}
                disabled={permanentDeleteMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={() => permanentDeleteMutation.mutate()}
                disabled={deleteConfirmText !== 'DELETE' || permanentDeleteMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700
                           disabled:bg-red-300 disabled:cursor-not-allowed">
                {permanentDeleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Row component ──
function TimelineRow({ item, router }: { item: TimelineItem; router: any }) {
  if (item.type === 'event') {
    const ev = item.data as LeadEvent;
    const meta = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, color: 'bg-gray-100 text-gray-600', icon: '•' };
    return (
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={"px-2 py-0.5 rounded-full text-xs font-semibold " + meta.color}>{meta.label}</span>
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
            {ev.actor_name && <span>·</span>}
            <span>{timeAgo(ev.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }
  if (item.type === 'call') {
    const c = item.data;
    const icon = c.direction === 'inbound'
      ? <PhoneIncoming size={14} className="text-blue-600"/>
      : c.status === 'no_answer'
      ? <PhoneMissed size={14} className="text-red-500"/>
      : <PhoneOutgoing size={14} className="text-green-600"/>;
    return (
      <div onClick={() => router.push(`/calls/${c.id}`)}
        className="flex items-start gap-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
          ${c.direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50'}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              {c.direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call'}
            </span>
            <StatusBadge status={c.status} size="xs"/>
            {c.duration > 0 && (
              <span className="text-xs text-gray-500 font-mono">{formatDuration(c.duration)}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {c.agent_name || 'No agent'} · {timeAgo(c.started_at || c.created_at)}
          </p>
        </div>
      </div>
    );
  }
  if (item.type === 'ticket') {
    const t = item.data;
    return (
      <div onClick={() => router.push(`/tickets/${t.id}`)}
        className="flex items-start gap-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
        <div className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
          <TicketIcon size={13} className="text-purple-600"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">Ticket: {t.title}</span>
            <span className="text-xs text-gray-400">#{t.ticket_number}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(t.created_at)}</p>
        </div>
      </div>
    );
  }
  if (item.type === 'followup') {
    const f = item.data;
    const isPast = f.scheduled_at && new Date(f.scheduled_at) < new Date();
    return (
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
          ${f.status === 'completed' ? 'bg-green-50' : isPast ? 'bg-red-50' : 'bg-amber-50'}`}>
          <Calendar size={13} className={`
            ${f.status === 'completed' ? 'text-green-600' : isPast ? 'text-red-500' : 'text-amber-600'}`}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">Follow-up: {f.title}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
              ${f.status === 'completed' ? 'bg-green-100 text-green-700'
              : f.status === 'cancelled' ? 'bg-gray-100 text-gray-500'
                                          : 'bg-blue-100 text-blue-700'}`}>
              {f.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {f.scheduled_at ? `Due ${timeAgo(f.scheduled_at)}` : ''}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// ── RecordingsTab Component ───────────────────────────────────────
function RecordingsTab({ calls }: { calls: any[] }) {
  const callsWithRecordings = (calls || []).filter(
    (c: any) => Array.isArray(c.recordings) && c.recordings.length > 0
  );

  if (callsWithRecordings.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Mic size={40} className="text-gray-300 mx-auto mb-3"/>
        <p className="text-sm text-gray-500 mb-1">No recordings yet for this lead.</p>
        <p className="text-xs text-gray-400">Recordings will appear here automatically after each call.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {callsWithRecordings.map((call: any) =>
        (call.recordings || []).map((rec: any) => (
          <RecordingRow key={rec.id} call={call} recording={rec} />
        ))
      )}
    </div>
  );
}

function RecordingRow({ call, recording }: { call: any; recording: any }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAudio = async () => {
    if (audioUrl) return;
    setLoading(true);
    setError(null);
    try {
      const r = await callsApi.recordingBlob(call.id);
      const blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: 'audio/wav' });
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.response?.status === 404 ? 'Recording file not found' : 'Failed to load recording');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async () => {
    try {
      const r = await callsApi.recordingDownload(call.id);
      const blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = recording.filename.split('/').pop() || `call-${call.id}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const dirIcon = call.direction === 'inbound'
    ? <PhoneIncoming size={14} className="text-blue-500"/>
    : <PhoneOutgoing size={14} className="text-green-500"/>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {dirIcon}
        <span className="text-sm font-medium text-gray-900">
          {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call
        </span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-500">{call.agent_name || 'Unknown agent'}</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-500">
          {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}
        </span>
        {call.duration > 0 && (
          <>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">{Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}</span>
          </>
        )}
        <button
          onClick={downloadFile}
          className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          title="Download"
        >
          <DownloadIcon size={14}/> Download
        </button>
      </div>

      {!audioUrl && !loading && (
        <button
          onClick={loadAudio}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium transition-colors"
        >
          <Play size={14}/> Load &amp; Play Recording
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center py-3 text-xs text-gray-500">
          <Spinner size="sm"/> <span className="ml-2">Loading recording...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {audioUrl && (
        <audio controls src={audioUrl} className="w-full" preload="metadata">
          Your browser does not support audio playback.
        </audio>
      )}

      <div className="mt-2 text-[10px] text-gray-400 font-mono truncate">
        {recording.filename}
      </div>
    </div>
  );
}

