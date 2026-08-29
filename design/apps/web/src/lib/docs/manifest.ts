import {
  DOCS_MANIFEST,
  type BundledDocumentationArticle,
  type BundledDocumentationManifest,
} from './generated';

const SHA256_RE = /^[0-9a-f]{64}$/;
const SOURCE_URL_RE = /^https:\/\/github\.com\/Ding-Ding-Projects\/material-designer\/blob\/main\/docs\/[^?#]+\.md$/;
const SAFE_FRAGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_IMAGE_PATH_RE = /^assets\/[^/]+\/[^/]+$/;

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
    || !SOURCE_URL_RE.test(article.sourceUrl)
    || !SHA256_RE.test(article.sha256)
    || typeof article.markdown !== 'string'
    || article.markdown.trim() === ''
    || !Array.isArray(article.suggestedArticles)
    || article.suggestedArticles.length < 1
    || !Array.isArray(article.fragments)
    || !Array.isArray(article.images)
  ) {
    throw new Error('The bundled documentation manifest contains an invalid article.');
  }
  const normalized = article.path.replace(/\\/g, '/');
  if (
    normalized !== article.path
    || /(^|\/)\.\.(\/|$)/.test(normalized)
    || !normalized.endsWith('.md')
  ) {
    throw new Error('The bundled documentation path is unsafe: ' + article.path);
  }
  const expectedSourceUrl = 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/' + article.path;
  if (article.sourceUrl !== expectedSourceUrl) {
    throw new Error('The bundled documentation source URL does not match its article path: ' + article.path);
  }
  const suggested = new Set<string>();
  for (const target of article.suggestedArticles) {
    if (typeof target !== 'string' || /(^|\/)\.\.(\/|$)/.test(target) || !target.endsWith('.md')) {
      throw new Error('The bundled suggestion path is unsafe: ' + article.path + ' -> ' + String(target));
    }
    if (suggested.has(target)) {
      throw new Error('The bundled documentation suggestions repeat ' + article.path + ' -> ' + target + '.');
    }
    suggested.add(target);
  }
  const fragments = new Set<string>();
  for (const fragment of article.fragments) {
    if (typeof fragment !== 'string' || !SAFE_FRAGMENT_RE.test(fragment) || fragments.has(fragment)) {
      throw new Error('The bundled documentation fragments are invalid or repeated: ' + article.path + '.');
    }
    fragments.add(fragment);
  }
  const images = new Set<string>();
  for (const image of article.images) {
    if (
      !image
      || typeof image.source !== 'string'
      || typeof image.path !== 'string'
      || !SAFE_IMAGE_PATH_RE.test(image.path)
      || /(^|\/)\.\.(\/|$)/.test(image.path)
      || /^[a-z][a-z\d+.-]*:/i.test(image.source)
      || image.source.startsWith('//')
      || image.source.startsWith('/')
      || !SHA256_RE.test(image.sha256)
    ) {
      throw new Error('The bundled documentation image mapping is invalid: ' + article.path + '.');
    }
    if (images.has(image.path)) {
      throw new Error('The bundled documentation image mappings repeat ' + article.path + ' -> ' + image.path + '.');
    }
    images.add(image.path);
  }
}

assertBundledDocumentationManifest();
