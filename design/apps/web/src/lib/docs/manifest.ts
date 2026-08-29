import {
  DOCS_MANIFEST,
  type BundledDocumentationArticle,
  type BundledDocumentationManifest,
} from './generated';

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Runtime and test boundary for the generated offline documentation bundle.
 * The generator proves disk-to-bundle equality before build; this second
 * boundary refuses a malformed bundle if a packaging step ever changes it.
 */
export function assertBundledDocumentationManifest(
  value: BundledDocumentationManifest = DOCS_MANIFEST,
): BundledDocumentationManifest {
  if (
    value.schemaVersion !== 1
    || value.source !== 'docs/**/*.md'
    || !Array.isArray(value.articles)
    || value.articleCount !== value.articles.length
    || value.articleCount < 1
  ) {
    throw new Error('The bundled documentation manifest is incomplete or unsupported.');
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const article of value.articles) {
    assertArticle(article);
    if (ids.has(article.id) || paths.has(article.path)) {
      throw new Error(`The bundled documentation manifest repeats ${article.path}.`);
    }
    ids.add(article.id);
    paths.add(article.path);
  }
  return value;
}

function assertArticle(article: BundledDocumentationArticle): void {
  if (
    !article
    || typeof article.id !== 'string'
    || typeof article.path !== 'string'
    || typeof article.category !== 'string'
    || typeof article.title !== 'string'
    || typeof article.sourceUrl !== 'string'
    || !SHA256_RE.test(article.sha256)
    || typeof article.markdown !== 'string'
    || article.markdown.trim() === ''
    || !Array.isArray(article.suggestedArticles)
    || article.suggestedArticles.length < 1
  ) {
    throw new Error('The bundled documentation manifest contains an invalid article.');
  }
  const normalized = article.path.replace(/\\/g, '/');
  if (normalized !== article.path || normalized.includes('..') || !normalized.endsWith('.md')) {
    throw new Error(`The bundled documentation path is unsafe: ${article.path}`);
  }
}

assertBundledDocumentationManifest();
