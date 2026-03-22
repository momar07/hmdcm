"use client";
import React from "react";
import Link from "next/link";
import { Phone, User, Clock, Paperclip, MessageSquare } from "lucide-react";
import { PriorityBadge, StatusBadge } from "./TicketBadge";
import { formatRelativeTime } from "@/lib/helpers/tickets";
import type { Ticket } from "@/types/tickets";

interface Props { ticket: Ticket; }

export function TicketRow({ ticket }: Props) {
  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      {/* ID + Title */}
      <td className="px-4 py-3 max-w-xs">
        <Link href={`/tickets/${ticket.id}`} className="block group-hover:text-blue-600 transition-colors">
          <p className="text-xs text-gray-400 font-mono mb-0.5">#{ticket.ticket_number}</p>
          <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
        </Link>
      </td>

      {/* Customer */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <div>
            <p className="text-sm text-gray-700">{ticket.customer_name ?? "—"}</p>
            {ticket.phone_number && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Phone className="h-3 w-3" /> {ticket.phone_number}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Priority */}
      <td className="px-4 py-3 text-center">
        <PriorityBadge priority={ticket.priority} />
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        <StatusBadge status={ticket.status} />
      </td>

      {/* Agent */}
      <td className="px-4 py-3">
        <p className="text-sm text-gray-600">{ticket.agent_name ?? <span className="text-gray-400 italic">Unassigned</span>}</p>
      </td>

      {/* Meta */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {ticket.note_count > 0 && (
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{ticket.note_count}</span>
          )}
          {ticket.attachment_count > 0 && (
            <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{ticket.attachment_count}</span>
          )}
          {ticket.sla_breached && (
            <span className="text-red-500 font-medium">SLA ⚠</span>
          )}
        </div>
      </td>

      {/* Time */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(ticket.created_at)}
        </div>
      </td>
    </tr>
  );
}
