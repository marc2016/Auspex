interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscodeInstance: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (!vscodeInstance) {
    if (typeof acquireVsCodeApi === 'function') {
      vscodeInstance = acquireVsCodeApi();
    } else {
      // Mock for browser testing
      vscodeInstance = {
        postMessage: (msg: unknown) => console.log('[VsCode Mock postMessage]', msg),
        getState: () => ({}),
        setState: () => {},
      };
    }
  }
  return vscodeInstance;
}
