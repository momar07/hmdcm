"use client";
import React from "react";
import Link from "next/link";
import { Phone, User, Clock, Paperclip, MessageSquare, AlertTriangle } from "lucide-react";
import { PriorityBadge, StatusBadge } from "./TicketBadge";
import type { TicketListItem } from "@/types/tickets";

interface Props { ticket: TicketListItem; }

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)      return "just now";
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function TicketRow({ ticket }: Props) {
  return (
    <tr className="hover:bg-gray-50 transition-colors group">

      {/* ID + Title */}
      <td className="px-4 py-3 max-w-xs">
        <Link href={`/tickets/${ticket.id}`}
          className="block group-hover:text-blue-600 transition-colors">
          <p className="text-xs text-gray-400 font-mono mb-0.5">#{ticket.ticket_number}</p>
          <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
        </Link>
      </td>

      {/* Customer */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <div>
            <p className="text-sm text-gray-700">
              {ticket.customer_name || <span className="text-gray-400 italic">Unknown</span>}
            </p>
            {ticket.phone_number && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Phone className="h-3 w-3" />{ticket.phone_number}
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
        <p className="text-sm text-gray-600">
          {ticket.agent_name || <span className="text-gray-400 italic text-xs">Unassigned</span>}
        </p>
      </td>

      {/* Meta */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {ticket.note_count > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />{ticket.note_count}
            </span>
          )}
          {ticket.attachment_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />{ticket.attachment_count}
            </span>
          )}
          {ticket.sla_breached && (
            <span className="flex items-center gap-0.5 text-red-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> SLA
            </span>
          )}
        </div>
      </td>

      {/* Time */}
      <td className="px-4 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {relativeTime(ticket.created_at)}
        </span>
      </td>

    </tr>
  );
}
