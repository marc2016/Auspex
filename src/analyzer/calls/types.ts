/**
 * Call analysis data model.
 *
 * A function is identified by a FunctionId: "<relPath>#<qualifiedName>", where qualifiedName is
 * `Container.method` for container methods, `method` for top-level functions, `parent > child` for
 * nested helpers, and the plain name for a constructor/component body. On a collision within one
 * file, "@<startLine>" is appended.
 */
export type FunctionId = string;

export type CallConfidence = 'certain' | 'inferred';

/** Kind of source that produced an edge. */
export type CallSourceKind = 'js' | 'declarative';

/** How the receiver of a call (`recv.name()`) was classified during extraction. */
export type ReceiverKind =
  /** bare call: `name()` */
  | 'none'
  /** `this.name()` or `alias.name()` where alias is bound to `this` */
  | 'this'
  /** `param.name()` where param is an AMD factory parameter */
  | 'amd'
  /** any other receiver, e.g. `obj.name()` */
  | 'other';

/** A call found in the source of a known function (per file, cached with the parse result). */
export interface CallSite {
  /** Name of the calling method as reported by the extractor (e.g. `add()`, `Cart > validate()`). */
  callerName: string;
  /** Start line of the calling method (disambiguates same-named methods). */
  callerStartLine: number;
  /** 1-based line of the call. */
  line: number;
  /** Called name (`persist` in `Store.persist()`). */
  callee: string;
  receiverKind: ReceiverKind;
  /** Receiver identifier for `amd` and `other` calls. */
  receiver?: string;
  /** Type of the receiver from a local `new X()` or a TypeScript annotation (last name segment). */
  receiverType?: string;
}

/** An ES import or CommonJS require of a relative module. */
export interface FileImport {
  /** Local name in the importing file. */
  local: string;
  /** Imported name, `default` or `*` (namespace / whole module). */
  imported: string;
  /** Module specifier as written (relative, e.g. `../i18n`). */
  source: string;
}

/** A location in a file that is not a function (e.g. an XML attribute referencing a JS handler). */
export interface CallLocation {
  file: string;
  line: number;
}

export type CallerRef = FunctionId | CallLocation;

export interface CallEdge {
  from: CallerRef;
  to: FunctionId;
  confidence: CallConfidence;
  source: CallSourceKind;
}

/** A known function as needed by the call views (metrics are looked up in the tree). */
export interface CallFunctionRef {
  id: FunctionId;
  file: string;
  /** Qualified name without file, e.g. `Cart.add`. */
  qualifiedName: string;
  startLine: number;
  endLine: number;
}

export interface CallCounts {
  callers: number;
  callees: number;
}

export interface CallGraph {
  functions: CallFunctionRef[];
  edges: CallEdge[];
  counts: Record<FunctionId, CallCounts>;
}

/** Context handed to edge sources. */
export interface CallEdgeSourceContext {
  /** Parsed files of the workspace (with call sites and AMD dependencies where available). */
  files: import('../types').ParsedFileInfo[];
  /** Index of all known functions of these files. */
  index: import('./functionIndex').FunctionIndex;
}

/** A pluggable producer of call edges (code analysis, language server, declarative references, ...). */
export interface CallEdgeSource {
  readonly kind: CallSourceKind;
  collect(ctx: CallEdgeSourceContext): CallEdge[];
}

export function isLocationCaller(from: CallerRef): from is CallLocation {
  return typeof from !== 'string';
}
