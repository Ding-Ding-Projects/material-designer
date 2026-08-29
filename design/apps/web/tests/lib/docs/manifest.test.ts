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
    expect(manifest.articles.some((article) => article.path === 'standards/documentation-evidence.md')).toBe(false);
    expect(manifest.articles.every((article) => new Set(article.fragments).size === article.fragments.length)).toBe(true);
    expect(manifest.articles.every((article) => article.images.every((image) => image.path.startsWith('assets/')))).toBe(true);
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

  it('rejects stale source URLs and duplicated suggestions', () => {
    const base = assertBundledDocumentationManifest();
    const badUrl = {
      ...base,
      articles: base.articles.map((article, index) => index === 0
        ? { ...article, sourceUrl: 'http://example.invalid/docs/README.md' }
        : article),
    } as BundledDocumentationManifest;
    expect(() => assertBundledDocumentationManifest(badUrl)).toThrow(/invalid article/i);

    const duplicateSuggestions = {
      ...base,
      articles: base.articles.map((article, index) => index === 0
        ? { ...article, suggestedArticles: [article.suggestedArticles[0], article.suggestedArticles[0]] }
        : article),
    } as BundledDocumentationManifest;
    expect(() => assertBundledDocumentationManifest(duplicateSuggestions)).toThrow(/suggestions repeat/i);
  });
});
