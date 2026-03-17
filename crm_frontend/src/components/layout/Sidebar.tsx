'use client';

import Link        from 'next/link';
import { usePathname } from 'next/navigation';
import clsx        from 'clsx';
import {
  LayoutDashboard,
  UserCircle,
  BookOpen,
  PhoneCall,
  ClipboardList,
  Megaphone,
  BarChart2,
  Users,
  UsersRound,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import type { Role } from '@/types';

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ReactNode;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
    roles: ['admin', 'supervisor', 'agent', 'qa'],
  },
  {
    href: '/customers', label: 'Customers',
    icon: <UserCircle size={18} />,
    roles: ['admin', 'supervisor', 'agent'],
  },
  {
    href: '/leads', label: 'Leads',
    icon: <BookOpen size={18} />,
    roles: ['admin', 'supervisor', 'agent'],
  },
  {
    href: '/leads/pipeline', label: 'Pipeline',
    icon: <LayoutGrid size={18} />,
    roles: ['admin', 'supervisor', 'agent'],
  },
  {
    href: '/calls', label: 'Calls',
    icon: <PhoneCall size={18} />,
    roles: ['admin', 'supervisor', 'agent', 'qa'],
  },
  {
    href: '/followups', label: 'Follow-ups',
    icon: <ClipboardList size={18} />,
    roles: ['admin', 'supervisor', 'agent'],
  },
  {
    href: '/campaigns', label: 'Campaigns',
    icon: <Megaphone size={18} />,
    roles: ['admin', 'supervisor'],
  },
  {
    href: '/reports', label: 'Reports',
    icon: <BarChart2 size={18} />,
    roles: ['admin', 'supervisor', 'qa'],
  },
  {
    href: '/users', label: 'Users',
    icon: <Users size={18} />,
    roles: ['admin'],
  },
  {
    href: '/teams', label: 'Teams',
    icon: <UsersRound size={18} />,
    roles: ['admin', 'supervisor'],
  },
  {
    href: '/settings', label: 'Settings',
    icon: <Settings size={18} />,
    roles: ['admin'],
  },
];

export function Sidebar() {
  const pathname             = usePathname();
  const { user, logout }     = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const visible = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside
      className={clsx(
        'flex flex-col bg-gray-900 text-gray-100 shrink-0',
        'transition-all duration-200 ease-in-out',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-3
                      border-b border-gray-700 shrink-0">
        {!sidebarCollapsed && (
          <span className="text-base font-bold text-white tracking-tight">
            📞 CRM
          </span>
        )}
        <button
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className="ml-auto p-1.5 rounded-lg text-gray-400
                     hover:bg-gray-700 hover:text-white transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={sidebarCollapsed ? item.label : undefined}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5',
                'text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-gray-700 p-3 space-y-2">
        {!sidebarCollapsed && user && (
          <div className="px-1 pb-1">
            <p className="text-xs font-semibold text-white truncate">{user.full_name}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role}</p>
          </div>
        )}
        <button
          onClick={() => logout()}
          title={sidebarCollapsed ? 'Logout' : undefined}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2
                     text-sm text-gray-400 hover:bg-gray-700 hover:text-white
                     transition-colors duration-150"
        >
          <LogOut size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
