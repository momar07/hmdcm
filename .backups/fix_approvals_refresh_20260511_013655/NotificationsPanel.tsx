'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, CheckCheck, Trash2, Phone, ClipboardList, FileText,
  Star, AlertCircle, Calendar, Inbox,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNotificationsStore } from '@/store';
import type { Notification, NotificationType } from '@/lib/api/notifications';

const ICONS: Record<NotificationType, LucideIcon> = {
  task_assigned:     ClipboardList,
  task_reminder:     ClipboardList,
  followup_reminder: Calendar,
  call_incoming:     Phone,
  call_missed:       Phone,
  vip_call:          Star,
  quotation_pending: FileText,
  quotation_update:  FileText,
  approval_needed:   AlertCircle,
  lead_assigned:     Inbox,
  system:            Bell,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  task_assigned:     'text-blue-600 bg-blue-50',
  task_reminder:     'text-blue-600 bg-blue-50',
  followup_reminder: 'text-purple-600 bg-purple-50',
  call_incoming:     'text-green-600 bg-green-50',
  call_missed:       'text-red-600 bg-red-50',
  vip_call:          'text-yellow-600 bg-yellow-50',
  quotation_pending: 'text-orange-600 bg-orange-50',
  quotation_update:  'text-orange-600 bg-orange-50',
  approval_needed:   'text-pink-600 bg-pink-50',
  lead_assigned:     'text-indigo-600 bg-indigo-50',
  system:            'text-gray-600 bg-gray-50',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  onClose: () => void;
}

export function NotificationsPanel({ onClose }: Props) {
  const router = useRouter();
  const ref    = useRef<HTMLDivElement>(null);

  const {
    items, unreadCount, loading,
    fetchAll, markRead, markAllRead, remove,
  } = useNotificationsStore();

  // Initial fetch when panel opens
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.link) {
      router.push(n.link);
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 z-50 w-96 max-h-[32rem]
                 bg-white border border-gray-200 rounded-xl shadow-2xl
                 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-gray-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Inbox size={40} className="mb-2 opacity-50" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          items.map((n) => {
            const Icon  = ICONS[n.type] ?? Bell;
            const color = TYPE_COLORS[n.type] ?? 'text-gray-600 bg-gray-50';
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`group relative flex gap-3 px-4 py-3 border-b
                            cursor-pointer hover:bg-gray-50 transition-colors
                            ${!n.is_read ? 'bg-blue-50/30' : ''}`}
              >
                {/* Unread indicator */}
                {!n.is_read && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2
                                   w-1.5 h-1.5 bg-blue-500 rounded-full" />
                )}

                {/* Icon */}
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center
                                 justify-center ${color}`}>
                  <Icon size={16} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug truncate
                                 ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {timeAgo(n.created_at)}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                  className="shrink-0 opacity-0 group-hover:opacity-100
                             p-1 hover:bg-red-50 rounded transition-opacity"
                  title="Delete"
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-4 py-2 border-t bg-gray-50 text-center">
          <button
            onClick={() => { router.push('/notifications'); onClose(); }}
            className="text-xs text-gray-600 hover:text-gray-800"
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}
