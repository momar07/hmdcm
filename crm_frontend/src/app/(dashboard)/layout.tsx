'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter }           from 'next/navigation';
import { Sidebar }             from '@/components/layout/Sidebar';
import { Topbar }              from '@/components/layout/Topbar';
import { IncomingCallPopup, unlockAudio } from '@/components/calls/IncomingCallPopup';
import { DispositionModal }   from '@/components/calls/DispositionModal';
import { SoftPhone }           from '@/components/softphone/SoftPhone';
import { useAuthStore, useCallStore, useAgentStatusStore } from '@/store';
import { useSipStore } from '@/store/sipStore';
import { useWebSocket }        from '@/lib/websocket/useWebSocket';
import { ReminderToastListener } from '@/components/followups/ReminderToast';
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

  // ring key — increments on every incoming_call WS event
  // forces useEffect to re-fire even if call_id is the same (re-queue scenario)
  const [ringKey, setRingKey]    = useState(0);
  const lastEventRef             = useRef<any>(null);

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  const { setStatus } = useAgentStatusStore();
  const prevCallStatus = useRef<string>('idle');

  useEffect(() => {
    // Show DispositionModal when call ends (both inbound active→idle AND outbound ringing/active→idle)
    const wasInCall = prevCallStatus.current === 'active' || prevCallStatus.current === 'ringing';
    if (wasInCall && callStatus === 'idle') {
      // Short delay so backend has time to update the call record
      setTimeout(() => {
        import('@/lib/api/calls').then(({ callsApi }) => {
          callsApi.pendingCompletions().then(res => {
            const pending = res.data;
            if (Array.isArray(pending) && pending.length > 0) {
              const latest = pending[0];
              setDispModal({
                callId:       latest.id,
                callerNumber: (latest as any).caller ?? (latest as any).caller_number ?? 'Unknown',
                customerName: (latest as any).customer_name ?? null,
                customerId:   (latest as any).customer   ?? null,
              });
            }
          }).catch(() => {});
        });
      }, 800);  // 800ms so endWebrtcCall finishes before we query pending
    }
    prevCallStatus.current = callStatus;
  }, [callStatus]);

  // WS event arrives → set directly without null-clear race condition
  useWebSocket((event: WSEvent) => {
    if (event.type === 'incoming_call') {
      // Only show popup for agents with SIP extension — not admin/supervisor
      const { user: currentUser } = useAuthStore.getState();
      const hasExtension = !!(currentUser as any)?.extension;
      const isAgent      = currentUser?.role === 'agent';
      if (!isAgent || !hasExtension) return;   // ← skip for admin/supervisor

      lastEventRef.current = event;
      setIncomingCall(event as any);
      setRingKey(k => k + 1);
    }
    if (event.type === 'agent_status' || event.type === 'agent_status_update') {
      const s = (event as any).status ?? (event as any).payload?.status;
      const { user: currentUser } = useAuthStore.getState();
      const evtAgentId = (event as any).agent_id;
      if (s && (!evtAgentId || evtAgentId === currentUser?.id)) {
        setStatus(s as any);
      }
    }
    if (event.type === 'followup_reminder') {
      // Dispatch DOM event — ReminderToastListener handles the toast UI
      window.dispatchEvent(new CustomEvent('followup:reminder', { detail: event }));
    }
    if (event.type === 'approval_update') {
      const ev = event as any;
      const isApproved = ev.status === 'approved';
      const msg = (isApproved ? '✅ Approved: ' : '❌ Rejected: ') + (ev.title ?? 'Approval Request');
      const comment = ev.review_comment ? (' — ' + ev.review_comment) : '';
      import('react-hot-toast').then(({ default: toast }) => {
        toast(msg + comment, {
          duration: 6000,
          style: { borderLeft: '4px solid ' + (isApproved ? '#16a34a' : '#dc2626'), maxWidth: '360px' },
        });
      });
    }
    if (event.type === 'approval_request') {
      const ev2 = event as any;
      const msg2 = '📋 New request from ' + (ev2.requested_by_name ?? 'Agent') + ': ' + (ev2.title ?? '');
      import('react-hot-toast').then(({ default: toast }) => {
        toast(msg2, { duration: 7000, style: { borderLeft: '4px solid #2563eb' } });
      });
    }
  });

  // ringKey ref — no longer needs a separate effect
  useEffect(() => {}, [ringKey]);


  // Unlock audio on first user interaction (Chrome Autoplay Policy)
  useEffect(() => {
    const unlock = () => { unlockAudio(); };
    window.addEventListener('click',    unlock, { once: true });
    window.addEventListener('keydown',  unlock, { once: true });
    window.addEventListener('touchend', unlock, { once: true });
    return () => {
      window.removeEventListener('click',    unlock);
      window.removeEventListener('keydown',  unlock);
      window.removeEventListener('touchend', unlock);
    };
  }, []);

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
      <ReminderToastListener />
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
