"use client";
import React, { useState, useEffect } from "react";
import { X, Ticket, Phone, Clock, Radio } from "lucide-react";
import { ticketsApi }   from "@/lib/api/tickets";
import { useCallStore } from "@/store";
import { useSipStore }  from "@/store/sipStore";
import type { TicketCreatePayload, TicketType } from "@/types/tickets";

interface Props {
  open               : boolean;
  onClose            : () => void;
  onCreated          : () => void;
  defaultCustomerId? : string;
  // kept for future recording attachment — pass call DB uuid when available
  defaultCallId?     : string;
}

const TYPE_OPTIONS: { value: TicketType | "technical" | "billing"; label: string }[] = [
  { value: "complaint",  label: "Complaint" },
  { value: "request",    label: "Request" },
  { value: "inquiry",    label: "Inquiry" },
  { value: "technical",  label: "Technical" },
  { value: "billing",    label: "Billing" },
];

export function NewTicketModal({ open, onClose, onCreated, defaultCustomerId, defaultCallId }: Props) {
  const { incomingCall }    = useCallStore();
  const { callStatus }      = useSipStore();

  // Detect if there is an active call right now
  const isCallActive = callStatus === "active" || callStatus === "holding";

  // Build initial form — auto-fill from active call if present
  function buildForm(): TicketCreatePayload {
    const fromCall = isCallActive && incomingCall;
    return {
      title            : "",
      description      : "",
      ticket_type      : "inquiry",
      priority         : "medium",
      source           : fromCall ? "call"   : "manual",
      customer         : defaultCustomerId,
      call             : defaultCallId,
      // call-center fields — filled from store when active
      phone_number     : fromCall ? (incomingCall?.caller      ?? "") : "",
      queue            : fromCall ? (incomingCall?.queue       ?? "") : "",
      asterisk_call_id : fromCall ? (incomingCall?.uniqueid    ?? "") : "",
    };
  }

  const [form,   setForm]   = useState<TicketCreatePayload>(buildForm);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Re-build form every time modal opens
  useEffect(() => {
    if (open) {
      setForm(buildForm());
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const set = (key: keyof TicketCreatePayload, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Title is required");
    try {
      setSaving(true);
      setError(null);
      await ticketsApi.create(form);
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">New Ticket</h2>
            {isCallActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                text-xs font-medium bg-green-100 text-green-700 border border-green-200 animate-pulse">
                <Radio className="h-3 w-3" /> Live Call
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Active Call Banner */}
        {isCallActive && incomingCall && (
          <div className="mx-5 mt-4 p-3 bg-green-50 border border-green-200 rounded-xl space-y-1.5">
            <p className="text-xs font-semibold text-green-700">
              📞 Active call data — auto-linked to this ticket
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-green-800">
              {incomingCall.caller && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {incomingCall.caller}
                </span>
              )}
              {incomingCall.queue && (
                <span>
                  Queue: <strong>{incomingCall.queue}</strong>
                </span>
              )}
              <span>
                Direction: <strong className="capitalize">{incomingCall.direction ?? "inbound"}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date().toLocaleTimeString("en-GB")}
              </span>
              {incomingCall.uniqueid && (
                <span className="col-span-2 font-mono text-[10px] text-green-600 truncate">
                  Asterisk ID: {incomingCall.uniqueid}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Brief description of the issue"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.ticket_type}
                onChange={e => set("ticket_type", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority}
                onChange={e => set("priority", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description ?? ""}
              onChange={e => set("description", e.target.value)}
              rows={3}
              placeholder="Detailed description..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg
                hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
