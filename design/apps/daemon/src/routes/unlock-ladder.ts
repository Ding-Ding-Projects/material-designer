import { randomBytes } from 'node:crypto';
import type { Express, RequestHandler } from 'express';

const CHALLENGE_TTL_MS = 60_000;
const MOLE_ROUND_MS = 5_000;
const MAX_LADDER_USES_PER_HOUR = 3;
const MAX_SESSIONS = 200;

type LadderRung = 'dish' | 'sums' | 'moles' | 'clock';
type LadderSession = {
  lockoutId: string;
  schoolMode: boolean;
  rung: LadderRung;
  wrongDishes: number;
  uses: number[];
  challenge: LadderChallenge | null;
};
type LadderChallenge = {
  nonce: string;
  rung: Exclude<LadderRung, 'clock'>;
  createdAt: number;
  expiresAt: number;
  answer: number | number[];
  operands?: Array<{ left: number; right: number }>;
  visibleCells?: number[];
};

export interface RegisterUnlockLadderRoutesDeps {
  http: { requireLocalDaemonRequest: RequestHandler };
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function randomInt(maximum: number): number {
  return randomBytes(4).readUInt32BE(0) % maximum;
}

function makeSums(): number[] {
  return Array.from({ length: 10 }, () => {
    const left = 1 + randomInt(90);
    const right = 1 + randomInt(90);
    return left * 1000 + right;
  });
}

function sumAnswer(encoded: number): number {
  return Math.floor(encoded / 1000) + (encoded % 1000);
}

function makeChallenge(session: LadderSession, now: number): LadderChallenge | null {
  if (session.rung === 'clock') return null;
  const nonce = randomBytes(24).toString('base64url');
  if (session.rung === 'dish') {
    return { nonce, rung: 'dish', createdAt: now, expiresAt: now + CHALLENGE_TTL_MS, answer: randomInt(4) };
  }
  if (session.rung === 'sums') {
    const encoded = makeSums();
    return {
      nonce,
      rung: 'sums',
      createdAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
      answer: encoded.map(sumAnswer),
      operands: encoded.map((value) => ({ left: Math.floor(value / 1000), right: value % 1000 })),
    };
  }
  const visibleCells = Array.from({ length: 9 }, (_, index) => index).filter(() => randomInt(2) === 1);
  const cells = visibleCells.length > 0 ? visibleCells : [0];
  return { nonce, rung: 'moles', createdAt: now, expiresAt: now + CHALLENGE_TTL_MS, answer: cells, visibleCells: cells };
}

function purgeUses(session: LadderSession, now: number): void {
  session.uses = session.uses.filter((timestamp) => timestamp > now - 60 * 60 * 1000);
}

export function registerUnlockLadderRoutes(app: Express, deps: RegisterUnlockLadderRoutesDeps): void {
  const sessions = new Map<string, LadderSession>();
  const requireLocal = deps.http.requireLocalDaemonRequest;

  app.post('/api/unlock-ladder/challenge', requireLocal, (req, res) => {
    const lockoutId = boundedString(req.body?.lockoutId, 96);
    if (!lockoutId) return res.status(400).json({ ok: false, code: 'invalid-input' });
    const schoolMode = req.body?.schoolMode === true;
    const now = Date.now();
    let session = sessions.get(lockoutId);
    if (!session) {
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (typeof oldest === 'string') sessions.delete(oldest);
      }
      session = { lockoutId, schoolMode, rung: schoolMode ? 'sums' : 'dish', wrongDishes: 0, uses: [], challenge: null };
      sessions.set(lockoutId, session);
    }
    purgeUses(session, now);
    if (session.uses.length >= MAX_LADDER_USES_PER_HOUR) session.rung = 'clock';
    const challenge = makeChallenge(session, now);
    session.challenge = challenge;
    if (!challenge) return res.json({ ok: true, rung: 'clock', credentialStillRequired: true, retryAfterMs: CHALLENGE_TTL_MS });
    session.uses.push(now);
    return res.json({
      ok: true,
      rung: challenge.rung,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      credentialStillRequired: true,
      ...(challenge.rung === 'dish' ? { choices: ['dish-a', 'dish-b', 'dish-c', 'dish-d'] } : {}),
      ...(challenge.rung === 'sums' ? { sums: challenge.operands } : {}),
      ...(challenge.rung === 'moles' ? { visibleCells: challenge.visibleCells, durationMs: MOLE_ROUND_MS } : {}),
    });
  });

  app.post('/api/unlock-ladder/answer', requireLocal, (req, res) => {
    const lockoutId = boundedString(req.body?.lockoutId, 96);
    const nonce = boundedString(req.body?.nonce, 256);
    if (!lockoutId || !nonce) return res.status(400).json({ ok: false, code: 'invalid-input' });
    const session = sessions.get(lockoutId);
    const challenge = session?.challenge;
    if (!session || !challenge || challenge.nonce !== nonce) return res.status(409).json({ ok: false, code: 'challenge-expired' });
    session.challenge = null;
    const now = Date.now();
    if (challenge.expiresAt <= now) return res.status(409).json({ ok: false, code: 'challenge-expired' });
    let correct = false;
    if (challenge.rung === 'dish') {
      const answer = req.body?.choice;
      correct = Number.isInteger(answer) && answer === challenge.answer;
      if (!correct) {
        session.wrongDishes += 1;
        if (session.wrongDishes >= 5) session.rung = 'sums';
      }
    } else if (challenge.rung === 'sums') {
      const answers = req.body?.answers;
      correct = Array.isArray(answers)
        && answers.length === (challenge.answer as number[]).length
        && answers.every((answer, index) => Number.isInteger(answer) && answer === (challenge.answer as number[])[index]);
      if (!correct) session.rung = 'moles';
    } else {
      const hits = req.body?.hits;
      const visible = challenge.visibleCells ?? [];
      const elapsed = now - challenge.createdAt;
      correct = elapsed >= MOLE_ROUND_MS
        && Array.isArray(hits)
        && new Set(hits).size === hits.length
        && hits.every((cell) => Number.isInteger(cell) && visible.includes(cell))
        && hits.length === visible.length;
      if (!correct) session.rung = 'clock';
    }
    return res.json({ ok: true, correct, rung: session.rung, clearsWaiting: correct, credentialStillRequired: true, sessionCookieIssued: false });
  });
}
