// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPath, parseRoute } from '../../src/router';
import { DOCS_MANIFEST } from '../../src/lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../src/lib/docs/manifest';
import { DocumentationBrowserView } from '../../src/components/documentation/DocumentationBrowserView';

afterEach(() => cleanup());

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
});
