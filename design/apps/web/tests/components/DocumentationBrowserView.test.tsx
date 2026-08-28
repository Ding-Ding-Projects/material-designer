import { describe, expect, it } from 'vitest';

import { buildPath, parseRoute } from '../../src/router';
import { DOCS_MANIFEST } from '../../src/lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../src/lib/docs/manifest';

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
});
