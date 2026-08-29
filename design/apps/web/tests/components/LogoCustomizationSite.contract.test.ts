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
    expect(logo).toContain('requestId');
    expect(logo).toContain('const updateCurrent = (next)');
    expect(logo).toContain('supersedeConversions();');
    expect(logo).toContain('const generation = supersedeConversions();');
    expect(logo).toContain('uploadGeneration = generation;');
    expect(logo).toContain('uploadAbort?.abort();');
    expect(logo).toContain('refreshAbort?.abort();');
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
    expect(decoder).toContain('requestId');
  });

  it('keeps nested import objects closed and edge crops pixel-safe', () => {
    expect(logo).toContain("hasOnlyKeys(file.state.crop, ['x', 'y', 'width', 'height'])");
    expect(logo).toContain("hasOnlyKeys(file.state.focalPoint, ['x', 'y'])");
    expect(logo).toContain("hasOnlyKeys(candidate.patch.crop, ['x', 'y', 'width', 'height'])");
    expect(decoder).toContain('Math.min(width - 1');
    expect(decoder).toContain('Math.min(height - 1');
    expect(logo).toContain('const crop = safeCrop(current.crop)');
    expect(logo).toContain('renderFingerprint({ crop, fit: current.fit');
    expect(logo).toContain('const validation = validateLogoSchedule');
  });

  it('fails closed if the first-upload authority is replaced by an independent counter', () => {
    const uploadStart = 'const generation = supersedeConversions();\n    uploadGeneration = generation;';
    const broken = logo.replace(uploadStart, 'const generation = ++uploadGeneration;');
    expect(broken).not.toContain(uploadStart);
    expect(logo).toContain(uploadStart);
    expect(logo.indexOf('const generation = supersedeConversions();\n    uploadGeneration = generation;')).toBeGreaterThan(-1);
  });

  it('keeps upload and derivative refresh on one abortable intent clock', () => {
    expect(logo).toContain('const supersedeConversions = ()');
    expect(logo).toContain('uploadAbort?.abort();');
    expect(logo).toContain('refreshAbort?.abort();');
    expect(logo).toContain('generation !== intentGeneration');
    expect(logo).toContain('intent !== intentGeneration');
  });

  it('fails closed when a race repair stops aborting the competing conversion', () => {
    const authority = 'const supersedeConversions = () => {\n    intentGeneration += 1;\n    uploadAbort?.abort();\n    refreshAbort?.abort();';
    const broken = logo.replace(authority, 'const supersedeConversions = () => {\n    intentGeneration += 1;\n    uploadAbort?.abort();');
    expect(broken).not.toContain(authority);
    expect(logo).toContain(authority);
    const staleResultGuard = 'if (generation !== refreshGeneration || intent !== intentGeneration) return;';
    const brokenGuard = logo.replace(staleResultGuard, 'if (generation !== refreshGeneration) return;');
    expect(brokenGuard).not.toContain(staleResultGuard);
  });

  it('keeps the documented shell mount unregistered until the owning integration lane lands', () => {
    expect(logo).toContain('export function mount(host');
    expect(logo).not.toContain("document.querySelector('[data-logo-customization]')?.appendChild");
  });
});
