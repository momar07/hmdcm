'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsApi } from '@/lib/api/leads';
import { Button }   from '@/components/ui/Button';
import type { LeadStage } from '@/types';

// 12-colour palette
const PALETTE = [
  '#6366f1','#3b82f6','#0ea5e9','#14b8a6',
  '#22c55e','#84cc16','#eab308','#f97316',
  '#ef4444','#ec4899','#8b5cf6','#64748b',
];

interface Props {
  open:    boolean;
  onClose: () => void;
}

export function StageManagerModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  // ── state ──────────────────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editName,    setEditName]    = useState('');
  const [editColor,   setEditColor]   = useState('#6366f1');
  const [addingNew,   setAddingNew]   = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newColor,    setNewColor]    = useState('#6366f1');
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // ── data ───────────────────────────────────────────────────────────────────
  const { data: stagesRaw, isLoading } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then((r) => r.data as LeadStage[]),
    enabled:  open,
  });
  const stages: LeadStage[] = Array.isArray(stagesRaw) ? stagesRaw : [];

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead-stages'] });
    qc.invalidateQueries({ queryKey: ['leads-pipeline'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color: string; order: number }) =>
      leadsApi.createStage(data),
    onSuccess: () => { toast.success('Stage created'); invalidate(); setAddingNew(false); setNewName(''); },
    onError:   () => toast.error('Failed to create stage'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LeadStage> }) =>
      leadsApi.updateStage(id, data),
    onSuccess: () => { toast.success('Stage updated'); invalidate(); setEditingId(null); },
    onError:   () => toast.error('Failed to update stage'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leadsApi.deleteStage(id),
    onSuccess: () => { toast.success('Stage deleted'); invalidate(); setDeletingId(null); },
    onError:   () => toast.error('Failed to delete stage'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      leadsApi.updateStage(id, { is_active }),
    onSuccess: () => { invalidate(); },
    onError:   () => toast.error('Failed to toggle stage'),
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const startEdit = (s: LeadStage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color || '#6366f1');
  };
  const saveEdit = (s: LeadStage) => {
    if (!editName.trim()) return;
    updateMutation.mutate({ id: s.id, data: { name: editName, color: editColor } });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg
                      flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Manage Pipeline Stages</h2>
            <p className="text-xs text-gray-400 mt-0.5">Add, rename, recolor or remove stages</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : stages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No stages yet.</p>
          ) : (
            stages.map((s) => (
              <div key={s.id}
                className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl
                           border border-gray-100 hover:border-gray-200 transition-colors">

                <GripVertical size={14} className="text-gray-300 shrink-0 cursor-grab" />

                {/* Colour dot */}
                <span className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: editingId === s.id ? editColor : (s.color || '#6366f1') }} />

                {editingId === s.id ? (
                  /* ── Edit row ── */
                  <div className="flex flex-1 flex-col gap-2 min-w-0">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') setEditingId(null); }}
                      className="w-full text-sm border border-blue-300 rounded-lg px-2.5 py-1.5
                                 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="flex flex-wrap gap-1">
                      {PALETTE.map((c) => (
                        <button key={c} onClick={() => setEditColor(c)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110
                            ${editColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ── View row ── */
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <span className={`flex-1 text-sm font-medium truncate
                      ${s.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {s.name}
                    </span>
                    {s.is_won  && <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-semibold">Won</span>}
                    {s.is_closed && !s.is_won && <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-semibold">Closed</span>}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {editingId === s.id ? (
                    <>
                      <button onClick={() => saveEdit(s)}
                        className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : deletingId === s.id ? (
                    <>
                      <span className="text-xs text-red-500 font-medium mr-1">Delete?</span>
                      <button onClick={() => deleteMutation.mutate(s.id)}
                        className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setDeletingId(null)}
                        className="p-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Toggle active */}
                      <button
                        onClick={() => toggleMutation.mutate({ id: s.id, is_active: !s.is_active })}
                        title={s.is_active ? 'Deactivate' : 'Activate'}
                        className={`w-8 h-4 rounded-full transition-colors shrink-0
                          ${s.is_active ? 'bg-green-400' : 'bg-gray-200'}`}
                      >
                        <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform
                          ${s.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={() => startEdit(s)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-blue-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeletingId(s.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Add new stage row */}
          {addingNew && (
            <div className="flex flex-col gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <input
                autoFocus
                placeholder="Stage name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    createMutation.mutate({ name: newName, color: newColor, order: stages.length * 10 });
                  }
                  if (e.key === 'Escape') setAddingNew(false);
                }}
                className="w-full text-sm border border-blue-300 rounded-lg px-2.5 py-1.5
                           focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
              <div className="flex flex-wrap gap-1">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110
                      ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary"
                  onClick={() => {
                    if (newName.trim()) {
                      createMutation.mutate({ name: newName, color: newColor, order: stages.length * 10 });
                    }
                  }}
                  disabled={!newName.trim() || createMutation.isPending}>
                  {createMutation.isPending ? 'Saving…' : 'Add Stage'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setAddingNew(false); setNewName(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <Button
            size="sm" variant="secondary"
            icon={<Plus size={14} />}
            onClick={() => { setAddingNew(true); setEditingId(null); }}
            disabled={addingNew}>
            Add Stage
          </Button>
          <Button size="sm" variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
