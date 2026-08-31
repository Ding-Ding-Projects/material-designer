export const STARTUP_SURPRISE_PROBABILITY = 0.1;

export interface StartupSurpriseContext {
  firstRun: boolean;
  errorPath: boolean;
  updateInProgress: boolean;
  userMidTask: boolean;
}

export interface StartupSurpriseCandidate {
  id: string;
  nameEn: string;
  nameZhHant: string;
  imageUrl: string;
}

export interface StartupSurpriseDraw {
  shown: boolean;
  candidate: StartupSurpriseCandidate | null;
}

export function drawStartupSurprise(
  candidates: readonly StartupSurpriseCandidate[],
  context: StartupSurpriseContext,
  random: () => number = Math.random,
): StartupSurpriseDraw {
  const chance = random();
  if (
    candidates.length === 0
    || context.firstRun
    || context.errorPath
    || context.updateInProgress
    || context.userMidTask
    || !Number.isFinite(chance)
    || chance < 0
    || chance >= STARTUP_SURPRISE_PROBABILITY
  ) {
    return { shown: false, candidate: null };
  }
  const selection = random();
  if (!Number.isFinite(selection)) return { shown: false, candidate: null };
  const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, selection) * candidates.length));
  return { shown: true, candidate: candidates[index] ?? null };
}

export class StartupSurpriseController {
  private drawn = false;

  draw(
    candidates: readonly StartupSurpriseCandidate[],
    context: StartupSurpriseContext,
    random: () => number = Math.random,
  ): StartupSurpriseDraw {
    if (this.drawn) return { shown: false, candidate: null };
    this.drawn = true;
    return drawStartupSurprise(candidates, context, random);
  }
}
