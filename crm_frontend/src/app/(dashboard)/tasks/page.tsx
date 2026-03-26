'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api/tasks';
import { Task, TaskStatus, TaskPriority } from '@/types';
import TaskModal from '@/components/tasks/TaskModal';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string }> = {
  low:    { label: 'Low',    color: 'text-green-700 bg-green-50 border-green-200',   dot: 'bg-green-500' },
  medium: { label: 'Medium', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  high:   { label: 'High',   color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', color: 'text-red-700 bg-red-50 border-red-200',         dot: 'bg-red-500' },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'text-gray-700 bg-gray-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-700 bg-blue-100' },
  completed:   { label: 'Completed',   color: 'text-green-700 bg-green-100' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-700 bg-red-100' },
};

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function TaskCard({ task, onEdit, onStart, onComplete, onCancel }: {
  task:       Task;
  onEdit:     (t: Task) => void;
  onStart:    (id: string) => void;
  onComplete: (id: string) => void;
  onCancel:   (id: string) => void;
}) {
  const [showComplete, setShowComplete] = useState(false);
  const [comment, setComment]           = useState('');

  const isOverdue = task.is_overdue;

  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${isOverdue ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {isOverdue && (
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                ⚠ Overdue
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-800 truncate">{task.title}</h3>
          {task.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            {task.due_date && (
              <span>📅 {new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {task.assigned_by_name && (
              <span>👤 By {task.assigned_by_name}</span>
            )}
            {task.customer_name && <span>🏷 {task.customer_name}</span>}
            {task.lead_title    && <span>🎯 {task.lead_title}</span>}
            {task.ticket_title  && <span>🎫 {task.ticket_title}</span>}
          </div>
        </div>

        {/* Actions */}
        {task.status !== 'completed' && task.status !== 'cancelled' && (
          <div className="flex items-center gap-1 shrink-0">
            {task.status === 'pending' && (
              <button
                onClick={() => onStart(task.id)}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Start
              </button>
            )}
            <button
              onClick={() => setShowComplete(!showComplete)}
              className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              ✓ Done
            </button>
            <button
              onClick={() => onEdit(task)}
              className="text-xs px-2 py-1 border text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Complete with comment */}
      {showComplete && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <textarea
            rows={2}
            placeholder="Add a completion note (optional)..."
            className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onComplete(task.id); setShowComplete(false); }}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Confirm Complete
            </button>
            <button
              onClick={() => setShowComplete(false)}
              className="text-xs px-3 py-1.5 border text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuthStore();
  const qc       = useQueryClient();
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);
  const [filter,    setFilter]    = useState<{ status: string; priority: string; search: string }>({
    status: '', priority: '', search: '',
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['task-stats'],
    queryFn:  () => tasksApi.myStats(),
    refetchInterval: 30_000,
  });

  // Tasks list
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter, isSupervisor],
    queryFn:  () => tasksApi.list({
      status:      filter.status   || undefined,
      priority:    filter.priority || undefined,
      search:      filter.search   || undefined,
      page_size:   50,
    }),
    refetchInterval: 15_000,
  });

  const tasks: Task[] = data?.results ?? data ?? [];

  // Mutations
  const startMutation = useMutation({
    mutationFn: (id: string) => tasksApi.start(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task started'); },
    onError:    () => toast.error('Failed to start task'),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => tasksApi.complete(id, comment),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task-stats'] }); toast.success('Task completed ✅'); },
    onError:    () => toast.error('Failed to complete task'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tasksApi.cancel(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task cancelled'); },
    onError:    () => toast.error('Failed to cancel task'),
  });

  // Group tasks
  const overdue   = tasks.filter(t => t.is_overdue && !['completed','cancelled'].includes(t.status));
  const today     = tasks.filter(t => !t.is_overdue && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString() && !['completed','cancelled'].includes(t.status));
  const upcoming  = tasks.filter(t => !t.is_overdue && (!t.due_date || new Date(t.due_date).toDateString() !== new Date().toDateString()) && !['completed','cancelled'].includes(t.status));
  const done      = tasks.filter(t => ['completed','cancelled'].includes(t.status));

  const openCreate = () => { setEditTask(null); setModalOpen(true); };
  const openEdit   = (t: Task) => { setEditTask(t); setModalOpen(true); };

  const Section = ({ title, items, color }: { title: string; items: Task[]; color: string }) => (
    items.length > 0 ? (
      <div>
        <h2 className={`text-sm font-semibold mb-3 ${color}`}>{title} ({items.length})</h2>
        <div className="space-y-3">
          {items.map(t => (
            <TaskCard
              key={t.id} task={t}
              onEdit={openEdit}
              onStart={(id) => startMutation.mutate(id)}
              onComplete={(id) => completeMutation.mutate({ id })}
              onCancel={(id) => cancelMutation.mutate(id)}
            />
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isSupervisor ? '📋 All Tasks' : '✅ My Tasks'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSupervisor ? 'Manage and assign tasks to your team' : 'Your assigned tasks and action items'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium shadow"
        >
          + New Task
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Pending',     value: stats.pending,         color: 'text-gray-700',  bg: 'bg-gray-50' },
            { label: 'In Progress', value: stats.in_progress,     color: 'text-blue-700',  bg: 'bg-blue-50' },
            { label: 'Overdue',     value: stats.overdue,         color: 'text-red-700',   bg: 'bg-red-50' },
            { label: 'Done Today',  value: stats.completed_today, color: 'text-green-700', bg: 'bg-green-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          placeholder="🔍 Search tasks..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filter.priority}
          onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Task Sections */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">✅</div>
          <p className="font-medium">No tasks found</p>
          <p className="text-sm mt-1">Create a new task to get started</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section title="🔴 Overdue"  items={overdue}  color="text-red-600" />
          <Section title="🟡 Today"    items={today}    color="text-yellow-600" />
          <Section title="📅 Upcoming" items={upcoming} color="text-blue-600" />
          <Section title="✅ Closed"   items={done}     color="text-gray-400" />
        </div>
      )}

      {/* Modal */}
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        task={editTask}
      />
    </div>
  );
}
