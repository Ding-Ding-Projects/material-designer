import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

function assertConverterSurface(source: string): void {
  for (const category of ['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings']) {
    if (!source.includes(`'${category}'`)) throw new Error(`Converter category is missing: ${category}`);
  }
  for (const needle of ['RegexSearchField', 'DestructiveGate', 'host.queue.page(', 'host.queue.enqueue(', 'host.queue.export(', 'pdfOperation(', 'data-converter-notification-history', 'data-converter-local-history', 'acknowledgeDisclosure', 'preview.adapterId !== adapter.id', 'disclosureAcknowledgement.previewId !== preview.previewId', "item.state !== 'running'"]) {
    if (!source.includes(needle)) throw new Error(`Converter surface contract is missing: ${needle}`);
  }
}

function assertFeatureBridgeContract(source: string): void {
  for (const needle of ['export type ConverterBridge', 'acknowledgeDisclosure', 'queue:', 'page(cursor?: string', 'export function getFileConverterBridge']) {
    if (!source.includes(needle)) throw new Error(`Feature-owned bridge contract is missing: ${needle}`);
  }
}

describe('file converter renderer wiring', () => {
  it('keeps the feature surface and bridge contract independently typed', () => {
    assertConverterSurface(read('components/FileConverterView.tsx'));
    assertFeatureBridgeContract(read('components/converter/converterBridge.ts'));
    expect(read('components/FileConverterView.tsx')).not.toContain('OpenDesignHostConverter');
    expect(read('components/converter/converterBridge.ts')).not.toContain('OpenDesignHostConverter');
    const registration = read('components/converter/converterRegistration.ts');
    expect(registration).toContain("route: FILE_CONVERTER_ROUTE");
    expect(registration).toContain("surfaceId: FILE_CONVERTER_SURFACE_ID");
    expect(registration).toContain("componentExport: 'FileConverterView'");
  });

  it('records the central and site source seams without claiming built proof', () => {
    const registration = read('components/converter/converterRegistration.ts');
    const required = ['design/apps/web/src/App.tsx', 'design/apps/desktop/src/main/preload.cts', 'design/apps/desktop/src/main/runtime.ts', 'design/packages/host/src/protocol.ts', 'site/index.html', 'site/assets/js/converter.js'];
    for (const path of required) expect(registration).toContain(path);
    const siteScript = new URL('../../../../site/assets/js/converter.js', import.meta.url);
    expect(existsSync(siteScript)).toBe(true);
    expect(registration).toContain("status: 'source-integrated-built-proof-pending'");
  });

  it('turns red when a feature-owned surface boundary disappears, then returns green', () => {
    const source = read('components/FileConverterView.tsx');
    expect(() => assertConverterSurface(source.replace('host.queue.page(', 'host.queue.page_removed('))).toThrow('host.queue.page(');
    expect(() => assertConverterSurface(source)).not.toThrow();
  });

  it('turns red when the feature-owned bridge acknowledgement seam disappears, then returns green', () => {
    const source = read('components/converter/converterBridge.ts');
    expect(() => assertFeatureBridgeContract(source.replace('acknowledgeDisclosure(previewId:', 'acknowledgeDisclosure_removed(previewId:'))).toThrow('acknowledgeDisclosure');
    expect(() => assertFeatureBridgeContract(source)).not.toThrow();
  });
});
