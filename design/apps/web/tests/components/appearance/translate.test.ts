import { describe, expect, it } from 'vitest';

import {
  translateColor,
  type ColorRepresentation,
  type ColorRepresentationId,
} from '../../../src/components/appearance/translate';

/**
 * The translator's contract is not "produce ten strings", it is "produce
 * ten strings and say honestly what each one costs". So most of what is
 * asserted here is the `loss` list rather than the value: a wrong value is
 * a visible bug someone reports in an afternoon, and a missing loss flag is
 * a silent lie that only surfaces when a user pastes a colour somewhere
 * else and gets a different one.
 */

function rowFor(rows: ColorRepresentation[], id: ColorRepresentationId): ColorRepresentation {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`expected a ${id} row, got: ${rows.map((r) => r.id).join(', ')}`);
  return row;
}

function idsOf(rows: ColorRepresentation[]): ColorRepresentationId[] {
  return rows.map((row) => row.id);
}

describe('translateColor, coverage', () => {
  it('offers every representation the appearance standard asks for', () => {
    const rows = translateColor({ r: 255, g: 0, b: 0, a: 1 });
    expect(idsOf(rows)).toEqual([
      'name',
      'hex',
      'hex8',
      'rgb',
      'hsl',
      'hsv',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'cmyk',
    ]);
  });

  it('adds the alpha-carrying variants only when there is alpha to carry', () => {
    const opaque = idsOf(translateColor({ r: 255, g: 0, b: 0, a: 1 }));
    const translucent = idsOf(translateColor({ r: 255, g: 0, b: 0, a: 0.5 }));
    expect(opaque).not.toContain('rgba');
    expect(opaque).not.toContain('hsla');
    expect(translucent).toContain('rgba');
    expect(translucent).toContain('hsla');
  });

  it('labels each perceptual row with the CSS colour space it is actually in', () => {
    const rows = translateColor({ r: 255, g: 0, b: 0, a: 1 });
    expect(rowFor(rows, 'lab').space).toBe('lab');
    expect(rowFor(rows, 'lch').space).toBe('lch');
    expect(rowFor(rows, 'oklab').space).toBe('oklab');
    expect(rowFor(rows, 'oklch').space).toBe('oklch');
    // The old rows keep saying sRGB, because they are still sRGB.
    expect(rowFor(rows, 'hsl').space).toBe('srgb');
    expect(rowFor(rows, 'cmyk').space).toBe('device-cmyk');
  });

  it('writes the four perceptual values as CSS functions a stylesheet accepts', () => {
    const rows = translateColor({ r: 255, g: 0, b: 0, a: 1 });
    expect(rowFor(rows, 'lab').value).toMatch(/^lab\(/);
    expect(rowFor(rows, 'lch').value).toMatch(/^lch\(/);
    expect(rowFor(rows, 'oklab').value).toMatch(/^oklab\(/);
    expect(rowFor(rows, 'oklch').value).toMatch(/^oklch\(/);
  });

  it('states nothing lost for the perceptual rows of a plain primary', () => {
    // They are CSS, they are colour-managed, they carry alpha, and two (or
    // four) decimals survives the trip back. There is genuinely nothing to
    // warn about, and inventing a warning would be as dishonest as hiding
    // one — `hsv()` and `device-cmyk()` beside them still declare theirs.
    const rows = translateColor({ r: 255, g: 0, b: 0, a: 1 });
    expect(rowFor(rows, 'lab').loss).toEqual([]);
    expect(rowFor(rows, 'lch').loss).toEqual([]);
    expect(rowFor(rows, 'oklab').loss).toEqual([]);
    expect(rowFor(rows, 'oklch').loss).toEqual([]);
    expect(rowFor(rows, 'hsv').loss).toContain('not-css');
    expect(rowFor(rows, 'cmyk').loss).toContain('unmanaged');
  });

  it('puts alpha behind a slash in the perceptual rows instead of declaring it lost', () => {
    const rows = translateColor({ r: 255, g: 0, b: 0, a: 0.5 });
    for (const id of ['lab', 'lch', 'oklab', 'oklch'] as const) {
      expect(rowFor(rows, id).value).toContain('/ 0.5');
      expect(rowFor(rows, id).loss).not.toContain('alpha');
    }
  });

  it('does not report a lost alpha on an opaque slash-syntax row', () => {
    // `hwb()`, `lab()` and friends omit `/ A` entirely at full opacity, so
    // the fourth number is absent rather than 1. Reading it positionally
    // anyway would find nothing, read 0, and flag every opaque colour in
    // the panel as having rounded its alpha away.
    const rows = translateColor({ r: 18, g: 52, b: 86, a: 1 });
    for (const id of ['hwb', 'lab', 'lch', 'oklab', 'oklch'] as const) {
      expect(rowFor(rows, id).value).not.toContain('/');
      expect(rowFor(rows, id).loss).not.toContain('rounding');
    }
  });
});

describe('translateColor, the name row', () => {
  it('inherits the rounding the hex it was looked up from admits to', () => {
    // r = g = b = 127.5 is the reproducer: it formats as #808080, which is
    // the CSS colour `gray`, and neither of those is 127.5. The two rows
    // sit one above the other in the panel, so the name row claiming a
    // clean round trip beside "HEX · rounding" was visibly self-
    // contradictory — same hex, same loss.
    const rows = translateColor({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(rowFor(rows, 'name').value).toBe('gray');
    expect(rowFor(rows, 'hex').loss).toContain('rounding');
    expect(rowFor(rows, 'name').loss).toContain('rounding');
  });

  it('still reports a clean round trip when the hex really is exact', () => {
    const rows = translateColor({ r: 128, g: 128, b: 128, a: 1 });
    expect(rowFor(rows, 'name').value).toBe('gray');
    expect(rowFor(rows, 'hex').loss).toEqual([]);
    expect(rowFor(rows, 'name').loss).toEqual([]);
  });

  it('keeps declaring the alpha a name cannot express', () => {
    const rows = translateColor({ r: 128, g: 128, b: 128, a: 0.5 });
    expect(rowFor(rows, 'name').loss).toContain('alpha');
  });

  it('omits the row entirely for a colour with no name', () => {
    // 148 names for 16.7 million colours: absence is the common case and is
    // shown as absence rather than as a nearest neighbour.
    expect(idsOf(translateColor({ r: 0xc9, g: 0x64, b: 0x42, a: 1 }))).not.toContain('name');
  });
});

describe('translateColor, alpha round trips', () => {
  it('admits that HEX8 quantises alpha to a 255th', () => {
    // The reproducer: 0.5 writes as `80` and reads back as 0.501961. That
    // is a real change, and the row used to hand back an empty loss list
    // without having performed the round trip at all.
    const rows = translateColor({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(rowFor(rows, 'hex8').value).toBe('#00000080');
    expect(rowFor(rows, 'hex8').loss).toContain('rounding');
  });

  it('reports HEX8 as clean when the alpha really is a whole 255th', () => {
    // The complement of the test above, and the one that proves the flag is
    // measuring something rather than always firing on translucency.
    const rows = translateColor({ r: 0, g: 0, b: 0, a: 128 / 255 });
    expect(rowFor(rows, 'hex8').loss).toEqual([]);
  });

  it('does not blame the decimal notations for a quantisation they do not do', () => {
    // `rgba()`, `hsla()` and `hwb()` write three decimals, so 0.5 survives
    // exactly. Only HEX8 loses it, and only HEX8 should say so.
    const rows = translateColor({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(rowFor(rows, 'rgba').loss).toEqual([]);
    expect(rowFor(rows, 'hsla').loss).toEqual([]);
    expect(rowFor(rows, 'hwb').loss).toEqual([]);
  });

  it('flags HEX8 for an alpha that is not a whole 255th, not merely for 0.5', () => {
    // 0.25 is the tidiest possible alpha and HEX8 still cannot hold it:
    // 63.75 of 255 rounds to 64, which reads back as 0.25098. The flag is
    // measuring the quantisation, not pattern-matching one famous example.
    const rows = translateColor({ r: 0, g: 0, b: 0, a: 0.25 });
    expect(rowFor(rows, 'hex8').loss).toContain('rounding');
    expect(rowFor(rows, 'rgba').value).toContain('0.25');
    expect(rowFor(rows, 'rgba').loss).toEqual([]);
  });

  it('leaves the alpha-free rows declaring alpha rather than rounding', () => {
    // Nothing to round-trip on a row that cannot carry alpha at all; the
    // honest flag there is still `alpha`.
    const rows = translateColor({ r: 128, g: 128, b: 128, a: 0.5 });
    expect(rowFor(rows, 'hex').loss).toEqual(['alpha']);
    expect(rowFor(rows, 'rgb').loss).toEqual(['alpha']);
    expect(rowFor(rows, 'hsl').loss).toEqual(['alpha']);
  });
});
