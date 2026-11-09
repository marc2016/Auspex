import type { CallDirection, CallEntry } from '../../../src/analyzer/calls/viewModel';
import { isRecursiveEntry } from '../../../src/analyzer/calls/viewModel';

/** Key of a node in the call tree: direction plus the function ids on the path from the subject. */
export function pathKey(direction: CallDirection, pathIds: string[]): string {
  return `${direction}:${pathIds.join('|')}`;
}

export interface CallTreeRow {
  entry: CallEntry;
  depth: number;
  key: string;
  /** Function ids from the subject down to (and including) this entry. */
  pathIds: string[];
  recursive: boolean;
  canExpand: boolean;
  expanded: boolean;
  loading: boolean;
}

export interface ChildrenState {
  loading: boolean;
  items?: CallEntry[];
}

/**
 * Flattens the visible part of a call tree into rows. `children` maps path keys of expanded entries
 * to their loaded children; recursion (an id already on the path) stops expansion.
 */
export function buildCallTreeRows(
  direction: CallDirection,
  subjectId: string,
  roots: CallEntry[],
  expanded: Set<string>,
  children: Map<string, ChildrenState>
): CallTreeRow[] {
  const rows: CallTreeRow[] = [];
  const visit = (entries: CallEntry[], parentPath: string[], depth: number) => {
    for (const entry of entries) {
      const recursive = isRecursiveEntry(parentPath, entry);
      const pathIds = entry.id ? [...parentPath, entry.id] : parentPath;
      const key = pathKey(direction, entry.id ? pathIds : [...parentPath, entry.key]);
      const canExpand = !recursive && entry.expandable && !!entry.id;
      const isExpanded = canExpand && expanded.has(key);
      const state = children.get(key);
      rows.push({ entry, depth, key, pathIds, recursive, canExpand, expanded: isExpanded, loading: !!state?.loading });
      if (isExpanded && state?.items) visit(state.items, pathIds, depth + 1);
    }
  };
  visit(roots, [subjectId], 0);
  return rows;
}
