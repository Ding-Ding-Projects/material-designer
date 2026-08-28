export interface AppearanceHistoryMutation {
  targetId: string;
  action: string;
  revision: string;
}

export type AppearanceHistoryAck =
  | { status: 'acknowledged' }
  | { status: 'pending' | 'unavailable'; reason: string };

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
  try {
    const response = await fetch('/api/history/mutation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domainId: 'appearance', action: mutation.action, targetId: mutation.targetId, revision: mutation.revision }),
    });
    if (response.status === 404 || response.status === 405) return { status: 'unavailable', reason: 'The host history service does not expose appearance mutation acknowledgement yet.' };
    if (!response.ok) return { status: 'pending', reason: `The host history service returned ${response.status}.` };
    const body = await response.json() as { acknowledged?: unknown };
    return body.acknowledged === true ? { status: 'acknowledged' } : { status: 'pending', reason: 'The host history service returned no acknowledgement.' };
  } catch (error) {
    return { status: 'pending', reason: error instanceof Error ? error.message : 'The host history service is unavailable.' };
  }
}
