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

/* ─────────────────────────────────────────────────────────────────────
 * Module-level singleton store: one WebSocket per (path) for the whole
 * browser tab. Survives React 18 StrictMode double-mount and any other
 * re-mount caused by Next.js HMR / route transitions.
 * ─────────────────────────────────────────────────────────────────── */
interface PathSlot {
  ws:                 WebSocket | null;
  refCount:           number;
  closeTimer:         ReturnType<typeof setTimeout> | null;
  reconnectTimer:     ReturnType<typeof setTimeout> | null;
  heartbeatTimer:     ReturnType<typeof setInterval> | null;
  reconnectAttempt:   number;
  listeners: {
    msg:   Set<(m: any) => void>;
    open:  Set<() => void>;
    close: Set<(e: CloseEvent) => void>;
    err:   Set<(e: Event) => void>;
  };
}

const slots = new Map<string, PathSlot>();

function getSlot(path: string): PathSlot {
  let s = slots.get(path);
  if (!s) {
    s = {
      ws: null, refCount: 0,
      closeTimer: null, reconnectTimer: null, heartbeatTimer: null,
      reconnectAttempt: 0,
      listeners: { msg: new Set(), open: new Set(), close: new Set(), err: new Set() },
    };
    slots.set(path, s);
  }
  return s;
}

function openSocket(path: string, initialDelay: number, maxDelay: number) {
  const slot = getSlot(path);

  // Already open or connecting? Just return.
  if (slot.ws && (slot.ws.readyState === WebSocket.OPEN || slot.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

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
    scheduleReconnect(path, initialDelay, maxDelay);
    return;
  }
  slot.ws = ws;

  ws.onopen = () => {
    slot.reconnectAttempt = 0;
    if (slot.heartbeatTimer) clearInterval(slot.heartbeatTimer);
    slot.heartbeatTimer = setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      } catch { /* ignore */ }
    }, 25_000);
    slot.listeners.open.forEach((fn) => { try { fn(); } catch {} });
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }
    slot.listeners.msg.forEach((fn) => { try { fn(msg); } catch {} });
  };

  ws.onerror = (ev) => {
    slot.listeners.err.forEach((fn) => { try { fn(ev); } catch {} });
  };

  ws.onclose = (ev) => {
    if (slot.heartbeatTimer) {
      clearInterval(slot.heartbeatTimer);
      slot.heartbeatTimer = null;
    }
    slot.listeners.close.forEach((fn) => { try { fn(ev); } catch {} });
    slot.ws = null;
    // Auto-reconnect ONLY if there are still mounted consumers
    if (slot.refCount > 0) {
      scheduleReconnect(path, initialDelay, maxDelay);
    }
  };
}

function scheduleReconnect(path: string, initialDelay: number, maxDelay: number) {
  const slot = getSlot(path);
  if (slot.reconnectTimer) clearTimeout(slot.reconnectTimer);
  const attempt = slot.reconnectAttempt++;
  const base    = Math.min(initialDelay * 2 ** attempt, maxDelay);
  const jitter  = Math.random() * 0.3 * base;
  const delay   = base + jitter;
  slot.reconnectTimer = setTimeout(() => {
    if (slot.refCount > 0) openSocket(path, initialDelay, maxDelay);
  }, delay);
}

function closeSocket(path: string) {
  const slot = slots.get(path);
  if (!slot) return;
  if (slot.reconnectTimer) { clearTimeout(slot.reconnectTimer); slot.reconnectTimer = null; }
  if (slot.heartbeatTimer) { clearInterval(slot.heartbeatTimer); slot.heartbeatTimer = null; }
  if (slot.ws) {
    try { slot.ws.close(1000, 'unmount'); } catch {}
    slot.ws = null;
  }
}

/**
 * Robust WebSocket hook with:
 *  - JWT from cookie (matches axios interceptor)
 *  - protocol-aware URL (ws/wss)
 *  - exponential reconnection with jitter
 *  - heartbeat ping every 25s to keep idle connections alive
 *  - StrictMode-safe singleton: one WebSocket per path for the whole tab.
 *    Multiple components calling useAppSocket({path:'/ws/calls/'}) share
 *    the same underlying WebSocket. Close happens 200ms after the last
 *    consumer unmounts (covers React 18 StrictMode double-mount).
 */
export function useAppSocket(opts: AppSocketOptions) {
  const {
    path,
    enabled = true,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectMaxDelay     = 30_000,
    reconnectInitialDelay = 1_000,
  } = opts;

  // Keep latest callback refs to avoid re-subscribing on every render
  const onMsgRef   = useRef(onMessage);
  const onOpenRef  = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrRef   = useRef(onError);
  onMsgRef.current   = onMessage;
  onOpenRef.current  = onOpen;
  onCloseRef.current = onClose;
  onErrRef.current   = onError;

  useEffect(() => {
    if (!enabled) return;
    const slot = getSlot(path);

    // Cancel any pending close from a previous unmount (StrictMode)
    if (slot.closeTimer) {
      clearTimeout(slot.closeTimer);
      slot.closeTimer = null;
    }

    // Register thin wrappers that always call the latest ref
    const msg   = (m: any) => onMsgRef.current?.(m);
    const open  = ()       => onOpenRef.current?.();
    const close = (e: CloseEvent) => onCloseRef.current?.(e);
    const err   = (e: Event)      => onErrRef.current?.(e);

    slot.listeners.msg.add(msg);
    slot.listeners.open.add(open);
    slot.listeners.close.add(close);
    slot.listeners.err.add(err);
    slot.refCount++;

    // Open the socket only if it isn't already
    openSocket(path, reconnectInitialDelay, reconnectMaxDelay);

    return () => {
      slot.listeners.msg.delete(msg);
      slot.listeners.open.delete(open);
      slot.listeners.close.delete(close);
      slot.listeners.err.delete(err);
      slot.refCount = Math.max(0, slot.refCount - 1);

      // Delay actual close so that StrictMode's immediate remount can
      // reuse the same socket. 200ms is well above the synchronous
      // unmount→remount cycle of React 18 dev mode.
      if (slot.refCount === 0) {
        if (slot.closeTimer) clearTimeout(slot.closeTimer);
        slot.closeTimer = setTimeout(() => {
          if (slot.refCount === 0) closeSocket(path);
          slot.closeTimer = null;
        }, 200);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled]);

  // Return a ref-shaped object for callers that previously read wsRef.current
  return {
    get current() { return slots.get(path)?.ws ?? null; },
  } as { current: WebSocket | null };
}
