'use client';

import { useState, useRef }                        from 'react';
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query';
import { useRouter }                               from 'next/navigation';
import {
  Phone, Calendar, User, DollarSign,
  LayoutGrid, List, RefreshCw,
} from 'lucide-react';
import toast            from 'react-hot-toast';
import { leadsApi }     from '@/lib/api/leads';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import type { Lead, LeadStage } from '@/types';

// ── helpers ───────────────────────────────────────────────────
function formatValue(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

// ── Lead Card ─────────────────────────────────────────────────
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
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3
                 cursor-grab active:cursor-grabbing hover:shadow-md
                 transition-all hover:border-blue-300 select-none"
    >
      {/* title */}
      <p className="text-sm font-semibold text-gray-900 leading-tight mb-2 line-clamp-2">
        {lead.title}
      </p>

      {/* customer */}
      {lead.customer_name && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1.5">
          <User size={11} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{lead.customer_name}</span>
        </div>
      )}

      {/* value */}
      {lead.value && (
        <div className="flex items-center gap-1 text-xs text-green-600 font-medium mb-1.5">
          <DollarSign size={11} className="flex-shrink-0" />
          <span>{formatValue(lead.value)}</span>
        </div>
      )}

      {/* followup */}
      {lead.followup_date && (
        <div className="flex items-center gap-1 text-xs text-orange-500 mb-1.5">
          <Calendar size={11} className="flex-shrink-0" />
          <span>{new Date(lead.followup_date).toLocaleDateString()}</span>
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between mt-2 pt-2
                      border-t border-gray-100">
        {lead.assigned_name ? (
          <span className="text-xs text-gray-400 truncate max-w-[100px]">
            👤 {lead.assigned_name}
          </span>
        ) : (
          <span className="text-xs text-gray-300">Unassigned</span>
        )}
        {lead.source && (
          <span className="text-xs bg-gray-100 text-gray-500
                           px-1.5 py-0.5 rounded-full">
            {lead.source}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stage Column ──────────────────────────────────────────────
function StageColumn({
  stage,
  leads,
  onDragStart,
  onDrop,
  onDragOver,
  onLeadClick,
  isDragOver,
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
      className={`flex flex-col min-w-[260px] max-w-[280px] rounded-xl
        transition-colors
        ${isDragOver
          ? 'bg-blue-50 ring-2 ring-blue-300'
          : 'bg-gray-50'}`}
      onDrop={(e) => onDrop(e, stage.id)}
      onDragOver={onDragOver}
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2.5
                      border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-semibold text-gray-800 truncate">
            {stage.name}
          </span>
          <span className="text-xs bg-white border border-gray-200
                           text-gray-600 rounded-full px-1.5 py-0.5 font-medium">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs text-green-600 font-medium">
            {formatValue(totalValue)}
          </span>
        )}
      </div>

      {/* cards */}
      <div className="flex flex-col gap-2 p-2 flex-1 min-h-[120px]
                      overflow-y-auto max-h-[calc(100vh-220px)]">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onClick={onLeadClick}
          />
        ))}
        {leads.length === 0 && (
          <div className={`flex items-center justify-center h-20
                           rounded-lg border-2 border-dashed text-xs
                           ${isDragOver
                             ? 'border-blue-300 text-blue-400'
                             : 'border-gray-200 text-gray-300'}`}>
            {isDragOver ? 'Drop here' : 'No leads'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Pipeline Page ────────────────────────────────────────
export default function PipelinePage() {
  const router    = useRouter();
  const qc        = useQueryClient();
  const dragLead  = useRef<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // fetch all stages
  const { data: stagesRaw } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  () => leadsApi.stages().then((r) => r.data as LeadStage[]),
  });
  const stages = stagesRaw ?? [];

  // fetch all active leads (up to 200)
  const { data: leadsData, isLoading, isFetching } = useQuery({
    queryKey: ['leads-pipeline'],
    queryFn:  () =>
      leadsApi.list({ page_size: 200, is_active: true }).then((r) => r.data),
    refetchInterval: 30_000,
  });
  const allLeads: Lead[] = leadsData?.results ?? [];

  // group leads by stage
  const leadsByStage = stages.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s.id] = allLeads.filter((l) => l.stage === s.id);
    return acc;
  }, {});

  // unassigned (no stage)
  const unstagedLeads = allLeads.filter((l) => !l.stage);

  // move stage mutation
  const moveMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      leadsApi.moveStage(leadId, stageId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] });
      toast.success('Lead moved ✅');
    },
    onError: () => toast.error('Failed to move lead'),
  });

  // drag handlers
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    dragLead.current = lead;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragLead.current) return;
    if (dragLead.current.stage === stageId) return;
    moveMutation.mutate({ leadId: dragLead.current.id, stageId });
    dragLead.current = null;
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => setDragOverStage(null);

  // summary stats
  const totalValue = allLeads.reduce((s, l) => s + (l.value ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Lead Pipeline"
        subtitle={`${allLeads.length} leads · ${formatValue(totalValue) ?? '$0'} total value`}
        actions={
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <RefreshCw size={14} className="animate-spin text-gray-400" />
            )}
            <Button
              variant="secondary" size="sm"
              icon={<List size={14} />}
              onClick={() => router.push('/leads')}
            >
              List View
            </Button>
            <Button
              variant="primary" size="sm"
              icon={<LayoutGrid size={14} />}
              onClick={() => router.push('/leads/new')}
            >
              + New Lead
            </Button>
          </div>
        }
      />

      {/* unstaged warning */}
      {unstagedLeads.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200
                        rounded-lg text-xs text-yellow-700 flex items-center gap-2">
          ⚠️ {unstagedLeads.length} lead(s) have no stage assigned.
          <button
            className="underline hover:text-yellow-900"
            onClick={() => router.push('/leads')}
          >
            View them
          </button>
        </div>
      )}

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}
              className="min-w-[260px] h-96 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div
          className="flex gap-4 overflow-x-auto pb-4 flex-1"
          onDragLeave={handleDragLeave}
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
