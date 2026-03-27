'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api/tasks';
import { Task, TaskStatus, TaskPriority } from '@/types';
import toast from 'react-hot-toast';
import { useState } from 'react';
import TaskModal from '@/components/tasks/TaskModal';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low:    'text-green-700 bg-green-50 border-green-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  high:   'text-orange-700 bg-orange-50 border-orange-200',
  urgent: 'text-red-700 bg-red-50 border-red-200',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending:     'text-gray-700 bg-gray-100',
  in_progress: 'text-blue-700 bg-blue-100',
  completed:   'text-green-700 bg-green-100',
  cancelled:   'text-red-700 bg-red-100',
};

const ACTION_LABELS: Record<string, string> = {
  call_lead:  '📞 Call Lead',
  send_email: '📧 Send Email',
  follow_up:  '🔔 Follow Up',
  send_offer: '📄 Send Offer',
  other:      '📌 Other',
};

export default function TaskDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const qc       = useQueryClient();

  const [editOpen,  setEditOpen]  = useState(false);
  const [comment,   setComment]   = useState('');
  const [showDone,  setShowDone]  = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn:  () => tasksApi.get(id),
    enabled:  !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => tasksApi.start(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['task', id] }); toast.success('Task started'); },
    onError:    () => toast.error('Failed to start task'),
  });

  const completeMutation = useMutation({
    mutationFn: () => tasksApi.complete(id, comment),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['task', id] }); toast.success('Task completed ✅'); setShowDone(false); },
    onError:    () => toast.error('Failed to complete task'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => tasksApi.cancel(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['task', id] }); toast.success('Task cancelled'); },
    onError:    () => toast.error('Failed to cancel task'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  );
  if (!task) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Task not found</div>
  );

  const isClosed = task.status === 'completed' || task.status === 'cancelled';

  return (
    <div className="p-6 max-w-3xl mx-auto">

      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5"
      >
        ← Back to Tasks
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[task.priority as TaskPriority]}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status as TaskStatus]}`}>
                {task.status.replace('_', ' ')}
              </span>
              {task.is_overdue && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-600">⚠ Overdue</span>
              )}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {ACTION_LABELS[task.action_type] ?? task.action_type}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-800">{task.title}</h1>
            {task.description && <p className="text-sm text-gray-500 mt-2">{task.description}</p>}
          </div>

          {!isClosed && (
            <div className="flex flex-col gap-2 shrink-0">
              {task.status === 'pending' && (
                <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                  className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {task.action_type === 'call_lead' ? '📞 Call' : '▶ Start'}
                </button>
              )}
              <button onClick={() => setShowDone(true)}
                className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                ✓ Complete
              </button>
              <button onClick={() => setEditOpen(true)}
                className="text-sm px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50">
                ✏ Edit
              </button>
              <button onClick={() => { if (confirm('Cancel this task?')) cancelMutation.mutate(); }}
                disabled={cancelMutation.isPending}
                className="text-sm px-4 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50">
                ✕ Cancel
              </button>
            </div>
          )}
        </div>

        {showDone && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <textarea rows={2} placeholder="Completion note (optional)..."
              className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              value={comment} onChange={e => setComment(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
                className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                Confirm Complete
              </button>
              <button onClick={() => setShowDone(false)}
                className="text-sm px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-gray-400">Assigned To</dt><dd className="font-medium text-gray-800 mt-0.5">{task.assigned_to_name}</dd></div>
          <div><dt className="text-gray-400">Assigned By</dt><dd className="font-medium text-gray-800 mt-0.5">{task.assigned_by_name}</dd></div>
          {task.due_date && <div><dt className="text-gray-400">Due Date</dt><dd className="font-medium text-gray-800 mt-0.5">{new Date(task.due_date).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</dd></div>}
          {task.reminder_at && <div><dt className="text-gray-400">Reminder</dt><dd className="font-medium text-gray-800 mt-0.5">{new Date(task.reminder_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</dd></div>}
          {task.completed_at && <div><dt className="text-gray-400">Completed At</dt><dd className="font-medium text-gray-800 mt-0.5">{new Date(task.completed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</dd></div>}
          {task.created_at && <div><dt className="text-gray-400">Created</dt><dd className="font-medium text-gray-800 mt-0.5">{new Date(task.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</dd></div>}
        </dl>
      </div>

      {/* Linked records */}
      {(task.customer_name || task.lead_title || task.ticket_title) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Linked To</h2>
          <div className="flex flex-wrap gap-3">
            {task.customer_name && <a href={`/customers/${task.customer}`} className="flex items-center gap-2 text-sm px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100">👤 {task.customer_name}</a>}
            {task.lead_title    && <a href={`/leads/${task.lead}`}         className="flex items-center gap-2 text-sm px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-100">🎯 {task.lead_title}</a>}
            {task.ticket_title  && <a href={`/tickets/${task.ticket}`}     className="flex items-center gap-2 text-sm px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 hover:bg-orange-100">🎫 {task.ticket_title}</a>}
          </div>
        </div>
      )}

      {/* Completion comment */}
      {task.comment && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Completion Note</h2>
          <p className="text-sm text-gray-600">{task.comment}</p>
        </div>
      )}

      {/* Activity Log */}
      {task.logs && task.logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Activity Log</h2>
          <ol className="relative border-l border-gray-200 space-y-4 ml-3">
            {task.logs.map((log: import('@/types').TaskLog) => (
              <li key={log.id} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-blue-400 border-2 border-white" />
                <p className="text-sm font-medium text-gray-700">{log.action.replace('_', ' ')}</p>
                {log.detail && <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{log.actor_name} · {new Date(log.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <TaskModal open={editOpen} onClose={() => setEditOpen(false)} task={task} />
    </div>
  );
}
