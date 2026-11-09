import ELK from 'elkjs/lib/elk-api';
import elkWorkerSource from 'elkjs/lib/elk-worker.min.js?raw';
import type { ElkHandle } from './client';

/**
 * ELK running in its own Web Worker. The worker script is started from a Blob URL because VS Code
 * webviews cannot load worker scripts from resource URLs. Falls back to the bundled (main-thread)
 * ELK if workers are unavailable.
 */
export async function createElk(): Promise<ElkHandle> {
  try {
    const url = URL.createObjectURL(new Blob([elkWorkerSource], { type: 'text/javascript' }));
    const elk = new ELK({ workerFactory: () => new Worker(url) });
    // probe: fails fast if the worker cannot start
    await elk.layout({ id: 'probe', children: [], edges: [] });
    return { elk, usesWorker: true };
  } catch {
    const { default: Bundled } = await import('elkjs/lib/elk.bundled.js');
    return { elk: new Bundled(), usesWorker: false };
  }
}
