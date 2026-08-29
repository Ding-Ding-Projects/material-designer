import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

function assertConverterMount(source: string): void {
  if (!source.includes("import { FileConverterView } from './components/FileConverterView';")) throw new Error('File converter component import is missing.');
  if (!source.includes("route.kind === 'home' && route.view === 'file-converter'")) throw new Error('File converter route mount is missing.');
}

function assertBridgeConsumption(source: string): void {
  for (const channel of ['od:converter:catalog', 'od:converter:pick-source', 'od:converter:pick-sources', 'od:converter:pick-destination', 'od:converter:preview', 'od:converter:convert', 'od:converter:pdf-operation', 'od:converter:queue:list', 'od:converter:queue:enqueue', 'od:converter:queue:start', 'od:converter:queue:pause', 'od:converter:queue:resume', 'od:converter:queue:cancel', 'od:converter:queue:retry']) {
    if (!source.includes(channel)) throw new Error(`Converter bridge channel is missing: ${channel}`);
  }
}

function assertDurableRenderer(source: string): void {
  if (source.includes('material-designer.converter.queue')) throw new Error('Renderer queue must not fall back to transient local storage.');
  for (const needle of ['converter.queue.enqueue(', 'converter.queue.list()', 'converter.queue.start()', 'converter.queue.pause()', 'converter.queue.resume()', 'converter.queue.cancel(', 'converter.queue.retry(', 'pdfOperation(']) if (!source.includes(needle)) throw new Error(`Renderer host operation is missing: ${needle}`);
}

function assertSiteEquivalent(source: string, script: string): void {
  for (const category of ['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings']) if (!source.includes(`data-converter-category="${category}"`)) throw new Error(`Site converter category is missing: ${category}`);
  if (!source.includes('data-converter-queue') || !source.includes('data-converter-queue-export') || !script.includes('attachRegexBuilder') || !script.includes('data-converter-queue')) throw new Error('Site converter wiring is missing its local builders or queue.');
}

describe('file converter renderer wiring', () => {
  it('mounts the destination and consumes every host channel', () => {
    assertConverterMount(read('App.tsx'));
    const view = read('components/FileConverterView.tsx');
    expect(view).toContain('RegexSearchField');
    for (const category of ['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings']) expect(view).toContain(`'${category}'`);
    assertBridgeConsumption(read('../../desktop/src/main/preload.cts'));
    assertBridgeConsumption(read('../../desktop/src/main/runtime.ts'));
    assertDurableRenderer(view);
    assertSiteEquivalent(read('../../../../site/index.html'), read('../../../../site/assets/js/converter.js'));
  });

  it('turns red when the renderer mount disappears, then returns green', () => {
    const source = read('App.tsx');
    expect(() => assertConverterMount(source.replace("import { FileConverterView } from './components/FileConverterView';", ''))).toThrow('component import');
    expect(() => assertConverterMount(source)).not.toThrow();
  });

  it('turns red when one bridge operation disappears, then returns green', () => {
    const source = read('../../desktop/src/main/runtime.ts');
    expect(() => assertBridgeConsumption(source.replaceAll("od:converter:convert", 'od:converter:convert_removed'))).toThrow('od:converter:convert');
    expect(() => assertBridgeConsumption(source)).not.toThrow();
  });

  it('turns red when the durable queue, PDF controls, history/notifications/export hooks, or site equivalent disappears', () => {
    const view = read('components/FileConverterView.tsx');
    expect(() => assertDurableRenderer(view.replace('converter.queue.enqueue', 'converter.queue.enqueue_removed'))).toThrow('transient');
    expect(() => assertDurableRenderer(view)).not.toThrow();
    expect(() => assertConverterMount(read('App.tsx').replace('FileConverterView', 'FileConverterViewRemoved'))).toThrow('component import');
    expect(() => assertSiteEquivalent(read('../../../../site/index.html').replace('data-converter-category="audio"', ''), read('../../../../site/assets/js/converter.js'))).toThrow('audio');
    expect(() => assertSiteEquivalent(read('../../../../site/index.html'), read('../../../../site/assets/js/converter.js'))).not.toThrow();
    expect(view).toContain('data-converter-notification-history');
    expect(view).toContain('data-converter-local-history');
  });
});
