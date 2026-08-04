// The density control has to change something.
//
// Before this, `data-density` swapped five custom properties of which one
// had a single reader and four had none, so all three levels rendered an
// identical interface. These specs pin the two halves of the repair: the
// token sheet declares a complete scale at every level, and the shared
// primitives read it instead of hard-coding the numbers.
//
// Every expectation quotes the literal text in the source, not a computed
// equivalent — a spec that asserts "40px" where the file says
// `var(--control-h, 40px)` passes for the wrong reason and then fails the
// moment someone changes the fallback.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../../src/styles/md3-tokens.css', import.meta.url), 'utf8');
const primitives = readFileSync(
  new URL('../../src/styles/primitives.css', import.meta.url),
  'utf8',
);

function block(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(source.matchAll(pattern)).at(0)?.[1] ?? '';
}

/** Every variable a density level is expected to move. */
const DENSITY_VARS = [
  '--sp',
  '--gap',
  '--pad',
  '--row',
  '--card',
  '--control-h',
  '--control-h-sm',
  '--control-pad-x',
] as const;

describe('the density scale', () => {
  it('declares every variable at the baseline, "default" level', () => {
    const root = block(tokens, ':root');
    for (const name of DENSITY_VARS) {
      expect(root).toContain(`${name}:`);
    }
  });

  it('redefines every one of them at compact and comfortable', () => {
    const compact = block(tokens, '[data-density="compact"]');
    const comfortable = block(tokens, '[data-density="comfortable"]');
    expect(compact).not.toBe('');
    expect(comfortable).not.toBe('');
    for (const name of DENSITY_VARS) {
      expect(compact, `compact is missing ${name}`).toContain(`${name}:`);
      expect(comfortable, `comfortable is missing ${name}`).toContain(`${name}:`);
    }
  });

  it('has no [data-density="default"] rule, because default is :root', () => {
    // Applying "default" means REMOVING the attribute, which only works
    // while there is nothing for it to select. Matched as a rule at the
    // start of a line rather than as a substring — the sheet's own comment
    // names the selector in prose to explain why it is absent.
    expect(tokens).not.toMatch(/^\[data-density="default"\]/m);
  });

  it('moves the base spacing unit with the rest of the scale', () => {
    // `--sp` used to sit at 8px through all three levels while `--gap`,
    // built on the same unit, halved — a scale that disagreed with itself.
    expect(block(tokens, ':root')).toContain('--sp: 8px;');
    expect(block(tokens, '[data-density="compact"]')).toContain('--sp: 6px;');
    expect(block(tokens, '[data-density="comfortable"]')).toContain('--sp: 10px;');
  });

  it('keeps every control above the minimum touch target at compact', () => {
    const compact = block(tokens, '[data-density="compact"]');
    expect(compact).toContain('--control-h: 34px;');
    expect(compact).toContain('--control-h-sm: 32px;');
  });

  it('sets the default control heights to the numbers primitives.css used to hard-code', () => {
    // This is what makes the change invisible at default density: an
    // install that never touches the control measures exactly as before.
    const root = block(tokens, ':root');
    expect(root).toContain('--control-h: 40px;');
    expect(root).toContain('--control-h-sm: 36px;');
    expect(root).toContain('--control-pad-x: 16px;');
  });
});

describe('the shared primitives read the density scale', () => {
  it('sizes every button from it', () => {
    const button = block(primitives, 'button');
    expect(button).toContain('gap: var(--sp, 8px);');
    expect(button).toContain('min-height: var(--control-h, 40px);');
    expect(button).toContain('padding: 0 var(--control-pad-x, 16px);');
  });

  it('sizes text fields from the same variable as the buttons beside them', () => {
    const fields = block(primitives, 'input, textarea, select');
    expect(fields).toContain('min-height: var(--control-h, 40px);');
  });

  it('keeps the select trigger on the deliberately shorter scale', () => {
    const trigger = block(primitives, '.od-select-trigger');
    expect(trigger).toContain('min-height: var(--control-h-sm, 36px);');
  });
});

describe('the appearance controls demonstrate the setting they carry', () => {
  const controls = readFileSync(
    new URL('../../src/components/appearance/AppearanceControls.module.css', import.meta.url),
    'utf8',
  );

  it('spaces its own cards with the density tokens', () => {
    expect(block(controls, '.cards')).toContain('gap: var(--gap, 16px);');
    expect(block(controls, '.card')).toContain('padding: var(--pad, 24px);');
    expect(block(controls, '.card')).toContain('border-radius: calc(var(--card, 14px) + 10px);');
  });
});
