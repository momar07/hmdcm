'use client';

import { useState, useRef }                        from 'react';
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query';
import { useRouter }                               from 'next/navigation';
import {
  Calendar, User, DollarSign,
  List, RefreshCw, Plus, AlertCircle,
} from 'lucide-react';
import toast            from 'react-hot-toast';
import { leadsApi }     from '@/lib/api/leads';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import type { Lead, LeadStage } from '@/types';
import { getLeadDisplayName } from '@/lib/leads';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatCurrency(v: number | null | undefined) {
  if (!v) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function priorityBadge(p: string | undefined) {
  switch (p) {
    case 'High':   return 'bg-red-100 text-red-700';
    case 'Medium': return 'bg-yellow-100 text-yellow-700';
    case 'Low':    return 'bg-green-100 text-green-700';
    default:       return 'bg-gray-100 text-gray-500';
  }
}

// ─────────────────────────────────────────────
// Lead Card
// ─────────────────────────────────────────────
function LeadCard({
  lead,
  onDragStart,
  onClick,
}: {
  lead:        Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onClick:     (lead: Lead) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => onClick(lead)}
      className="group bg-white rounded-xl border border-gray-200 shadow-sm p-3.5
                 cursor-grab active:cursor-grabbing hover:shadow-md
                 hover:border-blue-300 transition-all duration-150 select-none"
    >
      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 leading-snug mb-2.5
                    line-clamp-2 group-hover:text-blue-700 transition-colors">
        {getLeadDisplayName(lead)}
      </p>

      {/* Contact */}
      {(lead.full_name || lead.phone) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
          <User size={11} className="text-gray-400 shrink-0" />
          <span className="truncate">
            {lead.full_name
              ? `${''} ${''}`.trim()
              : lead.phone}
          </span>
        </div>
      )}

      {/* Value */}
      {lead.value && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mb-1.5">
          <DollarSign size={11} className="shrink-0" />
          <span>{formatCurrency(lead.value)}</span>
        </div>
      )}

      {/* Follow-up */}
      {lead.followup_date && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-1.5">
          <Calendar size={11} className="shrink-0" />
          <span>{new Date(lead.followup_date).toLocaleDateString()}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
        <span className="text-xs text-gray-400 truncate max-w-[110px]">
          {lead.assigned_name ? `👤 ${lead.assigned_name}` : 'Unassigned'}
        </span>
        {lead.priority_name && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                            ${priorityBadge(lead.priority_name)}`}>
            {lead.priority_name}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Stage Column
// ─────────────────────────────────────────────
function StageColumn({
  stage, leads, onDragStart, onDrop,
  onDragOver, onLeadClick, isDragOver,
}: {
  stage:       LeadStage;
  leads:       Lead[];
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDrop:      (e: React.DragEvent, stageId: string) => void;
  onDragOver:  (e: React.DragEvent) => void;
  onLeadClick: (lead: Lead) => void;
  isDragOver:  boolean;
}) {
  const totalValue = leads.reduce((s, l) => s + (l.value ?? 0), 0);

  return (
    <div
      className={`flex flex-col w-[260px] shrink-0 rounded-2xl border
                  transition-all duration-150
                  ${isDragOver
                    ? 'border-blue-400 bg-blue-50/70 shadow-lg shadow-blue-100/50'
                    : 'border-gray-200 bg-gray-50'}`}
      onDrop={(e)    => onDrop(e, stage.id)}
      onDragOver={onDragOver}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3
                      border-b border-gray-200 shrink-0 rounded-t-2xl
                      bg-white/80">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-semibold text-gray-800 truncate">
            {stage.name}
          </span>
          <span className="shrink-0 text-xs bg-gray-100 text-gray-600
                           border border-gray-200 rounded-full px-1.5 py-0.5
                           font-semibold leading-none">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="shrink-0 text-xs text-emerald-600 font-bold ml-1">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>

      {/* Cards List */}
      <div className="flex flex-col gap-2 p-2.5 flex-1
                      overflow-y-auto min-h-[80px] max-h-[calc(100vh-260px)]">
        {leads.length === 0 ? (
          <div className={`flex items-center justify-center h-20 rounded-xl
                           border-2 border-dashed text-xs font-medium transition-all
                           ${isDragOver
                             ? 'border-blue-400 text-blue-500 bg-blue-50'
                             : 'border-gray-200 text-gray-300'}`}>
            {isDragOver ? '↓ Drop here' : 'No leads'}
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onDragStart={onDragStart}
              onClick={onLeadClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Pipeline Page
// ─────────────────────────────────────────────
export default function PipelinePage() {
  const router   = useRouter();
  const qc       = useQueryClient();
  const dragLead = useRef<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  /* Stages */
  const { data: stagesRaw } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then((r) => r.data as LeadStage[]),
  });
  const stages = Array.isArray(stagesRaw) ? stagesRaw : [];

  /* Leads */
  const { data: leadsData, isLoading, isFetching } = useQuery({
    queryKey: ['leads-pipeline'],
    queryFn:  () =>
      leadsApi.list({ page_size: 200, is_active: true }).then((r) => r.data),
    refetchInterval: 30_000,
  });
  const allLeads: Lead[] = leadsData?.results ?? [];

  /* Group by stage */
  const leadsByStage = stages.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s.id] = allLeads.filter((l) => l.stage === s.id);
    return acc;
  }, {});
  const unstagedLeads = allLeads.filter((l) => !l.stage);

  /* Move mutation */
  const moveMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      leadsApi.moveStage(leadId, stageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] });
      toast.success('Lead moved successfully');
    },
    onError: () => toast.error('Failed to move lead'),
  });

  /* Drag handlers */
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    dragLead.current = lead;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragLead.current || dragLead.current.stage === stageId) return;
    moveMutation.mutate({ leadId: dragLead.current.id, stageId });
    dragLead.current = null;
  };
  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const totalValue = allLeads.reduce((s, l) => s + (l.value ?? 0), 0);

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <PageHeader
        title="Lead Pipeline"
        subtitle={
          (<span className="flex items-center gap-2.5 text-sm">
            <span className="font-medium text-gray-700">
              {allLeads.length} lead{allLeads.length !== 1 ? 's' : ''}
            </span>
            {totalValue > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(totalValue)} total
                </span>
              </>
            )}
            {isFetching && !isLoading && (
              <RefreshCw size={12} className="animate-spin text-gray-400" />
            )}
          </span>) as any
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary" size="sm"
              icon={<List size={14} />}
              onClick={() => router.push('/leads')}
            >
              List View
            </Button>
            <Button
              variant="primary" size="sm"
              icon={<Plus size={14} />}
              onClick={() => router.push('/leads/new')}
            >
              New Lead
            </Button>
          </div>
        }
      />

      {/* ── Unstaged warning ── */}
      {unstagedLeads.length > 0 && (
        <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5
                        bg-amber-50 border border-amber-200 rounded-xl
                        text-xs text-amber-700">
          <AlertCircle size={14} className="shrink-0 text-amber-500" />
          <span>
            <strong>{unstagedLeads.length}</strong> lead(s) have no stage assigned.
          </span>
          <button
            className="underline underline-offset-2 hover:text-amber-900 font-semibold ml-auto"
            onClick={() => router.push('/leads')}
          >
            View in list →
          </button>
        </div>
      )}

      {/* ── Kanban Board ── */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}
              className="w-[260px] shrink-0 h-72 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center
                        text-center py-20 text-gray-400">
          <List size={40} className="mb-3 text-gray-200" />
          <p className="font-semibold text-gray-500">No pipeline stages configured</p>
          <p className="text-sm mt-1">Add stages from the admin panel first.</p>
        </div>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-6 flex-1 items-start pt-1"
          onDragLeave={() => setDragOverStage(null)}
        >
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage[stage.id] ?? []}
              isDragOver={dragOverStage === stage.id}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onLeadClick={(l) => router.push(`/leads/${l.id}`)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
