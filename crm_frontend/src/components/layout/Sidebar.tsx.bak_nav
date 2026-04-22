'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/leads',        icon: '🎯', label: 'Leads Pipeline' },
  { href: '/customers',    icon: '👥', label: 'Customers'       },
  { href: '/calls',        icon: '📞', label: 'Calls'           },
  { href: '/followups',    icon: '📅', label: 'Follow-ups'      },
  { href: '/tasks',        icon: '✅', label: 'Tasks'           },
  { href: '/quotations',   icon: '📄', label: 'Quotations'      },
  { href: '/tickets',      icon: '🎫', label: 'Tickets'         },
  { href: '/reports',      icon: '📊', label: 'Reports'         },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">HMDCM</h1>
        <p className="text-xs text-gray-400 mt-0.5">Call Center CRM</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                          font-medium transition-colors
                ${active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                     text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <span>⚙️</span> Settings
        </Link>
      </div>
    </aside>
  );
}

export default Sidebar;
