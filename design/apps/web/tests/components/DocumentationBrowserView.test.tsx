// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPath, parseRoute } from '../../src/router';
import { DOCS_MANIFEST } from '../../src/lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../src/lib/docs/manifest';
import {
  DocumentationBrowserView,
  type DocumentationCopy,
} from '../../src/components/documentation/DocumentationBrowserView';
import { renderMarkdown } from '../../src/runtime/markdown';
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

  it('accepts a typed localized-copy adapter without importing global locale keys', () => {
    const copy: DocumentationCopy = {
      navDocumentation: 'Docs',
      loading: 'Loading docs',
      offlineDescription: 'Read locally',
      articleCount: (count) => String(count) + ' docs',
      articlesTab: 'Articles',
      historyTab: 'History',
      articleSearch: 'Find articles',
      historySearch: 'Find history',
      invalidRegex: 'Invalid pattern',
      empty: 'No matches',
      source: 'Source',
      suggested: 'Suggested',
    };
    render(<DocumentationBrowserView copy={copy} />);
    expect(screen.getByRole('heading', { name: 'Docs' })).toBeTruthy();
    expect(screen.getByLabelText('68 docs')).toBeTruthy();
  });

  it('exposes a one-shot opener registration seam for C0 callers', () => {
    const listener = vi.fn();
    window.addEventListener(DOCUMENTATION_OPEN_EVENT, listener);

    openDocumentation({
      activation: 'article',
      path: 'site/offline-documentation-browser.md',
      hash: 'behaviour',
      focus: 'article',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(peekPendingDocumentation()).toEqual({
      activation: 'article',
      path: 'site/offline-documentation-browser.md',
      hash: 'behaviour',
      focus: 'article',
    });
    expect(takePendingDocumentation()).toEqual({
      activation: 'article',
      path: 'site/offline-documentation-browser.md',
      hash: 'behaviour',
      focus: 'article',
    });
    expect(takePendingDocumentation()).toBeNull();
    window.removeEventListener(DOCUMENTATION_OPEN_EVENT, listener);
  });

  it('consumes an opener request to select the requested bundled article', () => {
    render(<DocumentationBrowserView />);

    openDocumentation({ path: 'site/offline-documentation-browser.md' });

    expect(screen.getByRole('heading', { name: 'Offline documentation browser' })).toBeTruthy();
  });

  it('activates the reader once and returns focus to the requested search field', async () => {
    render(<DocumentationBrowserView />);
    const search = screen.getByTestId('documentation-article-search');

    openDocumentation({
      activation: 'view',
      path: 'site/offline-documentation-browser.md',
      focus: 'search',
    });

    await waitFor(() => expect(search).toHaveFocus());
    expect(takePendingDocumentation()).toBeNull();
  });

  it('can return focus to the activated article heading', async () => {
    render(<DocumentationBrowserView />);
    const heading = screen.getByRole('heading', { name: 'Documentation stays current, task by task' });

    openDocumentation({
      activation: 'article',
      path: 'standards/documentation-currency.md',
      focus: 'article',
    });

    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('intercepts a relative article link before HTTPS host filtering', () => {
    const onLinkClick = vi.fn((_: string, event: ReactMouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(
      <div>
        {renderMarkdown('[article](../standards/tabs.md#verification)', {
          allowedExternalHosts: ['github.com'],
          onLinkClick,
        })}
      </div>,
    );

    const link = screen.getByRole('link', { name: 'article' });
    fireEvent.click(link);
    expect(onLinkClick).toHaveBeenCalledWith('../standards/tabs.md#verification', expect.anything());
  });

  it('keeps disallowed external links as readable text', () => {
    render(
      <div>
        {renderMarkdown('[outside](https://evil.invalid/article)', {
          allowedExternalHosts: ['github.com'],
        })}
      </div>,
    );

    expect(screen.queryByRole('link', { name: 'outside' })).toBeNull();
    expect(screen.getByText('outside')).toBeTruthy();
  });

  it('resolves only an indexed local path for a relative documentation image', () => {
    render(
      <div>
        {renderMarkdown('![splash](../../assets/screenshots/material-designer-64e427cd-packaged-splash-before.png)', {
          allowRelativeImages: true,
          relativeImageMap: {
            '../../assets/screenshots/material-designer-64e427cd-packaged-splash-before.png':
              'assets/screenshots/material-designer-64e427cd-packaged-splash-before.png',
          },
        })}
      </div>,
    );

    expect(screen.getByRole('img', { name: 'splash' })).toHaveAttribute(
      'src',
      'assets/screenshots/material-designer-64e427cd-packaged-splash-before.png',
    );
  });
});
