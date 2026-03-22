"use client";
import React, { useState } from "react";
import { Plus, RefreshCw, TicketIcon } from "lucide-react";
import { useTickets, useDashboardStats } from "@/hooks/useTickets";
import { TicketStatsCards } from "@/components/tickets/TicketStatsCards";
import { TicketFiltersBar } from "@/components/tickets/TicketFiltersBar";
import { TicketRow } from "@/components/tickets/TicketRow";
import { NewTicketModal } from "@/components/tickets/NewTicketModal";
import type { TicketStatus } from "@/types/tickets";

const STATUS_TABS: { label: string; value: TicketStatus | "" }[] = [
  { label: "All",         value: "" },
  { label: "Open",        value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Pending",     value: "pending" },
  { label: "Resolved",    value: "resolved" },
  { label: "Closed",      value: "closed" },
];

export default function TicketsPage() {
  const [showModal, setShowModal]   = useState(false);
  const [activeTab, setActiveTab]   = useState<TicketStatus | "">("");
  const { tickets, loading, error, total, filters, updateFilter, refetch } = useTickets();
  const { stats, loading: statsLoading } = useDashboardStats();

  const handleTabChange = (tab: TicketStatus | "") => {
    setActiveTab(tab);
    updateFilter("status", tab || undefined);
  };

  const totalPages = Math.ceil(total / (filters.page_size ?? 20));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <TicketIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Tickets</h1>
              <p className="text-sm text-gray-500">{total} total tickets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refetch}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> New Ticket
            </button>
          </div>
        </div>

        {/* Stats */}
        <TicketStatsCards stats={stats} loading={statsLoading} />

        {/* Main Table Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Status Tabs */}
          <div className="flex overflow-x-auto border-b border-gray-200">
            {STATUS_TABS.map(tab => (
              <button key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.value
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <TicketFiltersBar filters={filters} onChange={updateFilter} />

          {/* Table */}
          {error ? (
            <div className="p-8 text-center">
              <p className="text-red-600 text-sm">{error}</p>
              <button onClick={refetch} className="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
            </div>
          ) : loading ? (
            <div className="divide-y divide-gray-100">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="px-4 py-3 flex gap-4">
                  <div className="h-4 bg-gray-100 rounded w-1/4 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-1/5 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-16 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-20 animate-pulse" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-16 text-center">
              <TicketIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No tickets found</p>
              <p className="text-sm text-gray-400 mt-1">Try changing your filters or create a new ticket.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Ticket", "Customer", "Priority", "Status", "Agent", "Meta", "Created"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets.map(ticket => <TicketRow key={ticket.id} ticket={ticket} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing {((filters.page ?? 1) - 1) * (filters.page_size ?? 20) + 1}–
                {Math.min((filters.page ?? 1) * (filters.page_size ?? 20), total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => updateFilter("page", (filters.page ?? 1) - 1)}
                  disabled={(filters.page ?? 1) <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >← Prev</button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {filters.page ?? 1} / {totalPages}
                </span>
                <button
                  onClick={() => updateFilter("page", (filters.page ?? 1) + 1)}
                  disabled={(filters.page ?? 1) >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      <NewTicketModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => { setShowModal(false); refetch(); }}
      />
    </div>
  );
}
