'use client';

import { useEffect } from 'react';
import { wsClient } from './client';
import type { WSEvent } from '@/types';

export function useWebSocket(onEvent: (e: WSEvent) => void) {
  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe(onEvent);
    return () => {
      unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
