import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { renderMarkdown } from '../../runtime/markdown';
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { BundledDocumentationArticle } from '../../lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../lib/docs/manifest';
import {
  DOCUMENTATION_OPEN_EVENT,
  takePendingDocumentation,
  type OpenDocumentationDetail,
} from './open-documentation';
import styles from './DocumentationBrowserView.module.css';

const HISTORY_STORAGE_KEY = 'material-designer:documentation-history:v1';
const HISTORY_LIMIT = 20;
const HISTORY_MAX_BYTES = 32 * 1024;
const DOCS_MANIFEST = assertBundledDocumentationManifest();

type DocumentationTab = 'articles' | 'history';

/**
 * The central shell supplies this adapter from its locale catalog. Keeping the
 * reader's contract local avoids making the feature depend on a global key
 * union that may not yet contain these entries while the reader is ported.
 */
export interface DocumentationCopy {
  readonly navDocumentation: string;
  readonly loading: string;
  readonly offlineDescription: string;
  readonly articleCount: (count: number) => string;
  readonly articlesTab: string;
  readonly historyTab: string;
  readonly articleSearch: string;
  readonly historySearch: string;
  readonly invalidRegex: string;
  readonly empty: string;
  readonly source: string;
  readonly suggested: string;
}

export const DEFAULT_DOCUMENTATION_COPY: DocumentationCopy = {
  navDocumentation: 'Documentation',
  loading: 'Loading documentation…',
  offlineDescription: 'Read the complete bundled documentation without a network connection.',
  articleCount: (count) => String(count) + ' articles',
  articlesTab: 'Articles',
  historyTab: 'Recently read',
  articleSearch: 'Search articles',
  historySearch: 'Search reading history',
  invalidRegex: 'Invalid or risky pattern.',
  empty: 'No bundled article matches this search.',
  source: 'Open source article',
  suggested: 'Suggested articles',
};

function normalisePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveArticleTarget(href: string, currentPath: string): { path: string; hash: string } | null {
  const raw = href.trim();
  const hashAt = raw.indexOf('#');
  const pathPart = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const hash = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
  const sourcePrefix = 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/';
  let candidate = pathPart.startsWith(sourcePrefix)
    ? pathPart.slice(sourcePrefix.length)
    : pathPart;
  if (!candidate && hash) return { path: currentPath, hash };
  if (/^https?:\/\//i.test(candidate)) return null;
  const parts = normalisePath(currentPath).split('/');
  parts.pop();
  for (const part of normalisePath(candidate).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    if (/[\u0000-\u001f]/.test(part)) return null;
    parts.push(part);
  }
  const path = parts.join('/');
  if (!path.endsWith('.md') || path.split('/').includes('..')) return null;
  return { path, hash };
}

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    if (new TextEncoder().encode(raw).byteLength > HISTORY_MAX_BYTES) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > HISTORY_LIMIT) return [];
    const valid = value.filter((entry): entry is string =>
      typeof entry === 'string' && DOCS_MANIFEST.articles.some((article) => article.path === entry),
    );
    return valid.slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function articleByPath(path: string): BundledDocumentationArticle | null {
  const normalized = normalisePath(path).toLowerCase();
  return DOCS_MANIFEST.articles.find((article) => article.path.toLowerCase() === normalized) ?? null;
}

function suggestedArticles(article: BundledDocumentationArticle): BundledDocumentationArticle[] {
  const explicit = article.suggestedArticles
    .map((path) => articleByPath(path))
    .filter((value): value is BundledDocumentationArticle => value !== null);
  const fallback = DOCS_MANIFEST.articles.filter(
    (candidate) => candidate.category === article.category && candidate.path !== article.path,
  );
  const candidates = [...explicit, ...fallback];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false;
    seen.add(candidate.path);
    return true;
  }).slice(0, 3);
}

function headingSlug(value: string, seen: Set<string>): string {
  const base = value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  if (!base) return '';
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = base + '-' + suffix;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

export interface DocumentationBrowserViewProps {
  /** Localized copy supplied by the central C0 registration boundary. */
  readonly copy?: DocumentationCopy;
}

export function DocumentationBrowserView({ copy = DEFAULT_DOCUMENTATION_COPY }: DocumentationBrowserViewProps = {}) {
  const [activeTab, setActiveTab] = useState<DocumentationTab>('articles');
  const [selectedPath, setSelectedPath] = useState('README.md');
  const [history, setHistory] = useState<string[]>(readHistory);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [focusRequest, setFocusRequest] = useState<'article' | 'search' | null>(null);
  const readerBodyRef = useRef<HTMLDivElement | null>(null);
  const articleSearch = useRegexSearch(searchQuery, setSearchQuery);
  const historySearch = useRegexSearch(historyQuery, setHistoryQuery);

  const selectedArticle = articleByPath(selectedPath) ?? DOCS_MANIFEST.articles[0] ?? null;
  const relativeImageMap = useMemo(
    () => Object.fromEntries((selectedArticle?.images ?? []).map((image) => [image.source, image.path])),
    [selectedArticle],
  );

  useEffect(() => {
    const readerBody = readerBodyRef.current;
    if (!readerBody) return;
    const seen = new Set<string>();
    readerBody.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
      const slug = headingSlug(heading.textContent ?? '', seen);
      if (slug) heading.id = `documentation-heading-${slug}`;
    });
  }, [selectedArticle]);

  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.setTimeout(() => {
      const target = focusRequest === 'search'
        ? document.getElementById('documentation-article-search')
        : document.getElementById('documentation-reader-title');
      if (target instanceof HTMLElement) {
        target.focus();
        target.scrollIntoView({ block: 'start' });
      }
      setFocusRequest(null);
    }, 0);
    return () => window.clearTimeout(frame);
  }, [focusRequest, selectedArticle]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
    } catch {
      // Private browsing or disabled storage does not prevent reading articles.
    }
  }, [history]);

  const openArticle = useCallback((article: BundledDocumentationArticle, hash = '') => {
    setSelectedPath(article.path);
    setHistory((current) => [article.path, ...current.filter((path) => path !== article.path)].slice(0, HISTORY_LIMIT));
    setActiveTab('articles');
    if (hash) {
      window.setTimeout(() => {
        const targetSlug = headingSlug(hash, new Set<string>());
        if (!article.fragments.includes(targetSlug)) return;
        const target = document.getElementById('documentation-heading-' + targetSlug);
        target?.scrollIntoView({ block: 'start' });
      }, 0);
    }
  }, []);

  useEffect(() => {
    const applyRequest = (request: OpenDocumentationDetail | null) => {
      if (!request) return;
      const article = articleByPath(request.path ?? 'README.md') ?? DOCS_MANIFEST.articles[0];
      if (!article) return;
      setFocusRequest(request.focus ?? 'article');
      openArticle(article, request.hash ?? '');
    };
    const onOpen = (event: Event) => {
      const pending = takePendingDocumentation();
      const detail = (event as CustomEvent<OpenDocumentationDetail>).detail;
      applyRequest(detail && typeof detail === 'object' ? detail : pending);
    };
    applyRequest(takePendingDocumentation());
    window.addEventListener(DOCUMENTATION_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DOCUMENTATION_OPEN_EVENT, onOpen);
  }, [openArticle]);

  const visibleArticles = useMemo(
    () => DOCS_MANIFEST.articles.filter((article) =>
      articleSearch.matches(`${article.title}\n${article.path}\n${article.markdown}`),
    ),
    [articleSearch, articleSearch.matches],
  );

  const visibleHistory = useMemo(
    () => history
      .map((path) => articleByPath(path))
      .filter((article): article is BundledDocumentationArticle => article !== null)
      .filter((article) => historySearch.matches(`${article.title}\n${article.path}`)),
    [history, historySearch, historySearch.matches],
  );

  const handleArticleLink = useCallback((href: string, event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!selectedArticle) return;
    const target = resolveArticleTarget(href, selectedArticle.path);
    if (!target) return;
    const article = articleByPath(target.path);
    if (!article) return;
    event.preventDefault();
    openArticle(article, target.hash);
  }, [openArticle, selectedArticle]);

  const canOpenInternalLink = useCallback((href: string) => {
    if (!selectedArticle) return false;
    const target = resolveArticleTarget(href, selectedArticle.path);
    if (!target) return false;
    const article = articleByPath(target.path);
    if (!article) return false;
    if (!target.hash) return true;
    return article.fragments.includes(headingSlug(target.hash, new Set<string>()));
  }, [selectedArticle]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: DocumentationTab[] = ['articles', 'history'];
    const index = tabs.indexOf(activeTab);
    const next = event.key === 'Home'
      ? tabs[0]
      : event.key === 'End'
        ? tabs[tabs.length - 1]
        : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setActiveTab(next);
    document.getElementById(`documentation-tab-${next}`)?.focus();
  };

  if (!selectedArticle) {
    return (
      <section className={styles.root} data-testid="documentation-browser">
        <p role="status">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className={styles.root} data-testid="documentation-browser" aria-labelledby="documentation-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{copy.navDocumentation}</p>
          <h1 id="documentation-title">{copy.navDocumentation}</h1>
          <p className={styles.description}>
            {copy.offlineDescription}
          </p>
        </div>
        <span className={styles.badge} aria-label={copy.articleCount(DOCS_MANIFEST.articleCount)}>
          <Icon name="file-text" size={16} />
          {DOCS_MANIFEST.articleCount}
        </span>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={copy.navDocumentation}>
        <button
          id="documentation-tab-articles"
          type="button"
          role="tab"
          aria-selected={activeTab === 'articles'}
          aria-controls="documentation-panel-articles"
          tabIndex={activeTab === 'articles' ? 0 : -1}
          onClick={() => setActiveTab('articles')}
          onKeyDown={handleTabKeyDown}
        >
          <Icon name="file-text" size={15} />
          {copy.articlesTab}
        </button>
        <button
          id="documentation-tab-history"
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          aria-controls="documentation-panel-history"
          tabIndex={activeTab === 'history' ? 0 : -1}
          onClick={() => setActiveTab('history')}
          onKeyDown={handleTabKeyDown}
        >
          <Icon name="history" size={15} />
          {copy.historyTab}
        </button>
      </div>

      <div
        id="documentation-panel-articles"
        role="tabpanel"
        aria-labelledby="documentation-tab-articles"
        hidden={activeTab !== 'articles'}
        className={styles.panel}
      >
        <aside className={styles.index} aria-label={copy.navDocumentation}>
          <RegexSearchField
            search={articleSearch}
            fieldLabel={copy.articleSearch}
            id="documentation-article-search"
            placeholder={copy.articleSearch}
            ariaLabel={copy.articleSearch}
            ariaControls="documentation-article-list"
            testId="documentation-article-search"
            ariaInvalid={Boolean(articleSearch.error)}
          />
          {articleSearch.error ? (
            <p className={styles.error} role="alert">
              {copy.invalidRegex} {articleSearch.error.message}
            </p>
          ) : null}
          <p className={styles.status} role="status" aria-live="polite">
            {visibleArticles.length} / {DOCS_MANIFEST.articleCount}
          </p>
          <ul id="documentation-article-list" className={styles.articleList}>
            {visibleArticles.map((article) => (
              <li key={article.path}>
                <button
                  type="button"
                  className={styles.articleButton}
                  aria-current={article.path === selectedArticle.path ? 'page' : undefined}
                  onClick={() => openArticle(article)}
                >
                  <span>{article.title}</span>
                  <small>{article.path}</small>
                </button>
              </li>
            ))}
            {visibleArticles.length === 0 ? <li className={styles.empty}>{copy.empty}</li> : null}
          </ul>
        </aside>
        <article className={styles.reader} aria-labelledby="documentation-reader-title">
          <header className={styles.readerHeader}>
            <div>
            <h2 id="documentation-reader-title" tabIndex={-1}>{selectedArticle.title}</h2>
              <p>{selectedArticle.path} · SHA-256 {selectedArticle.sha256}</p>
            </div>
            <a href={selectedArticle.sourceUrl} target="_blank" rel="noreferrer noopener">
              {copy.source}
            </a>
          </header>
          <div ref={readerBodyRef} className={styles.readerBody}>
            {renderMarkdown(selectedArticle.markdown, {
              onLinkClick: handleArticleLink,
              allowedExternalHosts: ['github.com', 'www.github.com', 'raw.githubusercontent.com', 'ding-ding-projects.github.io'],
              allowRelativeImages: true,
              relativeImageMap,
              indexedImagesOnly: true,
              resolveInternalLink: canOpenInternalLink,
            })}
            <section className={styles.suggested} aria-labelledby="documentation-suggested-title">
              <h3 id="documentation-suggested-title">{copy.suggested}</h3>
              <ul>
                {suggestedArticles(selectedArticle).map((article) => (
                  <li key={article.path}>
                    <button type="button" onClick={() => openArticle(article)}>{article.title}</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </article>
      </div>

      <div
        id="documentation-panel-history"
        role="tabpanel"
        aria-labelledby="documentation-tab-history"
        hidden={activeTab !== 'history'}
        className={styles.historyPanel}
      >
        <RegexSearchField
          search={historySearch}
          fieldLabel={copy.historySearch}
          id="documentation-history-search"
          placeholder={copy.historySearch}
          ariaLabel={copy.historySearch}
          ariaControls="documentation-history-list"
          testId="documentation-history-search"
          ariaInvalid={Boolean(historySearch.error)}
        />
        {historySearch.error ? (
          <p className={styles.error} role="alert">
            {copy.invalidRegex} {historySearch.error.message}
          </p>
        ) : null}
        <p className={styles.status} role="status" aria-live="polite">{visibleHistory.length}</p>
        <ul id="documentation-history-list" className={styles.historyList}>
          {visibleHistory.map((article) => (
            <li key={article.path}>
              <button type="button" onClick={() => openArticle(article)}>
                <span>{article.title}</span>
                <small>{article.path}</small>
              </button>
            </li>
          ))}
          {visibleHistory.length === 0 ? <li className={styles.empty}>{copy.empty}</li> : null}
        </ul>
      </div>
    </section>
  );
}
