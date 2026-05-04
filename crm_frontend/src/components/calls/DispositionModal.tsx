'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Phone, User, FileText, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { callsApi, type CallCompletionPayload } from '@/lib/api/calls';
import { dispositionsApi, type Disposition, type ActionType } from '@/lib/api/dispositions';
import { usersApi } from '@/lib/api/users';
import { leadsApi } from '@/lib/api/leads';
import toast from 'react-hot-toast';

interface DispositionModalProps {
  callId:         string;
  callerNumber:   string;
  leadName?:      string | null;
  leadId?:        string | null;
  callDirection?: 'inbound' | 'outbound';
  onClose:        () => void;
}

const isManual = (callId: string) => callId === '__manual__';

const ACTION_ICONS: Record<ActionType, string> = {
  no_action:         '⊘',
  create_followup:   '📅',
  create_lead:       '🔗',
  create_ticket:     '🎫',
  change_lead_stage: '📌',
  mark_won:          '🏆',
  escalate:          '🚨',
};

const ACTION_LABELS: Record<ActionType, string> = {
  no_action:         'No Action',
  create_followup:   'Creates Follow-up',
  create_lead:       'Creates Lead',
  create_ticket:     'Creates Ticket',
  change_lead_stage: 'Changes Lead Stage',
  mark_won:          'Marks Lead as Won',
  escalate:          'Escalates to Supervisor',
};

const NEXT_ACTIONS = [
  { value: 'callback',        label: '📞 Schedule Callback' },
  { value: 'send_quotation',  label: '📄 Send Quotation'    },
  { value: 'followup_later',  label: '🔔 Follow-up Later'   },
  { value: 'close_lead',      label: '✅ Close Lead'         },
  { value: 'no_action',       label: '—  No Action'          },
];

const FOLLOWUP_TYPES = [
  { value: 'call',     label: '📞 Call'     },
  { value: 'email',    label: '✉️ Email'    },
  { value: 'meeting',  label: '🤝 Meeting'  },
  { value: 'whatsapp', label: '💬 WhatsApp' },
];

export function DispositionModal({
  callId, callerNumber, leadName, leadId, callDirection, onClose,
}: DispositionModalProps) {
  if (isManual(callId)) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <Phone size={16} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Call Ended</h3>
                  <p className="text-xs text-gray-400">Disposition not available</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-6 text-center space-y-3">
              <p className="text-sm text-gray-600">
                The call was logged, but the disposition form couldn&apos;t be loaded automatically.
              </p>
              <p className="text-xs text-gray-400">
                You can complete this call later from the Call History.
              </p>
            </div>
            <div className="px-6 pb-6">
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700
                           text-white text-sm font-semibold transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const qc = useQueryClient();
  const [selectedDisp, setSelectedDisp] = useState('');
  const [note,         setNote]         = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [nextAction,   setNextAction]   = useState<CallCompletionPayload['next_action']>('no_action');
  const [updateStage,  setUpdateStage]  = useState(false);
  const [newStageId,   setNewStageId]   = useState('');
  const [wonAmount,    setWonAmount]    = useState('');
  const [lostReason,   setLostReason]   = useState('');
  const [followupReq,  setFollowupReq]  = useState(false);
  const [followupType, setFollowupType] = useState('call');
  const [followupAssignee, setFollowupAssignee] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: dispositions = [] } = useQuery<Disposition[]>({
    queryKey: ['dispositions-full', callDirection],
    queryFn:  async () => {
      const r = await dispositionsApi.list();
      const d = (r as any).data ?? r;
      const all: Disposition[] = Array.isArray(d) ? d : (d?.results ?? []);
      if (callDirection) {
        return all.filter(
          disp => disp.direction === 'both' || disp.direction === callDirection
        );
      }
      return all;
    },
  });

  const { data: stagesData } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages(),
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-list'],
    queryFn:  () => usersApi.list({ role: 'agent', page_size: 100 }),
    enabled:  followupReq,
  });

  const selected = dispositions.find(d => d.id === selectedDisp);
  const actions  = selected?.actions ?? [];

  const autoFollowup = actions.some(a => a.action_type === 'create_followup');
  const needsNote    = selected?.requires_note ?? true;
  const needsAutoFollowupDate = autoFollowup;

  const stageItems: any[] = (stagesData as any)?.data ?? (stagesData as any)?.results ?? stagesData ?? [];
  const selectedStage = stageItems.find((s: any) => s.id === newStageId);
  const isWon  = selectedStage?.is_won ?? false;
  const isLost = selectedStage?.is_closed && !selectedStage?.is_won;

  const canSubmit = selectedDisp &&
    (!needsNote || note.length >= 10) &&
    (!needsAutoFollowupDate || followupDate);

  useEffect(() => {
    if (selectedDisp) {
      setErrors({});
    }
  }, [selectedDisp]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!selectedDisp) e.disposition = 'Disposition is required';
    if (needsNote && note.trim().length < 10) e.note = 'Note must be at least 10 characters';
    if (needsAutoFollowupDate && !followupDate) e.followupDate = 'Follow-up date is required';
    if (updateStage && isWon && !wonAmount) e.wonAmount = 'Won amount is required';
    if (updateStage && isLost && !lostReason.trim()) e.lostReason = 'Lost reason is required';
    if (followupReq && !followupDate) e.followupDate = 'Follow-up date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      const fDate = followupDate
        ? (followupDate.length === 16 ? followupDate + ':00' : followupDate)
        : undefined;
      return callsApi.complete(callId, {
        disposition_id:      selectedDisp,
        note:                note.trim() || 'No additional notes',
        next_action:         nextAction,
        followup_due_at:     fDate,
        update_lead_stage:   updateStage,
        new_lead_stage_id:   updateStage ? newStageId || undefined : undefined,
        won_amount:          updateStage && isWon && wonAmount ? parseFloat(wonAmount) : null,
        lost_reason:         updateStage && isLost ? lostReason.trim() : undefined,
        followup_required:   followupReq || autoFollowup,
        followup_type:       followupType,
        followup_assigned_to: followupAssignee || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Call completed ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      qc.invalidateQueries({ queryKey: ['lead-calls'] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ||
                  err?.response?.data?.non_field_errors?.[0] ||
                  'Failed to save disposition';
      toast.error(msg);
    },
  });

  const handleSubmit = () => {
    if (validate()) submit();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                <Phone size={16} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Call Disposition</h3>
                <p className="text-xs text-gray-400">{callerNumber}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-5">

            {/* Lead */}
            {leadName && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                <User size={15} className="text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-blue-800">{leadName}</span>
              </div>
            )}

            {/* Disposition selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Disposition <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {dispositions.map(d => (
                  <button key={d.id} onClick={() => setSelectedDisp(d.id)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all text-left
                      ${selectedDisp === d.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                    <span className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: d.color || '#6b7280' }} />
                    {d.name}
                  </button>
                ))}
              </div>
              {errors.disposition && <p className="text-xs text-red-500 mt-1">{errors.disposition}</p>}
            </div>

            {/* Actions preview */}
            {selected && actions.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-800 mb-2">⚡ Automatic Actions:</p>
                {actions.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-amber-700">
                    <span>{ACTION_ICONS[a.action_type]}</span>
                    <span>{ACTION_LABELS[a.action_type]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Note */}
            {needsNote && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText size={14} className="inline mr-1" />
                  Note <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(min 10 chars)</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Add call notes..."
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent
                    ${errors.note ? 'border-red-400' : 'border-gray-200'}`}
                />
                <div className="flex justify-between mt-1">
                  {errors.note ? <p className="text-xs text-red-500">{errors.note}</p> : <span />}
                  <p className={`text-xs ${note.length < 10 ? 'text-red-400' : 'text-gray-400'}`}>{note.length} / 10 min</p>
                </div>
              </div>
            )}

            {/* Next Action */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Next Action</label>
              <select
                value={nextAction}
                onChange={e => setNextAction(e.target.value as CallCompletionPayload['next_action'])}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {NEXT_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {/* Update lead stage */}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="update_stage" checked={updateStage}
                onChange={e => setUpdateStage(e.target.checked)}
                className="rounded border-gray-300 text-blue-600" />
              <label htmlFor="update_stage" className="text-sm text-gray-700">Update lead stage</label>
            </div>

            {updateStage && (
              <div className="pl-6 space-y-3 border-l-2 border-blue-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Stage</label>
                  <select value={newStageId} onChange={e => setNewStageId(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Select stage —</option>
                    {stageItems.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {isWon && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Won Amount <span className="text-red-500">*</span>
                    </label>
                    <input type="number" value={wonAmount} onChange={e => setWonAmount(e.target.value)}
                      placeholder="0.00"
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${errors.wonAmount ? 'border-red-400' : 'border-gray-200'}`} />
                    {errors.wonAmount && <p className="text-xs text-red-500 mt-1">{errors.wonAmount}</p>}
                  </div>
                )}
                {isLost && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lost Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea value={lostReason} onChange={e => setLostReason(e.target.value)}
                      rows={2} placeholder="Why was this lead lost?"
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${errors.lostReason ? 'border-red-400' : 'border-gray-200'}`} />
                    {errors.lostReason && <p className="text-xs text-red-500 mt-1">{errors.lostReason}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Schedule follow-up */}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="followup_req" checked={followupReq}
                onChange={e => setFollowupReq(e.target.checked)}
                className="rounded border-gray-300 text-blue-600" />
              <label htmlFor="followup_req" className="text-sm text-gray-700">Schedule a follow-up</label>
            </div>

            {(followupReq || needsAutoFollowupDate) && (
              <div className={`pl-6 space-y-3 ${followupReq ? 'border-l-2 border-green-100' : ''}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input type="datetime-local" value={followupDate}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => setFollowupDate(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${errors.followupDate ? 'border-red-400' : 'border-gray-200'}`} />
                  {errors.followupDate && <p className="text-xs text-red-500 mt-1">{errors.followupDate}</p>}
                  {followupDate && !errors.followupDate && (
                    <p className="text-xs text-blue-600 mt-1">
                      📅 {new Date(followupDate).toLocaleString('en-GB', {
                        weekday: 'short', day: '2-digit', month: 'short',
                        year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                {followupReq && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Type</label>
                      <select value={followupType} onChange={e => setFollowupType(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {FOLLOWUP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                      <select value={followupAssignee} onChange={e => setFollowupAssignee(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— Same agent —</option>
                        {((agentsData as any)?.results ?? []).map((u: any) => (
                          <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {Object.keys(errors).length > 0 && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
                <AlertCircle size={16} />
                <span>Please fix the errors above before submitting.</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200
                         text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Skip for now
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400
                         text-white text-sm font-semibold transition-colors">
              <CheckCircle size={15} />
              {isPending ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
