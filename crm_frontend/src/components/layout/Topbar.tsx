'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter }                    from 'next/navigation';
import { Bell, PhoneCall, CheckSquare, LogOut } from 'lucide-react';
import { useAuthStore }                 from '@/store';
import { AgentStatusDropdown }          from './AgentStatusDropdown';
import { useAgentStatusStore }          from '@/store';
import { NewApprovalModal }             from '@/components/approvals/NewApprovalModal';
import type { AgentStatus }             from '@/types';

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
  const { user, logout } = useAuthStore();
  const { status }       = useAgentStatusStore();
  const router           = useRouter();
  const [showApproval, setShowApproval] = useState(false);
  const [showMenu, setShowMenu]         = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

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

        {/* Request Approval button — agents only */}
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

        {/* Agent Status Dropdown */}
        <AgentStatusDropdown />

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell size={18} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2
                           bg-red-500 rounded-full ring-2 ring-white" />
        </button>

        {/* User avatar + dropdown */}
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2.5 hover:bg-gray-50 rounded-lg
                         px-2 py-1.5 transition-colors"
            >
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
              <div className="hidden md:block leading-tight text-left">
                <p className="text-sm font-medium text-gray-800">{user.full_name}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role}</p>
              </div>
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white
                              rounded-lg shadow-lg border border-gray-200
                              py-1 z-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                             text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Approval Modal */}
      <NewApprovalModal
        open={showApproval}
        onClose={() => setShowApproval(false)}
        onCreated={() => setShowApproval(false)}
      />
    </header>
  );
}
