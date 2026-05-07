"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Ticket, Phone, Clock, Radio, Search, User } from "lucide-react";
import { ticketsApi }    from "@/lib/api/tickets";
import { useCallStore }  from "@/store";
import { useSipStore }   from "@/store/sipStore";
import type { TicketCreatePayload, TicketType } from "@/types/tickets";
import api from "@/lib/api/axios";

interface Props {
  open               : boolean;
  onClose            : () => void;
  onCreated          : () => void;
  defaultLeadId?     : string;
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

export function NewTicketModal({ open, onClose, onCreated, defaultLeadId, defaultCallId }: Props) {
  const { incomingCall }    = useCallStore();
  const { callStatus }      = useSipStore();

  // Detect if there is an active call right now
  const isCallActive = callStatus === "active" || callStatus === "holding";

  // Build initial form — auto-fill from active call if present
  function buildForm(): TicketCreatePayload {
    const fromCall = isCallActive && incomingCall;
    console.log('[NewTicketModal] buildForm:', {
      isCallActive,
      callStatus,
      direction: incomingCall?.direction,
      queue: incomingCall?.queue,
      fromCall: !!fromCall,
    });
    return {
      title            : "",
      description      : "",
      ticket_type      : "inquiry",
      priority         : "medium",
      source           : fromCall ? "call"   : "manual",
      lead             : defaultLeadId,
      call             : defaultCallId,
      // call-center fields — filled from store when active
      phone_number     : fromCall ? (incomingCall?.caller      ?? "") : "",
      queue            : fromCall ? (incomingCall?.queue       ?? "") : "",
      asterisk_call_id : fromCall ? (incomingCall?.uniqueid    ?? "") : "",
      direction        : fromCall ? (incomingCall?.direction   ?? "inbound") : undefined,
    };
  }

  const [form,   setForm]   = useState<TicketCreatePayload>(buildForm);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Lead search
  const [leadSearch,   setLeadSearch]   = useState("");
  const [leadResults,  setLeadResults]  = useState<any[]>([]);
  const [leadLoading,  setLeadLoading]  = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search leads with debounce
  const searchLeads = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setLeadResults([]); setShowDropdown(false); return; }
    searchTimer.current = setTimeout(async () => {
      setLeadLoading(true);
      try {
        const res = await api.get('/leads/', { params: { search: q, page_size: 6 } });
        const list = (res.data as any).results ?? res.data ?? [];
        setLeadResults(list);
        setShowDropdown(list.length > 0);
      } catch { setLeadResults([]); }
      finally { setLeadLoading(false); }
    }, 350);
  }, []);

  // Select lead
  const handleSelectLead = (l: any) => {
    setSelectedLead(l);
    const phone = l.phone ?? "";
    setLeadSearch(l.title ?? `${l.first_name || ''} ${l.last_name || ''}`.trim());
    setShowDropdown(false);
    setForm(prev => ({ ...prev, lead: l.id, phone_number: phone || prev.phone_number }));
  };

  // Clear lead
  const handleClearLead = () => {
    setSelectedLead(null);
    setLeadSearch("");
    setLeadResults([]);
    setForm(prev => ({ ...prev, lead: undefined }));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Re-build form every time modal opens
  useEffect(() => {
    if (!open) return;
    setForm(buildForm());
    setError(null);

    if (defaultLeadId) {
      // Fetch & display the pre-linked lead (so the user SEES it's linked)
      (async () => {
        try {
          const res = await api.get(`/leads/${defaultLeadId}/`);
          const l = (res.data as any) ?? null;
          if (l) {
            setSelectedLead(l);
            setLeadSearch(l.title ?? `${l.first_name || ''} ${l.last_name || ''}`.trim());
          }
        } catch {
          // leave empty – the form.lead is still set, ticket will link correctly
        }
      })();
    } else {
      setSelectedLead(null);
      setLeadSearch("");
      setLeadResults([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultLeadId]);

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

          {/* Lead Search */}
          {!isCallActive && (
            <div ref={dropdownRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-3.5 w-3.5 mr-1" />
                Link to Lead
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  value={leadSearch}
                  onChange={e => { setLeadSearch(e.target.value); searchLeads(e.target.value); setShowDropdown(true); }}
                  onFocus={() => { if (leadResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search by name or phone..."
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {selectedLead && (
                  <button type="button" onClick={handleClearLead}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {leadLoading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Dropdown results */}
              {showDropdown && leadResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {leadResults.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onMouseDown={() => handleSelectLead(l)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {l.title}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {l.phone ?? l.email ?? ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected lead badge */}
              {selectedLead && (
                <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs font-medium text-blue-800 truncate">
                    {selectedLead.title}
                  </span>
                  {selectedLead.phone && (
                    <span className="text-xs text-blue-500">· {selectedLead.phone}</span>
                  )}
                </div>
              )}
            </div>
          )}

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
