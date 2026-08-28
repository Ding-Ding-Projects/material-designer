import type { AppVersionInfo, AppVersionProvenance } from '@open-design/contracts';

const APP_VERSION_PLACEHOLDER = '0.0.0';
const SOURCE_COMMIT_RE = /^[0-9a-f]{40}$/i;
const ISO_TIMESTAMP_WITH_SECONDS_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidProvenanceTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_WITH_SECONDS_RE.test(value)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
  ) return false;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day
    && calendar.getUTCHours() === hour
    && calendar.getUTCMinutes() === minute
    && calendar.getUTCSeconds() === second
    && Number.isFinite(Date.parse(value));
}

export interface ResolvedFrontScreenProvenance {
  version: string | null;
  provenance: AppVersionProvenance | null;
}

/**
 * Resolve only facts that can be tied to the running package. A version can
 * be displayed without a timestamp, but a timestamp is usable only when its
 * record names the same version and a real source commit. No browser clock or
 * launch timestamp participates in this decision.
 */
export function resolveFrontScreenProvenance(
  info: AppVersionInfo | null | undefined,
): ResolvedFrontScreenProvenance {
  const version = typeof info?.version === 'string' && info.version.trim().length > 0
    && info.version.trim() !== APP_VERSION_PLACEHOLDER
    ? info.version.trim()
    : null;
  const candidate = info?.provenance;
  const provenance = isValidBoundProvenance(candidate, version) ? candidate : null;
  return { version, provenance };
}

function isValidBoundProvenance(
  value: AppVersionInfo['provenance'],
  version: string | null,
): value is AppVersionProvenance {
  if (!value || version == null || typeof value !== 'object') return false;
  if (value.schemaVersion !== 1 || value.version !== version) return false;
  if (typeof value.sourceCommit !== 'string' || !SOURCE_COMMIT_RE.test(value.sourceCommit)) {
    return false;
  }
  if (typeof value.updatedAt !== 'string' || !isValidProvenanceTimestamp(value.updatedAt)) {
    return false;
  }
  return Number.isFinite(Date.parse(value.updatedAt));
}

export function formatFrontScreenUpdatedAt(
  provenance: AppVersionProvenance | null | undefined,
  locale?: string,
): string | null {
  if (!provenance || !isValidBoundProvenance(provenance, provenance.version)) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(provenance.updatedAt));
  } catch {
    return null;
  }
}
