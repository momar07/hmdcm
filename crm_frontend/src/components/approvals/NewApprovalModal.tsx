"use client";
import React, { useState } from "react";
import { X, CheckSquare, DollarSign } from "lucide-react";
import { approvalsApi } from "@/lib/api/approvals";
import toast from "react-hot-toast";

interface Props {
  open:             boolean;
  onClose:          () => void;
  onCreated:        () => void;
  defaultTicketId?: string;
  defaultCustomerId?: string;
}

const TYPE_OPTIONS = [
  { value: "refund",    label: "💰 Refund",     hasAmount: true  },
  { value: "discount",  label: "🏷️ Discount",   hasAmount: true  },
  { value: "exception", label: "⚠️ Exception",  hasAmount: false },
  { value: "leave",     label: "🏖️ Leave",      hasAmount: false },
  { value: "other",     label: "📋 Other",       hasAmount: false },
];

export function NewApprovalModal({
  open, onClose, onCreated, defaultTicketId, defaultCustomerId,
}: Props) {
  const [type,        setType]        = useState("other");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [amount,      setAmount]      = useState("");
  const [saving,      setSaving]      = useState(false);

  if (!open) return null;

  const selectedType = TYPE_OPTIONS.find(t => t.value === type);
  const canSubmit    = title.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await approvalsApi.create({
        approval_type: type,
        title:         title.trim(),
        description:   description.trim(),
        amount:        selectedType?.hasAmount && amount ? parseFloat(amount) : null,
        ticket:        defaultTicketId   ?? null,
        customer:      defaultCustomerId ?? null,
      });
      toast.success("Approval request sent ✅");
      onCreated();
      onClose();
      setTitle(""); setDescription(""); setAmount(""); setType("other");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to send request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">New Approval Request</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Request Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`px-2 py-2.5 rounded-xl text-xs font-medium border-2 transition-all text-center
                    ${type === t.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Brief description of your request"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Amount — only for refund/discount */}
          {selectedType?.hasAmount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="inline h-3.5 w-3.5 mr-1" />
                Amount (EGP)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Explain why you need this approval..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Linked ticket badge */}
          {defaultTicketId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
              <CheckSquare className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-purple-700 font-medium">
                Linked to ticket
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-300
                rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || saving}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600
                rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Sending..." : "Send Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
