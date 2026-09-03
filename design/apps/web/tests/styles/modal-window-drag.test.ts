import { describe, expect, it } from 'vitest';
import { MODAL_WINDOW_DRAG_BACKDROP_SELECTOR } from '../../src/hooks/useModalWindowDragGuard';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('modal window drag strip styles', () => {
  it('covers shared full-screen modal backdrops', () => {
    const css = readExpandedIndexCss();

    for (const selector of MODAL_WINDOW_DRAG_BACKDROP_SELECTOR.split(',')) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('--modal-window-drag-strip-height: 56px;');
    expect(css).toContain('-webkit-app-region: drag !important;');
    expect(css).toMatch(/\.staged-preview-modal,[\s\S]*?\.qs-overlay[\s\S]*?\)\s*>\s*\*[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*1;/u);
    expect(css).toContain('.ds-modal-close');
    expect(css).toContain('.staged-preview-head');
    expect(css).toContain('-webkit-app-region: no-drag;');
  });
});
