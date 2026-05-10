"use client";
import React, { useState, useEffect, useCallback } from "react";
import { CheckSquare, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { approvalsApi, type ApprovalRequest } from "@/lib/api/approvals";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { useAuthStore } from "@/store";

type FilterStatus = "" | "pending" | "approved" | "rejected" | "cancelled";

const STATUS_TABS: { label: string; value: FilterStatus; icon: React.ReactNode }[] = [
  { label: "All",       value: "",          icon: <CheckSquare className="h-4 w-4" /> },
  { label: "Pending",   value: "pending",   icon: <Clock       className="h-4 w-4" /> },
  { label: "Approved",  value: "approved",  icon: <CheckCircle className="h-4 w-4" /> },
  { label: "Rejected",  value: "rejected",  icon: <XCircle     className="h-4 w-4" /> },
  { label: "Cancelled", value: "cancelled", icon: <AlertCircle className="h-4 w-4" /> },
];

export default function ApprovalsPage() {
  const { user }                          = useAuthStore();
  const [approvals,    setApprovals]      = useState<ApprovalRequest[]>([]);
  const [loading,      setLoading]        = useState(true);
  const [activeTab,    setActiveTab]      = useState<FilterStatus>("pending");
  const [pendingCount, setPendingCount]   = useState(0);

  const isSupervisor = user?.role === "supervisor" || user?.role === "admin";

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab) params.status = activeTab;
      const res = await approvalsApi.list(params);
      const list = (res.data as any).results ?? res.data ?? [];
      setApprovals(list);
    } catch { setApprovals([]); }
    finally   { setLoading(false); }
  }, [activeTab]);

  const fetchPending = useCallback(async () => {
    try {
      const res = await approvalsApi.pending();
      setPendingCount(res.data.count ?? 0);
    } catch {}
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);
  useEffect(() => { fetchPending();   }, [fetchPending]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <CheckSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Approvals</h1>
              <p className="text-sm text-gray-500">
                {isSupervisor ? "Manage approval requests" : "My approval requests"}
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                {pendingCount} Pending
              </span>
            )}
          </div>
          <button onClick={() => { fetchApprovals(); fetchPending(); }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600
              border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          {STATUS_TABS.map(tab => (
            <button key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3
                text-sm font-medium rounded-lg transition-all
                ${activeTab === tab.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                }`}
            >
              {tab.icon}
              {tab.label}
              {tab.value === "pending" && pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-16">
            <CheckSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No requests found</p>
            <p className="text-sm text-gray-400 mt-1">
              {activeTab === "pending"
                ? "No pending approval requests"
                : "No requests in this category"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {approvals.map(a => (
              <ApprovalCard
                key={a.id}
                approval={a}
                canReview={isSupervisor}
                onUpdated={() => { fetchApprovals(); fetchPending(); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
