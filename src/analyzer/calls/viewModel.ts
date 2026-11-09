import type { TreeNode } from '../types';
import { findTreeNodeForFunction } from './functionIndex';
import {
  isLocationCaller,
  type CallConfidence,
  type CallEdge,
  type CallGraph,
  type CallSourceKind,
  type FunctionId,
} from './types';

export type CallDirection = 'incoming' | 'outgoing';

/** One entry in the Calls view (a function or a location caller in a non-code file). */
export interface CallEntry {
  /** Unique key within its list. */
  key: string;
  /** FunctionId for function entries; undefined for location callers. */
  id?: FunctionId;
  label: string;
  file: string;
  /** Start line of the function, or the referencing line of a location caller. */
  line: number;
  endLine?: number;
  /** Confidence of the edge leading to this entry (undefined for the subject). */
  confidence?: CallConfidence;
  source?: CallSourceKind;
  location: boolean;
  codeHealth?: number;
  churnScore?: number;
  loc?: number;
  /** Whether expanding the entry can show further callers/callees. */
  expandable: boolean;
}

export type CallsViewStatus = 'noScan' | 'notFunction' | 'ready';

export interface CallsViewState {
  status: CallsViewStatus;
  subject?: CallEntry;
  incoming: CallEntry[];
  outgoing: CallEntry[];
  /** Language server query for the subject is in progress. */
  lspLoading: boolean;
  /** Only Auspex's name-based resolution is available for the subject. */
  nameOnly: boolean;
}

function metricsFor(tree: TreeNode | null, graph: CallGraph, id: FunctionId) {
  const fn = graph.functions.find((f) => f.id === id);
  const node = fn && tree ? findTreeNodeForFunction(tree, fn) : null;
  return { fn, node };
}

/** Entry for a function, annotated with metrics from the tree. */
export function functionEntry(
  graph: CallGraph,
  tree: TreeNode | null,
  id: FunctionId,
  direction: CallDirection | null,
  edge?: CallEdge
): CallEntry | null {
  const { fn, node } = metricsFor(tree, graph, id);
  if (!fn) return null;
  const counts = graph.counts[id];
  const expandable =
    direction === 'incoming' ? (counts?.callers ?? 0) > 0 : direction === 'outgoing' ? (counts?.callees ?? 0) > 0 : false;
  return {
    key: id,
    id,
    label: fn.qualifiedName,
    file: fn.file,
    line: fn.startLine,
    endLine: fn.endLine,
    confidence: edge?.confidence,
    source: edge?.source,
    location: false,
    codeHealth: node?.codeHealth,
    churnScore: node?.churnScore,
    loc: node?.loc,
    expandable,
  };
}

/** Callers (incoming) or callees (outgoing) of a function as view entries, sorted by label. */
export function callEntriesFor(
  graph: CallGraph,
  tree: TreeNode | null,
  id: FunctionId,
  direction: CallDirection
): CallEntry[] {
  const edges = graph.edges.filter((e) => (direction === 'incoming' ? e.to === id : e.from === id));
  const entries: CallEntry[] = [];
  for (const edge of edges) {
    if (direction === 'incoming' && isLocationCaller(edge.from)) {
      entries.push({
        key: `${edge.from.file}:${edge.from.line}`,
        label: `${edge.from.file.split('/').pop()}:${edge.from.line}`,
        file: edge.from.file,
        line: edge.from.line,
        confidence: edge.confidence,
        source: edge.source,
        location: true,
        expandable: false,
      });
      continue;
    }
    const target = direction === 'incoming' ? (edge.from as FunctionId) : edge.to;
    const entry = functionEntry(graph, tree, target, direction, edge);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

/** An entry is recursive if its function already appears on the path from the subject. */
export function isRecursiveEntry(pathIds: FunctionId[], entry: CallEntry): boolean {
  return !!entry.id && pathIds.includes(entry.id);
}
