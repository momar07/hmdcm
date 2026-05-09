import { useEffect, useRef } from 'react';
import Cookies from 'js-cookie';

/**
 * Build the WebSocket URL for a given path, using the current host
 * and the correct protocol (ws/wss). Falls back to NEXT_PUBLIC_WS_HOST
 * (or NEXT_PUBLIC_API_URL host) when running off-host.
 */
export function buildWsUrl(path: string): string {
  if (typeof window === 'undefined') return '';

  const envWs = process.env.NEXT_PUBLIC_WS_HOST;
  if (envWs) {
    if (envWs.startsWith('ws://') || envWs.startsWith('wss://')) {
      return `${envWs.replace(/\/$/, '')}${path}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${envWs.replace(/\/$/, '')}${path}`;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      const proto = u.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${u.host}${path}`;
    } catch { /* ignore */ }
  }

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${path}`;
}

export interface AppSocketOptions {
  path:                  string;
  enabled?:              boolean;
  onMessage?:            (msg: any) => void;
  onOpen?:               () => void;
  onClose?:              (ev: CloseEvent) => void;
  onError?:              (ev: Event) => void;
  reconnectMaxDelay?:    number;
  reconnectInitialDelay?: number;
}

/**
 * Robust WebSocket hook with:
 *  - JWT from cookie (matches axios interceptor)
 *  - protocol-aware URL (ws/wss)
 *  - exponential reconnection with jitter
 *  - heartbeat ping every 25s to keep idle connections alive
 *  - clean unmount (no reconnect after component unmounts)
 */
export function useAppSocket(opts: AppSocketOptions) {
  const {
    path,
    enabled = true,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectMaxDelay    = 30_000,
    reconnectInitialDelay = 1_000,
  } = opts;

  const onMsgRef   = useRef(onMessage);
  const onOpenRef  = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrRef   = useRef(onError);
  onMsgRef.current   = onMessage;
  onOpenRef.current  = onOpen;
  onCloseRef.current = onClose;
  onErrRef.current   = onError;

  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef       = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    stoppedRef.current = false;

    function connect() {
      const token = Cookies.get('access_token');
      if (!token) {
        console.warn('[WS] No access_token cookie - skipping connect');
        return;
      }

      const url = `${buildWsUrl(path)}?token=${encodeURIComponent(token)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        console.warn('[WS] constructor failed:', e);
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt.current = 0;
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = setInterval(() => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          } catch { /* ignore */ }
        }, 25_000);
        onOpenRef.current?.();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          onMsgRef.current?.(msg);
        } catch {
          /* non-JSON frame - ignore */
        }
      };

      ws.onerror = (ev) => {
        onErrRef.current?.(ev);
      };

      ws.onclose = (ev) => {
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = null;
        }
        onCloseRef.current?.(ev);
        if (!stoppedRef.current) scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      const attempt = reconnectAttempt.current++;
      const base    = Math.min(reconnectInitialDelay * 2 ** attempt, reconnectMaxDelay);
      const jitter  = Math.random() * 0.3 * base;
      const delay   = base + jitter;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (!stoppedRef.current) connect();
      }, delay);
    }

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      try { wsRef.current?.close(1000, 'unmount'); } catch { /* ignore */ }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, reconnectInitialDelay, reconnectMaxDelay]);

  return wsRef;
}
