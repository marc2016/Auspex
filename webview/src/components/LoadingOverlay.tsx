import React, { useEffect, useState } from 'react';
import { formatElapsed } from '../utils/callDiagram/view';

interface LoadingStrings {
  loadStep: (n: number) => string;
  loadFunctions: (n: number) => string;
  loadElapsed: (time: string) => string;
}

interface Props {
  /** Current step out of three. */
  step: 1 | 2 | 3;
  /** What the step does, e.g. "Computing layout…". */
  stepText: string;
  /** Number of functions being laid out, once known. */
  functionCount?: number;
  /** Start of the load (ms since epoch); the elapsed time spans all steps. */
  startedAt: number;
  /** Show the indicator only after this delay, so fast re-layouts do not flash. */
  delayMs?: number;
  /** Dim the content below (a previous diagram that is being replaced). */
  dim?: boolean;
  strings: LoadingStrings;
}

/**
 * Loading indicator centered over a canvas. It owns the elapsed-time tick and the show delay, so
 * the (possibly large) content below is not re-rendered while it runs. Does not block the mouse.
 */
export const LoadingOverlay: React.FC<Props> = ({ step, stepText, functionCount, startedAt, delayMs = 0, dim = false, strings }) => {
  const [visible, setVisible] = useState(delayMs <= 0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => {
      setNow(Date.now());
      setVisible(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!visible) return null;
  return (
    <div style={styles.overlay} role="status" aria-live="polite">
      {dim && <div style={styles.dim} />}
      <div style={styles.card}>
        <div className="auspex-load-spinner" style={styles.spinner} />
        <div style={styles.text}>
          <strong>{strings.loadStep(step)}</strong>
          <span>{stepText}</span>
          <span style={styles.detail}>
            {functionCount !== undefined ? `${strings.loadFunctions(functionCount)} · ` : ''}
            {strings.loadElapsed(formatElapsed(now - startedAt))}
          </span>
        </div>
      </div>
      <style>{`
        @keyframes auspex-load-spin { to { transform: rotate(360deg); } }
        .auspex-load-spinner { animation: auspex-load-spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .auspex-load-spinner { animation: none; } }
      `}</style>
    </div>
  );
};

/** Message centered over a canvas (error or empty state); same slot as the loading indicator. */
export const CanvasMessage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={styles.overlay} role="status">
    <div style={styles.card}>{children}</div>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  dim: { position: 'absolute', inset: 0, background: 'var(--vscode-editor-background, #1e1e1e)', opacity: 0.6 },
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: 6,
    border: '1px solid var(--vscode-panel-border, #3c3c3c)',
    background: 'var(--vscode-editorWidget-background, #252526)',
    color: 'var(--vscode-foreground, #cccccc)',
    fontSize: 13,
  },
  spinner: {
    flex: 'none',
    width: 22,
    height: 22,
    border: '3px solid var(--vscode-focusBorder, #007fd4)',
    borderTopColor: 'transparent',
    borderRadius: '50%',
  },
  text: { display: 'flex', flexDirection: 'column', gap: 2 },
  detail: { color: 'var(--vscode-descriptionForeground, #9d9d9d)', fontVariantNumeric: 'tabular-nums' },
};
