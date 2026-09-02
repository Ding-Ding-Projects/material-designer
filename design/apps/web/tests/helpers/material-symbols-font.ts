// Reads the ligature names a Material Symbols woff2 can be addressed by.
//
// The published codepoints list says which icons exist in the family; the
// GSUB ligature table inside the file actually on disk says which NAMES this
// build renders. Only the second is proof that `<span>arrow_back</span>` paints
// an arrow rather than the word, so this walks the font itself, the way
// `docs/standards/typography-and-icons.md` describes: parse the woff2 header
// and table directory, brotli-decompress the payload, slice `cmap` and `GSUB`
// by directory order, build glyph→char from the format-4 cmap (preferring
// lowercase, because `A` and `a` share a glyph), then rebuild every type-4
// ligature (unwrapping type-7 extensions) from its coverage glyph and
// component glyphs. No font library is involved.

import fs from 'node:fs';
import zlib from 'node:zlib';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

interface TableEntry {
  tag: string;
  length: number;
}

function readDirectory(buf: Buffer): { tables: TableEntry[]; dataStart: number; compressedLength: number } {
  if (buf.readUInt32BE(0) !== 0x774f4632) throw new Error('not a woff2 file');
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error('font collections are not handled');
  const numTables = buf.readUInt16BE(12);
  const compressedLength = buf.readUInt32BE(20);
  let p = 48;
  const base128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = buf[p]!;
      p += 1;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('malformed UIntBase128');
  };
  const tables: TableEntry[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[p]!;
    p += 1;
    const index = flags & 0x3f;
    let tag: string;
    if (index === 63) {
      tag = buf.toString('latin1', p, p + 4);
      p += 4;
    } else {
      tag = KNOWN_TAGS[index]!;
    }
    const version = (flags >> 6) & 3;
    const origLength = base128();
    let length = origLength;
    const glyfOrLoca = tag === 'glyf' || tag === 'loca';
    if ((glyfOrLoca && version === 0) || (!glyfOrLoca && version !== 0)) length = base128();
    tables.push({ tag, length });
  }
  return { tables, dataStart: p, compressedLength };
}

function glyphToChar(cmap: Buffer): Map<number, string> {
  const out = new Map<number, string>();
  const subtables = cmap.readUInt16BE(2);
  for (let i = 0; i < subtables; i += 1) {
    const offset = cmap.readUInt32BE(8 + i * 8);
    if (cmap.readUInt16BE(offset) !== 4) continue;
    const segX2 = cmap.readUInt16BE(offset + 6);
    const ends = offset + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = cmap.readUInt16BE(ends + s * 2);
      const start = cmap.readUInt16BE(starts + s * 2);
      const delta = cmap.readInt16BE(deltas + s * 2);
      const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c += 1) {
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (c + delta) & 0xffff;
        } else {
          glyph = cmap.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph === 0) continue;
        const ch = String.fromCharCode(c);
        const previous = out.get(glyph);
        const lower = ch >= 'a' && ch <= 'z';
        const previousUpper = previous !== undefined && previous >= 'A' && previous <= 'Z';
        if (previous === undefined || lower || (previousUpper && !(ch >= 'A' && ch <= 'Z'))) out.set(glyph, ch);
      }
    }
  }
  return out;
}

function coverageGlyphs(gsub: Buffer, offset: number): number[] {
  const format = gsub.readUInt16BE(offset);
  const count = gsub.readUInt16BE(offset + 2);
  const glyphs: number[] = [];
  if (format === 1) {
    for (let i = 0; i < count; i += 1) glyphs.push(gsub.readUInt16BE(offset + 4 + i * 2));
    return glyphs;
  }
  for (let i = 0; i < count; i += 1) {
    const start = gsub.readUInt16BE(offset + 4 + i * 6);
    const end = gsub.readUInt16BE(offset + 6 + i * 6);
    for (let g = start; g <= end; g += 1) glyphs.push(g);
  }
  return glyphs;
}

/** Every ligature name in the font, mapped to the glyph id it renders. */
export function readMaterialSymbolLigatures(fontPath: string): Map<string, number> {
  const buf = fs.readFileSync(fontPath);
  const { tables, dataStart, compressedLength } = readDirectory(buf);
  const data = zlib.brotliDecompressSync(buf.subarray(dataStart, dataStart + compressedLength));
  const slices = new Map<string, Buffer>();
  let offset = 0;
  for (const table of tables) {
    slices.set(table.tag, data.subarray(offset, offset + table.length));
    offset += table.length;
  }
  const cmap = slices.get('cmap');
  const gsub = slices.get('GSUB');
  if (!cmap || !gsub) throw new Error('font has no cmap or GSUB table');
  const chars = glyphToChar(cmap);
  const ligatures = new Map<string, number>();
  const lookupList = gsub.readUInt16BE(8);
  const lookupCount = gsub.readUInt16BE(lookupList);
  for (let i = 0; i < lookupCount; i += 1) {
    const lookup = lookupList + gsub.readUInt16BE(lookupList + 2 + i * 2);
    const lookupType = gsub.readUInt16BE(lookup);
    const subtableCount = gsub.readUInt16BE(lookup + 4);
    for (let s = 0; s < subtableCount; s += 1) {
      let subtable = lookup + gsub.readUInt16BE(lookup + 6 + s * 2);
      let type = lookupType;
      if (type === 7) {
        type = gsub.readUInt16BE(subtable + 2);
        subtable += gsub.readUInt32BE(subtable + 4);
      }
      if (type !== 4) continue;
      const coverage = coverageGlyphs(gsub, subtable + gsub.readUInt16BE(subtable + 2));
      const setCount = gsub.readUInt16BE(subtable + 4);
      for (let c = 0; c < setCount; c += 1) {
        const set = subtable + gsub.readUInt16BE(subtable + 6 + c * 2);
        const ligatureCount = gsub.readUInt16BE(set);
        for (let l = 0; l < ligatureCount; l += 1) {
          const ligature = set + gsub.readUInt16BE(set + 2 + l * 2);
          const target = gsub.readUInt16BE(ligature);
          const components = gsub.readUInt16BE(ligature + 2);
          let name = chars.get(coverage[c]!) ?? '?';
          for (let k = 0; k < components - 1; k += 1) {
            name += chars.get(gsub.readUInt16BE(ligature + 4 + k * 2)) ?? '?';
          }
          ligatures.set(name, target);
        }
      }
    }
  }
  return ligatures;
}
