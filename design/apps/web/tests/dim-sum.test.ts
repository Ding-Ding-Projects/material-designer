import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { DIM_SUM_CATALOGUE, DIM_SUM_IMAGE_BASE } from '../src/lib/dim-sum/catalog';
import {
  DIM_SUM_CHANCE,
  dimSumAltText,
  dimSumDishName,
  dishForRoll,
  drawDimSum,
  winsTheDraw,
} from '../src/lib/dim-sum/surprise';

/**
 * A deterministic uniform generator, so "is it really 10%?" is a fact this
 * suite can assert rather than a coin flip it has to tolerate. Numerical
 * Recipes' LCG: cheap, uniform enough over a hundred thousand draws, and it
 * produces the same sequence on every machine.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bundledImagePath(image: string): URL {
  return new URL(`../public${image}`, import.meta.url);
}

describe('dim sum draw probability', () => {
  it('states its chance as one in ten', () => {
    expect(DIM_SUM_CHANCE).toBe(0.1);
  });

  it('wins strictly below the chance and loses at or above it', () => {
    expect(winsTheDraw(0)).toBe(true);
    expect(winsTheDraw(0.0999999)).toBe(true);
    // Exactly 0.1 must lose, or the draw is 10% plus a boundary.
    expect(winsTheDraw(0.1)).toBe(false);
    expect(winsTheDraw(0.5)).toBe(false);
    expect(winsTheDraw(0.999999)).toBe(false);
  });

  it('draws a dish about one launch in ten', () => {
    const random = seededRandom(20260804);
    const launches = 100_000;
    let hits = 0;
    for (let i = 0; i < launches; i += 1) {
      if (drawDimSum(random) != null) hits += 1;
    }
    const rate = hits / launches;
    // A 0.5pp band around 10%: far tighter than chance would wander over
    // 100k draws, and wide enough that the assertion is about the constant
    // rather than about the generator's low-order bits.
    expect(rate).toBeGreaterThan(0.095);
    expect(rate).toBeLessThan(0.105);
  });

  it('never returns a dish when the first roll loses', () => {
    // A winning draw takes two rolls — one to decide, one to select — but a
    // losing draw short-circuits and takes only the first. So three losing
    // draws consume exactly three rolls, and the count is what proves the
    // short-circuit: if the selecting roll were ever taken on a loss, `i`
    // would end above three.
    //
    // This array used to interleave a selecting roll after each deciding one,
    // which meant the second draw's *deciding* roll was the 0 intended as a
    // selector — and 0 wins, so the draw handed back a dish and the assertion
    // that it should not was correct all along.
    const rolls = [0.1, 0.5, 0.99];
    let i = 0;
    const random = () => rolls[i++] ?? 0;
    expect(drawDimSum(random)).toBeNull();
    expect(drawDimSum(random)).toBeNull();
    expect(drawDimSum(random)).toBeNull();
    expect(i).toBe(3);
  });

  it('reaches every dish in the catalogue and never falls off the end', () => {
    const seen = new Set<string>();
    for (let i = 0; i < DIM_SUM_CATALOGUE.length * 40; i += 1) {
      const dish = dishForRoll(i / (DIM_SUM_CATALOGUE.length * 40));
      expect(dish).not.toBeNull();
      seen.add(dish!.id);
    }
    expect(seen.size).toBe(DIM_SUM_CATALOGUE.length);
    // A generator that returns exactly 1 (or a negative) must still land on a
    // real dish rather than an undefined index.
    expect(dishForRoll(1)?.id).toBe(DIM_SUM_CATALOGUE[DIM_SUM_CATALOGUE.length - 1]?.id);
    expect(dishForRoll(-0.4)?.id).toBe(DIM_SUM_CATALOGUE[0]?.id);
    expect(dishForRoll(0.5, [])).toBeNull();
  });
});

describe('dim sum launch guard', () => {
  it('spends the draw once per launch, win or lose', async () => {
    // The guard is module state, so each case gets its own module instance —
    // that is what "one launch" means here.
    vi.resetModules();
    const won = await import('../src/lib/dim-sum/surprise');
    expect(won.dimSumDrawSpent()).toBe(false);
    const winning = [0, 0];
    let wi = 0;
    expect(won.drawDimSumOncePerLaunch(() => winning[wi++] ?? 0)).not.toBeNull();
    expect(won.dimSumDrawSpent()).toBe(true);
    // A second ask in the same launch must not roll again, even with a
    // generator that would certainly win.
    let extraRolls = 0;
    expect(
      won.drawDimSumOncePerLaunch(() => {
        extraRolls += 1;
        return 0;
      }),
    ).toBeNull();
    expect(extraRolls).toBe(0);

    vi.resetModules();
    const lost = await import('../src/lib/dim-sum/surprise');
    expect(lost.drawDimSumOncePerLaunch(() => 0.9)).toBeNull();
    expect(lost.dimSumDrawSpent()).toBe(true);
    // A lost draw is spent too: no remount, route change or double-invoke
    // gets a second chance at the same launch.
    expect(lost.drawDimSumOncePerLaunch(() => 0)).toBeNull();
  });
});

describe('dim sum catalogue integrity', () => {
  it('bundles a dozen dishes, one per category', () => {
    expect(DIM_SUM_CATALOGUE.length).toBe(12);
    const categories = new Set(DIM_SUM_CATALOGUE.map((dish) => dish.category));
    expect(categories.size).toBe(DIM_SUM_CATALOGUE.length);
  });

  it('gives every dish a complete, unique record', () => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    const images = new Set<string>();
    for (const dish of DIM_SUM_CATALOGUE) {
      expect(dish.id).toMatch(/^hk-dish-\d{4}$/);
      expect(dish.slug.length).toBeGreaterThan(0);
      expect(dish.category.length).toBeGreaterThan(0);
      expect(dish.jyutping.length).toBeGreaterThan(0);
      expect(dish.name.en.length).toBeGreaterThan(0);
      expect(dish.name.zhHant.length).toBeGreaterThan(0);
      expect(dish.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(dish.bytes).toBeGreaterThan(0);
      expect(dish.image.startsWith(DIM_SUM_IMAGE_BASE)).toBe(true);
      ids.add(dish.id);
      slugs.add(dish.slug);
      images.add(dish.image);
    }
    expect(ids.size).toBe(DIM_SUM_CATALOGUE.length);
    expect(slugs.size).toBe(DIM_SUM_CATALOGUE.length);
    expect(images.size).toBe(DIM_SUM_CATALOGUE.length);
  });

  it('ships every photograph locally, byte-for-byte', () => {
    // The whole point of bundling: no network fetch, no CDN, and the bytes on
    // disk are the catalogue's own bytes. A re-encode or a resize would change
    // the digest, so this fails rather than shipping a different picture.
    for (const dish of DIM_SUM_CATALOGUE) {
      const path = bundledImagePath(dish.image);
      expect(existsSync(path), `${dish.image} is not bundled`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, `${dish.image} size`).toBe(dish.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), `${dish.image} digest`).toBe(
        dish.sha256,
      );
      // A real PNG, not a placeholder that happens to hash to something.
      expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

describe('dim sum alt text and naming', () => {
  it('names every dish in both languages', () => {
    for (const dish of DIM_SUM_CATALOGUE) {
      const name = dimSumDishName(dish);
      expect(name).toContain(dish.name.en);
      expect(name).toContain(dish.name.zhHant);
      expect(name).toContain(' · ');
    }
  });

  it('carries alt text that actually names the dish it shows', () => {
    for (const dish of DIM_SUM_CATALOGUE) {
      expect(dish.alt.en.length).toBeGreaterThan(0);
      expect(dish.alt.yue.length).toBeGreaterThan(0);
      // Alt text a screen-reader user can act on: it says which dish this is,
      // not "an image" or "a photograph of food".
      expect(dish.alt.en, `${dish.id} English alt`).toContain(dish.name.en);
      expect(dish.alt.yue, `${dish.id} Cantonese alt`).toContain(dish.name.zhHant);
    }
  });

  it('picks the alt text for the reader, and pairs both in bilingual mode', () => {
    const dish = DIM_SUM_CATALOGUE[0]!;
    expect(dimSumAltText(dish, 'en')).toBe(dish.alt.en);
    expect(dimSumAltText(dish, 'fr')).toBe(dish.alt.en);
    expect(dimSumAltText(dish, 'zh-HK')).toBe(dish.alt.yue);
    expect(dimSumAltText(dish, 'zh-TW')).toBe(dish.alt.yue);
    expect(dimSumAltText(dish, 'zh-CN')).toBe(dish.alt.yue);
    expect(dimSumAltText(dish, 'en', 'bilingual')).toBe(`${dish.alt.en} · ${dish.alt.yue}`);
    expect(dimSumAltText(dish, 'zh-HK', 'bilingual')).toBe(`${dish.alt.yue} · ${dish.alt.en}`);
  });
});
