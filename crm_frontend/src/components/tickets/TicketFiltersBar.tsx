"use client";
import React from "react";
import { Search, Filter, X } from "lucide-react";
import type { TicketFilters, TicketStatus, TicketPriority } from "@/types/tickets";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/helpers/tickets";

interface Props {
  filters: TicketFilters;
  onChange: (key: keyof TicketFilters, value: any) => void;
}

const STATUSES  = ["open", "in_progress", "pending", "resolved", "closed"] as TicketStatus[];
const PRIORITIES = ["low", "medium", "high", "urgent"] as TicketPriority[];

export function TicketFiltersBar({ filters, onChange }: Props) {
  const hasActive = filters.status || filters.priority || filters.search;

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
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status */}
      <select
        value={filters.status ?? ""}
        onChange={e => onChange("status", e.target.value || undefined)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Statuses</option>
        {STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={filters.priority ?? ""}
        onChange={e => onChange("priority", e.target.value || undefined)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Priorities</option>
        {PRIORITIES.map(p => (
          <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
        ))}
      </select>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={() => { onChange("status", undefined); onChange("priority", undefined); onChange("search", undefined); }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          <X className="h-4 w-4" /> Clear
        </button>
      )}
    </div>
  );
}
