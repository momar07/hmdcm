"use client";
import React from "react";
import { Paperclip, FileText, Image, Mic, Download, ExternalLink } from "lucide-react";
import type { TicketAttachment } from "@/types/tickets";

interface Props { attachments: TicketAttachment[]; }

const TYPE_ICON = {
  file:           FileText,
  image:          Image,
  call_recording: Mic,
};

export function TicketAttachments({ attachments }: Props) {
  if (!attachments?.length) return (
    <div className="p-8 text-center text-sm text-gray-400">
      <Paperclip className="h-8 w-8 text-gray-300 mx-auto mb-2" />
      No attachments yet.
    </div>
  );

  return (
    <div className="p-5">
      <div className="grid gap-3">
        {attachments.map(att => {
          const Icon = TYPE_ICON[att.attachment_type] ?? FileText;
          return (
            <div key={att.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl
                border border-gray-200 hover:border-blue-300 transition-colors">
              <div className={`p-2 rounded-lg shrink-0
                ${att.attachment_type === "call_recording"
                  ? "bg-purple-100 text-purple-600"
                  : att.attachment_type === "image"
                    ? "bg-green-100 text-green-600"
                    : "bg-blue-100 text-blue-600"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{att.file_name}</p>
                <p className="text-xs text-gray-400">
                  {att.file_size_kb} • {att.uploaded_by_name} •{" "}
                  {new Date(att.created_at).toLocaleDateString("en-GB")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a href={att.file_path} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600
                    hover:bg-blue-50 transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a href={att.file_path} download
                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600
                    hover:bg-green-50 transition-colors">
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
