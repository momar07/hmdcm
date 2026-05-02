'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store';

const NAV = [
  { href: '/leads',             icon: '🎯', label: 'Leads Pipeline' },
  { href: '/customers',         icon: '👥', label: 'Customers'       },
  { href: '/calls',             icon: '📞', label: 'Calls'           },
  { href: '/followups',         icon: '📅', label: 'Follow-ups'      },
  { href: '/tasks',             icon: '✅', label: 'Tasks'           },
  { href: '/sales/quotations',  icon: '📄', label: 'Quotations'      },
  { href: '/deals',             icon: '💰', label: 'Deals'           },
  { href: '/tickets',           icon: '🎫', label: 'Tickets'         },
  { href: '/campaigns',         icon: '📣', label: 'Campaigns'       },
  { href: '/reports',           icon: '📊', label: 'Reports'         },
] as const;

const ADMIN_NAV = [
  { href: '/users',             icon: '👤', label: 'Users & Teams'  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  return (
    <aside
      style={{
        width: '240px',
        minWidth: '240px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #f3f4f6',
      }}>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
          HMDCM
        </h1>
        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', marginBottom: 0 }}>
          Call Center CRM
        </p>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1,
        padding: '12px 8px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'background 0.15s',
                backgroundColor: active ? '#eff6ff' : 'transparent',
                color: active ? '#1d4ed8' : '#4b5563',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {active && (
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#2563eb',
                  flexShrink: 0,
                }} />
              )}
            </Link>
          );
        })}

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <div style={{
              height: '1px',
              backgroundColor: '#f3f4f6',
              margin: '8px 12px',
            }} />
            {ADMIN_NAV.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                    backgroundColor: active ? '#eff6ff' : 'transparent',
                    color: active ? '#1d4ed8' : '#4b5563',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {active && (
                    <span style={{
                      width: '6px', height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#2563eb',
                      flexShrink: 0,
                    }} />
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 8px',
        borderTop: '1px solid #f3f4f6',
      }}>
        <Link
          href="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#6b7280',
            textDecoration: 'none',
          }}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}

export default Sidebar;
