'use client';

import { Bell, PhoneCall } from 'lucide-react';
import { useAuthStore }    from '@/store';

const ROLE_COLORS: Record<string, string> = {
  admin:      'bg-purple-600',
  supervisor: 'bg-blue-600',
  agent:      'bg-green-600',
  qa:         'bg-yellow-600',
};

export function Topbar() {
  const { user } = useAuthStore();

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
            Ext: {user.extension}
          </span>
        )}

        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell size={18} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2
                           bg-red-500 rounded-full ring-2 ring-white" />
        </button>

        {user && (
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center
                          text-white text-sm font-bold shrink-0
                          ${ROLE_COLORS[user.role] ?? 'bg-gray-600'}`}
            >
              {user.full_name.charAt(0).toUpperCase()}
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
