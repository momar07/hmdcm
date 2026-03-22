"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Edit2, CheckCircle, XCircle,
  AlertTriangle, MoreVertical, RefreshCw,
} from "lucide-react";
import { StatusBadge, PriorityBadge } from "./TicketBadge";
import type { TicketDetail, TicketUpdatePayload, TicketStatus, TicketPriority } from "@/types/tickets";

interface Props {
  ticket : TicketDetail;
  saving : boolean;
  onUpdate: (payload: TicketUpdatePayload) => Promise<void>;
}

const STATUSES: TicketStatus[]  = ["open", "in_progress", "pending", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

export function TicketDetailHeader({ ticket, saving, onUpdate }: Props) {
  const router  = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-wrap items-center gap-4">

      {/* Back */}
      <button onClick={() => router.push("/tickets")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0">
        <ArrowLeft className="h-4 w-4" /> Tickets
      </button>

      {/* Ticket ID + Title */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-mono">#{ticket.ticket_number}</p>
        <h1 className="text-base font-semibold text-gray-900 truncate">{ticket.title}</h1>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge   status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.sla_breached && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
            font-medium bg-red-100 text-red-700 border border-red-200">
            <AlertTriangle className="h-3 w-3" /> SLA
          </span>
        )}
        {ticket.is_escalated && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
            font-medium bg-orange-100 text-orange-700 border border-orange-200">
            ↑ Escalated
          </span>
        )}
      </div>

      {/* Quick Status Change */}
      <div className="flex items-center gap-2 shrink-0">
        {ticket.status !== "resolved" && ticket.status !== "closed" && (
          <button
            onClick={() => onUpdate({ status: "resolved" })}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700
              bg-green-50 border border-green-200 rounded-lg hover:bg-green-100
              disabled:opacity-50 transition-colors">
            <CheckCircle className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Resolve"}
          </button>
        )}
        {ticket.status !== "closed" && (
          <button
            onClick={() => onUpdate({ status: "closed" })}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600
              bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100
              disabled:opacity-50 transition-colors">
            <XCircle className="h-3.5 w-3.5" /> Close
          </button>
        )}

        {/* More menu */}
        <div className="relative">
          <button onClick={() => setShowMenu(p => !p)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <MoreVertical className="h-4 w-4 text-gray-500" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 w-44 bg-white border border-gray-200
              rounded-xl shadow-lg z-20 py-1" onMouseLeave={() => setShowMenu(false)}>
              {STATUSES.map(s => (
                <button key={s}
                  onClick={() => { onUpdate({ status: s }); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700
                    hover:bg-gray-50 capitalize transition-colors">
                  → {s.replace("_", " ")}
                </button>
              ))}
              <hr className="my-1 border-gray-100" />
              {PRIORITIES.map(p => (
                <button key={p}
                  onClick={() => { onUpdate({ priority: p }); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700
                    hover:bg-gray-50 capitalize transition-colors">
                  ◆ {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
