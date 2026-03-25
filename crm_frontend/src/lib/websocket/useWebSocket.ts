'use client';

import { useEffect, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';
import type { WSEvent } from '@/types';

const WS_URL    = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const MAX_RETRY = 5;
const DELAY_MS  = 4000;

// Global singleton — one WS connection per browser tab
let _globalWs: WebSocket | null = null;
let _globalListeners: Set<(e: WSEvent) => void> = new Set();

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const wsRef      = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const retryRef   = useRef(0);
  const deadRef    = useRef(false);
  const lastMsgId  = useRef<string>('');

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const connect = useCallback(() => {
    if (deadRef.current) return;

    const token = Cookies.get('access_token');
    if (!token) {
      console.log('[WS] No token — skip');
      return;
    }
    if (retryRef.current >= MAX_RETRY) {
      console.warn('[WS] Max retries reached — giving up');
      return;
    }

    const ws = new WebSocket(`${WS_URL}/ws/calls/?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected ✅');
      retryRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WSEvent;
        // Dedup: skip if same message received within 200ms
        const msgKey = JSON.stringify(data).slice(0, 120);
        if (lastMsgId.current === msgKey) return;
        lastMsgId.current = msgKey;
        setTimeout(() => { if (lastMsgId.current === msgKey) lastMsgId.current = ''; }, 200);
        onEventRef.current(data);
      } catch {
        console.warn('[WS] Parse error', e.data);
      }
    };

    ws.onerror = () => console.warn('[WS] Connection error');

    ws.onclose = (e) => {
      console.log(`[WS] Disconnected — code: ${e.code}`);
      if (deadRef.current || e.code === 1000) return;
      if (e.code === 4001) { console.warn('[WS] Auth failed'); return; }
      retryRef.current += 1;
      console.log(`[WS] Retry ${retryRef.current}/${MAX_RETRY} in ${DELAY_MS / 1000}s`);
      setTimeout(connect, DELAY_MS);
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 30_000);

    ws.addEventListener('close', () => clearInterval(ping));
  }, []);

  useEffect(() => {
    deadRef.current = false;
    connect();
    return () => {
      deadRef.current = true;
      wsRef.current?.close(1000, 'unmounted');
    };
  }, [connect]);

  const sendEvent = (data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { sendEvent };
}
