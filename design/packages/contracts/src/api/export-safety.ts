/**
 * Shared, public-safe rules for files and Markdown that cross an export
 * boundary.  The daemon owns the bytes, while browser and generated guides
 * reuse these small pure helpers so a filename or a user value cannot quietly
 * become a path traversal, a secret, or malformed Markdown.
 */

export const PROJECT_EXPORT_POLICY_VERSION = 1 as const;

export interface ExportOmission {
  path: string;
  field?: string;
  reason: string;
}

export interface ExportTextRedaction {
  value: string;
  omissions: ExportOmission[];
}

const SENSITIVE_PATH_RE = /(^|\/)(?:\.env(?:\.[^/]+)?|credentials?(?:\.[^/]+)?|secrets?(?:\.[^/]+)?|personal[-_]?vocabulary(?:\.[^/]+)?|.*(?:token|api[-_]?key|private[-_]?key|password|passphrase|cookie|session)[^/]*)(?:$|\/)/i;
const SENSITIVE_EXTENSION_RE = /\.(?:pem|key|p12|pfx|kdbx|sqlite|db-wal|db-shm)$/i;
const CACHE_SEGMENTS = new Set(['.cache', '.parcel-cache', '.next', '.vite', '.turbo', '__pycache__']);

/** Return an omission reason for a project-relative path, or null to include it. */
export function exportPathOmissionReason(rawPath: string): string | null {
  const normalized = String(rawPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return 'absolute or empty export path';
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return 'path traversal segment';
  }
  if (segments.some((segment) => CACHE_SEGMENTS.has(segment.toLowerCase()))) {
    return 'local build/cache data is not part of a shareable project handoff';
  }
  if (SENSITIVE_PATH_RE.test(normalized) || SENSITIVE_EXTENSION_RE.test(normalized)) {
    return 'credential, token, private-key, or personal-vocabulary material';
  }
  return null;
}

/** Stable code-point ordering, independent of the host locale. */
export function compareExportPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const LOCAL_ABSOLUTE_PATH_RE = /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings|home|tmp)[\\/][^\s"'`<>]+|\/(?:Users|home|private\/var|tmp)\/[^\s"'`<>]+)/g;

/**
 * Redact local absolute paths from bounded UTF-8 text. Binary files are never
 * passed here. The omission ledger records that the content, not the file,
 * was changed so recipients can tell a deliberate redaction from corruption.
 */
export function redactExportText(value: string, path: string): ExportTextRedaction {
  const redacted = value.replace(LOCAL_ABSOLUTE_PATH_RE, '[REDACTED:local-path]');
  return redacted === value
    ? { value, omissions: [] }
    : {
        value: redacted,
        omissions: [{ path, field: 'content', reason: 'local absolute path redacted' }],
      };
}

/** Escape a dynamic Markdown heading without changing its visible text. */
export function markdownHeading(value: string, level = 1): string {
  const depth = Math.min(6, Math.max(1, Math.trunc(level)));
  return `${'#'.repeat(depth)} ${String(value ?? '').replace(/[\r\n]+/g, ' ').trim()}`;
}

/** Escape dynamic Markdown list content. */
export function markdownListItem(value: string): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/^\s*[-*+]\s+/u, '\\- ');
}

/** Escape dynamic Markdown table content, including pipes and newlines. */
export function markdownTableCell(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, '<br>');
}

/** Choose a fence one run longer than any backtick run in the body. */
export function markdownCodeFence(value: string, minimum = 3): string {
  let longest = 0;
  for (const run of String(value ?? '').match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(minimum, longest + 1));
}

/** Safe Markdown inline code for dynamic values, including identifiers and paths. */
export function markdownInlineCode(value: string): string {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  const fence = markdownCodeFence(text, 1);
  return `${fence}${text}${fence}`;
}

/** Keep a dynamic Markdown URL from escaping its link destination. */
export function markdownUrl(value: string): string {
  return String(value ?? '').replace(/[<>\s\r\n]/g, (character) => encodeURIComponent(character));
}
