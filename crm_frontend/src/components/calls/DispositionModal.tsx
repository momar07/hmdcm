'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Phone, User, FileText, Calendar, CheckCircle } from 'lucide-react';
import { callsApi } from '@/lib/api/calls';
import { useCallStore } from '@/store';
import { useSipStore } from '@/store/sipStore';
import toast from 'react-hot-toast';
import type { Disposition } from '@/types';

interface DispositionModalProps {
  callId:       string;
  callerNumber: string;
  customerName?: string | null;
  customerId?:  string | null;
  onClose:      () => void;
}

const NEXT_ACTIONS = [
  { value: 'no_action',       label: 'No Action',        color: 'bg-gray-100 text-gray-700' },
  { value: 'callback',        label: 'Schedule Callback', color: 'bg-blue-100 text-blue-700' },
  { value: 'followup_later',  label: 'Follow Up Later',   color: 'bg-yellow-100 text-yellow-700' },
  { value: 'send_quotation',  label: 'Send Quotation',    color: 'bg-purple-100 text-purple-700' },
  { value: 'close_lead',      label: 'Close Lead',        color: 'bg-green-100 text-green-700' },
];

export function DispositionModal({
  callId, callerNumber, customerName, customerId, onClose,
}: DispositionModalProps) {

  const [selectedDisp,   setSelectedDisp]   = useState('');
  const [note,           setNote]           = useState('');
  const [nextAction,     setNextAction]     = useState('no_action');
  const [followupDate,   setFollowupDate]   = useState('');
  const [requireFollowup, setRequireFollowup] = useState(false);

  // Load dispositions
  const { data: dispositions = [] } = useQuery<Disposition[]>({
    queryKey: ['dispositions'],
    queryFn:  () => callsApi.dispositionsList().then(r => r.data),
  });

  // When disposition changes — check if followup is required
  useEffect(() => {
    const d = dispositions.find(d => d.id === selectedDisp);
    if (d) setRequireFollowup(d.requires_followup ?? false);
  }, [selectedDisp, dispositions]);

  // Submit mutation
  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => callsApi.complete(callId, {
      disposition_id:   selectedDisp,
      note,
      next_action:      nextAction as any,
      followup_required: requireFollowup,
      followup_due_at:  followupDate || undefined,
    }),
    onSuccess: () => {
      toast.success('Call completed successfully ✅');
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Failed to save disposition';
      toast.error(msg);
    },
  });

  const canSubmit = selectedDisp && note.length >= 10 && nextAction &&
                    (!requireFollowup || followupDate);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
           onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md
                        max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4
                          border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                <Phone size={16} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Call Disposition</h3>
                <p className="text-xs text-gray-400">{callerNumber}</p>
              </div>
            </div>
            <button onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-5">

            {/* Customer info */}
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
                  <button
                    key={d.id}
                    onClick={() => setSelectedDisp(d.id)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium
                                border-2 transition-all text-left
                                ${selectedDisp === d.id
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: d.color || '#6b7280' }} />
                    {d.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
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
                placeholder="Add call notes here..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5
                           text-sm resize-none focus:outline-none focus:ring-2
                           focus:ring-blue-300 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">{note.length} / 10 min chars</p>
            </div>

            {/* Next Action */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Next Action <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {NEXT_ACTIONS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setNextAction(a.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium
                                border-2 transition-all
                                ${nextAction === a.value
                                  ? 'border-blue-500 ' + a.color
                                  : 'border-transparent ' + a.color
                                }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Follow-up date — shown if required */}
            {(requireFollowup || nextAction === 'callback' || nextAction === 'followup_later') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Follow-up Date {requireFollowup && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="datetime-local"
                  value={followupDate}
                  onChange={e => setFollowupDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5
                             text-sm focus:outline-none focus:ring-2
                             focus:ring-blue-300 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200
                         text-sm font-medium text-gray-600 hover:bg-gray-50
                         transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={() => canSubmit && submit()}
              disabled={!canSubmit || isPending}
              className="flex-1 flex items-center justify-center gap-2
                         py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700
                         disabled:bg-gray-200 disabled:text-gray-400
                         text-white text-sm font-semibold transition-colors"
            >
              <CheckCircle size={15} />
              {isPending ? 'Saving...' : 'Save & Close'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
