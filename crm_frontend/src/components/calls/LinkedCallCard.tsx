"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, PhoneIncoming, PhoneOutgoing, Clock, User as UserIcon,
  PlayCircle, ExternalLink, MessageSquare, Lock,
} from 'lucide-react';
import type { CallDetail } from '@/types/calls';

interface Props {
  call: CallDetail | null | undefined;
  /** Free-text reason the linked entity was created (e.g. "Customer requested discount") */
  creationReason?: string;
  /** Optional context label shown in the header */
  label?: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LinkedCallCard({ call, creationReason, label = 'Linked Call' }: Props) {
  const router = useRouter();
  const [showPlayer, setShowPlayer] = useState(false);

  if (!call) return null;

  const isInbound = call.direction === 'inbound';
  const DirIcon   = isInbound ? PhoneIncoming : PhoneOutgoing;
  const dirColor  = isInbound ? 'text-blue-600' : 'text-green-600';

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 my-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <Phone className="h-4 w-4 text-purple-700" />
          </div>
          <div>
            <p className="text-xs font-semibold text-purple-900 uppercase tracking-wider">{label}</p>
            <p className="text-xs text-gray-500">{fmtDate(call.started_at)}</p>
          </div>
        </div>
        <button
          onClick={() => router.push(`/calls/${call.id}`)}
          className="text-xs text-purple-700 hover:text-purple-900 flex items-center gap-1
                     px-2 py-1 rounded-md hover:bg-purple-100 transition"
          title="Open call details"
        >
          Open <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="flex items-center gap-1.5 text-gray-700">
          <DirIcon className={`h-3.5 w-3.5 ${dirColor}`} />
          <span className="font-mono">{isInbound ? call.caller_number : call.callee_number || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-700">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <span>{fmtDuration(call.duration)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-700">
          <UserIcon className="h-3.5 w-3.5 text-gray-400" />
          <span>{call.agent_name || 'No agent'}</span>
        </div>
        {call.disposition_name && (
          <div>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: (call.disposition_color || '#6b7280') + '20',
                borderColor:     call.disposition_color || '#6b7280',
                color:           call.disposition_color || '#6b7280',
              }}
            >
              {call.disposition_name}
            </span>
          </div>
        )}
      </div>

      {/* Customer request (from call note) */}
      {call.completion_note && (
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 mb-2">
          <div className="flex items-start gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-0.5">
                Customer request (call note)
              </p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{call.completion_note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Reason / action taken */}
      {creationReason && (
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 mb-2">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">
            Reason / action taken
          </p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{creationReason}</p>
        </div>
      )}

      {/* Recording (supervisor only) */}
      <div className="mt-2">
        {call.can_listen && call.recording_url ? (
          showPlayer ? (
            <div className="bg-white border border-purple-200 rounded-lg p-2">
              <audio
                controls
                autoPlay
                src={call.recording_url}
                className="w-full h-8"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowPlayer(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                         bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition"
            >
              <PlayCircle className="h-4 w-4" />
              Play recording
            </button>
          )
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 italic py-1">
            <Lock className="h-3 w-3" />
            Recording available to supervisors only
          </div>
        )}
      </div>
    </div>
  );
}
