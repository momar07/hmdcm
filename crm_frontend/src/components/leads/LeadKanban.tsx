'use client';
import { useState } from 'react';
import type { Lead, LeadStage } from '@/types/leads';
import LeadScoreBadge from './LeadScoreBadge';

interface Props {
  leads:    Lead[];
  stages:   LeadStage[];
  onMoveStage: (leadId: string, stageId: string) => Promise<void>;
  onLeadClick: (lead: Lead) => void;
}

export default function LeadKanban({ leads, stages, onMoveStage, onLeadClick }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);

  const getLeadsForStage = (stageId: string) =>
    leads.filter(l => l.stage === stageId && l.is_active);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (dragging) {
      await onMoveStage(dragging, stageId);
      setDragging(null);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
      {stages
        .filter(s => !s.is_closed)
        .sort((a, b) => a.order - b.order)
        .map(stage => {
          const stageLeads = getLeadsForStage(stage.id);
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200"
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, stage.id)}
            >
              {/* Stage header */}
              <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-semibold text-sm text-gray-700">
                    {stage.name}
                  </span>
                </div>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  {stageLeads.length}
                </span>
              </div>

              {/* Lead cards */}
              <div className="p-2 flex flex-col gap-2">
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragging(lead.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => onLeadClick(lead)}
                    className={`
                      bg-white rounded-lg border border-gray-200 p-3
                      cursor-pointer shadow-sm hover:shadow-md
                      transition-all duration-150
                      ${dragging === lead.id ? 'opacity-50 scale-95' : ''}
                    `}
                  >
                    {/* Name */}
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {lead.first_name} {lead.last_name}
                    </p>
                    {lead.company && (
                      <p className="text-xs text-gray-500 truncate">{lead.company}</p>
                    )}
                    {/* Phone */}
                    {lead.phone && (
                      <p className="text-xs text-blue-600 mt-1">📞 {lead.phone}</p>
                    )}
                    {/* Value */}
                    {lead.value && (
                      <p className="text-xs text-green-600 mt-1">
                        💰 {Number(lead.value).toLocaleString()} EGP
                      </p>
                    )}
                    {/* Score */}
                    <div className="mt-2">
                      <LeadScoreBadge
                        score={lead.score}
                        classification={lead.classification}
                      />
                    </div>
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">
                    No leads
                  </p>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
