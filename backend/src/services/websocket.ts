import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type {
  WsMessage,
  WsScanProgressPayload,
  WsScanCompletePayload,
  WsScanErrorPayload,
} from '@auspex/shared';

/** Active scan controllers keyed by repositoryId */
const activeScanControllers = new Map<string, AbortController>();

/** All connected WebSocket clients */
const clients = new Set<WebSocket>();

let wss: WebSocketServer;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    clients.add(ws);
    console.log(`[WS] Client connected. Total: ${clients.size}`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsMessage;
        handleClientMessage(msg);
      } catch {
        console.warn('[WS] Received non-JSON message, ignoring.');
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });

    // Send a welcome/ping so the frontend knows we're live
    ws.send(JSON.stringify({ type: 'connected', payload: { version: '0.1.0' } }));
  });

  console.log('[WS] WebSocket server initialized on /ws');
}

function handleClientMessage(msg: WsMessage): void {
  switch (msg.type) {
    case 'scan:cancel': {
      const { repositoryId } = msg.payload as { repositoryId: string };
      const controller = activeScanControllers.get(repositoryId);
      if (controller) {
        controller.abort();
        activeScanControllers.delete(repositoryId);
        console.log(`[WS] Scan cancelled for repo: ${repositoryId}`);
      }
      break;
    }
    default:
      // Scan start is triggered via REST, not WS
      break;
  }
}

/** Broadcast a message to all connected clients */
export function broadcast<T>(type: string, payload: T): void {
  const msg = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastProgress(payload: WsScanProgressPayload): void {
  broadcast('scan:progress', payload);
}

export function broadcastComplete(payload: WsScanCompletePayload): void {
  broadcast('scan:complete', payload);
}

export function broadcastError(payload: WsScanErrorPayload): void {
  broadcast('scan:error', payload);
}

/** Register a cancellable scan controller */
export function registerScanController(repositoryId: string): AbortController {
  // Cancel any existing scan for this repo
  activeScanControllers.get(repositoryId)?.abort();
  const controller = new AbortController();
  activeScanControllers.set(repositoryId, controller);
  return controller;
}

export function unregisterScanController(repositoryId: string): void {
  activeScanControllers.delete(repositoryId);
}
