# Proposal

## Why

In XML-based files, JavaScript functions are often referenced as string arguments of a dispatcher call, e.g. `onClick="invoke('Cart.save')"`. Today string literals are blanked before calls are extracted, so only `invoke` is found and `Cart.save` silently gets no caller, which makes the Calls view and caller counts incomplete for these files. Which dispatcher functions a project uses is often not known up front, so detection must work without configuration and help users discover them.

## What Changes

- String arguments of calls in configured attributes and element texts whose content looks like a function reference (`name` or `Container.method`) become a new reference form "string argument", remembering the call that carries the string (the carrier).
- Without configuration, a string argument produces an `inferred` edge only if it resolves to exactly one known function; otherwise it is dropped silently.
- New optional rule property `dispatchers`: string arguments of the listed carrier functions are resolved like written references (`certain` if unique, `inferred` per candidate if ambiguous), and unresolved ones are reported.
- Heuristic mode also takes string arguments, always `inferred` and only if unique.
- The "Auspex" output channel gains a section listing carrier functions with the number of resolved string references, marking configured dispatchers, so users can decide which carriers to add to `dispatchers`.
- Cached per-file results are re-extracted once (analyzer version bump) so existing workspaces pick up string references without a manual cache reset.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `declarative-references`: new `dispatchers` rule property, string-argument reference form, resolution and unresolved-reporting rules for string arguments, carrier report in the output channel.

## Impact

- `src/analyzer/declarative/references.ts` (interpretation of expressions), `rules.ts` (`dispatchers`), `declarativeEdgeSource.ts` (resolution, carrier statistics), `report.ts` and `src/analyzer/pipeline.ts` (report), `src/analyzer/types.ts` (report type, `ANALYZER_VERSION`).
- `package.json` setting schema, `src/i18n.ts` report strings, README and CHANGELOG.
- Tests under `test/declarative/`.
- No new dependencies; existing rules keep working unchanged (string arguments only add edges).
