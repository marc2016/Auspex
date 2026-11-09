import type { DeclarativeReport } from '../types';

export interface DeclarativeReportStrings {
  title: string;
  warnings: string;
  rules: string;
  rule: (files: string, matchedFiles: number, references: number) => string;
  unresolved: string;
  noUnresolved: string;
}

/** Whether there is anything worth reporting (rules configured, warnings or unresolved references). */
export function hasDeclarativeReport(report: DeclarativeReport | undefined): report is DeclarativeReport {
  return !!report && (report.rules.length > 0 || report.warnings.length > 0 || report.unresolved.length > 0);
}

/** Text for the "Auspex" output channel. */
export function formatDeclarativeReport(report: DeclarativeReport, t: DeclarativeReportStrings): string[] {
  const lines = [t.title, ''];
  if (report.warnings.length > 0) {
    lines.push(t.warnings);
    for (const w of report.warnings) lines.push(`  ! ${w}`);
    lines.push('');
  }
  if (report.rules.length > 0) {
    lines.push(t.rules);
    for (const r of report.rules) lines.push(`  ${t.rule(r.files.join(', '), r.matchedFiles, r.references)}`);
    lines.push('');
  }
  if (report.unresolved.length > 0) {
    lines.push(`${t.unresolved} (${report.unresolved.length})`);
    const sorted = [...report.unresolved].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    for (const u of sorted) lines.push(`  ${u.file}:${u.line}  ${u.value}`);
  } else {
    lines.push(t.noUnresolved);
  }
  return lines;
}
