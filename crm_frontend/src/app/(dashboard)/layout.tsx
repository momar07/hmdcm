'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter }           from 'next/navigation';
import { Sidebar }             from '@/components/layout/Sidebar';
import { Topbar }              from '@/components/layout/Topbar';
import { IncomingCallPopup }   from '@/components/calls/IncomingCallPopup';
import { DispositionModal }   from '@/components/calls/DispositionModal';
import { SoftPhone }           from '@/components/softphone/SoftPhone';
import { useAuthStore, useCallStore, useAgentStatusStore } from '@/store';
import { useSipStore } from '@/store/sipStore';
import { useWebSocket }        from '@/lib/websocket/useWebSocket';
import type { WSEvent }        from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, hydrate } = useAuthStore();
  const { setIncomingCall, incomingCall } = useCallStore();
  const { callStatus }                   = useSipStore();
  const [dispModal, setDispModal]        = useState<{
    callId: string; callerNumber: string;
    customerName?: string | null; customerId?: string | null;
  } | null>(null);
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

  const { setStatus } = useAgentStatusStore();

  const prevCallStatus = useRef<string>('idle');

  useEffect(() => {
    // When call goes from active → idle, show disposition modal
    if (prevCallStatus.current === 'active' && callStatus === 'idle') {
      // find the most recent active call from store
      const call = incomingCall;
      setDispModal({
        callId:       '',   // will be filled from pendingCompletions
        callerNumber: call?.caller ?? 'Unknown',
        customerName: call?.customer_name ?? null,
        customerId:   call?.customer_id   ?? null,
      });
      // fetch actual call_id from backend
      import('@/lib/api/calls').then(({ callsApi }) => {
        callsApi.pendingCompletions().then(res => {
          const pending = res.data;
          if (Array.isArray(pending) && pending.length > 0) {
            const latest = pending[0];
            setDispModal({
              callId:       latest.id,
              callerNumber: latest.caller_number ?? 'Unknown',
              customerName: (latest as any).customer_name ?? null,
              customerId:   (latest as any).customer   ?? null,
            });
          }
        }).catch(() => {});
      });
    }
    prevCallStatus.current = callStatus;
  }, [callStatus]);

  useWebSocket((event: WSEvent) => {
    if (event.type === 'incoming_call') {
      setIncomingCall(event);
    }
    if (event.type === 'agent_status') {
      const s = (event as any).status;
      if (s) setStatus(s);
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
      <SoftPhone />
      {dispModal && dispModal.callId && (
        <DispositionModal
          callId={dispModal.callId}
          callerNumber={dispModal.callerNumber}
          customerName={dispModal.customerName}
          customerId={dispModal.customerId}
          onClose={() => setDispModal(null)}
        />
      )}
    </div>
  );
}
