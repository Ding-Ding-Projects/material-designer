/**
 * Shared, public-safe rules for files and Markdown that cross an export
 * boundary.  The daemon owns the bytes, while browser and generated guides
 * reuse these small pure helpers so a filename or a user value cannot quietly
 * become a path traversal, a secret, or malformed Markdown.
 */

export const PROJECT_EXPORT_POLICY_VERSION = 1 as const;
export const PROJECT_EXPORT_RECEIPT_SCHEMA = 'open-design.project-export-receipt.v1' as const;
export const PROJECT_EXPORT_TARGETS = ['project', 'desktop-scaffold'] as const;
export type ProjectExportTarget = (typeof PROJECT_EXPORT_TARGETS)[number];

export interface ProjectExportReceipt {
  schema: typeof PROJECT_EXPORT_RECEIPT_SCHEMA;
  target: ProjectExportTarget;
  projectId: string;
  token: string;
  filename: string;
  bytes: number;
  sha256: string;
  editorPath: string;
  downloadUrl: string;
  expiresAt: number;
  archiveDigestScope: string;
}

export const PROJECT_EXPORT_LIMITS = {
  maxEntries: 2_048,
  maxPathLength: 240,
  maxEntryBytes: 64 * 1024 * 1024,
  maxUncompressedBytes: 256 * 1024 * 1024,
  maxArchiveBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxCentralDirectoryBytes: 16 * 1024 * 1024,
  maxCommentBytes: 1_024,
} as const;

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

/** Canonical relative path used for slash, Unicode, and case-fold checks. */
export function canonicalExportPath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.normalize('NFC').trim();
  if (!value || value.length > PROJECT_EXPORT_LIMITS.maxPathLength) return null;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  const unified = value.replace(/\\/g, '/');
  if (unified.startsWith('/') || unified.startsWith('//') || /^[A-Za-z]:/.test(unified)) return null;
  const segments = unified.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

export function exportPathCollisionKey(raw: string): string | null {
  const canonical = canonicalExportPath(raw);
  return canonical ? canonical.toLowerCase() : null;
}

/** Return an omission reason for a project-relative path, or null to include it. */
export function exportPathOmissionReason(rawPath: string): string | null {
  const normalized = String(rawPath ?? '').replace(/^\.\//, '');
  if (!canonicalExportPath(normalized)) {
    return 'absolute or empty export path';
  }
  const segments = canonicalExportPath(normalized)!.split('/');
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
  const a = Array.from(String(left ?? '').normalize('NFC'));
  const b = Array.from(String(right ?? '').normalize('NFC'));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const ac = a[index]!.codePointAt(0)!;
    const bc = b[index]!.codePointAt(0)!;
    if (ac !== bc) return ac < bc ? -1 : 1;
  }
  return a.length - b.length;
}

const LOCAL_ABSOLUTE_PATH_RE = /(?:[A-Za-z]:[\\/][^\r\n"'<>]+|\\\\[^\r\n"'<>]+|\/(?:Users|home|private\/var|tmp|var\/tmp)\/[^\r\n"'<>]+)/g;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const CREDENTIAL_ASSIGNMENT_RE = /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passphrase|client[_-]?secret|secret|authorization)\s*[=:]\s*)(["']?)[^\s"'&,}]+\2/gi;

/**
 * Redact local absolute paths from bounded UTF-8 text. Binary files are never
 * passed here. The omission ledger records that the content, not the file,
 * was changed so recipients can tell a deliberate redaction from corruption.
 */
export function redactExportText(value: string, path: string): ExportTextRedaction {
  let redacted = value;
  const omissions: ExportOmission[] = [];
  const privateKeyRedacted = redacted.replace(PRIVATE_KEY_RE, '[REDACTED:private-key]');
  if (privateKeyRedacted !== redacted) {
    redacted = privateKeyRedacted;
    omissions.push({ path, field: 'content', reason: 'private-key material redacted' });
  }
  const credentialsRedacted = redacted.replace(CREDENTIAL_ASSIGNMENT_RE, '$1$2[REDACTED:credential]$2');
  if (credentialsRedacted !== redacted) {
    redacted = credentialsRedacted;
    omissions.push({ path, field: 'content', reason: 'credential field redacted' });
  }
  const pathsRedacted = redacted.replace(LOCAL_ABSOLUTE_PATH_RE, '[REDACTED:local-path]');
  if (pathsRedacted !== redacted) {
    redacted = pathsRedacted;
    omissions.push({ path, field: 'content', reason: 'local absolute path redacted' });
  }
  return { value: redacted, omissions };
}

/** Escape a dynamic Markdown heading without changing its visible text. */
export function markdownHeading(value: string, level = 1): string {
  const depth = Math.min(6, Math.max(1, Math.trunc(level)));
  return `${'#'.repeat(depth)} ${String(value ?? '').replace(/[\r\n]+/g, ' ').trim()}`;
}

/** Escape dynamic Markdown list content. */
export function markdownListItem(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*[-*+]\s+/u, '\\- ')
    .replace(/[|]/g, '\\|');
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
