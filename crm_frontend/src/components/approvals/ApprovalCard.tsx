"use client";
import React, { useState } from "react";
import { CheckCircle, XCircle, Clock, User, Ticket, DollarSign } from "lucide-react";
import { approvalsApi, type ApprovalRequest } from "@/lib/api/approvals";
import toast from "react-hot-toast";
import { LinkedCallCard } from '@/components/calls/LinkedCallCard';

const TYPE_LABELS: Record<string, string> = {
  refund:    "💰 Refund",
  discount:  "🏷️ Discount",
  exception: "⚠️ Exception",
  leave:     "🏖️ Leave",
  other:     "📋 Other",
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-green-100  text-green-700",
  rejected:  "bg-red-100    text-red-700",
  cancelled: "bg-gray-100   text-gray-500",
};

interface Props {
  approval:  ApprovalRequest;
  canReview: boolean;
  onUpdated: () => void;
}

export function ApprovalCard({ approval, canReview, onUpdated }: Props) {
  const [comment,    setComment]    = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading,    setLoading]    = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approvalsApi.approve(approval.id, comment);
      onUpdated();
    } catch { toast.error("Failed to approve"); }
    finally  { setLoading(false); }
  };

  const handleReject = async () => {
    if (!comment.trim()) { toast.error("Please add a rejection reason"); return; }
    setLoading(true);
    try {
      await approvalsApi.reject(approval.id, comment);
      onUpdated();
    } catch { toast.error("Failed to reject"); }
    finally  { setLoading(false); }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60)   return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-sm">

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">
              {TYPE_LABELS[approval.approval_type] ?? approval.approval_type}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[approval.status]}`}>
              {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
            </span>
            {approval.amount && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                <DollarSign className="h-3 w-3" />
                {parseFloat(approval.amount).toLocaleString()} EGP
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{approval.title}</p>
        </div>
        <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(approval.created_at)}
        </span>
      </div>

      {/* Description */}
      {approval.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{approval.description}</p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1 text-gray-500">
          <User className="h-3 w-3" />
          {approval.requested_by_name}
        </span>
        {approval.lead_name && (
          <a
            href={approval.lead ? `/leads/${approval.lead}` : '#'}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-purple-50 text-purple-700 font-semibold border border-purple-200
                       hover:bg-purple-100 transition-colors"
            title="Linked Lead">
            <User className="h-3 w-3" />
            {approval.lead_name}
            {approval.lead_phone && (
              <span className="text-purple-500 font-normal">· {approval.lead_phone}</span>
            )}
          </a>
        )}
        {approval.ticket_number && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full
                           bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            <Ticket className="h-3 w-3" />
            #{approval.ticket_number}
          </span>
        )}
        {approval.call && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full
                           bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200"
                title="Created during this call">
            📞 During call
          </span>
        )}
      </div>

      {/* Review comment (if reviewed) */}
      {approval.review_comment && (
        <div className={`px-3 py-2 rounded-lg text-xs ${
          approval.status === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          <span className="font-semibold">{approval.reviewed_by_name}: </span>
          {approval.review_comment}
        </div>
      )}

      {/* Action buttons — only for pending + supervisor */}
      {canReview && approval.status === "pending" && (
        <div className="space-y-2 pt-1">
          {showReject ? (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Rejection reason (required)..."
                rows={2}
                className="w-full text-xs border border-red-200 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(false)}
                  className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  Back
                </button>
                <button onClick={handleReject} disabled={loading}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-red-500
                    rounded-lg hover:bg-red-600 disabled:opacity-50">
                  {loading ? "Rejecting..." : "Confirm Reject"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional comment for approval..."
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs
                    font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button onClick={handleApprove} disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs
                    font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700
                    disabled:opacity-50">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {loading ? "..." : "Approve"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
          <LinkedCallCard
        call={(approval as any).call_detail}
        creationReason={(approval as any).creation_reason}
      />
      </div>
  );
}
