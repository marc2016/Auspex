# Design

## Context

See proposal.md - Why. Relevant current state:

- `interpretValue()` in `src/analyzer/declarative/references.ts` replaces every string literal with an empty one before matching `name(` / `a.b(`, so string contents never reach resolution.
- `extractDeclarativeRefs()` runs per rule and file at parse time; results are cached as `ParsedFileInfo.declarativeRefs`. Cache reuse depends on `ANALYZER_VERSION` and the rules hash (`parseRules()` hashes the validated rules, so a new rule property invalidates automatically).
- `DeclarativeEdgeSource.resolveRef()` resolves by form; `lastUnresolved` feeds `buildDeclarativeReport()` in `pipeline.ts`, which `formatDeclarativeReport()` in `report.ts` turns into output channel lines.

## Goals / Non-Goals

**Goals:**
- String-argument references with carrier tracking, `dispatchers` rule property, and carrier report (spec: `declarative-references`).

**Non-Goals:**
- String-argument references in JavaScript/TypeScript source files (the regular call analysis). Can follow as a separate change once the report shows how common the pattern is.
- Strings that are concatenated or computed (`'Cart.' + action`), template literals with substitutions, and object/array literals holding names.
- Strings in CDATA sections or values wrapped in quotes without a call (cases B and C from the exploration).

## Decisions

### D1: Carrier-aware scan of the expression instead of blank-then-regex
`interpretValue()` keeps the existing blanked-code pass for called names and adds a second, small left-to-right scan over the original value: it tracks a stack of open parentheses, each with the dotted name written directly before it (`invoke`, `App.call`, or `null` for grouping parentheses). A string literal (`'...'`, `"..."`, or a backtick literal without `${`) counts when the top frame has a name, the previous significant character is `(` or `,`, and the next one is `,` or `)`. Its content must match the existing simple-reference pattern.
- *Why:* gives the innermost carrier for nested calls (`run(invoke('x'))` -> `invoke`) and rejects assignments and concatenations, without a JS parser.
- *Alternative:* parse the value with the TypeScript/Babel parser already used for JS files. More exact, but heavier per attribute and fails on the many values that are not valid standalone JS (fragments, template placeholders of in-house formats).

### D2: Reference model
`DeclarativeRefForm` gains `'string'`. `DeclarativeRef` gains `carrier?: string` (dotted name as written) and `dispatcher?: boolean`. `dispatcher` is set at extraction time when the carrier is listed in the `dispatchers` of the rule that produced the reference; when several rules yield the same reference, `true` wins (the dedupe key ignores the flag and upgrades an existing entry).
- *Why:* extraction already knows the rule; resolution then needs no access to rules, and the cache stays self-contained.

### D3: Dispatcher matching
A carrier matches a `dispatchers` entry when the written dotted name is equal to it (`App.call` matches `App.call`, not `call`; `this.invoke` matches only `this.invoke`). The report shows carriers exactly as written, so users copy the name from there.
- *Why:* predictable and consistent with how the report presents carriers.
- *Alternative:* suffix matching (`call` matches `App.call`). More forgiving, but makes accidental matches with common method names likely.

### D4: Resolution rules
In `resolveRef()`, a `'string'` reference with `dispatcher` resolves exactly like a `name`/`qualified` reference. Without `dispatcher` (and always in heuristic mode) it keeps candidates only if exactly one function matches; confidence is `inferred`. Unresolved string references are added to `lastUnresolved` only when `dispatcher` is set and not heuristic.

### D5: Carrier statistics and report
`DeclarativeEdgeSource` counts, per carrier, the string references that produced at least one edge, and records whether any of them was a dispatcher reference; exposed as `lastCarriers`. `DeclarativeReport` gains `carriers: { name: string; count: number; dispatcher: boolean }[]`, filled in `buildDeclarativeReport()`. `formatDeclarativeReport()` prints a section "String references by carrier" (sorted by count, then name; configured ones marked) only when the list is non-empty; `hasDeclarativeReport()` also returns true when carriers exist. Strings are localized in `src/i18n.ts` (de/en).
- *Note:* "configured" is derived from the references (`dispatcher` flag), which matches "configured in any rule" for every carrier that actually appears.

### D6: Cache migration
Bump `ANALYZER_VERSION` from 5 to 6 so cached `declarativeRefs` produced by the old interpretation are re-extracted once. The rules hash covers `dispatchers` changes.

### D7: Setting schema
`package.json` adds `dispatchers` (string or string array) to the rule item schema with a description and an example; `parseRules()` validates it like `attributes`/`elements` and stores it as a list (default `[]`). A dispatchers-only rule (no attributes/elements/pair) stays invalid, because dispatchers apply only within those sources.

## Risks / Trade-offs

- [Unconfigured string arguments produce false `inferred` edges when a plain-text string such as `'init'` happens to equal a unique function name] -> Only names matching exactly one function are kept, edges are `inferred`, and the carrier report makes the source visible; users can switch to explicit `dispatchers`.
- [Hand-written scan misreads unusual expressions (regex literals, escaped quotes in odd places)] -> Failure mode is a missed or extra string reference, never a crashed scan; unit tests cover escapes, nested calls and non-argument strings.
- [Cache version bump forces a full re-parse on the first scan after the update] -> One-time cost, same as earlier analyzer changes.
