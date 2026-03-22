"use client";
import React from "react";
import { User, Phone, Calendar, Clock, Tag as TagIcon, Layers } from "lucide-react";
import type { TicketDetail } from "@/types/tickets";

interface Props { ticket: TicketDetail; }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  );
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function TicketInfoPanel({ ticket }: Props) {
  return (
    <aside className="w-72 shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-5 space-y-5">

        {/* Customer */}
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Customer</p>
          <div className="space-y-3">
            <Row label="Name">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-gray-400" />
                {ticket.customer_name || <span className="text-gray-400 italic">Unknown</span>}
              </span>
            </Row>
            {ticket.phone_number && (
              <Row label="Phone">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono">{ticket.phone_number}</span>
                </span>
              </Row>
            )}
            {ticket.customer_email && (
              <Row label="Email">
                <span className="text-blue-600 text-xs break-all">{ticket.customer_email}</span>
              </Row>
            )}
          </div>
        </section>

        <hr className="border-gray-100" />

        {/* Assignment */}
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assignment</p>
          <div className="space-y-3">
            <Row label="Agent">
              {ticket.agent_name || <span className="text-gray-400 italic">Unassigned</span>}
            </Row>
            <Row label="Queue">
              {ticket.queue || <span className="text-gray-400 italic">—</span>}
            </Row>
            <Row label="Source">
              <span className="capitalize">{ticket.source}</span>
            </Row>
            {ticket.phone_number && (
              <Row label="Caller Number">
                <span className="font-mono flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  {ticket.phone_number}
                </span>
              </Row>
            )}
            {ticket.asterisk_call_id && (
              <Row label="Call ID">
                <span className="font-mono text-xs text-gray-500 break-all">
                  {ticket.asterisk_call_id}
                </span>
              </Row>
            )}
            {ticket.direction && (
              <Row label="Direction">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                  text-xs font-medium border
                  ${ticket.direction === 'inbound'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : ticket.direction === 'outbound'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {ticket.direction === 'inbound'  ? '📲 Inbound'  :
                   ticket.direction === 'outbound' ? '📤 Outbound' : '🔄 Internal'}
                </span>
              </Row>
            )}
            <Row label="Category">
              {ticket.category || <span className="text-gray-400 italic">—</span>}
            </Row>
          </div>
        </section>

        <hr className="border-gray-100" />

        {/* SLA */}
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">SLA</p>
          <div className="space-y-3">
            <Row label="Resolution Deadline">
              <span className={ticket.sla_breached ? "text-red-600 font-medium" : ""}>
                {fmt(ticket.resolution_deadline)}
              </span>
            </Row>
            <Row label="First Response">
              <span className={ticket.sla_response_breached ? "text-red-600 font-medium" : ""}>
                {fmt(ticket.response_time_deadline)}
              </span>
            </Row>
            {ticket.sla_remaining_mins !== null && (
              <Row label="Time Remaining">
                <span className={ticket.sla_remaining_mins <= 0 ? "text-red-600 font-medium" : "text-green-600"}>
                  {ticket.sla_remaining_mins <= 0
                    ? `Overdue by ${Math.abs(ticket.sla_remaining_mins)}m`
                    : `${ticket.sla_remaining_mins}m left`}
                </span>
              </Row>
            )}
          </div>
        </section>

        <hr className="border-gray-100" />

        {/* Dates */}
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Timeline</p>
          <div className="space-y-3">
            <Row label="Created">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                {fmt(ticket.created_at)}
              </span>
            </Row>
            <Row label="Updated">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {fmt(ticket.updated_at)}
              </span>
            </Row>
            {ticket.resolved_at && (
              <Row label="Resolved">{fmt(ticket.resolved_at)}</Row>
            )}
            {ticket.closed_at && (
              <Row label="Closed">{fmt(ticket.closed_at)}</Row>
            )}
          </div>
        </section>

        {/* Tags */}
        {ticket.tags?.length > 0 && (
          <>
            <hr className="border-gray-100" />
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map(tag => (
                  <span key={tag.id}
                    style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                      font-medium border">
                    <TagIcon className="h-2.5 w-2.5" />
                    {tag.name}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

      </div>
    </aside>
  );
}
