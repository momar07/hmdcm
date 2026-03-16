import type { WSEvent } from '@/types';
import Cookies from 'js-cookie';

type WSListener = (event: WSEvent) => void;

class WebSocketClient {
  private socket:      WebSocket | null = null;
  private listeners:   Set<WSListener>  = new Set();
  private reconnectMs: number           = 3000;
  private shouldReconnect               = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect() {
    const token    = Cookies.get('access_token');
    const wsBase   = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
    const url      = `${wsBase}/ws/calls/?token=${token ?? ''}`;

    this.shouldReconnect = true;
    this.socket          = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('[WS] Connected to call event stream.');
      this.startPing();
    };

    this.socket.onmessage = (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data) as WSEvent;
        this.listeners.forEach((cb) => cb(event));
      } catch {
        console.warn('[WS] Could not parse message:', msg.data);
      }
    };

    this.socket.onclose = () => {
      console.warn('[WS] Disconnected.');
      this.stopPing();
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectMs);
      }
    };

    this.socket.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    this.socket?.close();
    this.socket = null;
  }

  send(data: object) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  subscribe(listener: WSListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
  }
}

export const wsClient = new WebSocketClient();
