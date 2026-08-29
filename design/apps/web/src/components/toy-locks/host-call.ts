/**
 * Bound every renderer-to-host toy-lock request so an unavailable host cannot
 * leave an authentication surface in a permanent loading state.
 */
export const TOY_LOCK_UI_DEADLINE_MS = 10_000;

export function withToyLockUiDeadline<T>(
  operation: () => Promise<T> | T,
  timeoutMs = TOY_LOCK_UI_DEADLINE_MS,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new RangeError('Toy-lock UI deadline must be positive'));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('toy-lock host request timed out'));
    }, timeoutMs);

    let pending: Promise<T>;
    try {
      pending = Promise.resolve(operation());
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
