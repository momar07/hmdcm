"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquare, History, Paperclip, AlertCircle, Loader2 } from "lucide-react";
import { useTicketDetail } from "@/hooks/useTicketDetail";
import { TicketDetailHeader } from "@/components/tickets/TicketDetailHeader";
import { TicketInfoPanel }    from "@/components/tickets/TicketInfoPanel";
import { TicketConversation } from "@/components/tickets/TicketConversation";
import { TicketHistoryLog }   from "@/components/tickets/TicketHistoryLog";
import { TicketAttachments }  from "@/components/tickets/TicketAttachments";
import type { NoteVisibility } from "@/types/tickets";

type Tab = "conversation" | "history" | "attachments";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "conversation", label: "Conversation", icon: MessageSquare },
  { id: "history",      label: "History",      icon: History },
  { id: "attachments",  label: "Attachments",  icon: Paperclip },
];

export default function TicketDetailPage() {
  const params = useParams();
  const id     = params?.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("conversation");
  const { ticket, loading, error, saving, refetch, update, addNote } = useTicketDetail(id);

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading ticket…</p>
      </div>
    </div>
  );

  /* ── Error ── */
  if (error || !ticket) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-base font-medium text-gray-700">Failed to load ticket</p>
        <p className="text-sm text-gray-400 mt-1">{error}</p>
        <button onClick={refetch}
          className="mt-4 px-4 py-2 text-sm text-blue-600 border border-blue-300
            rounded-lg hover:bg-blue-50 transition-colors">
          Try Again
        </button>
      </div>
    </div>
  );

  const handleReply = async (content: string, visibility: NoteVisibility) => {
    await addNote(content, visibility);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <TicketDetailHeader ticket={ticket} saving={saving} onUpdate={update} />

      {/* Body: main + sidebar */}
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 73px)" }}>

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4 shrink-0">
            {TABS.map(tab => {
              const count =
                tab.id === "conversation"  ? ticket.note_count       :
                tab.id === "attachments"   ? ticket.attachment_count  : null;
              return (
                <button key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium
                    border-b-2 transition-colors
                    ${activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "conversation" && (
              <TicketConversation
                notes={ticket.notes ?? []}
                onReply={handleReply}
              />
            )}
            {activeTab === "history" && (
              <div className="h-full overflow-y-auto">
                <TicketHistoryLog history={ticket.history ?? []} />
              </div>
            )}
            {activeTab === "attachments" && (
              <div className="h-full overflow-y-auto">
                <TicketAttachments attachments={ticket.attachments ?? []} />
              </div>
            )}
          </div>
        </main>

        {/* ── Right Info Sidebar ── */}
        <TicketInfoPanel ticket={ticket} />

      </div>
    </div>
  );
}
