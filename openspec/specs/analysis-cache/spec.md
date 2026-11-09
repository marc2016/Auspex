# analysis-cache Specification

## Purpose
Defines when Auspex may reuse cached per-file analysis results and stored snapshots, and when it must re-analyze, so that improvements to the analysis reach users without manual cache clearing.

## Requirements

### Requirement: Versioned analysis results
The system SHALL record the analyzer version with every cached per-file result and every stored snapshot. The analyzer version SHALL change whenever a change to the analysis alters the results for unchanged source files.

#### Scenario: Version is stored
- **WHEN** a file is analyzed and its result is written to the file cache
- **THEN** the cached entry records the current analyzer version

### Requirement: Reuse of cached file results
The system SHALL reuse a cached per-file result only if its analyzer version equals the current analyzer version and the file has not been modified since it was analyzed. Otherwise the file SHALL be analyzed again.

#### Scenario: Unchanged file, same version
- **GIVEN** a cached result for `a.js` with the current analyzer version
- **AND** `a.js` has not been modified since
- **WHEN** a scan runs
- **THEN** the cached result for `a.js` is reused

#### Scenario: Unchanged file, older version
- **GIVEN** a cached result for `a.js` written by an older analyzer version
- **AND** `a.js` has not been modified since
- **WHEN** a scan runs
- **THEN** `a.js` is analyzed again and the cache entry is replaced

#### Scenario: Cache entry without version
- **GIVEN** a cached result written before versioning existed
- **WHEN** a scan runs
- **THEN** the file is analyzed again

### Requirement: Reuse of stored snapshots
The system SHALL restore a stored snapshot on startup only if it was written by the current analyzer version. Otherwise it SHALL treat the snapshot as absent, exactly as it does today for snapshots without Code Health data.

#### Scenario: Snapshot from older version
- **GIVEN** a stored snapshot written by an older analyzer version
- **WHEN** the extension starts and the user opens the treemap
- **THEN** the old snapshot is not shown and a fresh scan is performed
