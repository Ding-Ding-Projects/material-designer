// Every symbol name the application renders is a ligature the shipped font
// can address.
//
// Material Symbols renders an unknown name as that name, in English, in the
// interface — `keyboard_arrow_dwon` paints the word, not a chevron — and no
// jsdom test can see that. The only evidence that a name will draw is the
// GSUB ligature table of the woff2 on disk, so this reads it.

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MATERIAL_SYMBOL_FOR_ICON_NAME,
  MATERIAL_SYMBOL_FOR_REMIX_ICON,
} from '../../src/components/MaterialSymbol';
import { readMaterialSymbolLigatures } from '../helpers/material-symbols-font';

const FONT = path.resolve(
  __dirname,
  '../../public/fonts/material-symbols/material-symbols-rounded.woff2',
);

describe('Material Symbols ligature names', () => {
  const ligatures = readMaterialSymbolLigatures(FONT);

  it('reads the same table the standard documents', () => {
    // `docs/standards/typography-and-icons.md`: 4,268 ligature names in the
    // shipped woff2 resolving to 3,967 distinct glyphs, the gap being aliases
    // such as `smartphone` / `mobile`. A different count means a different
    // font, and every mapping below would need re-checking against it.
    expect(ligatures.size).toBe(4268);
    expect(new Set(ligatures.values()).size).toBe(3967);
    expect(ligatures.get('smartphone')).toBe(ligatures.get('mobile'));
  });

  it('can address every name the Remix migration table maps to', () => {
    for (const [remix, symbol] of Object.entries(MATERIAL_SYMBOL_FOR_REMIX_ICON)) {
      expect(ligatures.has(symbol), `${remix} → ${symbol} is not a ligature in the shipped font`).toBe(true);
    }
  });

  it('can address every name the Icon table maps to', () => {
    for (const [icon, symbol] of Object.entries(MATERIAL_SYMBOL_FOR_ICON_NAME)) {
      expect(ligatures.has(symbol), `${icon} → ${symbol} is not a ligature in the shipped font`).toBe(true);
    }
  });

  it('keeps the filled twins on one glyph', () => {
    // `Icon` drives the FILL axis for these, so the pair must share a glyph
    // rather than point at two different symbols.
    const pairs: Array<[keyof typeof MATERIAL_SYMBOL_FOR_ICON_NAME, keyof typeof MATERIAL_SYMBOL_FOR_ICON_NAME]> = [
      ['home', 'home-filled'],
      ['folder', 'folder-filled'],
      ['palette', 'palette-filled'],
    ];
    for (const [outlined, filled] of pairs) {
      expect(MATERIAL_SYMBOL_FOR_ICON_NAME[outlined]).toBe(MATERIAL_SYMBOL_FOR_ICON_NAME[filled]);
    }
  });
});
