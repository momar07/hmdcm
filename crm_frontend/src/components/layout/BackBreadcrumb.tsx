'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';

/**
 * Maps a URL segment to a human-readable label.
 * For known routes use the same labels as the Sidebar.
 * For unknown segments (e.g. UUIDs, IDs) we fall back to "Detail".
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  leads:        'Leads',
  pipeline:     'Pipeline',
  'live-agents':'Live Agents',
  calls:        'Calls',
  activity:     'My Activity',
  tickets:      'Tickets',
  approvals:    'Approvals',
  followups:    'Follow-ups',
  tasks:        'Tasks',
  sales:        'Sales',
  products:     'Products',
  quotations:   'Quotations',
  campaigns:    'Campaigns',
  reports:      'Reports',
  users:        'Users',
  admin:        'Admin',
  audit:        'Audit Logs',
  settings:     'Settings',
  new:          'New',
  edit:         'Edit',
};

function isLikelyId(seg: string): boolean {
  // UUIDs, numeric IDs, or anything > 16 chars that isn't in the label map
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  if (seg.length > 24 && !SEGMENT_LABELS[seg]) return true;
  return false;
}

function labelFor(seg: string, isLast: boolean, parentSeg: string | null): string {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  if (isLikelyId(seg)) {
    // Contextual label based on parent
    if (parentSeg === 'leads')      return 'Lead Detail';
    if (parentSeg === 'tickets')    return 'Ticket Detail';
    if (parentSeg === 'calls')      return 'Call Detail';
    if (parentSeg === 'approvals')  return 'Approval Detail';
    if (parentSeg === 'quotations') return 'Quotation Detail';
    if (parentSeg === 'products')   return 'Product Detail';
    return 'Detail';
  }
  // Title-case any other unknown segment
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

export function BackBreadcrumb() {
  const router   = useRouter();
  const pathname = usePathname();

  // Don't show on dashboard (root of authenticated app)
  if (pathname === '/dashboard' || pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);
  // Build cumulative hrefs for each breadcrumb segment
  const crumbs = segments.map((seg, idx) => {
    const href     = '/' + segments.slice(0, idx + 1).join('/');
    const isLast   = idx === segments.length - 1;
    const parent   = idx > 0 ? segments[idx - 1] : null;
    const label    = labelFor(seg, isLast, parent);
    return { href, label, isLast };
  });

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Back arrow */}
      <button
        onClick={() => router.back()}
        className="flex items-center justify-center w-8 h-8 rounded-lg
                   text-gray-500 hover:bg-gray-100 hover:text-gray-700
                   transition-colors shrink-0"
        aria-label="Go back"
        title="Go back"
      >
        <ArrowLeft size={18} />
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-gray-200 shrink-0" />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden"
           aria-label="Breadcrumb">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-gray-400 hover:text-gray-700
                     transition-colors shrink-0"
          title="Dashboard"
        >
          <Home size={14} />
        </Link>
        {crumbs.map((c, i) => (
          <div key={c.href} className="flex items-center gap-1 min-w-0">
            <ChevronRight size={14} className="text-gray-300 shrink-0" />
            {c.isLast ? (
              <span className="text-gray-800 font-medium truncate">{c.label}</span>
            ) : (
              <Link
                href={c.href}
                className="text-gray-500 hover:text-gray-800 transition-colors truncate"
              >
                {c.label}
              </Link>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
