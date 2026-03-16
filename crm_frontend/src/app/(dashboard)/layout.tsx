'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar }           from '@/components/layout/Sidebar';
import { Topbar }            from '@/components/layout/Topbar';
import { IncomingCallPopup } from '@/components/calls/IncomingCallPopup';
import { useAuthStore, useCallStore } from '@/store';
import { useWebSocket }      from '@/lib/websocket/useWebSocket';
import type { WSEvent }      from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, hydrate } = useAuthStore();
  const { setIncomingCall }          = useCallStore();
  const router                       = useRouter();

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  useWebSocket((event: WSEvent) => {
    if (event.type === 'incoming_call') {
      setIncomingCall(event);
    }
  });

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <IncomingCallPopup />
    </div>
  );
}
