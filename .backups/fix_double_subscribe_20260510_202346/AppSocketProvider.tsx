'use client';

/**
 * AppSocketProvider — single WebSocket connection at the layout level.
 * Mount ONCE in the root dashboard layout. All components subscribe via
 * useAppSocketBus() to receive messages, instead of opening their own WS.
 *
 * This eliminates duplicate connections from React StrictMode / page navigation.
 */
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store';
import { useAppSocket } from '@/lib/ws/useAppSocket';

type Listener = (msg: any) => void;

class MessageBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(msg: any) {
    this.listeners.forEach((l) => {
      try { l(msg); } catch (e) { console.error('[bus] listener error', e); }
    });
  }
}

// Module-level singleton — survives StrictMode double-mount
const bus = new MessageBus();

export function subscribeAppSocket(fn: Listener): () => void {
  return bus.subscribe(fn);
}

interface Props {
  children: React.ReactNode;
}

export function AppSocketProvider({ children }: Props) {
  const { user } = useAuthStore();
  const mountedOnce = useRef(false);

  useAppSocket({
    path: '/ws/calls/',
    enabled: !!user,
    onMessage: (msg) => {
      bus.emit(msg);
    },
    onOpen: () => {
      if (!mountedOnce.current) {
        console.log('[AppSocket] connected');
        mountedOnce.current = true;
      }
    },
  });

  return <>{children}</>;
}
