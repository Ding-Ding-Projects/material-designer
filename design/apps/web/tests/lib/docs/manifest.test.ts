import { describe, expect, it } from 'vitest';

import {
  DOCS_MANIFEST,
  type BundledDocumentationManifest,
} from '../../../src/lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../../src/lib/docs/manifest';

describe('offline documentation bundle', () => {
  it('contains unique source paths and suggested reading for every article', () => {
    const manifest = assertBundledDocumentationManifest();
    expect(manifest.articleCount).toBeGreaterThan(0);
    expect(new Set(manifest.articles.map((article) => article.path)).size).toBe(manifest.articleCount);
    expect(manifest.articles.every((article) => article.suggestedArticles.length > 0)).toBe(true);
  });

  it('turns red when one bundled article is omitted', () => {
    const missing: BundledDocumentationManifest = {
      ...DOCS_MANIFEST,
      articleCount: DOCS_MANIFEST.articleCount - 1,
      articles: DOCS_MANIFEST.articles.slice(1),
    };
    expect(() => assertBundledDocumentationManifest(missing)).toThrow(/incomplete|unsupported/i);
    expect(() => assertBundledDocumentationManifest()).not.toThrow();
  });
});
