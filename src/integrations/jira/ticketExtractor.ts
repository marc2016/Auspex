/**
 * Utility for extracting Jira ticket keys from commit messages or branch names.
 */

// Matches standard Jira issue keys like PROJ-123, AUS_PEX-42, etc.
const JIRA_KEY_REGEX = /\b([A-Z][A-Z0-9_]+-\d+)\b/g;

/**
 * Extracts unique Jira ticket keys from a commit message.
 * @param message The commit message text.
 * @param allowedProjectKeys Optional list of project keys to filter by (e.g. ['PROJ', 'AUS']).
 * @returns Array of unique Jira ticket keys (e.g. ['PROJ-123', 'AUS-42']).
 */
export function extractJiraKeys(message: string, allowedProjectKeys?: string[]): string[] {
  if (!message) return [];

  const matches = message.match(JIRA_KEY_REGEX);
  if (!matches) return [];

  const uniqueKeys = Array.from(new Set(matches.map((k) => k.toUpperCase())));

  if (!allowedProjectKeys || allowedProjectKeys.length === 0) {
    return uniqueKeys;
  }

  const normalizedAllowed = new Set(
    allowedProjectKeys.map((p) => p.trim().toUpperCase()).filter(Boolean)
  );

  if (normalizedAllowed.size === 0) {
    return uniqueKeys;
  }

  return uniqueKeys.filter((key) => {
    const prefix = key.split('-')[0];
    return normalizedAllowed.has(prefix);
  });
}
