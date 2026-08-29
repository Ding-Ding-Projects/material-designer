import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const siteRoot = resolve(__dirname, '../../../../site/assets/js');
const logo = readFileSync(resolve(siteRoot, 'logo.js'), 'utf8');
const decoder = readFileSync(resolve(siteRoot, 'logo-decoder.worker.js'), 'utf8');

describe('documentation-surface logo module contract', () => {
  it('keeps the feature module independently loadable before shell registration', () => {
    expect(logo).toContain('export function init(options = {})');
    expect(logo).toContain('export function mount(host');
    expect(logo).toContain('new URL(\'./logo-decoder.worker.js\', import.meta.url)');
    expect(logo).not.toContain('site/index.html');
    expect(logo).not.toContain('main.js');
  });

  it('keeps decoding off the page thread and terminable at the hard deadline', () => {
    expect(logo).not.toContain('Promise.race');
    expect(logo).not.toContain('createImageBitmap');
    expect(logo).toContain('decode-timeout');
    expect(logo).toContain('worker.terminate');
    expect(decoder).toContain('createImageBitmap');
    expect(decoder).toContain('OffscreenCanvas');
    expect(decoder).toContain('convertToBlob');
  });

  it('keeps nested import objects closed and edge crops pixel-safe', () => {
    expect(logo).toContain("hasOnlyKeys(file.state.crop, ['x', 'y', 'width', 'height'])");
    expect(logo).toContain("hasOnlyKeys(file.state.focalPoint, ['x', 'y'])");
    expect(logo).toContain("hasOnlyKeys(candidate.patch.crop, ['x', 'y', 'width', 'height'])");
    expect(decoder).toContain('Math.min(width - 1');
    expect(decoder).toContain('Math.min(height - 1');
  });

  it('keeps the documented shell mount unregistered until the owning integration lane lands', () => {
    expect(logo).toContain('export function mount(host');
    expect(logo).not.toContain("document.querySelector('[data-logo-customization]')?.appendChild");
  });
});
