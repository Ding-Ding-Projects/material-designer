// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPath, parseRoute } from '../../src/router';
import { DOCS_MANIFEST } from '../../src/lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../src/lib/docs/manifest';
import { DocumentationBrowserView } from '../../src/components/documentation/DocumentationBrowserView';
import {
  clearPendingDocumentation,
  DOCUMENTATION_OPEN_EVENT,
  openDocumentation,
  peekPendingDocumentation,
  takePendingDocumentation,
} from '../../src/components/documentation/open-documentation';

afterEach(() => {
  cleanup();
  clearPendingDocumentation();
});

describe('DocumentationBrowserView route contract', () => {
  it('has a stable documentation destination in the router', () => {
    expect(parseRoute('/documentation')).toEqual({ kind: 'home', view: 'documentation' });
    expect(buildPath({ kind: 'home', view: 'documentation' })).toBe('/documentation');
  });

  it('keeps the application bundle aligned with the generated source manifest', () => {
    const manifest = assertBundledDocumentationManifest();
    expect(manifest.articleCount).toBe(DOCS_MANIFEST.articles.length);
    expect(manifest.articles.every((article) => article.markdown.length > 0)).toBe(true);
  });

  it('mounts the reader, filters article body text, and keeps article navigation in-app', () => {
    render(<DocumentationBrowserView />);
    expect(screen.getByTestId('documentation-browser')).toBeTruthy();
    expect(screen.getByRole('tablist')).toBeTruthy();
    const search = screen.getByTestId('documentation-article-search');
    fireEvent.change(search, { target: { value: 'offline' } });
    expect(screen.getByText('Offline documentation browser')).toBeTruthy();
    fireEvent.click(screen.getByText('Offline documentation browser'));
    expect(screen.getByRole('heading', { name: 'Offline documentation browser' })).toBeTruthy();
  });

  it('exposes a one-shot opener registration seam for C0 callers', () => {
    const listener = vi.fn();
    window.addEventListener(DOCUMENTATION_OPEN_EVENT, listener);

    openDocumentation({ path: 'site/offline-documentation-browser.md', hash: 'behaviour' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(peekPendingDocumentation()).toEqual({
      path: 'site/offline-documentation-browser.md',
      hash: 'behaviour',
    });
    expect(takePendingDocumentation()).toEqual({
      path: 'site/offline-documentation-browser.md',
      hash: 'behaviour',
    });
    expect(takePendingDocumentation()).toBeNull();
    window.removeEventListener(DOCUMENTATION_OPEN_EVENT, listener);
  });

  it('consumes an opener request to select the requested bundled article', () => {
    render(<DocumentationBrowserView />);

    openDocumentation({ path: 'site/offline-documentation-browser.md' });

    expect(screen.getByRole('heading', { name: 'Offline documentation browser' })).toBeTruthy();
  });
});
