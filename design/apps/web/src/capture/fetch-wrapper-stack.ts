/**
 * Token-owned fetch wrappers.
 *
 * Several lifecycle owners need to decorate fetch (fixture routing, analytics
 * context, and one-shot request ids). Assigning `window.fetch` directly makes
 * teardown order observable: the last disposer can restore a wrapper that no
 * longer owns the request path. This small multiplexer keeps one ordinary
 * predecessor and lets every owner remove exactly its own token.
 */

export type FetchWrapperNext = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type FetchWrapper = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  next: FetchWrapperNext,
) => Promise<Response>;

type Entry = { token: symbol; wrapper: FetchWrapper };

let ordinaryFetch: typeof window.fetch | null = null;
let dispatcher: typeof window.fetch | null = null;
const entries: Entry[] = [];

function rebuildDispatcher(): void {
  if (typeof window === 'undefined' || !ordinaryFetch) return;
  const predecessor = ordinaryFetch;
  dispatcher = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const snapshot = entries.slice();
    const invoke = (index: number, nextInput: RequestInfo | URL, nextInit?: RequestInit): Promise<Response> => {
      const entry = snapshot[index];
      if (!entry) return predecessor(nextInput, nextInit);
      return entry.wrapper(nextInput, nextInit, (forwardInput = nextInput, forwardInit = nextInit) =>
        invoke(index + 1, forwardInput, forwardInit));
    };
    return invoke(0, input, init);
  }) as typeof window.fetch;
  window.fetch = dispatcher;
}

export function installFetchWrapper(wrapper: FetchWrapper): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!ordinaryFetch) ordinaryFetch = window.fetch;
  const token = Symbol('fetch-wrapper');
  entries.push({ token, wrapper });
  rebuildDispatcher();
  return () => {
    const index = entries.findIndex((entry) => entry.token === token);
    if (index < 0) return;
    entries.splice(index, 1);
    if (entries.length === 0) {
      if (ordinaryFetch && window.fetch === dispatcher) window.fetch = ordinaryFetch;
      ordinaryFetch = null;
      dispatcher = null;
      return;
    }
    rebuildDispatcher();
  };
}

export function fetchWrapperStackSize(): number {
  return entries.length;
}
