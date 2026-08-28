import { describe, expect, test } from 'vitest';

import { registerUnlockLadderRoutes } from '../../src/routes/unlock-ladder.js';

type Handler = (request: any, response: any) => unknown;

function harness() {
  const handlers = new Map<string, Handler>();
  const app = {
    post(path: string, _middleware: unknown, handler: Handler) {
      handlers.set(path, handler);
    },
  };
  registerUnlockLadderRoutes(app as never, { http: { requireLocalDaemonRequest: () => undefined } });
  return handlers;
}

function response() {
  const value: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
  return {
    value,
    status(code: number) { value.statusCode = code; return this; },
    json(body: unknown) { value.body = body; return this; },
  };
}

describe('unlock ladder route', () => {
  test('starts at sums under School mode and never issues a session cookie', () => {
    const handlers = harness();
    const start = response();
    handlers.get('/api/unlock-ladder/challenge')?.({ body: { lockoutId: 'lock-1', schoolMode: true } }, start);
    // The route is POST-only. Registering through the actual key below keeps
    // this assertion honest about the method surface rather than assuming GET.
    expect(handlers.has('/api/unlock-ladder/challenge')).toBe(true);
    const postStart = response();
    handlers.get('/api/unlock-ladder/challenge')?.({ body: { lockoutId: 'lock-1', schoolMode: true } }, postStart);
    const body = postStart.value.body as { rung?: string; credentialStillRequired?: boolean; sessionCookieIssued?: boolean };
    expect(body.rung).toBe('sums');
    expect(body.credentialStillRequired).toBe(true);
    expect(body.sessionCookieIssued).toBeUndefined();
  });

  test('consumes a nonce before grading so replay cannot clear the wait twice', () => {
    const handlers = harness();
    const start = response();
    handlers.get('/api/unlock-ladder/challenge')?.({ body: { lockoutId: 'lock-2', schoolMode: false } }, start);
    const challenge = start.value.body as { nonce?: string; rung?: string };
    expect(challenge.nonce).toEqual(expect.any(String));
    const answer = response();
    handlers.get('/api/unlock-ladder/answer')?.({ body: { lockoutId: 'lock-2', nonce: challenge.nonce, choice: -1 } }, answer);
    expect((answer.value.body as { ok?: boolean }).ok).toBe(true);
    const replay = response();
    handlers.get('/api/unlock-ladder/answer')?.({ body: { lockoutId: 'lock-2', nonce: challenge.nonce, choice: -1 } }, replay);
    expect(replay.value.statusCode).toBe(409);
  });
});
