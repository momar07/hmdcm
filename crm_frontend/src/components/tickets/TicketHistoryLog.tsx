"use client";
import React from "react";
import type { TicketHistory } from "@/types/tickets";

interface Props { history: TicketHistory[]; }

function fmt(d: string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const FIELD_LABELS: Record<string, string> = {
  status: "Status", priority: "Priority", agent: "Agent",
  title: "Title", category: "Category", ticket_type: "Type",
  is_escalated: "Escalation", sla_policy: "SLA Policy",
};

export function TicketHistoryLog({ history }: Props) {
  if (!history?.length) return (
    <div className="p-8 text-center text-sm text-gray-400">No history yet.</div>
  );

  return (
    <div className="p-5">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200" />

        <div className="space-y-4">
          {history.map((h, idx) => (
            <div key={h.id ?? idx} className="flex gap-4 relative">
              {/* Dot */}
              <div className="w-7 h-7 rounded-full bg-white border-2 border-gray-300
                flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{h.actor_name}</span>
                  {" "}changed{" "}
                  <span className="font-medium">{FIELD_LABELS[h.field] ?? h.field}</span>
                  {h.old_value && (
                    <> from <span className="line-through text-gray-400">{h.old_value}</span></>
                  )}
                  {h.new_value && (
                    <> to <span className="text-blue-600 font-medium">{h.new_value}</span></>
                  )}
                </p>
                {h.note && <p className="text-xs text-gray-400 mt-0.5 italic">{h.note}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{fmt(h.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
