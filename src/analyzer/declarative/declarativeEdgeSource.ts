import path from 'path';
import type { FunctionIndex, IndexedFunction } from '../calls/functionIndex';
import type { CallConfidence, CallEdge, CallEdgeSource, CallEdgeSourceContext } from '../calls/types';
import type { ParsedFileInfo, UnresolvedDeclarativeRef } from '../types';
import type { DeclarativeRef } from './references';

const JS_EXTENSIONS = ['', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];

/**
 * Resolves references found in XML-like files to known functions and contributes them as call
 * edges with a location caller (source kind `declarative`).
 */
export class DeclarativeEdgeSource implements CallEdgeSource {
  readonly kind = 'declarative' as const;
  /** Unresolved bare/qualified/pair references of the last `collect` call. */
  lastUnresolved: UnresolvedDeclarativeRef[] = [];

  collect(ctx: CallEdgeSourceContext): CallEdge[] {
    const filePaths = new Set(ctx.files.map((f) => f.filePath));
    const edges: CallEdge[] = [];
    const unresolved: UnresolvedDeclarativeRef[] = [];

    for (const file of ctx.files) {
      for (const ref of file.declarativeRefs ?? []) {
        const { targets, confidence } = resolveRef(ref, file, ctx.index, filePaths);
        if (targets.length === 0) {
          if (ref.form !== 'expression' && !ref.heuristic) {
            unresolved.push({ file: file.filePath, line: ref.line, value: ref.value });
          }
          continue;
        }
        for (const t of targets) {
          edges.push({ from: { file: file.filePath, line: ref.line }, to: t.id, confidence, source: 'declarative' });
        }
      }
    }
    this.lastUnresolved = unresolved;
    return edges;
  }
}

function resolveRef(
  ref: DeclarativeRef,
  file: ParsedFileInfo,
  index: FunctionIndex,
  filePaths: Set<string>
): { targets: IndexedFunction[]; confidence: CallConfidence } {
  let candidates: IndexedFunction[];

  if (ref.form === 'pair') {
    const target = resolveTargetFile(ref.targetFile ?? '', file.filePath, filePaths);
    candidates = target ? index.inFile(target).filter((f) => f.name === ref.name && !f.nested) : [];
  } else if (ref.name.includes('.')) {
    const dot = ref.name.lastIndexOf('.');
    candidates = index.containerMethods(ref.name.slice(0, dot), ref.name.slice(dot + 1));
  } else {
    candidates = index.named(ref.name).filter((f) => !f.nested);
    // Heuristic bare names are only trusted if they are unique in the workspace
    if (ref.heuristic && ref.form === 'name' && candidates.length !== 1) candidates = [];
  }

  const unique = [...new Map(candidates.map((c) => [c.id, c])).values()];
  const confidence: CallConfidence = !ref.heuristic && unique.length === 1 ? 'certain' : 'inferred';
  return { targets: unique, confidence };
}

/** Workspace path of a referenced JS file: relative to the workspace root, then to the XML file. */
export function resolveTargetFile(target: string, fromFile: string, filePaths: Set<string>): string | undefined {
  const clean = target.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean) return undefined;
  const bases = [
    path.posix.normalize(clean),
    path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean)),
  ];
  for (const base of bases) {
    for (const ext of JS_EXTENSIONS) {
      if (filePaths.has(base + ext)) return base + ext;
    }
  }
  return undefined;
}
