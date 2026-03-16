'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';
import { Sidebar }             from '@/components/layout/Sidebar';
import { Topbar }              from '@/components/layout/Topbar';
import { IncomingCallPopup }   from '@/components/calls/IncomingCallPopup';
import { useAuthStore, useCallStore } from '@/store';
import { useWebSocket }        from '@/lib/websocket/useWebSocket';
import type { WSEvent }        from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, hydrate } = useAuthStore();
  const { setIncomingCall }          = useCallStore();
  const router                       = useRouter();
  const [hydrated, setHydrated]      = useState(false);

  // الخطوة 1: hydrate من localStorage أول
  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  // الخطوة 2: بعد ما hydrate خلص، لو مش authenticated → login
  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  useWebSocket((event: WSEvent) => {
    if (event.type === 'incoming_call') {
      setIncomingCall(event);
    }
  });

  // استنّى hydration قبل ما ترندر حاجة
  if (!hydrated) return null;
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
