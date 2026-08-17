import type {
  WsScanProgressPayload,
  WsScanCompletePayload,
  WsScanErrorPayload,
} from '@auspex/shared';

type WsEventMap = {
  connected: { version: string };
  'scan:progress': WsScanProgressPayload;
  'scan:complete': WsScanCompletePayload;
  'scan:error': WsScanErrorPayload;
};

type Listener<T> = (payload: T) => void;

class AuspexWebSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected to Auspex backend at', this.url);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
          const typeListeners = this.listeners.get(msg.type);
          typeListeners?.forEach((fn) => fn(msg.payload));
        } catch {
          /* ignore non-JSON messages */
        }
      };

      this.ws.onclose = () => {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
    }
  }

  on<K extends keyof WsEventMap>(event: K, listener: Listener<WsEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
    return () => this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  cancelScan(repositoryId: string): void {
    this.send('scan:cancel', { repositoryId });
  }

  disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Proxied via Vite dev server or direct to host
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;

export const wsClient = new AuspexWebSocket(WS_URL);
