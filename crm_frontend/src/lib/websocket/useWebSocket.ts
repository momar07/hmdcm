'use client';

import { useEffect, useRef } from 'react';
import Cookies               from 'js-cookie';
import type { WSEvent }      from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const wsRef      = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    const token = Cookies.get('access_token');
    if (!token) return;

    const url = `${WS_URL}/ws/calls/?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => console.log('[WS] Connected');

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WSEvent;
        onEventRef.current(data);
      } catch {
        console.warn('[WS] Failed to parse message', e.data);
      }
    };

    ws.onerror = (e) => console.error('[WS] Error', e);

    ws.onclose = (e) => console.log('[WS] Disconnected', e.code);

    // ping every 30s
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);

    return () => {
      clearInterval(ping);
      ws.close(1000, 'unmounted');
    };
  }, []);

  const sendEvent = (data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { sendEvent };
}
