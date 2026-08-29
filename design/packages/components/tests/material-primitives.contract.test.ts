import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../src/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, root), 'utf8');
const webTokens = readFileSync(new URL('../../../apps/web/src/styles/md3-tokens.css', import.meta.url), 'utf8');

function requireStyleContract(text: string) {
  expect(text).toContain('prefers-reduced-motion');
  expect(text).toContain('--md-sys-color');
}

describe('shared primitive contract', () => {
  it('exports stable Material 3 primitive families from both entry points', () => {
    const index = source('index.ts');
    const primitives = source('primitives.tsx');
    for (const name of ['Button', 'Dialog', 'Field', 'Checkbox', 'Radio', 'Switch', 'Menu', 'MenuItem', 'MenuSurface', 'Tabs', 'Tab', 'TabPanel', 'Typography', 'Surface', 'OverlaySurface', 'StateLayer']) {
      expect(index).toMatch(new RegExp(`\\b${name}\\b`));
      expect(primitives).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('keeps each primitive on the M3 token path with reduced-motion coverage', () => {
    for (const name of ['button.module.css', 'form-controls.module.css', 'selection-controls.module.css', 'menu.module.css', 'tabs.module.css', 'typography.module.css', 'surface.module.css']) {
      requireStyleContract(source(name));
    }
    requireStyleContract(source('dialog.module.css'));
  });

  it('publishes shared spacing, state-layer, and motion tokens for the package', () => {
    for (const token of [
      '--md-sys-spacing-1',
      '--md-sys-spacing-6',
      '--md-sys-state-hover-opacity',
      '--md-sys-state-focus-opacity',
      '--md-sys-state-pressed-opacity',
      '--md-sys-state-dragged-opacity',
      '--md-sys-motion-duration-short-4',
    ]) {
      expect(webTokens).toContain(token);
    }
    const broken = webTokens.replace('--md-sys-state-hover-opacity', '--missing-state-layer-opacity');
    expect(() => expect(broken).toContain('--md-sys-state-hover-opacity')).toThrow();
    expect(() => expect(webTokens).toContain('--md-sys-state-hover-opacity')).not.toThrow();
  });

  it('fails closed when the exact component marker is removed, then passes when restored', () => {
    const button = source('button.tsx');
    const marker = 'data-md-component="button"';
    expect(button).toContain(marker);
    const broken = button.replace(marker, 'data-md-component="missing"');
    expect(() => expect(broken).toContain(marker)).toThrow();
    expect(() => expect(button).toContain(marker)).not.toThrow();
  });

  it('keeps legacy variant names as explicit aliases, not as the primitive default', () => {
    const button = source('button.tsx');
    expect(button).toContain("default: joinClassNames(styles.outlined)");
    expect(button).toContain("primary: joinClassNames(styles.filled, 'primary')");
    expect(button).toContain("'primary-ghost': joinClassNames(styles.tonal, 'primary-ghost')");
  });
});
