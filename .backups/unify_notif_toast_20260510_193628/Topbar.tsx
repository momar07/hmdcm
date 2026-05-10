'use client';

import { useEffect, useState } from 'react';
import { Bell, PhoneCall, CheckSquare } from 'lucide-react';
import { useAuthStore, useAgentStatusStore, useNotificationsStore } from '@/store';
import { AgentStatusDropdown }     from './AgentStatusDropdown';
import { NotificationsPanel }      from './NotificationsPanel';
import { NewApprovalModal }        from '@/components/approvals/NewApprovalModal';
import { subscribeAppSocket }      from './AppSocketProvider';
import type { AgentStatus }        from '@/types';
import type { Notification }       from '@/lib/api/notifications';

const ROLE_COLORS: Record<string, string> = {
  admin:      'bg-purple-600',
  supervisor: 'bg-blue-600',
  agent:      'bg-green-600',
  qa:         'bg-yellow-600',
};

const STATUS_DOT: Record<AgentStatus, string> = {
  available: 'bg-green-400',
  on_call:   'bg-blue-400',
  busy:      'bg-orange-400',
  away:      'bg-yellow-400',
  offline:   'bg-gray-400',
};

export function Topbar() {
  const { user }   = useAuthStore();
  const { status } = useAgentStatusStore();
  const [showApproval, setShowApproval] = useState(false);

  const {
    unreadCount, open, toggleOpen, setOpen,
    fetchUnreadCount, addRealtime,
  } = useNotificationsStore();

  // 1) Initial unread count + polling fallback every 60s
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(t);
  }, [user, fetchUnreadCount]);

  // 2) Realtime: subscribe to the singleton WS bus for notification_new
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAppSocket((msg) => {
      if (msg?.event === 'notification_new') {
        const n: Notification = {
          id:         msg.id,
          type:       msg.notif_type,
          title:      msg.title,
          body:       msg.body ?? '',
          data:       msg.data ?? {},
          link:       msg.link ?? '',
          priority:   msg.priority ?? 'normal',
          is_read:    msg.is_read ?? false,
          read_at:    null,
          created_at: msg.created_at ?? new Date().toISOString(),
        };
        addRealtime(n);

        if (
          typeof window !== 'undefined'
          && 'Notification' in window
          && document.visibilityState !== 'visible'
          && Notification.permission === 'granted'
        ) {
          try { new Notification(n.title, { body: n.body, tag: n.id }); }
          catch { /* ignore */ }
        }
      }
    });
    return unsub;
  }, [user, addRealtime]);

  // 3) Request browser notification permission once
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* ignore */ });
    }
  }, []);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center
                       justify-between px-6 shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2 text-gray-600">
        <PhoneCall size={18} className="text-blue-600" />
        <span className="text-sm font-semibold">Call Center CRM</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {user?.extension && (
          <span className="hidden sm:inline-flex text-xs font-medium
                           bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg">
            Ext: {user.extension?.number}
          </span>
        )}

        {user?.role === 'agent' && (
          <button
            onClick={() => setShowApproval(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs
                       font-medium text-blue-700 bg-blue-50 border border-blue-200
                       rounded-lg hover:bg-blue-100 transition-colors"
          >
            <CheckSquare size={14} />
            Request Approval
          </button>
        )}

        <AgentStatusDropdown />

        {/* Notifications bell + panel */}
        <div className="relative">
          <button
            onClick={toggleOpen}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} className="text-gray-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px]
                               px-1 bg-red-500 text-white text-[10px] font-bold
                               rounded-full ring-2 ring-white flex items-center
                               justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {open && <NotificationsPanel onClose={() => setOpen(false)} />}
        </div>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center
                            text-white text-sm font-bold shrink-0
                            ${ROLE_COLORS[user.role] ?? 'bg-gray-600'}`}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              {['agent', 'supervisor'].includes(user.role) && (
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3
                               rounded-full ring-2 ring-white
                               ${STATUS_DOT[status] ?? 'bg-gray-400'}`}
                />
              )}
            </div>
            <div className="hidden md:block leading-tight">
              <p className="text-sm font-medium text-gray-800">{user.full_name}</p>
              <p className="text-xs text-gray-400 capitalize">{user.role}</p>
            </div>
          </div>
        )}
      </div>

      <NewApprovalModal
        open={showApproval}
        onClose={() => setShowApproval(false)}
        onCreated={() => setShowApproval(false)}
      />
    </header>
  );
}
