'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GripVertical, Pencil, Trash2, Plus, Check, X,
  Trophy, XCircle, Eye, EyeOff, Loader2,
} from 'lucide-react';
import toast        from 'react-hot-toast';
import { leadsApi } from '@/lib/api/leads';
import type { LeadStage } from '@/types';

const COLORS = [
  '#6b7280','#3b82f6','#8b5cf6','#ec4899',
  '#f59e0b','#10b981','#ef4444','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
];

function StageRow({
  stage, onSave, onDelete, onToggle, isDragging,
}: {
  stage:       LeadStage;
  onSave:      (id: string, data: Partial<LeadStage>) => Promise<void>;
  onDelete:    (id: string) => void;
  onToggle:    (id: string, active: boolean) => void;
  isDragging?: boolean;
}) {
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState(stage.name);
  const [color,    setColor]    = useState(stage.color);
  const [isWon,    setIsWon]    = useState(stage.is_won);
  const [isClosed, setIsClosed] = useState(stage.is_closed);
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(stage.id, {
        name: name.trim(), color,
        is_won: isWon,
        is_closed: isClosed || isWon,
      });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleCancel = () => {
    setName(stage.name); setColor(stage.color);
    setIsWon(stage.is_won); setIsClosed(stage.is_closed);
    setEditing(false);
  };

  return (
    <div className={[
      'group flex items-center gap-3 p-3 rounded-xl border transition-all',
      isDragging
        ? 'shadow-lg border-blue-300 bg-blue-50 scale-[1.02]'
        : 'border-gray-200 bg-white hover:border-gray-300',
      !stage.is_active ? 'opacity-50' : '',
    ].join(' ')}>

      <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0">
        <GripVertical size={18} />
      </div>

      <div
        className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
        style={{ backgroundColor: editing ? color : stage.color }}
      />

      {editing ? (
        <div className="flex-1 space-y-2.5">
          <input
            autoFocus value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Stage name"
          />
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={[
                  'w-6 h-6 rounded-full transition-transform hover:scale-110',
                  color === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : '',
                ].join(' ')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={isWon}
                onChange={e => { setIsWon(e.target.checked); if (e.target.checked) setIsClosed(true); }}
                className="rounded border-gray-300 text-green-600 h-3.5 w-3.5" />
              <Trophy size={12} className="text-green-600" />
              <span className="text-gray-600 font-medium">Won stage</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={isClosed || isWon} disabled={isWon}
                onChange={e => setIsClosed(e.target.checked)}
                className="rounded border-gray-300 text-red-500 h-3.5 w-3.5" />
              <XCircle size={12} className="text-red-500" />
              <span className="text-gray-600 font-medium">Closed stage</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold
                         bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:opacity-50 transition-colors">
              {saving
                ? <Loader2 size={12} className="animate-spin" />
                : <Check size={12} />}
              Save
            </button>
            <button onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                         border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{stage.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {stage.is_won && (
                <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                  <Trophy size={10} /> Won
                </span>
              )}
              {stage.is_closed && !stage.is_won && (
                <span className="text-[10px] text-red-500 font-medium flex items-center gap-0.5">
                  <XCircle size={10} /> Closed
                </span>
              )}
              {!stage.is_active && (
                <span className="text-[10px] text-gray-400 font-medium">Inactive</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={() => onToggle(stage.id, !stage.is_active)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title={stage.is_active ? 'Deactivate' : 'Activate'}>
              {stage.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => onDelete(stage.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AddStageForm({
  onAdd, nextOrder,
}: {
  onAdd:     (data: { name: string; color: string; order: number; is_won: boolean; is_closed: boolean }) => Promise<void>;
  nextOrder: number;
}) {
  const [open,   setOpen]   = useState(false);
  const [name,   setName]   = useState('');
  const [color,  setColor]  = useState('#6b7280');
  const [isWon,  setIsWon]  = useState(false);
  const [closed, setClosed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(), color, order: nextOrder,
        is_won: isWon, is_closed: closed || isWon,
      });
      setName(''); setColor('#6b7280');
      setIsWon(false); setClosed(false); setOpen(false);
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed
                   border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500
                   text-sm font-medium transition-all">
        <Plus size={16} /> Add new stage
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 space-y-3">
      <p className="text-sm font-semibold text-blue-800">New Stage</p>
      <input
        autoFocus value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  handleAdd();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Stage name (e.g. Qualified, Demo Scheduled…)"
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                   focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map(c => (
          <button key={c} type="button" onClick={() => setColor(c)}
            className={[
              'w-6 h-6 rounded-full transition-transform hover:scale-110',
              color === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : '',
            ].join(' ')}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={isWon}
            onChange={e => { setIsWon(e.target.checked); if (e.target.checked) setClosed(true); }}
            className="rounded border-gray-300 text-green-600 h-3.5 w-3.5" />
          <Trophy size={12} className="text-green-600" />
          <span className="font-medium text-gray-700">Won stage</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={closed || isWon} disabled={isWon}
            onChange={e => setClosed(e.target.checked)}
            className="rounded border-gray-300 text-red-500 h-3.5 w-3.5" />
          <XCircle size={12} className="text-red-500" />
          <span className="font-medium text-gray-700">Closed stage</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold
                     bg-blue-600 text-white rounded-lg hover:bg-blue-700
                     disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add Stage
        </button>
        <button onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PipelineStagesSettings() {
  const qc = useQueryClient();

  const { data: stages = [], isLoading } = useQuery<LeadStage[]>({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then(r => r.data as LeadStage[]),
  });

  const [localStages, setLocalStages] = useState<LeadStage[]>([]);
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  React.useEffect(() => { setLocalStages(stages); }, [stages]);

  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    setLocalStages(prev => {
      const arr   = [...prev];
      const fromI = arr.findIndex(s => s.id === draggingId);
      const toI   = arr.findIndex(s => s.id === overId);
      if (fromI === -1 || toI === -1) return prev;
      const [item] = arr.splice(fromI, 1);
      arr.splice(toI, 0, item);
      return arr;
    });
  };

  const handleDragEnd = async () => {
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    setSaving(true);
    try {
      await leadsApi.reorderStages(localStages.map(s => s.id));
      await qc.invalidateQueries({ queryKey: ['lead-stages'] });
      toast.success('Order saved');
    } catch {
      toast.error('Failed to save order');
      setLocalStages(stages);
    } finally { setSaving(false); }
  };

  const saveStageMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LeadStage> }) =>
      leadsApi.updateStage(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-stages'] });
      toast.success('Stage updated');
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const addStageMut = useMutation({
    mutationFn: (data: { name: string; color: string; order: number; is_won: boolean; is_closed: boolean }) =>
      leadsApi.createStage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-stages'] });
      toast.success('Stage added');
    },
    onError: () => toast.error('Failed to add stage'),
  });

  const deleteStageMut = useMutation({
    mutationFn: (id: string) => leadsApi.deleteStage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-stages'] });
      toast.success('Stage deleted');
    },
    onError: () => toast.error('Cannot delete — stage may have leads assigned'),
  });

  const handleDelete = (id: string) => {
    const stage = localStages.find(s => s.id === id);
    if (!confirm(`Delete stage "${stage?.name}"?\nLeads in this stage will become unsorted.`)) return;
    deleteStageMut.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Pipeline Stages</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Drag to reorder · Click ✏️ to rename or change colour
          </p>
        </div>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600">
            <Loader2 size={13} className="animate-spin" /> Saving order…
          </span>
        )}
      </div>

      <div className="space-y-2">
        {localStages.map(stage => (
          <div key={stage.id} draggable
            onDragStart={() => setDraggingId(stage.id)}
            onDragOver={e  => handleDragOver(e, stage.id)}
            onDragEnd={handleDragEnd}
          >
            <StageRow
              stage={stage}
              isDragging={draggingId === stage.id}
              onSave={async (id, data) => { await saveStageMut.mutateAsync({ id, data }); }}
              onDelete={handleDelete}
              onToggle={(id, active) => saveStageMut.mutate({ id, data: { is_active: active } as Partial<LeadStage> })}
            />
          </div>
        ))}
      </div>

      <AddStageForm
        nextOrder={localStages.length + 1}
        onAdd={async data => { await addStageMut.mutateAsync(data); }}
      />

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
        <strong>Tips:</strong> Mark a stage as <strong>Won</strong> to track conversions.
        Mark as <strong>Closed</strong> to remove it from the active pipeline view.
        You can have multiple Won/Closed stages.
      </div>
    </div>
  );
}
