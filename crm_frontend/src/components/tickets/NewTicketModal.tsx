"use client";
import React, { useState } from "react";
import { X, Ticket } from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import type { TicketCreatePayload } from "@/types/tickets";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultCustomerId?: string;
  defaultCallId?: string;
}

const INITIAL: TicketCreatePayload = {
  title: "", description: "", priority: "medium",
  ticket_type: "inquiry", category: "", status: "open",
};

export function NewTicketModal({ open, onClose, onCreated, defaultCustomerId, defaultCallId }: Props) {
  const [form, setForm]       = useState<TicketCreatePayload>({ ...INITIAL, customer: defaultCustomerId, call: defaultCallId });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open) return null;

  const set = (key: keyof TicketCreatePayload, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Title is required");
    try {
      setSaving(true); setError(null);
      await ticketsApi.create(form);
      onCreated();
      onClose();
      setForm({ ...INITIAL });
    } catch (err: any) {
      setError(err?.message ?? "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">New Ticket</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="Brief description of the issue"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.ticket_type} onChange={e => set("ticket_type", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="complaint">Complaint</option>
                <option value="request">Request</option>
                <option value="inquiry">Inquiry</option>
                <option value="technical">Technical</option>
                <option value="billing">Billing</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Detailed description..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
