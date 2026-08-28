/** Bound every renderer-to-host toy-lock request so a missing reply cannot
 * leave Settings in a convincing permanent spinner. */
export const TOY_LOCK_UI_DEADLINE_MS = 10_000;

export function withToyLockUiDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs = TOY_LOCK_UI_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('toy-lock host request timed out'));
    }, timeoutMs);
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error: unknown) {
      settled = true;
      window.clearTimeout(timer);
      reject(error);
      return;
    }
    pending.then((value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    });
  });
}
