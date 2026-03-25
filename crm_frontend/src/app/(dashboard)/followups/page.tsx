'use client';

import { useState, useRef, useEffect }                        from 'react';
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, Calendar,
  PhoneCall, Mail, Users, MessageSquare,
  RefreshCw, Phone, ExternalLink,
} from 'lucide-react';
import toast                  from 'react-hot-toast';
import { followupsApi }       from '@/lib/api/followups';
import { callsApi }           from '@/lib/api/calls';
import { PageHeader }         from '@/components/ui/PageHeader';
import { Button }             from '@/components/ui/Button';
import { Select }             from '@/components/ui/Select';
import { StatusBadge }        from '@/components/ui/StatusBadge';
import { Modal }              from '@/components/ui/Modal';
import { useSipStore }        from '@/store/sipStore';
import type { Followup }      from '@/types';

// helpers
const TYPE_ICON: Record<string, React.ReactNode> = {
  call:    <PhoneCall     size={14} className="text-blue-500"   />,
  email:   <Mail          size={14} className="text-green-500"  />,
  meeting: <Users         size={14} className="text-purple-500" />,
  sms:     <MessageSquare size={14} className="text-orange-500" />,
  other:   <Clock         size={14} className="text-gray-400"   />,
};

function formatDate(iso: string) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (d.getTime() - now.getTime()) / 1000 / 60;
  if (diff < -60 * 24) return { label: d.toLocaleDateString(), overdue: true  };
  if (diff < 0)        return { label: 'Overdue',              overdue: true  };
  if (diff < 60)       return { label: `In ${Math.round(diff)}m`,      overdue: false };
  if (diff < 60 * 24)  return { label: `In ${Math.round(diff / 60)}h`, overdue: false };
  return { label: d.toLocaleDateString(), overdue: false };
}

function waPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return '20' + digits.slice(1);
  return digits;
}

// Post-Call Log Modal
function PostCallModal({ followup, onClose }: { followup: Followup; onClose: () => void }) {
  const qc              = useQueryClient();
  const [note, setNote] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      followupsApi.logAction(followup.id, {
        action_type: 'call',
        note:        note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Call logged to customer timeline ✅');
      onClose();
    },
    onError: () => toast.error('Failed to log call'),
  });

  return (
    <Modal open onClose={onClose} title="Log Call to Timeline" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {followup.customer_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{followup.customer_name ?? 'Unknown'}</p>
            <p className="text-xs text-blue-700 font-mono">{followup.customer_phone ?? ''}</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Call note <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Customer interested, will send offer tomorrow..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">Skip</Button>
          <Button variant="primary" loading={isPending} icon={<CheckCircle size={14} />} onClick={() => mutate()} className="flex-1">
            Save to Timeline
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// WhatsApp Modal
function WhatsAppModal({ followup, onClose }: { followup: Followup; onClose: () => void }) {
  const qc              = useQueryClient();
  const [note, setNote] = useState('');
  const phone           = followup.customer_phone ?? '';

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      followupsApi.logAction(followup.id, {
        action_type: 'whatsapp',
        note:        note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('WhatsApp logged to timeline ✅');
      onClose();
    },
    onError: () => toast.error('Failed to log WhatsApp action'),
  });

  const openWA = () => window.open(`https://wa.me/${waPhone(phone)}`, '_blank');

  return (
    <Modal open onClose={onClose} title="WhatsApp Message" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {followup.customer_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{followup.customer_name ?? 'Unknown'}</p>
            <p className="text-xs text-green-700 font-mono">{phone}</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Add a note <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Sent price list, customer will review..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">Skip</Button>
          {note.trim() ? (
            <Button variant="primary" loading={isPending} icon={<CheckCircle size={14} />}
              onClick={() => { openWA(); mutate(); }}
              className="flex-1 !bg-green-600 hover:!bg-green-700">
              Save &amp; Open WA
            </Button>
          ) : (
            <Button variant="primary" icon={<ExternalLink size={14} />}
              onClick={() => { openWA(); mutate(); }}
              className="flex-1 !bg-green-600 hover:!bg-green-700">
              Open WhatsApp
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Reschedule Modal
function RescheduleModal({ followup, onClose }: { followup: Followup; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(followup.scheduled_at?.split('T')[0] ?? '');
  const [time, setTime] = useState(followup.scheduled_at?.split('T')[1]?.slice(0, 5) ?? '09:00');

  const { mutate, isPending } = useMutation({
    mutationFn: () => followupsApi.reschedule(followup.id, `${date}T${time}:00`),
    onSuccess: () => {
      toast.success('Rescheduled ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
      onClose();
    },
    onError: () => toast.error('Failed to reschedule'),
  });

  return (
    <Modal open onClose={onClose} title="Reschedule Follow-up" size="sm">
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-700">{followup.title}</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
            <input type="time" value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<RefreshCw size={14} />}
                  loading={isPending} disabled={!date || !time} onClick={() => mutate()}>
            Reschedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Followup Card
function FollowupCard({
  f, onComplete, onCancel, onReschedule, onWhatsApp, completing, cancelling,
  callingId, onCallStart, onPostCallOpen,
}: {
  f:              Followup;
  onComplete:     (id: string) => void;
  onCancel:       (id: string) => void;
  onReschedule:   (f: Followup) => void;
  onWhatsApp:     (f: Followup) => void;
  completing:     string | null;
  cancelling:     string | null;
  callingId:      string | null;
  onCallStart:    (id: string, callId?: string | null) => void;
  onPostCallOpen: (f: Followup) => void;
}) {
  const { label, overdue } = formatDate(f.scheduled_at);
  const isPending          = f.status === 'pending';
  const sipActions         = useSipStore(s => s.actions);
  const callStatus         = useSipStore(s => s.callStatus);
  const callTimer          = useSipStore(s => s.callTimer);
  const lastEndCause       = useSipStore(s => s.lastEndCause);
  const isThisCard         = callingId === f.id;

  const endCauseBanner = (isThisCard && lastEndCause) ? (() => {
    const c = lastEndCause.toLowerCase();
    if (c === 'ended')                                return { emoji: '✅', label: 'Call Ended', bg: 'bg-gray-50 border-gray-200',     text: 'text-gray-600'   };
    if (c.includes('no_answer') || c === 'no answer') return { emoji: '὏5', label: 'No Answer',  bg: 'bg-red-50 border-red-200',       text: 'text-red-600'    };
    if (c.includes('busy'))                           return { emoji: '🔴', label: 'Busy',       bg: 'bg-orange-50 border-orange-200', text: 'text-orange-600' };
    if (c.includes('cancel'))                         return { emoji: '↩️', label: 'Cancelled', bg: 'bg-gray-50 border-gray-200',     text: 'text-gray-500'   };
    if (c.includes('reject'))                         return { emoji: '❌', label: 'Rejected',  bg: 'bg-red-50 border-red-200',       text: 'text-red-600'    };
    return { emoji: '❌', label: `Failed (${lastEndCause})`, bg: 'bg-red-50 border-red-200', text: 'text-red-600' };
  })() : null;

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const handleCall = async () => {
    if (!f.customer_phone) return toast.error('No phone number available');
    if (!sipActions)       return toast.error('SoftPhone not connected');
    if (!sipActions.call)  return toast.error('Call action not available');
    let callId: string | null = null;
    try {
      const res = await callsApi.startWebrtcCall({
        customer_phone: f.customer_phone,
        customer_id:    f.customer_id   ?? undefined,
        lead_id:        f.lead          ? String(f.lead) : undefined,
      });
      callId = res.data.call_id;
    } catch {
      // non-blocking — still dial even if DB write fails
    }
    onCallStart(f.id, callId);
    sipActions.call(f.customer_phone);
  };

  const statusBanner = isThisCard ? (() => {
    switch (callStatus) {
      case 'ringing': return { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', emoji: '📞', label: 'Ringing...', showHangup: true };
      case 'active':  return { bg: 'bg-green-50 border-green-200',   text: 'text-green-700',  emoji: '🔴', label: `In Call  ${formatTime(callTimer)}`, showHangup: true };
      case 'holding': return { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   emoji: '⏸',     label: `On Hold  ${formatTime(callTimer)}`, showHangup: true };
      default: return null;
    }
  })() : null;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 transition-all hover:shadow-md ${overdue && isPending ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span>{TYPE_ICON[f.followup_type] ?? TYPE_ICON.other}</span>
          <p className="text-sm font-semibold text-gray-900 truncate">{f.title}</p>
        </div>
        <StatusBadge status={f.status} size="xs" />
      </div>

      {(f.customer_name || f.customer_phone) && (
        <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
            {f.customer_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            {f.customer_name && <p className="text-xs font-semibold text-gray-800 truncate">{f.customer_name}</p>}
            {f.customer_phone && <p className="text-xs text-gray-500 font-mono">{f.customer_phone}</p>}
          </div>
        </div>
      )}

      {statusBanner && (
        <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${statusBanner.bg} ${statusBanner.text}`}>
          <span>{statusBanner.emoji} {statusBanner.label}</span>
          {statusBanner.showHangup && sipActions && (
            <button onClick={() => { sipActions.hangup(); setTimeout(() => onPostCallOpen(f), 1200); }}
              className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white rounded-md px-2 py-0.5 text-xs transition-colors">
              <XCircle size={11} /> Hangup
            </button>
          )}
        </div>
      )}

      {!statusBanner && endCauseBanner && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${endCauseBanner.bg} ${endCauseBanner.text}`}>
          <span>{endCauseBanner.emoji} {endCauseBanner.label}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {f.lead_title && <span className="flex items-center gap-1"><Users size={11} />{f.lead_title}</span>}
        <span className={`flex items-center gap-1 font-medium ${overdue && isPending ? 'text-red-600' : 'text-gray-600'}`}>
          <Calendar size={11} />{label}
        </span>
        {f.assigned_to_name && <span className="flex items-center gap-1">👤 {f.assigned_to_name}</span>}
      </div>

      {f.description && <p className="text-xs text-gray-500 line-clamp-2">{f.description}</p>}

      {isPending && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
          {f.customer_phone && (
            <div className="flex gap-2">
              <button onClick={handleCall}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg py-2 text-xs font-semibold transition-colors">
                <Phone size={13} /> Call Now
              </button>
              <button onClick={() => onWhatsApp(f)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg py-2 text-xs font-semibold transition-colors">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-green-600" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.126 1.526 5.862L.057 23.882l6.186-1.44A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-5.031-1.388l-.36-.214-3.732.869.936-3.423-.235-.372A9.775 9.775 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/>
                </svg>
                WhatsApp
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="success" size="sm" icon={<CheckCircle size={13} />}
                    loading={completing === f.id} onClick={() => onComplete(f.id)} className="flex-1">
              Done
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => onReschedule(f)}>
              Reschedule
            </Button>
            <Button variant="danger" size="sm" icon={<XCircle size={13} />}
                    loading={cancelling === f.id} onClick={() => onCancel(f.id)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Page
export default function FollowupsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [page,         setPage]         = useState(1);
  const [rescheduling, setRescheduling] = useState<Followup | null>(null);
  const [whatsapping,  setWhatsapping]  = useState<Followup | null>(null);
  const [postCall,     setPostCall]     = useState<Followup | null>(null);
  const [completing,   setCompleting]   = useState<string | null>(null);
  const [cancelling,   setCancelling]   = useState<string | null>(null);
  const [callingId,    setCallingId]    = useState<string | null>(null);
  const callingFollowupRef  = useRef<Followup | null>(null);
  const activeCallIdRef     = useRef<string | null>(null);

  const callStatus    = useSipStore(s => s.callStatus);
  const prevStatusRef = useRef<string>('idle');

  // Capture end cause in a ref via the raw CustomEvent — more reliable than store timing
  const endCauseRef = useRef<string>('ended');
  useEffect(() => {
    const handler = (e: Event) => {
      endCauseRef.current = (e as CustomEvent<string>).detail ?? 'ended';
    };
    window.addEventListener('sip:endcause', handler);
    return () => window.removeEventListener('sip:endcause', handler);
  }, []);

  if (prevStatusRef.current !== 'idle' && callStatus === 'idle') {
    const f      = callingFollowupRef.current;
    const callId = activeCallIdRef.current;
    const cause  = endCauseRef.current ?? 'ended';
    if (callId) {
      callsApi.endWebrtcCall(callId, { end_cause: cause }).catch(() => {});
      activeCallIdRef.current = null;
    }
    endCauseRef.current = 'ended'; // reset for next call
    if (f) {
      setTimeout(() => {
        setPostCall(f);
        setCallingId(null);
        callingFollowupRef.current = null;
      }, 800);
    }
  }
  prevStatusRef.current = callStatus;

  const handleCallStart = (id: string, callId?: string | null) => {
    setCallingId(id);
    activeCallIdRef.current = callId ?? null;
    const f = results.find(x => x.id === id) ?? null;
    callingFollowupRef.current = f;
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['followups', statusFilter, typeFilter, page],
    queryFn:  () => followupsApi.list({
      status:        statusFilter || undefined,
      followup_type: typeFilter   || undefined,
      page,
      page_size: 20,
    }).then(r => r.data),
    placeholderData: (prev: any) => prev,
    refetchInterval: 15_000,
  });

  const { data: overdueData } = useQuery({
    queryKey: ['followups-overdue'],
    queryFn:  () => followupsApi.overdue().then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: upcomingData } = useQuery({
    queryKey: ['followups-upcoming'],
    queryFn:  () => followupsApi.upcoming().then(r => r.data),
    refetchInterval: 60_000,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => { setCompleting(id); return followupsApi.complete(id); },
    onSuccess:  () => {
      toast.success('Completed ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
    },
    onError:    () => toast.error('Failed to complete'),
    onSettled:  () => setCompleting(null),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => { setCancelling(id); return followupsApi.cancel(id); },
    onSuccess:  () => {
      toast.success('Cancelled');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
    },
    onError:    () => toast.error('Failed to cancel'),
    onSettled:  () => setCancelling(null),
  });

  const results    = data?.results ?? [];
  const totalCount = data?.count   ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  const stats = [
    { label: 'Pending',   value: totalCount,                color: 'yellow', emoji: '🟡' },
    { label: 'Overdue',   value: overdueData?.length  ?? 0, color: 'red',    emoji: '🔴' },
    { label: 'Due Today', value: upcomingData?.length ?? 0, color: 'blue',   emoji: '🔔' },
    { label: 'This Page', value: results.length,            color: 'gray',   emoji: '📋' },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${totalCount} total`}
        actions={isFetching && !isLoading ? <RefreshCw size={14} className="animate-spin text-gray-400" /> : undefined}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className={`bg-${s.color}-50 border border-${s.color}-100 rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold text-${s.color}-700`}>{s.value}</p>
            <p className={`text-xs text-${s.color}-600 mt-0.5`}>{s.emoji} {s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <Select
          options={[
            { value: '',            label: 'All Statuses'   },
            { value: 'pending',     label: '🟡 Pending'     },
            { value: 'completed',   label: '✅ Completed'   },
            { value: 'cancelled',   label: '❌ Cancelled'   },
            { value: 'rescheduled', label: '🔄 Rescheduled' },
          ]}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-44"
        />
        <Select
          options={[
            { value: '',        label: 'All Types'  },
            { value: 'call',    label: '📞 Call'    },
            { value: 'email',   label: '✉️ Email'   },
            { value: 'meeting', label: '🤝 Meeting' },
            { value: 'sms',     label: '💬 SMS'     },
            { value: 'other',   label: '📌 Other'   },
          ]}
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse h-48" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-lg font-medium text-gray-500">No follow-ups found</p>
          <p className="text-sm mt-1">{statusFilter === 'pending' ? 'Great! No pending follow-ups.' : 'Try changing the filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(f => (
            <FollowupCard
              key={f.id} f={f}
              completing={completing} cancelling={cancelling}
              callingId={callingId}
              onCallStart={(id, callId) => handleCallStart(id, callId)}
              onPostCallOpen={fu => setPostCall(fu)}
              onComplete={id  => completeMutation.mutate(id)}
              onCancel={id    => cancelMutation.mutate(id)}
              onReschedule={fu => setRescheduling(fu)}
              onWhatsApp={fu   => setWhatsapping(fu)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages} ({totalCount} total)</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {rescheduling && <RescheduleModal followup={rescheduling} onClose={() => setRescheduling(null)} />}
      {whatsapping  && <WhatsAppModal   followup={whatsapping}  onClose={() => setWhatsapping(null)}  />}
      {postCall     && <PostCallModal   followup={postCall}     onClose={() => setPostCall(null)}     />}
    </div>
  );
}
