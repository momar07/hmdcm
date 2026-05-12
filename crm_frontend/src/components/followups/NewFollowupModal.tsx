"use client";
import React, { useState } from "react";
import { X, Calendar, Clock } from "lucide-react";
import { followupsApi } from "@/lib/api/followups";
import toast from "react-hot-toast";

interface Props {
  open:           boolean;
  onClose:        () => void;
  onCreated:      () => void;
  /** Pre-link this follow-up to a specific lead */
  defaultLeadId?: string;
  /** Display name (for header preview only) */
  defaultLeadName?: string;
}

const TYPE_OPTIONS = [
  { value: "call",    label: "📞 Call"    },
  { value: "email",   label: "📧 Email"   },
  { value: "meeting", label: "🤝 Meeting" },
  { value: "sms",     label: "💬 SMS"     },
  { value: "other",   label: "📋 Other"   },
];

function defaultScheduledAt() {
  // Default to 1 hour from now, formatted as `YYYY-MM-DDTHH:mm`
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewFollowupModal({
  open, onClose, onCreated,
  defaultLeadId, defaultLeadName,
}: Props) {
  const [title,        setTitle]        = useState("");
  const [description,  setDescription]  = useState("");
  const [followupType, setFollowupType] = useState("call");
  const [scheduledAt,  setScheduledAt]  = useState(defaultScheduledAt());
  const [saving,       setSaving]       = useState(false);

  if (!open) return null;

  const canSubmit = title.trim().length >= 3 && !!scheduledAt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Convert "YYYY-MM-DDTHH:mm" → ISO 8601 with seconds
      const iso = scheduledAt.length === 16 ? scheduledAt + ":00" : scheduledAt;
      await followupsApi.create({
        title:         title.trim(),
        description:   description.trim(),
        followup_type: followupType,
        scheduled_at:  iso,
        lead_id:       defaultLeadId,
      });
      toast.success("Follow-up scheduled ✅");
      onCreated();
      onClose();
      setTitle(""); setDescription(""); setFollowupType("call");
      setScheduledAt(defaultScheduledAt());
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to schedule follow-up");
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
            <Calendar className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">New Follow-up</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Linked lead badge */}
          {defaultLeadId && defaultLeadName && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
              <span className="text-xs text-purple-700">
                Linked to <span className="font-semibold">{defaultLeadName}</span>
              </span>
            </div>
          )}

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFollowupType(t.value)}
                  className={`px-1 py-2 rounded-lg text-xs font-medium border-2 transition-all text-center
                    ${followupType === t.value
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
              placeholder="e.g. Call back to discuss pricing"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Scheduled at */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Clock className="inline h-3.5 w-3.5 mr-1" />
              Scheduled at <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional details for this follow-up..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

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
              {saving ? "Saving..." : "Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
