"use client";
import React from "react";
import { Search, X } from "lucide-react";
import type { TicketFilters, TicketStatus, TicketPriority } from "@/types/tickets";

interface Props {
  filters: TicketFilters;
  onChange: (key: keyof TicketFilters, value: unknown) => void;
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending",     label: "Pending" },
  { value: "resolved",    label: "Resolved" },
  { value: "closed",      label: "Closed" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function TicketFiltersBar({ filters, onChange }: Props) {
  // status in filters is TicketStatus[] — we use first element for the select
  const statusVal   = Array.isArray(filters.status)   ? filters.status[0]   ?? "" : filters.status   ?? "";
  const priorityVal = Array.isArray(filters.priority) ? filters.priority[0] ?? "" : filters.priority ?? "";
  const hasActive   = statusVal || priorityVal || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white border-b border-gray-200">

      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search tickets..."
          value={filters.search ?? ""}
          onChange={e => onChange("search", e.target.value || undefined)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status */}
      <select
        value={statusVal}
        onChange={e => onChange("status", e.target.value ? [e.target.value as TicketStatus] : undefined)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2
          focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Priority */}
      <select
        value={priorityVal}
        onChange={e => onChange("priority", e.target.value ? [e.target.value as TicketPriority] : undefined)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2
          focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Priorities</option>
        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={() => {
            onChange("status",   undefined);
            onChange("priority", undefined);
            onChange("search",   undefined);
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          <X className="h-4 w-4" /> Clear
        </button>
      )}
    </div>
  );
}
