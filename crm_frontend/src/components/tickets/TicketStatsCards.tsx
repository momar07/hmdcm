"use client";
import React from "react";
import { Ticket, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import type { TicketStats } from "@/types/tickets";

interface StatsProps {
  stats  : TicketStats | null;
  loading: boolean;
}

export function TicketStatsCards({ stats, loading }: StatsProps) {
  const open     = stats?.total_open        ?? 0;
  const progress = stats?.total_in_progress ?? 0;
  const breached = stats?.total_breached    ?? 0;
  const resolved = stats?.total_resolved    ?? 0;
  const total    = open + progress + (stats?.total_pending ?? 0) + resolved + (stats?.total_closed ?? 0);

  const cards = [
    { label: "Total Tickets",  value: total,    icon: Ticket,        color: "text-blue-600   bg-blue-50",   border: "border-blue-200"  },
    { label: "Open",           value: open,     icon: Clock,         color: "text-yellow-600 bg-yellow-50", border: "border-yellow-200"},
    { label: "SLA Breached",   value: breached, icon: AlertTriangle, color: "text-red-600    bg-red-50",    border: "border-red-200"   },
    { label: "Resolved",       value: resolved, icon: CheckCircle,   color: "text-green-600  bg-green-50",  border: "border-green-200" },
  ];

  if (loading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ label, value, icon: Icon, color, border }) => (
        <div key={label} className={`bg-white rounded-xl border ${border} p-4 flex items-center gap-3`}>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
