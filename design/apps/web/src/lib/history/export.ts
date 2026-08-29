// Taking the history away.
//
// The rule the changelog viewer already holds itself to applies here too: an
// export is *what is on screen*, not what the store happens to hold. The
// filtered revisions are rendered, the file states the scope it covers, and the
// scope sentence is the same one the panel is showing — passed in rather than
// rebuilt, so a file can never claim a range the list did not use.
//
// Three formats, because history is both prose and structure: Markdown to read,
// plain text to paste, JSON to re-import or diff. JSON carries every field the
// DTO has; the two text forms carry the human-readable ones and say so.

import type { HistoryRevisionSummary } from '@open-design/contracts';
import { markdownHeading, markdownInlineCode, markdownListItem } from '@open-design/contracts';
import { redactHistorySummaries } from './redaction';

export type HistoryExportFormat = 'markdown' | 'text' | 'json';

export interface HistoryExportLabels {
  readonly heading: string;
  /** One sentence naming exactly what was filtered in. */
  readonly scope: string;
  readonly kindLabel: (kind: HistoryRevisionSummary['kind']) => string;
  readonly restoredFrom: (id: string) => string;
  readonly changeCount: (count: number) => string;
  readonly empty: string;
  /** Sensitive domain ids whose labels/details must be redacted before export. */
  /**
   * Mandatory redaction policy. Callers with no sensitive domains pass an
   * empty set explicitly, so an omitted policy cannot accidentally export
   * credential-adjacent labels or details.
   */
  readonly sensitiveDomainIds: ReadonlySet<string>;
}

export const HISTORY_EXPORT_MEDIA_TYPES: Readonly<Record<HistoryExportFormat, string>> = {
  markdown: 'text/markdown',
  text: 'text/plain',
  json: 'application/json',
};

export const HISTORY_EXPORT_EXTENSIONS: Readonly<Record<HistoryExportFormat, string>> = {
  markdown: 'md',
  text: 'txt',
  json: 'json',
};

function timestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function safeRevisions(
  revisions: readonly HistoryRevisionSummary[],
  labels: HistoryExportLabels,
): readonly HistoryRevisionSummary[] {
  return redactHistorySummaries(revisions, labels.sensitiveDomainIds);
}

export function renderHistoryMarkdown(
  revisions: readonly HistoryRevisionSummary[],
  labels: HistoryExportLabels,
): string {
  revisions = safeRevisions(revisions, labels);
  const lines: string[] = [markdownHeading(labels.heading), '', `_${markdownListItem(labels.scope)}_`, ''];
  if (revisions.length === 0) {
    lines.push(labels.empty, '');
    return lines.join('\n');
  }
  for (const revision of revisions) {
    lines.push(markdownHeading(revision.label, 2));
    lines.push('');
    lines.push(
      `- ${markdownListItem(labels.kindLabel(revision.kind))} · ${markdownInlineCode(revision.id)} · ${timestamp(revision.createdAt)}`,
    );
    lines.push(`- ${markdownListItem(labels.changeCount(revision.changeCount))}`);
    if (revision.domainIds.length > 0) lines.push(`- ${markdownListItem(revision.domainIds.join(', '))}`);
    if (revision.restoredFromId != null) {
      lines.push(`- ${markdownListItem(labels.restoredFrom(revision.restoredFromId))}`);
    }
    // details[0] repeats the label when a revision recorded a single change;
    // printing it twice would read as two things having happened.
    const extra = revision.details.filter((line) => line !== revision.label);
    if (extra.length > 0) {
      lines.push('');
      for (const line of extra) lines.push(`  - ${markdownListItem(line)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function renderHistoryText(
  revisions: readonly HistoryRevisionSummary[],
  labels: HistoryExportLabels,
): string {
  revisions = safeRevisions(revisions, labels);
  const lines: string[] = [labels.heading, labels.scope, ''];
  if (revisions.length === 0) {
    lines.push(labels.empty, '');
    return lines.join('\n');
  }
  for (const revision of revisions) {
    lines.push(`${timestamp(revision.createdAt)}  [${labels.kindLabel(revision.kind)}]  ${revision.label}`);
    lines.push(`    ${revision.id} · ${labels.changeCount(revision.changeCount)}`);
    if (revision.domainIds.length > 0) lines.push(`    ${revision.domainIds.join(', ')}`);
    if (revision.restoredFromId != null) {
      lines.push(`    ${labels.restoredFrom(revision.restoredFromId)}`);
    }
    for (const line of revision.details.filter((entry) => entry !== revision.label)) {
      lines.push(`    - ${line}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * JSON keeps every field the DTO has, plus the scope sentence — so a file that
 * was filtered says so in the file rather than only in the name it was saved
 * under.
 */
export function renderHistoryJson(
  revisions: readonly HistoryRevisionSummary[],
  labels: HistoryExportLabels,
): string {
  revisions = safeRevisions(revisions, labels);
  return `${JSON.stringify(
    {
      heading: labels.heading,
      scope: labels.scope,
      exportedAt: new Date().toISOString(),
      revisions,
    },
    null,
    2,
  )}\n`;
}

export function renderHistoryExport(
  format: HistoryExportFormat,
  revisions: readonly HistoryRevisionSummary[],
  labels: HistoryExportLabels,
): string {
  if (format === 'markdown') return renderHistoryMarkdown(revisions, labels);
  if (format === 'json') return renderHistoryJson(revisions, labels);
  return renderHistoryText(revisions, labels);
}
