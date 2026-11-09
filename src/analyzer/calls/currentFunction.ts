import type { ParsedFileInfo } from '../types';
import { indexFileFunctions } from './functionIndex';
import type { CallFunctionRef, FunctionId } from './types';

/** The function at the text cursor (live mode). */
export interface CurrentFunction {
  /** Workspace-relative file path. */
  file: string;
  /** Qualified name without file, e.g. `Cart.add`. */
  qualifiedName: string;
  /** Call graph function; undefined when the function is not in the call data yet (e.g. new, unsaved). */
  fnId?: FunctionId;
  /** Start and end line (1-based) in the edited document. */
  startLine: number;
  endLine: number;
}

const range = (f: { startLine: number; endLine: number }) => f.endLine - f.startLine;

/** Innermost of the given functions whose range contains a 1-based line. */
function innermostAt<T extends { startLine: number; endLine: number }>(fns: T[], line: number): T | undefined {
  let best: T | undefined;
  for (const fn of fns) {
    if (line < fn.startLine || line > fn.endLine) continue;
    if (!best || range(fn) < range(best)) best = fn;
  }
  return best;
}

/**
 * Determines the function at a 1-based cursor line.
 *
 * With `parsed` (the structure of the document as currently edited), the innermost function is taken
 * from it and matched to the call graph by file and qualified name, so unsaved line shifts do not
 * matter; duplicates are resolved by the closest start line. Without `parsed`, the call graph's own
 * lines are used. Returns undefined when the line is outside every known function.
 */
export function resolveCurrentFunction(
  file: string,
  line: number,
  parsed: ParsedFileInfo | undefined,
  graphFunctions: readonly CallFunctionRef[]
): CurrentFunction | undefined {
  const inFile = graphFunctions.filter((f) => f.file === file);

  if (!parsed) {
    const fn = innermostAt(inFile, line);
    return fn ? { file, qualifiedName: fn.qualifiedName, fnId: fn.id, startLine: fn.startLine, endLine: fn.endLine } : undefined;
  }

  const edited = innermostAt(indexFileFunctions(parsed), line);
  if (!edited) return undefined;

  let match: CallFunctionRef | undefined;
  for (const fn of inFile) {
    if (fn.qualifiedName !== edited.qualifiedName) continue;
    if (!match || Math.abs(fn.startLine - edited.startLine) < Math.abs(match.startLine - edited.startLine)) match = fn;
  }
  return {
    file,
    qualifiedName: edited.qualifiedName,
    fnId: match?.id,
    startLine: edited.startLine,
    endLine: edited.endLine,
  };
}

/** Whether two current functions denote the same function (no update needed). */
export function sameCurrentFunction(a: CurrentFunction | undefined, b: CurrentFunction | undefined): boolean {
  if (!a || !b) return a === b;
  return a.file === b.file && a.qualifiedName === b.qualifiedName && a.fnId === b.fnId;
}
