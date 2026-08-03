// The dim sum startup surprise — everything about it that is not React.
//
// A launch has a one-in-ten chance of showing a randomly chosen dish. The draw
// is fresh every launch (no streak memory, no scheduling, no "due" state) and
// is spent exactly once per launch whether it wins or loses, so a lost draw
// cannot be re-rolled by a route change, a remount, or React's development
// double-invoke.
//
// There is deliberately no setting that turns this off. What keeps an
// un-optable surprise polite is that it never gates anything: the caller only
// asks for a draw once the app is genuinely usable, and the result is rendered
// as a non-blocking auto-dismissing toast (see `components/DimSumSurprise`).

import { DIM_SUM_CATALOGUE, type DimSumDish } from './catalog';
import type { LanguageMode, Locale } from '../../i18n/types';

/** One launch in ten. Stated once, asserted by the probability test. */
export const DIM_SUM_CHANCE = 0.1;

/** The separator the app already uses to pair two languages on one line. */
const NAME_SEPARATOR = ' · ';

/**
 * True when a `[0, 1)` roll wins the draw.
 *
 * Strictly `<` so the boundary is exact: with a uniform generator this is
 * 10% of launches, not 10% plus one ulp.
 */
export function winsTheDraw(roll: number): boolean {
  return roll < DIM_SUM_CHANCE;
}

/**
 * Map a `[0, 1)` roll onto a dish. Clamped at both ends so a generator that
 * returns exactly 1 (or a negative) cannot index off the array — a returned
 * `undefined` would surface as a toast with no picture and no name.
 */
export function dishForRoll(
  roll: number,
  catalogue: readonly DimSumDish[] = DIM_SUM_CATALOGUE,
): DimSumDish | null {
  if (catalogue.length === 0) return null;
  const index = Math.min(catalogue.length - 1, Math.max(0, Math.floor(roll * catalogue.length)));
  return catalogue[index] ?? null;
}

/**
 * A single draw: one roll decides whether the surprise happens, a second
 * chooses the dish. Two rolls rather than one because reusing the winning
 * roll would only ever select from the first tenth of the catalogue.
 */
export function drawDimSum(
  random: () => number = Math.random,
  catalogue: readonly DimSumDish[] = DIM_SUM_CATALOGUE,
): DimSumDish | null {
  if (!winsTheDraw(random())) return null;
  return dishForRoll(random(), catalogue);
}

// Module state, so it is per JavaScript context — one browser tab, one Electron
// window, one launch. It is set before the draw is taken, so an exception
// inside the draw still spends it rather than leaving a re-rollable launch.
let launchDrawSpent = false;

/**
 * The draw the app actually uses. The first call takes it; every later call in
 * the same launch returns null without rolling, which is what "never twice in
 * one launch" means in a component that can mount more than once.
 */
export function drawDimSumOncePerLaunch(
  random: () => number = Math.random,
  catalogue: readonly DimSumDish[] = DIM_SUM_CATALOGUE,
): DimSumDish | null {
  if (launchDrawSpent) return null;
  launchDrawSpent = true;
  return drawDimSum(random, catalogue);
}

/** True once this launch's draw has been taken, win or lose. */
export function dimSumDrawSpent(): boolean {
  return launchDrawSpent;
}

/**
 * The dish's own name, in both languages, always.
 *
 * The names are facts and never move with the language mode or the funny
 * level — the surrounding copy is what those settings style. A reader in any
 * locale gets "Wonton Noodles · 雲吞麵", which is how the dish is actually
 * named in a Hong Kong tea house.
 */
export function dimSumDishName(dish: DimSumDish): string {
  return `${dish.name.en}${NAME_SEPARATOR}${dish.name.zhHant}`;
}

/**
 * The catalogue's own alt text, in the reader's language.
 *
 * The catalogue writes two: English, and Cantonese in Traditional Chinese. A
 * Chinese-script locale gets the Cantonese one, everything else gets the
 * English one, and bilingual mode gets both — the same pairing rule the rest
 * of the interface follows. It is never invented or paraphrased here: a
 * screen-reader user is told exactly what the catalogue says the picture shows.
 */
export function dimSumAltText(
  dish: DimSumDish,
  locale: Locale,
  languageMode: LanguageMode = 'single',
): string {
  const chineseScript = locale === 'zh-HK' || locale === 'zh-TW' || locale === 'zh-CN';
  const primary = chineseScript ? dish.alt.yue : dish.alt.en;
  if (languageMode !== 'bilingual') return primary;
  const secondary = chineseScript ? dish.alt.en : dish.alt.yue;
  return `${primary}${NAME_SEPARATOR}${secondary}`;
}
