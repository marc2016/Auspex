import { describe, it, expect } from 'vitest';
import { extractJiraKeys } from '../src/integrations/jira/ticketExtractor';

describe('ticketExtractor', () => {
  it('extracts standard Jira keys from commit messages', () => {
    expect(extractJiraKeys('PROJ-123: fix authentication loop')).toEqual(['PROJ-123']);
    expect(extractJiraKeys('[AUS-42] Implement hotspot coloring')).toEqual(['AUS-42']);
    expect(extractJiraKeys('Merge branch feature/JIRA_APP-999-sidebar into main')).toEqual(['JIRA_APP-999']);
  });

  it('extracts multiple distinct keys from a single message and deduplicates', () => {
    const msg = 'PROJ-123 and PROJ-456: fixed race condition (closes PROJ-123)';
    expect(extractJiraKeys(msg)).toEqual(['PROJ-123', 'PROJ-456']);
  });

  it('returns empty array when no Jira keys are present', () => {
    expect(extractJiraKeys('fix: handle null pointer')).toEqual([]);
    expect(extractJiraKeys('123-PROJ invalid key format')).toEqual([]);
    expect(extractJiraKeys('')).toEqual([]);
  });

  it('filters by allowed project keys when specified', () => {
    const msg = 'AUS-100 and OTHER-200 and AUS-101: mixed project work';
    expect(extractJiraKeys(msg, ['AUS'])).toEqual(['AUS-100', 'AUS-101']);
    expect(extractJiraKeys(msg, ['aus'])).toEqual(['AUS-100', 'AUS-101']); // case-insensitive check
    expect(extractJiraKeys(msg, ['NONEXISTENT'])).toEqual([]);
  });
});
