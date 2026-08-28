export interface AppearanceHistoryMutation {
  domainId: string;
  targetId: string;
  action: string;
  revisionId: string;
}

export type AppearanceHistoryAck =
  | { status: 'acknowledged'; duplicate: boolean; historyRevisionId: string }
  | { status: 'pending' | 'unavailable'; reason: string };

export const APPEARANCE_HISTORY_TIMEOUT_MS = 10_000;

function validField(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(value) && !value.includes('/') && !value.includes('\\');
}

function validateMutation(input: AppearanceHistoryMutation): boolean {
  return validField(input.domainId) && /^[a-z0-9._-]+$/u.test(input.domainId)
    && validField(input.targetId) && /^[A-Za-z0-9:._-]+$/u.test(input.targetId)
    && validField(input.action) && /^[A-Za-z0-9 .:_-]+$/u.test(input.action)
    && validField(input.revisionId);
}

/**
 * Redacted acknowledgement seam for the daemon-owned Git history service.
 * Appearance sends metadata only, never a style snapshot, credential, local
 * path, or user-authored text. Older hosts do not expose the mutation route,
 * so this remains explicitly pending instead of pretending localStorage is
 * Git-backed history.
 */
export async function acknowledgeAppearanceMutation(
  mutation: AppearanceHistoryMutation,
): Promise<AppearanceHistoryAck> {
  if (!validateMutation(mutation)) return { status: 'unavailable', reason: 'Appearance history metadata was outside its bounded contract.' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, APPEARANCE_HISTORY_TIMEOUT_MS);
  try {
    const response = await fetch('/api/history/mutation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mutation),
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 405) return { status: 'unavailable', reason: 'The host history service does not expose appearance mutation acknowledgement yet.' };
    if (!response.ok) return { status: 'pending', reason: `The host history service returned ${response.status}.` };
    const body = await response.json() as { acknowledged?: unknown; duplicate?: unknown; historyRevisionId?: unknown };
    if (body.acknowledged !== true || typeof body.duplicate !== 'boolean' || typeof body.historyRevisionId !== 'string' || body.historyRevisionId.length === 0) return { status: 'pending', reason: 'The host history service returned malformed acknowledgement data.' };
    return { status: 'acknowledged', duplicate: body.duplicate, historyRevisionId: body.historyRevisionId };
  } catch (error) {
    return { status: timedOut ? 'pending' : 'pending', reason: timedOut ? `The host history service did not acknowledge within ${APPEARANCE_HISTORY_TIMEOUT_MS} ms.` : error instanceof Error ? error.message : 'The host history service is unavailable.' };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
