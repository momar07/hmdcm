'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, CreateTaskData } from '@/lib/api/tasks';
import { Task, TaskPriority } from '@/types';
import toast from 'react-hot-toast';
import api from '@/lib/api/axios';

interface TaskModalProps {
  open:        boolean;
  onClose:     () => void;
  task?:       Task | null;
  customerId?: string | null;
  leadId?:     string | null;
  ticketId?:   string | null;
  callId?:     string | null;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low',    label: '🟢 Low'    },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'high',   label: '🟠 High'   },
  { value: 'urgent', label: '🔴 Urgent' },
];

const ACTION_TYPES = [
  { value: 'call_lead',  label: '📞 Call Lead'  },
  { value: 'send_email', label: '📧 Send Email' },
  { value: 'follow_up',  label: '🔔 Follow Up'  },
  { value: 'send_offer', label: '📄 Send Offer' },
  { value: 'other',      label: '📌 Other'      },
];

export default function TaskModal({
  open, onClose, task,
  customerId, leadId, ticketId, callId,
}: TaskModalProps) {
  const qc       = useQueryClient();
  const editMode = !!task;

  const [form, setForm] = useState({
    title:       '',
    description: '',
    priority:    'medium' as TaskPriority,
    action_type: 'other',
    assigned_to: '',
    due_date:    '',
    reminder_at: '',
    lead:        leadId   ?? '',
    customer:    customerId ?? '',
  });

  useEffect(() => {
    if (task) {
      setForm({
        title:       task.title,
        description: task.description,
        priority:    task.priority,
        action_type: (task as any).action_type ?? 'other',
        assigned_to: task.assigned_to,
        due_date:    task.due_date
                       ? new Date(task.due_date).toISOString().slice(0, 16)
                       : '',
        reminder_at: (task as any).reminder_at
                       ? new Date((task as any).reminder_at).toISOString().slice(0, 16)
                       : '',
        lead:        task.lead    ?? '',
        customer:    task.customer ?? '',
      });
    } else {
      setForm({
        title: '', description: '', priority: 'medium', action_type: 'other',
        assigned_to: '', due_date: '', reminder_at: '',
        lead: leadId ?? '', customer: customerId ?? '',
      });
    }
  }, [task, open, leadId, customerId]);

  // Agents list
  const { data: agents = [] } = useQuery({
    queryKey: ['agents-list'],
    queryFn:  () => api.get('/users/?role=agent&page_size=100').then((r: any) => r.data?.results ?? r.data),
    enabled:  open,
    staleTime: 60_000,
  });

  // Leads list (for linking)
  const { data: leadsData } = useQuery({
    queryKey: ['leads-simple', form.customer],
    queryFn:  () => api.get('/leads/', {
      params: { customer: form.customer || undefined, page_size: 50 }
    }).then((r: any) => r.data?.results ?? r.data),
    enabled:  open,
    staleTime: 30_000,
  });
  const leads = leadsData ?? [];

  const mutation = useMutation({
    mutationFn: (data: CreateTaskData) =>
      editMode ? tasksApi.update(task!.id, data) : tasksApi.create(data),
    onSuccess: () => {
      toast.success(editMode ? 'Task updated ✅' : 'Task created ✅');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-stats'] });
      qc.invalidateQueries({ queryKey: ['customer-tasks'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to save task');
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.assigned_to)  return toast.error('Please assign to an agent');

    mutation.mutate({
      title:       form.title.trim(),
      description: form.description.trim(),
      priority:    form.priority,
      action_type: form.action_type,
      assigned_to: form.assigned_to,
      due_date:    form.due_date    || null,
      reminder_at: form.reminder_at || null,
      customer:    form.customer    || customerId || null,
      lead:        form.lead        || leadId     || null,
      ticket:      ticketId ?? null,
      call:        callId   ?? null,
    } as any);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {editMode ? '✏️ Edit Task' : '📝 New Task'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Call customer to confirm quotation"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ACTION_TYPES.map(a => (
                <button
                  key={a.value}
                  onClick={() => setForm(f => ({ ...f, action_type: a.value }))}
                  className={`text-xs px-2 py-2 rounded-lg border font-medium transition-all ${
                    form.action_type === a.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Additional details..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Assign To + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              >
                <option value="">Select agent...</option>
                {agents.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Link to Lead */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">🎯 Link to Lead (optional)</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.lead}
              onChange={e => setForm(f => ({ ...f, lead: e.target.value }))}
            >
              <option value="">No lead linked</option>
              {leads.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.title ?? l.id}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date + Reminder */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">📅 Due Date</label>
              <input
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🔔 Reminder At</label>
              <input
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.reminder_at}
                onChange={e => setForm(f => ({ ...f, reminder_at: e.target.value }))}
              />
            </div>
          </div>

          {/* Linked badges */}
          {(customerId || ticketId || callId) && (
            <div className="flex flex-wrap gap-2">
              {customerId && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">📋 Customer linked</span>}
              {ticketId   && <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1">🎫 Ticket linked</span>}
              {callId     && <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">📞 Call linked</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : editMode ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
