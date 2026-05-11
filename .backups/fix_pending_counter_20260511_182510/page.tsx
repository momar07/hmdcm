"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CheckSquare, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { approvalsApi, type ApprovalRequest } from "@/lib/api/approvals";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { NewApprovalModal } from "@/components/approvals/NewApprovalModal";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/store";
import { subscribeAppSocket } from "@/components/layout/AppSocketProvider";

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
  const [showNewModal, setShowNewModal]   = useState(false);

  const isSupervisor = user?.role === "supervisor" || user?.role === "admin";

  // ── Tab + ID from URL query (Bug #8) ──
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const urlTab       = searchParams.get("tab") as FilterStatus | null;
  const urlId        = searchParams.get("id");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs     = useRef<Record<string, HTMLDivElement | null>>({});

  // When URL params change (user clicks notification → next/navigation updates them),
  // switch the active tab and remember which approval to highlight.
  useEffect(() => {
    if (urlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
    if (urlId) {
      setHighlightId(urlId);
    }
  }, [urlTab, urlId]);

  // After approvals list loads, scroll to the highlighted card and clear URL query
  useEffect(() => {
    if (!highlightId || approvals.length === 0) return;
    const el = cardRefs.current[highlightId];
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      const t = setTimeout(() => {
        setHighlightId(null);
        router.replace(pathname, { scroll: false });
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [highlightId, approvals, pathname, router]);


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

  // Live refetch when a new approval-related notification arrives
  useEffect(() => {
    const unsub = subscribeAppSocket((msg: any) => {
      if (msg?.type !== "notification_new") return;
      // Backend sends the actual notification type under "notif_type"
      const notifType = msg?.notif_type ?? msg?.data?.type;
      if (notifType === "approval_needed" || notifType === "approval_update") {
        fetchApprovals();
        fetchPending();
      }
    });
    return () => { unsub(); };
  }, [fetchApprovals, fetchPending]);

  // Refetch when the user creates a new approval from anywhere in the app
  useEffect(() => {
    const handler = () => { fetchApprovals(); fetchPending(); };
    window.addEventListener('approval:created', handler);
    return () => window.removeEventListener('approval:created', handler);
  }, [fetchApprovals, fetchPending]);

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
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-white
                bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" /> New Request
            </button>
            <button onClick={() => { fetchApprovals(); fetchPending(); }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600
                border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
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
              <div
                key={a.id}
                ref={el => { cardRefs.current[a.id] = el; }}
                className={`transition-all rounded-xl ${
                  highlightId === a.id
                    ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg"
                    : ""
                }`}
              >
                <ApprovalCard
                  approval={a}
                  canReview={isSupervisor}
                  onUpdated={() => { fetchApprovals(); fetchPending(); }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <NewApprovalModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={() => { fetchApprovals(); fetchPending(); }}
      />
    </div>
  );
}
