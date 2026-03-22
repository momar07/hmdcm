import React from "react";
import type { TicketPriority, TicketStatus } from "@/types/tickets";

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high:   "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-purple-100 text-purple-700 border-purple-200",
  pending:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  resolved:    "bg-green-100 text-green-700 border-green-200",
  closed:      "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open", in_progress: "In Progress", pending: "Pending",
  resolved: "Resolved", closed: "Closed",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const isUrgent = priority === "urgent";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
      ${PRIORITY_COLORS[priority]} ${isUrgent ? "animate-pulse" : ""}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
      ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
