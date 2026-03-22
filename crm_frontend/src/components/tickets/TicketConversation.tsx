"use client";
import React, { useState, useRef, useEffect } from "react";
import { Send, Lock, Globe, Paperclip } from "lucide-react";
import type { TicketNote, NoteVisibility } from "@/types/tickets";

interface Props {
  notes   : TicketNote[];
  onReply : (content: string, visibility: NoteVisibility) => Promise<void>;
}

function Note({ note }: { note: TicketNote }) {
  const isInternal = note.visibility === "internal";
  return (
    <div className={`flex gap-3 ${isInternal ? "opacity-90" : ""}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs
        font-bold shrink-0 mt-0.5
        ${isInternal ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
        {note.author_name?.[0]?.toUpperCase() ?? "?"}
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm
          ${isInternal
            ? "bg-orange-50 border border-orange-200"
            : "bg-gray-50 border border-gray-200"}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-gray-800 text-xs">{note.author_name}</span>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {isInternal
                ? <><Lock className="h-3 w-3 text-orange-400" /> Internal</>
                : <><Globe className="h-3 w-3 text-blue-400" /> Public</>}
            </div>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-1">
          {new Date(note.created_at).toLocaleString("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
          {note.is_first_response && (
            <span className="ml-2 text-green-600 font-medium">✓ First Response</span>
          )}
        </p>
      </div>
    </div>
  );
}

export function TicketConversation({ notes, onReply }: Props) {
  const [content,    setContent]    = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("public");
  const [sending,    setSending]    = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  const handleSend = async () => {
    if (!content.trim() || sending) return;
    try {
      setSending(true);
      await onReply(content.trim(), visibility);
      setContent("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* Notes Thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {notes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No notes yet. Add the first reply below.</p>
          </div>
        ) : (
          notes.map(note => <Note key={note.id} note={note} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply Box */}
      <div className="border-t border-gray-200 p-4 bg-white">
        {/* Visibility Toggle */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setVisibility("public")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium
              transition-colors border
              ${visibility === "public"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "text-gray-500 border-transparent hover:bg-gray-50"}`}>
            <Globe className="h-3 w-3" /> Public Reply
          </button>
          <button
            onClick={() => setVisibility("internal")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium
              transition-colors border
              ${visibility === "internal"
                ? "bg-orange-50 text-orange-700 border-orange-200"
                : "text-gray-500 border-transparent hover:bg-gray-50"}`}>
            <Lock className="h-3 w-3" /> Internal Note
          </button>
        </div>

        {/* Textarea + Send */}
        <div className={`flex gap-2 p-3 rounded-xl border transition-colors
          ${visibility === "internal"
            ? "bg-orange-50 border-orange-200"
            : "bg-gray-50 border-gray-200"}`}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend(); }}
            rows={2}
            placeholder={visibility === "internal"
              ? "Internal note (only visible to agents)…"
              : "Write a reply…"}
            className="flex-1 bg-transparent text-sm text-gray-800 resize-none
              focus:outline-none placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || sending}
            className="self-end flex items-center gap-1.5 px-3 py-2 text-sm font-medium
              text-white bg-blue-600 rounded-lg hover:bg-blue-700
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            {sending ? "…" : <><Send className="h-3.5 w-3.5" /></>}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Ctrl+Enter to send</p>
      </div>

    </div>
  );
}
