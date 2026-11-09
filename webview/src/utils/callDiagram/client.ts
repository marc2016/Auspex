import type { DiagramRequest, DiagramResponse } from './protocol';
import type { ElkLike } from './layout';

export interface ElkHandle {
  elk: ElkLike;
  /** True if the layout runs in ELK's Web Worker, false for the main-thread fallback. */
  usesWorker: boolean;
}

export interface LayoutRunner {
  request(req: DiagramRequest): void;
  dispose(): void;
}

/**
 * Runs layout requests: the (cheap) model is built on the main thread, the ELK layout runs in ELK's
 * worker. The ELK instance is created lazily on the first request. Requests are deferred so that the
 * progress indicator can render first.
 */
export function createLayoutRunner(
  onMessage: (msg: DiagramResponse) => void,
  createElk: () => Promise<ElkHandle>
): LayoutRunner {
  let disposed = false;
  let handle: Promise<ElkHandle> | null = null;
  return {
    request: (req) => {
      setTimeout(async () => {
        if (disposed) return;
        try {
          handle = handle ?? createElk();
          const { elk } = await handle;
          const { handleDiagramRequest } = await import('./protocol');
          if (!disposed) await handleDiagramRequest(req, (m) => !disposed && onMessage(m), elk);
        } catch (err) {
          if (!disposed) {
            onMessage({ requestId: req.requestId, type: 'error', message: err instanceof Error ? err.message : String(err) });
          }
        }
      }, 0);
    },
    dispose: () => {
      disposed = true;
    },
  };
}
