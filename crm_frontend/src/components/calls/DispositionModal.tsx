'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Phone, User, FileText, Calendar, CheckCircle } from 'lucide-react';
import { callsApi } from '@/lib/api/calls';
import { dispositionsApi, type Disposition, type ActionType } from '@/lib/api/dispositions';
import toast from 'react-hot-toast';

interface DispositionModalProps {
  callId:         string;
  callerNumber:   string;
  customerName?:  string | null;
  customerId?:    string | null;
  leadId?:        string | null;
  callDirection?: 'inbound' | 'outbound';
  onClose:        () => void;
}

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

export function DispositionModal({
  callId, callerNumber, customerName, customerId, leadId, callDirection, onClose,
}: DispositionModalProps) {
  const qc = useQueryClient();
  const [selectedDisp, setSelectedDisp] = useState('');
  const [note,         setNote]         = useState('');
  const [followupDate, setFollowupDate] = useState('');

  // جيب الـ dispositions الجديدة مع الـ actions
  const { data: dispositions = [] } = useQuery<Disposition[]>({
    queryKey: ['dispositions-full', callDirection],
    queryFn:  async () => {
      const r = await dispositionsApi.list();
      const d = (r as any).data ?? r;
      const all: Disposition[] = Array.isArray(d) ? d : (d?.results ?? []);
      // Filter by call direction — show 'both' always, plus direction-specific
      if (callDirection) {
        return all.filter(
          disp => disp.direction === 'both' || disp.direction === callDirection
        );
      }
      return all;
    },
  });

  const selected = dispositions.find(d => d.id === selectedDisp);
  const actions  = selected?.actions ?? [];

  const needsFollowup = actions.some(a => a.action_type === 'create_followup');
  const needsNote     = selected?.requires_note ?? true;

  const canSubmit = selectedDisp &&
    (!needsNote || note.length >= 10) &&
    (!needsFollowup || followupDate);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      const fDate = followupDate
        ? (followupDate.length === 16 ? followupDate + ':00' : followupDate)
        : undefined;
      return callsApi.complete(callId, {
        disposition_id:  selectedDisp,
        note:            note.trim() || 'No additional notes',
        next_action:     'no_action',
        followup_due_at: fDate,
      });
    },
    onSuccess: () => {
      toast.success('Call completed ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customer-history'] });
      qc.invalidateQueries({ queryKey: ['customer-calls'] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ||
                  err?.response?.data?.non_field_errors?.[0] ||
                  'Failed to save disposition';
      toast.error(msg);
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

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

            {/* Customer */}
            {customerName && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                <User size={15} className="text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-blue-800">{customerName}</span>
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5
                             text-sm resize-none focus:outline-none focus:ring-2
                             focus:ring-blue-300 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{note.length} / 10 min</p>
              </div>
            )}

            {/* Follow-up date — فقط لو action = create_followup */}
            {needsFollowup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Follow-up Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={followupDate}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => setFollowupDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5
                             text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {followupDate && (
                  <p className="text-xs text-blue-600 mt-1">
                    📅 {new Date(followupDate).toLocaleString('en-GB', {
                      weekday: 'short', day: '2-digit', month: 'short',
                      year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
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
              onClick={() => canSubmit && submit()}
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
