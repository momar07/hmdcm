'use client';

import { useEffect } from 'react';
import { useSipStore } from '@/store/sipStore';

/**
 * Warns the user before refreshing/closing the tab during an active call.
 * Also clears any stale call recovery data when the call ends normally.
 */
export function useCallGuard() {
  const { callStatus } = useSipStore();

  useEffect(() => {
    const inCall = callStatus === 'active'
                || callStatus === 'holding'
                || callStatus === 'incoming'
                || callStatus === 'ringing';

    if (!inCall) {
      // Call ended cleanly — clear recovery data
      try { sessionStorage.removeItem('hmdcm:active_call'); } catch (_) {}
      return;
    }

    // While in a call, warn before unload
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most modern browsers ignore the custom message and show a generic one
      e.returnValue = 'You have an active call. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [callStatus]);
}
