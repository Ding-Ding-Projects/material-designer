import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { useT } from '../../i18n';
import { renderMarkdown } from '../../runtime/markdown';
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { BundledDocumentationArticle } from '../../lib/docs/generated';
import { assertBundledDocumentationManifest } from '../../lib/docs/manifest';
import styles from './DocumentationBrowserView.module.css';

const HISTORY_STORAGE_KEY = 'material-designer:documentation-history:v1';
const HISTORY_LIMIT = 20;
const DOCS_MANIFEST = assertBundledDocumentationManifest();

type DocumentationTab = 'articles' | 'history';

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
  try {
    const base = new URL(`https://docs.invalid/docs/${normalisePath(currentPath)}`);
    const resolved = new URL(candidate, base);
    const path = normalisePath(resolved.pathname.replace(/^\/docs\//, ''));
    if (!path.endsWith('.md') || path.split('/').some((part) => part === '..')) return null;
    return { path, hash };
  } catch {
    return null;
  }
}

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
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

export function DocumentationBrowserView() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<DocumentationTab>('articles');
  const [selectedPath, setSelectedPath] = useState('README.md');
  const [history, setHistory] = useState<string[]>(readHistory);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const articleSearch = useRegexSearch(searchQuery, setSearchQuery);
  const historySearch = useRegexSearch(historyQuery, setHistoryQuery);

  const selectedArticle = articleByPath(selectedPath) ?? DOCS_MANIFEST.articles[0] ?? null;

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
        const target = document.getElementById(`documentation-heading-${hash}`);
        target?.scrollIntoView({ block: 'start' });
      }, 0);
    }
  }, []);

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
        <p role="alert">{t('common.loading')}</p>
      </section>
    );
  }

  return (
    <section className={styles.root} data-testid="documentation-browser" aria-labelledby="documentation-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('entry.navDocumentation')}</p>
          <h1 id="documentation-title">{t('entry.navDocumentation')}</h1>
          <p className={styles.description}>
            {t('documentation.offlineDescription')}
          </p>
        </div>
        <span className={styles.badge} aria-label={t('documentation.articleCount', { count: DOCS_MANIFEST.articleCount })}>
          <Icon name="file-text" size={16} />
          {DOCS_MANIFEST.articleCount}
        </span>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={t('entry.navDocumentation')}>
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
          {t('documentation.articlesTab')}
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
          {t('documentation.historyTab')}
        </button>
      </div>

      <div
        id="documentation-panel-articles"
        role="tabpanel"
        aria-labelledby="documentation-tab-articles"
        hidden={activeTab !== 'articles'}
        className={styles.panel}
      >
        <aside className={styles.index} aria-label={t('entry.navDocumentation')}>
          <RegexSearchField
            search={articleSearch}
            fieldLabel={t('documentation.articleSearch')}
            id="documentation-article-search"
            placeholder={t('documentation.articleSearch')}
            ariaLabel={t('documentation.articleSearch')}
            ariaControls="documentation-article-list"
            testId="documentation-article-search"
          />
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
            {visibleArticles.length === 0 ? <li className={styles.empty}>{t('documentation.empty')}</li> : null}
          </ul>
        </aside>
        <article className={styles.reader} aria-labelledby="documentation-reader-title">
          <header className={styles.readerHeader}>
            <div>
              <h2 id="documentation-reader-title">{selectedArticle.title}</h2>
              <p>{selectedArticle.path} · SHA-256 {selectedArticle.sha256}</p>
            </div>
            <a href={selectedArticle.sourceUrl} target="_blank" rel="noreferrer noopener">
              {t('documentation.source')}
            </a>
          </header>
          <div className={styles.readerBody}>
            {renderMarkdown(selectedArticle.markdown, { onLinkClick: handleArticleLink })}
            <section className={styles.suggested} aria-labelledby="documentation-suggested-title">
              <h3 id="documentation-suggested-title">{t('documentation.suggested')}</h3>
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
          fieldLabel={t('documentation.historySearch')}
          id="documentation-history-search"
          placeholder={t('documentation.historySearch')}
          ariaLabel={t('documentation.historySearch')}
          ariaControls="documentation-history-list"
          testId="documentation-history-search"
        />
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
          {visibleHistory.length === 0 ? <li className={styles.empty}>{t('documentation.empty')}</li> : null}
        </ul>
      </div>
    </section>
  );
}
