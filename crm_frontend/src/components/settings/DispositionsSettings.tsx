'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, Save, X, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { dispositionsApi, type Disposition, type ActionType, type Direction } from '@/lib/api/dispositions';
import { Button } from '@/components/ui/Button';
import { Input }  from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

const ACTION_LABELS: Record<ActionType, { label: string; icon: string; description: string }> = {
  no_action:        { label: 'No Action',             icon: '⊘',  description: 'Close modal, nothing else' },
  create_followup:  { label: 'Create Follow-up',      icon: '📅', description: 'Show date picker → auto-create Followup' },
  create_lead:      { label: 'Create Lead',            icon: '🔗', description: 'Auto-create Lead linked to call' },
  create_ticket:    { label: 'Create Ticket',          icon: '🎫', description: 'Open ticket modal pre-filled with call info' },
  change_lead_stage:{ label: 'Change Lead Stage',      icon: '📌', description: 'Show stage picker → move linked lead' },
  mark_won:         { label: 'Mark Lead as Won',       icon: '🏆', description: 'Move linked lead to Won stage' },
  escalate:         { label: 'Escalate to Supervisor', icon: '🚨', description: 'Send WS notification to supervisors' },
};

const DIR_COLORS: Record<Direction, string> = {
  inbound:  'bg-blue-100 text-blue-700',
  outbound: 'bg-green-100 text-green-700',
  both:     'bg-purple-100 text-purple-700',
};

// ── Action Badge ──────────────────────────────────────────────────
function ActionBadge({ type }: { type: ActionType }) {
  const meta = ACTION_LABELS[type];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                     text-xs font-medium bg-gray-100 text-gray-700">
      {meta.icon} {meta.label}
    </span>
  );
}

// ── Add/Edit Action Modal ─────────────────────────────────────────
function ActionForm({
  dispositionId,
  existing,
  onDone,
}: {
  dispositionId: string;
  existing?: { id: string; action_type: ActionType; order: number };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<ActionType>(existing?.action_type ?? 'no_action');

  const save = useMutation({
    mutationFn: () =>
      existing
        ? dispositionsApi.updateAction(existing.id, { action_type: type })
        : dispositionsApi.addAction({ disposition: dispositionId, action_type: type }),
    onSuccess: () => {
      toast.success(existing ? 'Action updated' : 'Action added ✅');
      qc.invalidateQueries({ queryKey: ['dispositions-crud'] });
      onDone();
    },
    onError: () => toast.error('Failed to save action'),
  });

  return (
    <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 space-y-3">
      <p className="text-xs font-semibold text-blue-800">
        {existing ? 'Edit Action' : 'Add Action'}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(ACTION_LABELS) as ActionType[]).map(a => (
          <label key={a}
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
              ${type === a ? 'border-blue-500 bg-white' : 'border-transparent bg-white/60 hover:border-gray-200'}`}>
            <input type="radio" name="action" value={a}
              checked={type === a} onChange={() => setType(a)}
              className="mt-0.5 accent-blue-600" />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {ACTION_LABELS[a].icon} {ACTION_LABELS[a].label}
              </p>
              <p className="text-xs text-gray-500">{ACTION_LABELS[a].description}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
        <Button variant="primary" size="sm" icon={<Save size={13}/>}
          loading={save.isPending} onClick={() => save.mutate()}>
          {existing ? 'Update' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

// ── Disposition Card ──────────────────────────────────────────────
function DispositionCard({
  d, onEdit, onDelete,
}: {
  d: Disposition;
  onEdit: (d: Disposition) => void;
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [expanded,    setExpanded]    = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [editAction,  setEditAction]  = useState<{ id: string; action_type: ActionType; order: number } | null>(null);

  const delAction = useMutation({
    mutationFn: (id: string) => dispositionsApi.deleteAction(id),
    onSuccess: () => {
      toast.success('Action removed');
      qc.invalidateQueries({ queryKey: ['dispositions-crud'] });
    },
    onError: () => toast.error('Failed to remove action'),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{d.name}</p>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIR_COLORS[d.direction]}`}>
              {d.direction}
            </span>
            {!d.is_active && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Inactive
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {d.actions.length === 0
              ? <span className="text-xs text-gray-400">No actions</span>
              : d.actions.map(a => <ActionBadge key={a.id} type={a.action_type} />)
            }
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </button>
          <button onClick={() => onEdit(d)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Pencil size={14}/>
          </button>
          <button onClick={() => onDelete(d.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={14}/>
          </button>
        </div>
      </div>

      {/* Expanded — actions management */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase">Actions</p>
            {!addingAction && !editAction && (
              <button onClick={() => setAddingAction(true)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600
                           hover:text-blue-700 bg-blue-50 hover:bg-blue-100
                           px-2 py-1 rounded-lg transition-colors">
                <Plus size={12}/> Add Action
              </button>
            )}
          </div>

          {addingAction && (
            <ActionForm
              dispositionId={d.id}
              onDone={() => setAddingAction(false)}
            />
          )}

          {editAction && (
            <ActionForm
              dispositionId={d.id}
              existing={editAction}
              onDone={() => setEditAction(null)}
            />
          )}

          {!addingAction && !editAction && d.actions.map(a => (
            <div key={a.id}
              className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2">
              <GripVertical size={13} className="text-gray-300"/>
              <span className="flex-1 text-xs font-medium text-gray-700">
                {ACTION_LABELS[a.action_type].icon} {ACTION_LABELS[a.action_type].label}
              </span>
              <button onClick={() => setEditAction(a)}
                className="p-1 rounded text-gray-400 hover:text-blue-600 transition-colors">
                <Pencil size={12}/>
              </button>
              <button onClick={() => delAction.mutate(a.id)}
                className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors">
                <X size={12}/>
              </button>
            </div>
          ))}

          {!addingAction && !editAction && d.actions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No actions yet — add one above
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit Form ────────────────────────────────────────────
function DispositionForm({
  existing, direction, onDone,
}: {
  existing?: Disposition;
  direction: 'inbound' | 'outbound';
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name,   setName]   = useState(existing?.name  ?? '');
  const [color,  setColor]  = useState(existing?.color ?? '#6b7280');
  const [dir,    setDir]    = useState<Direction>(existing?.direction ?? direction);
  const [active, setActive] = useState(existing?.is_active ?? true);
  const [reqNote, setReqNote] = useState(existing?.requires_note ?? true);

  const generateCode = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name, color, direction: dir, is_active: active, requires_note: reqNote,
        code: existing?.code || generateCode(name),
        order: existing?.order ?? 0,
      };
      return existing
        ? dispositionsApi.update(existing.id, payload)
        : dispositionsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(existing ? 'Disposition updated ✅' : 'Disposition created ✅');
      qc.invalidateQueries({ queryKey: ['dispositions-crud'] });
      onDone();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.code?.[0] || err?.response?.data?.name?.[0] || 'Failed to save'),
  });

  return (
    <div className="border border-blue-200 rounded-xl p-5 bg-blue-50 space-y-4">
      <h3 className="text-sm font-semibold text-blue-800">
        {existing ? `Edit — ${existing.name}` : 'New Disposition'}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Name *" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Interested" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-10 h-9 rounded border border-gray-200 cursor-pointer"/>
            <span className="text-xs text-gray-500 font-mono">{color}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Direction</label>
          <div className="flex gap-2">
            {(['inbound', 'outbound', 'both'] as Direction[]).map(d => (
              <button key={d} onClick={() => setDir(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-all capitalize
                  ${dir === d ? 'border-blue-500 bg-white text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={reqNote} onChange={e => setReqNote(e.target.checked)}
              className="rounded accent-blue-600"/>
            <span className="text-xs text-gray-700">Require note</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
              className="rounded accent-blue-600"/>
            <span className="text-xs text-gray-700">Active</span>
          </label>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1 border-t border-blue-100">
        <Button variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
        <Button variant="primary" size="sm" icon={<Save size={13}/>}
          loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
          {existing ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function DispositionsSettings() {
  const qc = useQueryClient();
  const [tab,      setTab]      = useState<'inbound' | 'outbound'>('inbound');
  const [showForm, setShowForm] = useState(false);
  const [editDisp, setEditDisp] = useState<Disposition | null>(null);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['dispositions-crud'],
    queryFn:  () => dispositionsApi.list().then(r => {
      const d = (r as any).data ?? r;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 30_000,
  });

  const allDispositions: Disposition[] = rawData ?? [];
  const filtered = allDispositions.filter(
    d => d.direction === tab || d.direction === 'both'
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dispositionsApi.delete(id),
    onSuccess: () => {
      toast.success('Disposition deleted');
      qc.invalidateQueries({ queryKey: ['dispositions-crud'] });
    },
    onError: () => toast.error('Cannot delete — may be in use'),
  });

  const handleDelete = (id: string) => {
    if (!confirm('Delete this disposition?')) return;
    deleteMutation.mutate(id);
  };

  const handleEdit = (d: Disposition) => {
    setEditDisp(d);
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Dispositions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Define call outcomes and their automatic actions
          </p>
        </div>
        {!showForm && (
          <Button variant="primary" size="sm" icon={<Plus size={14}/>}
            onClick={() => { setEditDisp(null); setShowForm(true); }}>
            New Disposition
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['inbound', 'outbound'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize
              ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'inbound' ? '📥 Inbound' : '📤 Outbound'}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <DispositionForm
          existing={editDisp ?? undefined}
          direction={tab}
          onDone={() => { setShowForm(false); setEditDisp(null); }}
        />
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
          No {tab} dispositions yet.{' '}
          <button className="text-blue-600 hover:underline"
            onClick={() => { setEditDisp(null); setShowForm(true); }}>
            Create one
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => (
            <DispositionCard key={d.id} d={d}
              onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
