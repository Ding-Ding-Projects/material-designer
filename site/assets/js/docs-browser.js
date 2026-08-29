/*
 * Offline documentation browser.
 *
 * The published site carries a generated, local manifest of every Markdown
 * article. This module is the only renderer for that manifest. It escapes
 * provider-authored text before adding the small set of links and elements it
 * owns, so an article can never execute markup as site code.
 */

const $ = (selector, root) => (root || document).querySelector(selector);

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = escapeHtml;

function normalisePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function articleUrl(path) {
  return 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/' + normalisePath(path);
}

const SAFE_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'raw.githubusercontent.com',
  'ding-ding-projects.github.io',
]);

const SOURCE_URL_RE = /^https:\/\/github\.com\/Ding-Ding-Projects\/material-designer\/blob\/main\/docs\/[^?#]+\.md$/;

function fragmentsFromMarkdown(markdown) {
  const seen = new Set();
  const result = [];
  for (const line of String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const base = String(heading[1]).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!base) continue;
    let candidate = base;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = base + '-' + suffix;
      suffix += 1;
    }
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && SAFE_EXTERNAL_HOSTS.has(url.hostname.toLowerCase()) ? url.href : null;
  } catch (error) {
    return null;
  }
}

function safeLocalImageUrl(value, article) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//') || /^([a-z]+:|data:)/i.test(raw) || raw.startsWith('/')) return null;
  const mapping = Array.isArray(article?.images)
    ? article.images.find((entry) => entry && entry.source === raw)
    : null;
  if (!mapping || typeof mapping.path !== 'string' || !/^assets\/[^/]+\/[^/]+$/.test(mapping.path)) return null;
  return mapping.path;
}

function resolveInternalTarget(target, currentPath) {
  const raw = String(target || '').trim();
  const hashIndex = raw.indexOf('#');
  const pathPart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const anchor = hashIndex >= 0 ? raw.slice(hashIndex + 1) : '';
  if (!pathPart && anchor) return { anchor };

  let candidate = pathPart;
  const githubPrefix = 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/';
  if (candidate.startsWith(githubPrefix)) candidate = candidate.slice(githubPrefix.length);
  if (/^https?:\/\//i.test(candidate)) return null;
  const pieces = normalisePath(currentPath).split('/');
  pieces.pop();
  for (const piece of normalisePath(candidate).split('/')) {
    if (!piece || piece === '.') continue;
    if (piece === '..') {
      if (!pieces.length) return null;
      pieces.pop();
      continue;
    }
    if (/[\u0000-\u001f]/.test(piece)) return null;
    pieces.push(piece);
  }
  const path = pieces.join('/');
  if (!path.endsWith('.md') || path.split('/').includes('..')) return null;
  return { path, anchor };
}

function headingSlug(value, seen) {
  const base = String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
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

function inlineMarkdown(value, article, resolveArticle) {
  let source = String(value == null ? '' : value);
  const codeSpans = [];
  source = source.replace(/`([^`]+)`/g, (whole, code) => {
    const index = codeSpans.push('<code>' + escapeHtml(code) + '</code>') - 1;
    return '\u0000CODE' + index + '\u0000';
  });

  const links = [];
  const images = [];
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, alt, target) => {
    const local = safeLocalImageUrl(target, article);
    const src = local;
    if (!src) return escapeHtml(alt);
    const index = images.push('<img class="docs-inline-image" src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt || 'Documentation image') + '" loading="lazy" referrerpolicy="no-referrer">') - 1;
    return '\u0000IMAGE' + index + '\u0000';
  });
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, text, target) => {
    const internal = resolveInternalTarget(target, article.path);
    const targetArticle = internal && internal.path && typeof resolveArticle === 'function'
      ? resolveArticle(internal.path)
      : null;
    const targetFragment = internal && internal.anchor ? headingSlug(internal.anchor, new Set()) : '';
    if (targetArticle && (!targetFragment || targetArticle.fragments.includes(targetFragment))) {
      const index = links.push(
        '<button type="button" class="docs-inline-link" data-doc-link="' +
          escapeAttr(internal.path) + '"' +
          (internal.anchor ? ' data-doc-anchor="' + escapeAttr(internal.anchor) + '"' : '') +
          '>' + escapeHtml(text) + '</button>',
      ) - 1;
      return '\u0000LINK' + index + '\u0000';
    }

    const external = safeExternalUrl(target);
    if (external) {
      const index = links.push(
        '<a href="' + escapeAttr(external) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(text) + '<span class="visually-hidden"> (opens in a new tab)</span></a>',
      ) - 1;
      return '\u0000LINK' + index + '\u0000';
    }
    return escapeHtml(text);
  });

  let rendered = escapeHtml(source)
    .replace(/\u0000LINK(\d+)\u0000/g, (whole, index) => '\u0000LINK' + index + '\u0000')
    .replace(/\u0000CODE(\d+)\u0000/g, (whole, index) => '\u0000CODE' + index + '\u0000');
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  rendered = rendered.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  rendered = rendered.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  rendered = rendered.replace(/\u0000LINK(\d+)\u0000/g, (whole, index) => links[Number(index)] || '');
  rendered = rendered.replace(/\u0000CODE(\d+)\u0000/g, (whole, index) => codeSpans[Number(index)] || '');
  rendered = rendered.replace(/\u0000IMAGE(\d+)\u0000/g, (whole, index) => images[Number(index)] || '');
  return rendered;
}

function splitTableRow(line) {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownToHtml(markdown, article, resolveArticle) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const html = [];
  const headingIds = new Set();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```\s*([^\s]*)\s*$/);
    if (fence) {
      const language = fence[1] || 'text';
      const body = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(
        '<pre class="docs-code" data-language="' + escapeAttr(language) + '"><code>' +
          escapeHtml(body.join('\n')) + '</code></pre>',
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const id = headingSlug(heading[2], headingIds);
      html.push('<h' + level + ' id="doc-' + escapeAttr(id) + '" tabindex="-1">' + inlineMarkdown(heading[2], article, resolveArticle) + '</h' + level + '>');
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
      const header = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push('<div class="table-wrap docs-table-wrap"><table><thead><tr>');
      header.forEach((cell) => { html.push('<th scope="col">' + inlineMarkdown(cell, article, resolveArticle) + '</th>'); });
      html.push('</tr></thead><tbody>');
      rows.forEach((row) => {
        html.push('<tr>');
        row.forEach((cell) => { html.push('<td>' + inlineMarkdown(cell, article, resolveArticle) + '</td>'); });
        html.push('</tr>');
      });
      html.push('</tbody></table></div>');
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      html.push('<' + tag + '>');
      items.forEach((item) => { html.push('<li>' + inlineMarkdown(item, article, resolveArticle) + '</li>'); });
      html.push('</' + tag + '>');
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      html.push('<blockquote><p>' + quote.map((item) => inlineMarkdown(item, article, resolveArticle)).join('<br>') + '</p></blockquote>');
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      if (/^\s*```/.test(lines[index]) || /^\s*#{1,6}\s+/.test(lines[index]) ||
          /^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+[.)]\s+/.test(lines[index]) ||
          /^\s*>/.test(lines[index])) break;
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push('<p>' + inlineMarkdown(paragraph.join(' '), article, resolveArticle) + '</p>');
  }
  return html.join('\n');
}

function ensureManifest(value) {
  if (!value || value.schemaVersion !== 1 || !/^[0-9a-f]{64}$/.test(value.generation) || value.source !== 'docs/**/*.md' || !Array.isArray(value.articles) ||
      value.articleCount !== value.articles.length || value.articles.length === 0) {
    throw new Error('The bundled documentation manifest is missing or has an unsupported schema.');
  }
  const seen = new Set();
  const paths = new Set();
  for (const article of value.articles) {
    if (!article || typeof article.id !== 'string' || typeof article.path !== 'string' ||
        typeof article.category !== 'string' || typeof article.title !== 'string' ||
        typeof article.sourceUrl !== 'string' || !SOURCE_URL_RE.test(article.sourceUrl) ||
        !/^[0-9a-f]{64}$/.test(article.sha256) || typeof article.markdown !== 'string' ||
        !Array.isArray(article.suggestedArticles) || article.suggestedArticles.length < 1 ||
        !Array.isArray(article.fragments) || !Array.isArray(article.images) ||
        seen.has(article.id) || paths.has(article.path)) {
      throw new Error('The bundled documentation manifest contains an invalid or duplicate article.');
    }
    const path = normalisePath(article.path);
    if (path !== article.path || /(^|\/)\.\.(\/|$)/.test(path) || !path.endsWith('.md')) {
      throw new Error('The bundled documentation manifest contains an unsafe article path.');
    }
    if (article.sourceUrl !== articleUrl(path)) {
      throw new Error('The bundled documentation manifest source URL does not match its article path: ' + path);
    }
    const expectedFragments = fragmentsFromMarkdown(article.markdown);
    if (article.fragments.length !== expectedFragments.length ||
        article.fragments.some((fragment, index) => fragment !== expectedFragments[index])) {
      throw new Error('The bundled documentation manifest has stale or non-deterministic fragments: ' + article.path);
    }
    const fragments = new Set();
    for (const fragment of article.fragments) {
      if (typeof fragment !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fragment) || fragments.has(fragment)) {
        throw new Error('The bundled documentation manifest has invalid or repeated fragments: ' + article.path);
      }
      fragments.add(fragment);
    }
    const suggestions = new Set();
    for (const suggestion of article.suggestedArticles) {
      if (typeof suggestion !== 'string' || /(^|\/)\.\.(\/|$)/.test(suggestion) || !suggestion.endsWith('.md') || suggestions.has(suggestion)) {
        throw new Error('The bundled documentation manifest has an invalid suggestion: ' + article.path);
      }
      suggestions.add(suggestion);
    }
    const images = new Set();
    for (const image of article.images) {
      if (!image || typeof image.source !== 'string' || typeof image.path !== 'string' ||
          !/^assets\/[^/]+\/[^/]+$/.test(image.path) || /(^|\/)\.\.(\/|$)/.test(image.path) ||
          /^[a-z][a-z\d+.-]*:/i.test(image.source) || image.source.startsWith('//') ||
          image.source.startsWith('/') || !/^[0-9a-f]{64}$/.test(image.sha256) || images.has(image.path)) {
        throw new Error('The bundled documentation manifest has an invalid image mapping: ' + article.path);
      }
      if (!article.markdown.includes('](' + image.source + ')')) {
        throw new Error('The bundled documentation image mapping is unused: ' + article.path + ' -> ' + image.source);
      }
      images.add(image.path);
    }
    seen.add(article.id);
    paths.add(article.path);
  }
  for (const article of value.articles) {
    for (const suggestion of article.suggestedArticles) {
      if (!paths.has(suggestion)) {
        throw new Error('The bundled documentation suggestion target is missing: ' + article.path + ' -> ' + suggestion);
      }
    }
    for (const link of article.markdown.matchAll(/(?<!\!)\[[^\]]+\]\(([^)\s]+)\)/g)) {
      const rawTarget = link[1];
      const internal = resolveInternalTarget(rawTarget, article.path);
      if (!internal) continue;
      const targetPath = internal.path || article.path;
      if (!paths.has(targetPath)) {
        throw new Error('The bundled documentation link target is missing: ' + article.path + ' -> ' + rawTarget);
      }
      if (internal.anchor) {
        const targetArticle = value.articles.find((candidate) => candidate.path === targetPath);
        const targetSlug = headingSlug(internal.anchor, new Set());
        if (!targetArticle || !targetArticle.fragments.includes(targetSlug)) {
          throw new Error('The bundled documentation fragment target is missing: ' + article.path + ' -> ' + rawTarget);
        }
      }
    }
  }
  return value;
}

export function initDocsBrowser({ i18n, regex, tabs, ui } = {}) {
  const root = $('[data-docs-browser]');
  if (!root || !i18n || !regex) return Promise.resolve(false);

  const searchInput = $('#docs-search-input', root);
  const modeButton = $('#docs-search-mode', root);
  const builderButton = $('#docs-search-builder', root);
  const status = $('#docs-browser-status', root);
  const list = $('#docs-article-list', root);
  const reader = $('#docs-reader-article', root);
  const readerTitle = $('#docs-reader-title', root);
  const readerMeta = $('#docs-reader-meta', root);
  const readerBody = $('#docs-reader-body', root);
  const readerSource = $('#docs-reader-source', root);
  const current = { manifest: null, article: null, controller: null };

  const t = (key, fallback, params) => {
    try { return i18n.has(key) ? i18n.t(key, params) : fallback; } catch (error) { return fallback; }
  };

  function resolveArticle(path) {
    if (!current.manifest) return null;
    const wanted = normalisePath(path).toLowerCase();
    return current.manifest.articles.find((item) => item.path.toLowerCase() === wanted || item.id === wanted) || null;
  }

  function suggestionsFor(article) {
    const explicit = Array.isArray(article.suggestedArticles) ? article.suggestedArticles : [];
    const fromExplicit = explicit.map((target) => resolveArticle(resolveInternalTarget(target, article.path)?.path || target)).filter(Boolean);
    const fallback = current.manifest.articles.filter((candidate) => candidate.category === article.category && candidate.path !== article.path);
    const combined = [];
    for (const candidate of fromExplicit.concat(fallback)) {
      if (!combined.some((item) => item.path === candidate.path)) combined.push(candidate);
      if (combined.length >= 3) break;
    }
    return combined;
  }

  function renderSuggestions(article) {
    const items = suggestionsFor(article);
    if (!items.length) return '';
    return '<section class="docs-suggested" aria-labelledby="docs-suggested-title">' +
      '<h2 id="docs-suggested-title">' + escapeHtml(t('dc.browser.suggested', 'Suggested articles')) + '</h2>' +
      '<ul>' + items.map((item) => '<li><button type="button" class="docs-inline-link" data-doc-link="' +
        escapeAttr(item.path) + '">' + escapeHtml(item.title) + '</button></li>').join('') + '</ul></section>';
  }

  function bindInternalLinks() {
    if (!readerBody) return;
    readerBody.querySelectorAll('[data-doc-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const article = resolveArticle(link.getAttribute('data-doc-link'));
        if (!article) return;
        openArticle(article, link.getAttribute('data-doc-anchor') || '');
      });
    });
  }

  function openArticle(article, anchor) {
    current.article = article;
    if (readerTitle) readerTitle.textContent = article.title;
    if (readerMeta) readerMeta.textContent = article.path + ' · SHA-256 ' + (article.sha256 || 'not recorded');
    if (readerSource) {
      readerSource.href = article.sourceUrl || articleUrl(article.path);
      readerSource.hidden = false;
    }
    if (readerBody) {
      readerBody.innerHTML = markdownToHtml(article.markdown, article, resolveArticle) + renderSuggestions(article);
      bindInternalLinks();
    }
    list?.querySelectorAll('[data-doc-article]').forEach((item) => {
      item.setAttribute('aria-current', item.getAttribute('data-doc-article') === article.path ? 'page' : 'false');
    });
    if (anchor) {
      requestAnimationFrame(() => {
        const targetSlug = headingSlug(anchor, new Set());
        if (!Array.isArray(article.fragments) || !article.fragments.includes(targetSlug)) return;
        const target = document.getElementById('doc-' + targetSlug);
        if (target) target.scrollIntoView({ block: 'start' });
      });
    }
  }

  function getMatcher() {
    const query = searchInput ? searchInput.value.trim() : '';
    if (!query) return { query, matcher: () => true, invalid: false };
    if (!current.controller || current.controller.getState().mode !== 'regex') {
      const needle = query.toLocaleLowerCase();
      return { query, matcher: (text) => String(text).toLocaleLowerCase().includes(needle), invalid: false };
    }
    const matcher = current.controller.matcher();
    return { query, matcher, invalid: !matcher.isUsable() };
  }

  function renderList() {
    if (!list || !current.manifest) return;
    const result = getMatcher();
    const matches = current.manifest.articles.filter((article) => result.matcher(
      article.title + '\n' + article.path + '\n' + article.markdown,
    ));
    list.textContent = '';
    if (result.invalid) {
      if (status) status.textContent = t('dc.browser.invalid', 'The pattern is invalid or too risky to evaluate.');
      return;
    }
    if (status) status.textContent = result.query
      ? t('dc.browser.count', '{count} articles match.', { count: matches.length })
      : t('dc.browser.loaded', '{count} articles available offline.', { count: current.manifest.articles.length });

    matches.forEach((article) => {
      const item = document.createElement('li');
      item.className = 'docs-article-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'docs-article-link';
      button.setAttribute('data-doc-article', article.path);
      button.setAttribute('aria-current', current.article && current.article.path === article.path ? 'page' : 'false');
      button.innerHTML = '<span class="docs-article-link__title">' + escapeHtml(article.title) + '</span>' +
        '<span class="docs-article-link__path">' + escapeHtml(article.path) + '</span>';
      button.addEventListener('click', () => openArticle(article, ''));
      item.appendChild(button);
      list.appendChild(item);
    });

    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'docs-empty';
      empty.textContent = t('dc.browser.empty', 'No bundled article matches this search.');
      list.appendChild(empty);
    }
  }

  async function load() {
    try {
      const response = await fetch('assets/data/docs-manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      current.manifest = ensureManifest(await response.json());
      current.controller = regex.attachRegexBuilder(searchInput, {
        trigger: builderButton,
        modeToggle: modeButton,
        key: 'md-designer.docs-browser.search',
        dialect: 'ECMAScript (JavaScript RegExp)',
        sample: current.manifest.articles.map((article) => article.title).join('\n'),
      });
      if (ui && typeof ui.registerDestination === 'function') {
        current.manifest.articles.forEach((article) => {
          ui.registerDestination({
            id: 'docs.article.' + article.id.replace(/[^a-z0-9]+/g, '.'),
            title: article.title,
            subtitle: article.path,
            group: t('palette.group.docs', 'Documentation'),
            run: () => {
              if (tabs && typeof tabs.goToTab === 'function') tabs.goToTab('docs');
              openArticle(article, '');
            },
          });
        });
      }
      current.controller.onChange(renderList);
      searchInput.addEventListener('input', renderList);
      searchInput.addEventListener('search', renderList);
      i18n.onChange(() => {
        renderList();
        if (current.article) openArticle(current.article, '');
      });
      renderList();
      openArticle(resolveArticle('README.md') || current.manifest.articles[0], '');
      root.dataset.loaded = 'true';
      return true;
    } catch (error) {
      root.dataset.loaded = 'false';
      if (status) status.textContent = t('dc.browser.failure', 'The bundled documentation could not be opened offline.');
      if (list) {
        list.textContent = '';
        const item = document.createElement('li');
        item.className = 'docs-empty docs-empty--error';
        item.textContent = t('dc.browser.failure.detail', 'The local article manifest is missing, invalid, or unavailable.');
        list.appendChild(item);
      }
      return false;
    }
  }

  return load();
}

export {
  ensureManifest,
  fragmentsFromMarkdown,
  markdownToHtml,
  resolveInternalTarget,
  safeLocalImageUrl,
};

export default { initDocsBrowser };
