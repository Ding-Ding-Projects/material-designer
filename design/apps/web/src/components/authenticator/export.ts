export interface LocalExportSaver {
  save(filename: string, content: string, mediaType: string): Promise<void> | void;
}

export type AuthenticatorExportKind = 'redacted-history' | 'sensitive-history';

/** Validate the host-produced JSON and return the original bytes for saving. */
export function validateAuthenticatorExportContent(content: string, kind: AuthenticatorExportKind): string {
  if (typeof content !== 'string' || content.length === 0 || content.length > 2 * 1024 * 1024) throw new Error('Authenticator export content is outside the bounded size.');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Authenticator export content is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Authenticator export must be a top-level object.');
  const record = parsed as Record<string, unknown>;
  if (kind === 'redacted-history') {
    if (Object.keys(record).sort().join(',') !== 'records,retention,secretsOmitted,version' || record.version !== 1 || record.secretsOmitted !== true || !['keep-all', '30-days', '90-days'].includes(record.retention as string) || !Array.isArray(record.records)) throw new Error('Redacted authenticator export schema is invalid.');
    for (const item of record.records) {
      if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'action,createdAt,id,redacted,summary' || (item as Record<string, unknown>).redacted !== true || Object.values(item as Record<string, unknown>).some((value) => typeof value !== 'string' && value !== true)) throw new Error('Redacted authenticator export record schema is invalid.');
    }
  } else {
    if (Object.keys(record).sort().join(',') !== 'entries,version,warning' || record.version !== 1 || typeof record.warning !== 'string' || !Array.isArray(record.entries)) throw new Error('Sensitive authenticator export schema is invalid.');
    for (const item of record.entries) {
      if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).id !== 'string' || typeof (item as Record<string, unknown>).secret !== 'string') throw new Error('Sensitive authenticator export entry schema is invalid.');
    }
  }
  return content;
}

export const browserExportSaver: LocalExportSaver = {
  save(filename, content, mediaType) {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('Local file save is unavailable in this renderer.');
    }
    const blob = new Blob([content], { type: mediaType });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = 'noreferrer';
      anchor.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },
};

export async function saveAuthenticatorExport(saver: LocalExportSaver | undefined, filename: string, content: string): Promise<void> {
  await (saver ?? browserExportSaver).save(filename, content, 'application/json;charset=utf-8');
}
