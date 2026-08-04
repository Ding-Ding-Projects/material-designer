import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mirroredModelPickerStyles = [
  ['home', new URL('../../src/styles/home/entry-layout.css', import.meta.url)],
  ['workspace', new URL('../../src/styles/workspace/artifacts.css', import.meta.url)],
] as const;

function declarationBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe.each(mirroredModelPickerStyles)('%s model picker layout', (_surface, stylesheet) => {
  const css = readFileSync(stylesheet, 'utf8');

  it('reserves a non-shrinking lane for lock and tier affordances', () => {
    const declarations = declarationBlock(
      css,
      '.model-select-searchable__option-affordances',
    );

    expect(declarations).toContain('display: inline-flex;');
    expect(declarations).toContain('flex: 0 0 auto;');
  });

  it('allows the long model label text to truncate before the affordances', () => {
    const declarations = declarationBlock(
      css,
      '.model-select-searchable__option-label > span',
    );

    expect(declarations).toContain('min-width: 0;');
    expect(declarations).toContain('overflow: hidden;');
    expect(declarations).toContain('text-overflow: ellipsis;');
    expect(declarations).toContain('white-space: nowrap;');
  });

  it('gives the trigger label a block container so its ellipsis is not inert', () => {
    // The option label above escapes because its text is wrapped in a real
    // `> span`. The trigger's value label has no element to hand the ellipsis
    // to — the model name is its only child — so while the box was
    // `inline-flex` that name was an anonymous flex item, which
    // `text-overflow` cannot reach, and a long name was clipped mid-glyph
    // with no ellipsis at all.
    const declarations = declarationBlock(
      css,
      '.model-select-searchable__value-label',
    );

    expect(declarations).toContain('display: block;');
  });

  it('keeps the shared block from putting the value label back in a flex box', () => {
    // The shared declaration is still `inline-flex`, which is correct for the
    // option label and fatal for the value label. The override has to come
    // AFTER it in source order, because the two selectors carry the same
    // specificity and nothing but order separates them.
    const shared = css.indexOf('.model-select-searchable__value-label,');
    const override = css.indexOf('.model-select-searchable__value-label {');

    expect(shared).toBeGreaterThanOrEqual(0);
    expect(override).toBeGreaterThan(shared);
  });
});
