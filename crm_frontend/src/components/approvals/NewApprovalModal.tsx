"use client";
import React, { useState, useEffect, useRef } from "react";
import { X, CheckSquare, DollarSign, Search, User, Phone, Loader2 } from "lucide-react";
import { approvalsApi } from "@/lib/api/approvals";
import { leadsApi }     from "@/lib/api/leads";
import toast            from "react-hot-toast";

interface LeadOption {
  id:        string;
  full_name: string;
  phone?:    string;
  company?:  string;
}

interface Props {
  open:             boolean;
  onClose:          () => void;
  onCreated:        () => void;
  defaultTicketId?: string;
  /** Pre-select this lead and lock it (used from /leads/[id]) */
  defaultLeadId?:   string;
  /** Display name for the pre-selected lead (avoids extra fetch) */
  defaultLeadName?: string;
}

const TYPE_OPTIONS = [
  { value: "refund",    label: "💰 Refund",     hasAmount: true  },
  { value: "discount",  label: "🏷️ Discount",   hasAmount: true  },
  { value: "exception", label: "⚠️ Exception",  hasAmount: false },
  { value: "leave",     label: "🏖️ Leave",      hasAmount: false },
  { value: "other",     label: "📋 Other",       hasAmount: false },
];

export function NewApprovalModal({
  open, onClose, onCreated,
  defaultTicketId,
  defaultLeadId, defaultLeadName,
}: Props) {
  const [type,        setType]        = useState("other");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [amount,      setAmount]      = useState("");
  const [saving,      setSaving]      = useState(false);

  // ── Lead search state ───────────────────────────────────────────
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(
    defaultLeadId
      ? { id: defaultLeadId, full_name: defaultLeadName || 'Loading…' }
      : null
  );
  const [search,      setSearch]      = useState("");
  const [results,     setResults]     = useState<LeadOption[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [dropdownOpen,setDropdownOpen]= useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Re-sync selected lead if defaultLeadId changes between opens
  useEffect(() => {
    if (defaultLeadId) {
      setSelectedLead({
        id: defaultLeadId,
        full_name: defaultLeadName || 'Loading…',
      });
    }
  }, [defaultLeadId, defaultLeadName]);

  // Debounced search (300ms)
  useEffect(() => {
    if (!dropdownOpen) return;
    if (!search.trim() || search.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await leadsApi.list({ search: search.trim(), page_size: 10 });
        const data = (r as any)?.data ?? r;
        const list = Array.isArray(data) ? data : (data?.results ?? []);
        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, dropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  if (!open) return null;

  const selectedType = TYPE_OPTIONS.find(t => t.value === type);
  const canSubmit    = title.trim().length >= 3;
  const leadLocked   = !!defaultLeadId;

  const handlePickLead = (lead: LeadOption) => {
    setSelectedLead(lead);
    setSearch("");
    setResults([]);
    setDropdownOpen(false);
  };

  const handleClearLead = () => {
    if (leadLocked) return;
    setSelectedLead(null);
  };

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
        lead:          selectedLead?.id  ?? null,
      });
      try { window.dispatchEvent(new CustomEvent("approval:created")); } catch {}

      toast.success("Approval request sent ✅");
      onCreated();
      onClose();
      // Reset form (but keep lead if it was locked from parent)
      setTitle(""); setDescription(""); setAmount(""); setType("other");
      if (!leadLocked) setSelectedLead(null);
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

          {/* Linked Lead — search */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linked Lead {leadLocked && <span className="text-xs text-gray-400 font-normal">(locked)</span>}
            </label>

            {selectedLead ? (
              <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2
                              ${leadLocked
                                ? 'bg-purple-50 border-purple-200'
                                : 'bg-purple-50 border-purple-300'}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="h-4 w-4 text-purple-600 shrink-0"/>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-purple-900 truncate">
                      {selectedLead.full_name}
                    </p>
                    {selectedLead.phone && (
                      <p className="text-xs text-purple-600 flex items-center gap-1">
                        <Phone className="h-3 w-3"/> {selectedLead.phone}
                      </p>
                    )}
                  </div>
                </div>
                {!leadLocked && (
                  <button type="button" onClick={handleClearLead}
                    className="p-1 rounded hover:bg-purple-100 shrink-0">
                    <X className="h-4 w-4 text-purple-600"/>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search lead by name or phone…"
                    className="w-full text-sm border border-gray-300 rounded-lg pl-8 pr-3 py-2
                      focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  {searching && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 animate-spin"/>
                  )}
                </div>

                {dropdownOpen && search.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg
                                  shadow-lg max-h-64 overflow-y-auto">
                    {searching && results.length === 0 && (
                      <div className="p-3 text-center text-xs text-gray-400">Searching…</div>
                    )}
                    {!searching && results.length === 0 && (
                      <div className="p-3 text-center text-xs text-gray-400">
                        No leads match "{search}"
                      </div>
                    )}
                    {results.map(lead => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => handlePickLead(lead)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left
                                   hover:bg-purple-50 border-b border-gray-50 last:border-0 transition-colors">
                        <User className="h-4 w-4 text-gray-400 shrink-0"/>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {lead.full_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {lead.phone || '—'}
                            {lead.company && ` · ${lead.company}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {dropdownOpen && search.trim().length < 2 && search.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">Type at least 2 characters…</p>
                )}
              </>
            )}
          </div>

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
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <CheckSquare className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-blue-700 font-medium">
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
