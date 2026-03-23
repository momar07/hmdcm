'use client';

import { Bell, PhoneCall }         from 'lucide-react';
import { useAuthStore }            from '@/store';
import { AgentStatusDropdown }     from './AgentStatusDropdown';
import { useAgentStatusStore }     from '@/store';
import type { AgentStatus }        from '@/types';

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
        {/* Extension badge */}
        {user?.extension && (
          <span className="hidden sm:inline-flex text-xs font-medium
                           bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg">
            Ext: {user.extension?.number}
          </span>
        )}

        {/* Agent Status Dropdown — agents & supervisors only */}
        <AgentStatusDropdown />

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell size={18} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2
                           bg-red-500 rounded-full ring-2 ring-white" />
        </button>

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
              {/* Status dot on avatar */}
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
    </header>
  );
}
