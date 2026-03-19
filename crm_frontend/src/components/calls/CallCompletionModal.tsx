'use client';

import { useState, useEffect }   from 'react';
import { useMutation, useQuery }  from '@tanstack/react-query';
import toast                      from 'react-hot-toast';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { Modal }    from '@/components/ui/Modal';
import { Button }   from '@/components/ui/Button';
import { Input }    from '@/components/ui/Input';
import { Select }   from '@/components/ui/Select';
import { callsApi, CallCompletionPayload } from '@/lib/api/calls';
import { usersApi } from '@/lib/api/users';

interface Props {
  callId:    string;
  callInfo?: { caller?: string; callee?: string; duration?: number };
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

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

export function CallCompletionModal({ callId, callInfo, open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<CallCompletionPayload>({
    disposition_id:        '',
    note:                  '',
    next_action:           'no_action',
    update_lead_stage:     false,
    new_lead_stage_id:     '',
    won_amount:            null,
    lost_reason:           '',
    followup_required:     false,
    followup_due_at:       '',
    followup_type:         'call',
    followup_assigned_to:  '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: dispositions } = useQuery({
    queryKey: ['dispositions-list'],
    queryFn:  () => callsApi.dispositionsList().then((r) => r.data),
    enabled:  open,
  });

  const { data: stagesData } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => callsApi.leadStages().then((r) => r.data),
    enabled:  open,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-list'],
    queryFn:  () => usersApi.list({ role: 'agent', page_size: 100 }).then((r) => r.data),
    enabled:  open && form.followup_required,
  });

  const selectedDisposition = (dispositions as any[])?.find(
    (d) => d.id === form.disposition_id
  );

  useEffect(() => {
    if (selectedDisposition) {
      setForm((f) => ({
        ...f,
        followup_required: selectedDisposition.requires_followup,
        next_action:       selectedDisposition.default_next_action || 'no_action',
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDisposition?.id]);

  const stageItems: any[] = stagesData?.results ?? stagesData ?? [];
  const stageOptions = [
    { value: '', label: '— No stage change —' },
    ...stageItems.map((s) => ({ value: s.id, label: s.name })),
  ];

  const selectedStage = stageItems.find((s) => s.id === form.new_lead_stage_id);
  const isWon  = selectedStage?.is_won ?? false;
  const isLost = selectedStage?.is_closed && !selectedStage?.is_won;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.disposition_id)
      e.disposition_id = 'Disposition is required';
    if (!form.note || form.note.trim().length < 10)
      e.note = 'Note must be at least 10 characters';
    if (!form.next_action)
      e.next_action = 'Next action is required';
    if (form.followup_required) {
      if (!form.followup_due_at || !form.followup_due_at.includes('T') || form.followup_due_at.endsWith('T')) {
        e.followup_due_at = 'Please select a complete date and time';
      }
    }
    if (form.update_lead_stage && isWon && !form.won_amount)
      e.won_amount = 'Won amount is required';
    if (form.update_lead_stage && isLost && !form.lost_reason)
      e.lost_reason = 'Lost reason is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const { mutate, isPending: isLoading } = useMutation({
    mutationFn: () => callsApi.complete(callId, {
      ...form,
      won_amount:        form.won_amount || null,
      new_lead_stage_id: form.update_lead_stage ? form.new_lead_stage_id : undefined,
    }),
    onSuccess: () => {
      toast.success('Call completed successfully ✅');
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error
               || err?.response?.data?.detail
               || 'Failed to complete call';
      toast.error(msg);
    },
  });

  const handleSubmit = () => { if (validate()) mutate(); };
  const set = (key: keyof CallCompletionPayload, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <Modal open={open} onClose={onClose} title="Complete Call" size="lg">
      <div className="space-y-5">

        {callInfo && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 flex gap-4 flex-wrap">
            {callInfo.caller   && <span>📞 From: <strong>{callInfo.caller}</strong></span>}
            {callInfo.callee   && <span>→ To: <strong>{callInfo.callee}</strong></span>}
            {callInfo.duration && (
              <span>⏱ {Math.floor(callInfo.duration / 60)}m {callInfo.duration % 60}s</span>
            )}
          </div>
        )}

        <div>
          <Select
            label="Disposition *"
            value={form.disposition_id}
            onChange={(e) => set('disposition_id', e.target.value)}
            options={[
              { value: '', label: '— Select disposition —' },
              ...((dispositions as any[]) ?? []).map((d) => ({ value: d.id, label: d.name })),
            ]}
            error={errors.disposition_id}
          />
          {selectedDisposition && (
            <p className="mt-1 text-xs text-gray-400">
              {selectedDisposition.requires_followup
                ? '⚠️ This disposition requires a follow-up'
                : '✅ No follow-up required'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note * <span className="text-gray-400 font-normal">(min 10 chars)</span>
          </label>
          <textarea
            className={`w-full rounded-lg border px-3 py-2 text-sm resize-none
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${errors.note ? 'border-red-400' : 'border-gray-300'}`}
            rows={3}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Describe what happened in this call..."
          />
          <div className="flex justify-between mt-0.5">
            {errors.note
              ? <p className="text-xs text-red-500">{errors.note}</p>
              : <span />}
            <p className={`text-xs ${form.note.length < 10 ? 'text-red-400' : 'text-gray-400'}`}>
              {form.note.length} / 10 min
            </p>
          </div>
        </div>

        <Select
          label="Next Action *"
          value={form.next_action}
          onChange={(e) => set('next_action', e.target.value as CallCompletionPayload['next_action'])}
          options={NEXT_ACTIONS}
          error={errors.next_action}
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox" id="update_stage"
            checked={form.update_lead_stage}
            onChange={(e) => set('update_lead_stage', e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="update_stage" className="text-sm text-gray-700">
            Update lead stage
          </label>
        </div>

        {form.update_lead_stage && (
          <div className="pl-6 space-y-3 border-l-2 border-blue-100">
            <Select
              label="New Stage"
              value={form.new_lead_stage_id ?? ''}
              onChange={(e) => set('new_lead_stage_id', e.target.value)}
              options={stageOptions}
            />
            {isWon && (
              <Input
                label="Won Amount *"
                type="number"
                placeholder="0.00"
                value={form.won_amount?.toString() ?? ''}
                onChange={(e) => set('won_amount', parseFloat(e.target.value) || null)}
                error={errors.won_amount}
              />
            )}
            {isLost && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lost Reason *
                </label>
                <textarea
                  className={`w-full rounded-lg border px-3 py-2 text-sm resize-none
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${errors.lost_reason ? 'border-red-400' : 'border-gray-300'}`}
                  rows={2}
                  value={form.lost_reason}
                  onChange={(e) => set('lost_reason', e.target.value)}
                  placeholder="Why was this lead lost?"
                />
                {errors.lost_reason && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.lost_reason}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="checkbox" id="followup_required"
            checked={form.followup_required}
            onChange={(e) => set('followup_required', e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="followup_required" className="text-sm text-gray-700">
            Schedule a follow-up
          </label>
        </div>

        {form.followup_required && (
          <div className="pl-6 space-y-3 border-l-2 border-green-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date & Time *
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.followup_due_at ? 'border-red-400' : 'border-gray-300'}`}
                  value={form.followup_due_at ? form.followup_due_at.split('T')[0] : ''}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    const date = e.target.value;
                    const time = form.followup_due_at?.split('T')[1] || '09:00';
                    set('followup_due_at', date ? `${date}T${time}` : '');
                  }}
                />
                <input
                  type="time"
                  className={`w-32 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.followup_due_at ? 'border-red-400' : 'border-gray-300'}`}
                  value={form.followup_due_at ? form.followup_due_at.split('T')[1]?.slice(0,5) || '09:00' : '09:00'}
                  onChange={(e) => {
                    const time = e.target.value;
                    const date = form.followup_due_at?.split('T')[0] || new Date().toISOString().split('T')[0];
                    set('followup_due_at', `${date}T${time}`);
                  }}
                />
              </div>
              {errors.followup_due_at && (
                <p className="text-xs text-red-500 mt-1">{errors.followup_due_at}</p>
              )}
            </div>
            <Select
              label="Follow-up Type"
              value={form.followup_type ?? 'call'}
              onChange={(e) => set('followup_type', e.target.value)}
              options={FOLLOWUP_TYPES}
            />
            <Select
              label="Assign To"
              value={form.followup_assigned_to ?? ''}
              onChange={(e) => set('followup_assigned_to', e.target.value)}
              options={[
                { value: '', label: '— Same agent —' },
                ...((agentsData?.results as any[]) ?? []).map((u) => ({
                  value: u.id,
                  label: u.full_name || u.email,
                })),
              ]}
            />
          </div>
        )}

        {Object.keys(errors).length > 0 && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
            <AlertCircle size={16} />
            <span>Please fix the errors above before submitting.</span>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle size={16} />}
            loading={isLoading}
            onClick={handleSubmit}
          >
            Complete Call
          </Button>
        </div>
      </div>
    </Modal>
  );
}
