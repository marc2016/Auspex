import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mdiChevronRight, mdiChevronDown, mdiFunctionVariant, mdiFileCodeOutline, mdiReload } from '@mdi/js';
import type { CallDirection, CallEntry, CallsViewState } from '../../../src/analyzer/calls/viewModel';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { getCodeHealthColor } from './SystemMapViewer';
import { getHeatColor } from './TreemapViewer';
import { buildCallTreeRows, type ChildrenState } from '../utils/callTree';

interface VsCodeLike {
  postMessage(message: unknown): void;
}

interface Props {
  language: Language;
  vscode: VsCodeLike;
}

const EMPTY: CallsViewState = { status: 'noScan', incoming: [], outgoing: [], lspLoading: false, nameOnly: false };

const isLightTheme = () =>
  typeof document !== 'undefined' &&
  (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light'));

/** "Calls" sidebar view: incoming and outgoing call trees of the selected function. */
export const CallsPanel: React.FC<Props> = ({ language, vscode }) => {
  const t = WEBVIEW_STRINGS[language].calls;
  const [state, setState] = useState<CallsViewState>(EMPTY);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Map<string, ChildrenState>>(new Map());
  const pending = useRef(new Map<number, string>());
  const nextRequest = useRef(1);
  const subjectRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'calls:update') {
        const nextSubject = msg.payload?.subject?.id;
        if (subjectRef.current !== nextSubject) {
          subjectRef.current = nextSubject;
          setExpanded(new Set());
          setChildren(new Map());
          pending.current.clear();
        }
        setState(msg.payload);
      } else if (msg?.type === 'calls:children') {
        const key = pending.current.get(msg.payload.requestId);
        if (!key) return;
        pending.current.delete(msg.payload.requestId);
        setChildren((prev) => new Map(prev).set(key, { loading: false, items: msg.payload.items }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const subjectId = state.subject?.id ?? '';

  const toggle = (direction: CallDirection, key: string, entry: CallEntry) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!children.has(key) && entry.id) {
      const requestId = nextRequest.current++;
      pending.current.set(requestId, key);
      setChildren((prev) => new Map(prev).set(key, { loading: true }));
      vscode.postMessage({ type: 'calls:expand', requestId, id: entry.id, direction });
    }
  };

  const open = (entry: CallEntry) =>
    vscode.postMessage({ type: 'openFile', filePath: entry.file, startLine: entry.line, endLine: entry.endLine ?? entry.line });

  if (state.status === 'noScan') {
    return (
      <div style={styles.message}>
        <p>{t.noScan}</p>
        <button style={styles.button} onClick={() => vscode.postMessage({ type: 'startScan' })}>
          <Icon path={mdiReload} size={0.7} /> {t.startScan}
        </button>
      </div>
    );
  }
  if (state.status === 'notFunction' || !state.subject) {
    return (
      <div style={styles.message}>
        <p>{t.notFunction}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <SubjectHeader entry={state.subject} t={t} onOpen={open} />
      {state.lspLoading && <div style={styles.note}>{t.lspLoading}</div>}
      {state.nameOnly && <div style={styles.note}>{t.nameOnly}</div>}
      <CallSection
        title={t.incoming}
        empty={t.noCallers}
        direction="incoming"
        subjectId={subjectId}
        roots={state.incoming}
        expanded={expanded}
        childrenState={children}
        onToggle={toggle}
        onOpen={open}
        t={t}
      />
      <CallSection
        title={t.outgoing}
        empty={t.noCallees}
        direction="outgoing"
        subjectId={subjectId}
        roots={state.outgoing}
        expanded={expanded}
        childrenState={children}
        onToggle={toggle}
        onOpen={open}
        t={t}
      />
    </div>
  );
};

type CallStrings = (typeof WEBVIEW_STRINGS)['de']['calls'];

const Metrics: React.FC<{ entry: CallEntry; t: CallStrings }> = ({ entry, t }) => {
  if (entry.location) return null;
  const light = isLightTheme();
  return (
    <span style={styles.metrics}>
      {typeof entry.churnScore === 'number' && (
        <span title="Churn" style={{ ...styles.dot, background: getHeatColor(entry.churnScore, light) }} />
      )}
      {typeof entry.codeHealth === 'number' && (
        <span title="Code Health" style={{ ...styles.badge, color: getCodeHealthColor(entry.codeHealth) }}>
          {entry.codeHealth.toFixed(1)}
        </span>
      )}
      {typeof entry.loc === 'number' && (
        <span style={styles.muted}>
          {entry.loc} {t.loc}
        </span>
      )}
    </span>
  );
};

const SubjectHeader: React.FC<{ entry: CallEntry; t: CallStrings; onOpen: (e: CallEntry) => void }> = ({ entry, t, onOpen }) => (
  <div style={styles.subject} onClick={() => onOpen(entry)} title={entry.file}>
    <div style={styles.subjectTitle}>
      <Icon path={mdiFunctionVariant} size={0.75} /> {entry.label}
    </div>
    <div style={styles.subjectMeta}>
      <span style={styles.muted}>{entry.file}</span>
      <Metrics entry={entry} t={t} />
    </div>
  </div>
);

interface SectionProps {
  title: string;
  empty: string;
  direction: CallDirection;
  subjectId: string;
  roots: CallEntry[];
  expanded: Set<string>;
  childrenState: Map<string, ChildrenState>;
  onToggle: (direction: CallDirection, key: string, entry: CallEntry) => void;
  onOpen: (entry: CallEntry) => void;
  t: CallStrings;
}

const CallSection: React.FC<SectionProps> = ({ title, empty, direction, subjectId, roots, expanded, childrenState, onToggle, onOpen, t }) => {
  const rows = useMemo(
    () => buildCallTreeRows(direction, subjectId, roots, expanded, childrenState),
    [direction, subjectId, roots, expanded, childrenState]
  );
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>
        {title} <span style={styles.muted}>({roots.length})</span>
      </div>
      {rows.length === 0 && <div style={styles.empty}>{empty}</div>}
      {rows.map((row) => {
        const inferred = row.entry.confidence === 'inferred';
        return (
          <div key={row.key} style={{ ...styles.row, paddingLeft: 6 + row.depth * 14 }} title={row.entry.location ? t.declarative : row.entry.file}>
            <span
              style={{ ...styles.chevron, visibility: row.canExpand ? 'visible' : 'hidden' }}
              onClick={() => onToggle(direction, row.key, row.entry)}
            >
              <Icon path={row.expanded ? mdiChevronDown : mdiChevronRight} size={0.7} />
            </span>
            <span style={styles.rowMain} onClick={() => onOpen(row.entry)}>
              <Icon path={row.entry.location ? mdiFileCodeOutline : mdiFunctionVariant} size={0.65} />
              <span style={{ ...styles.label, ...(inferred ? styles.inferredLabel : {}) }}>{row.entry.label}</span>
              {inferred && (
                <span style={styles.tag} title={t.inferredHint}>
                  {t.inferred}
                </span>
              )}
              {row.recursive && <span style={styles.tag}>{t.recursive}</span>}
              {!row.entry.location && <span style={styles.muted}>{row.entry.file.split('/').pop()}</span>}
              <Metrics entry={row.entry} t={t} />
              {row.loading && <span style={styles.muted}>…</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '8px 4px', fontSize: 12, color: 'var(--vscode-foreground)' },
  message: { padding: 12, fontSize: 12, color: 'var(--vscode-descriptionForeground)' },
  button: {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: 'none', cursor: 'pointer',
    background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
  },
  note: { padding: '2px 8px', fontSize: 11, color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' },
  subject: { padding: '4px 8px 8px', borderBottom: '1px solid var(--vscode-panel-border)', cursor: 'pointer' },
  subjectTitle: { display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 },
  subjectMeta: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 },
  section: { marginTop: 8 },
  sectionTitle: { padding: '2px 8px', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 },
  empty: { padding: '2px 22px', color: 'var(--vscode-descriptionForeground)' },
  row: { display: 'flex', alignItems: 'center', minHeight: 22 },
  chevron: { display: 'inline-flex', cursor: 'pointer', width: 16 },
  rowMain: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' },
  label: { overflow: 'hidden', textOverflow: 'ellipsis' },
  inferredLabel: { fontStyle: 'italic', textDecoration: 'underline dotted' },
  tag: {
    fontSize: 10, padding: '0 4px', borderRadius: 3,
    border: '1px solid var(--vscode-panel-border)', color: 'var(--vscode-descriptionForeground)',
  },
  metrics: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  badge: { fontWeight: 600, fontSize: 11 },
  muted: { color: 'var(--vscode-descriptionForeground)', fontSize: 11 },
};
