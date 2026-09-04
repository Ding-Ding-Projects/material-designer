/*
 * Hand-written site-shell contract.
 *
 * This is intentionally an exact inventory, not a discovery-only query. A
 * missing panel or control must turn the audit red instead of disappearing
 * from the set being checked. The function is useful from a browser console
 * and from the static capture harness without requiring a package manager.
 */

export const REQUIRED_PANELS = Object.freeze([
  'overview', 'features', 'install', 'releases', 'building',
  'verifying', 'standards', 'docs', 'provenance', 'settings',
]);

export const REQUIRED_SETTINGS = Object.freeze([
  'settings-language', 'settings-tone', 'settings-appearance',
  'settings-toy-locks', 'settings-reset',
]);

export const REQUIRED_SEARCHES = Object.freeze([
  'site-search-input', 'settings-search-input',
  'page-overview-search', 'page-features-search', 'page-install-search',
  'page-releases-search', 'page-building-search', 'page-verifying-search',
  'page-standards-search', 'page-docs-search', 'page-provenance-search',
  'settings-settings-language-search', 'settings-settings-tone-search',
  'settings-settings-appearance-search', 'settings-settings-toy-locks-search',
  'settings-settings-reset-search', 'tabs-strip-search',
  'tabs-group-members-search', 'tabs-groups-search', 'tabs-master-search',
  'tab-groups-manager-search', 'settings-group-manager-search',
  'tabs-bulk-containing', 'tabs-bulk-not-containing',
  'nested-overview-status-search', 'nested-overview-what-search', 'nested-overview-adds-search', 'nested-overview-verified-search',
  'nested-features-today-search', 'nested-features-network-search', 'nested-features-building-search', 'nested-features-design-search',
  'nested-install-main-search', 'nested-install-will-search', 'nested-install-until-search',
  'nested-releases-main-search', 'nested-releases-contains-search', 'nested-releases-tag-search', 'nested-releases-codename-search', 'nested-releases-lines-search', 'nested-releases-evidence-search', 'nested-releases-caveat-search',
  'nested-building-main-search', 'nested-verifying-main-search', 'nested-standards-main-search',
  'nested-docs-main-search', 'nested-docs-start-search', 'nested-docs-categories-search', 'nested-docs-articles-search', 'nested-docs-convention-search', 'nested-docs-outside-search',
  'nested-provenance-main-search',
]);

function exact(node, selector) {
  return node instanceof Element && node.matches(selector);
}

export function auditSiteShell(root = document) {
  const checks = [];
  const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

  for (const id of REQUIRED_PANELS) check(`panel:${id}`, Boolean(root.querySelector(`[data-tab-panel="${id}"]`)), 'required panel exists');
  for (const id of REQUIRED_SETTINGS) check(`settings:${id}`, Boolean(root.getElementById(id)), 'required settings group exists');
  const settingsTabIds = [...root.querySelectorAll('#tab-panel-settings [role="tab"][data-shell-settings-tab]')].map((node) => node.getAttribute('data-shell-settings-tab'));
  check('settings-tab-membership', settingsTabIds.length === REQUIRED_SETTINGS.length && REQUIRED_SETTINGS.every((id) => settingsTabIds.includes(id)), 'exact five settings tabs are registered');
  check('outer-tablist', Boolean(root.querySelector('#tab-strip [role="tablist"]')), 'outer tab list exists');
  check('outer-dock', ['left', 'right', 'top', 'bottom'].includes(root.querySelector('#tab-strip')?.dataset.dockEdge), 'outer tab dock edge is bounded');
  check('outer-relocated', root.querySelector('#tab-strip')?.dataset.relocated === 'true' && Boolean(root.querySelector('.app-body #tab-strip')), 'outer tab wrapper is physically inside the application body');
  check('settings-tablist', Boolean(root.querySelector('#tab-panel-settings [role="tablist"]')), 'settings tab list exists');
  check('settings-panel', Boolean(root.querySelector('#tab-panel-settings [role="tabpanel"]')), 'settings tab panel exists');
  check('provenance-front', Boolean(root.querySelector('[data-site-provenance] [data-provenance-version]')) && Boolean(root.querySelector('[data-site-provenance] [data-provenance-updated]')), 'front provenance fields exist before navigation');
  check('palette-shortcut', Boolean(root.querySelector('[data-md-palette-open] kbd')?.textContent.includes('Ctrl+Shift+F')), 'palette displays the required shortcut');
  check('palette-no-legacy-shortcut', !root.querySelector('[data-md-palette-open] kbd')?.textContent.includes('Ctrl K'), 'legacy palette shortcut is absent');
  for (const id of REQUIRED_SEARCHES) {
    const input = root.getElementById(id);
    check(`search:${id}`, Boolean(input), 'required search field exists');
    if (input) {
      const searchRoot = input.closest('.md-shell-search');
      const builder = searchRoot?.querySelector('[aria-haspopup="dialog"]') || root.querySelector(`input#${CSS.escape(id)}[data-regex-builder]`);
      check(`search-builder:${id}`, Boolean(builder), 'field owns a regex builder seam');
      if (searchRoot) {
        const unavailable = searchRoot.dataset.builderState === 'unavailable';
        check(`search-builder-callback:${id}`, searchRoot.dataset.builderCallback === 'owner' || unavailable, 'field reports its builder callback or honest unavailability');
        check(`search-builder-disabled:${id}`, Boolean(builder?.disabled) === unavailable, 'unavailable builder affordance is disabled');
      }
    }
  }
  check('context-shell', root.documentElement?.dataset.contextShellReady === 'true', 'universal context shell is registered');
  check('inventory', root.documentElement?.dataset.siteInventory === 'registered', 'site inventory is registered');

  const missing = checks.filter((item) => !item.ok);
  return { ok: missing.length === 0, checks, missing };
}

export function selfTestSiteShellContract(root = document) {
  const baseline = auditSiteShell(root);
  // Discovery popovers are intentionally lazy, so this mutation test covers
  // the always-mounted shell while the full audit continues to require every
  // lazy search field once its owning popover has been exercised.
  const baselineCore = {
    ...baseline,
    missing: baseline.missing.filter((item) => !item.id.startsWith('search:')),
    ok: baseline.missing.every((item) => item.id.startsWith('search:')),
  };
  const tab = root.querySelector('#tab-panel-settings [role="tab"]');
  const search = root.getElementById('settings-settings-language-search');
  if (!tab || !search) return { ok: false, baseline: baselineCore, mutation: null, searchMutation: null, renameMutation: null, restoration: null };
  const parent = tab.parentElement;
  const next = tab.nextSibling;
  tab.remove();
  const mutation = auditSiteShell(root);
  if (next) parent.insertBefore(tab, next); else parent.append(tab);
  const searchParent = search.parentElement;
  const searchNext = search.nextSibling;
  search.remove();
  const searchMutation = auditSiteShell(root);
  if (searchNext) searchParent.insertBefore(search, searchNext); else searchParent.append(search);
  const oldId = tab.id;
  tab.id = `${oldId}-RENAMED`;
  const renameMutation = auditSiteShell(root);
  tab.id = oldId;
  const restoration = auditSiteShell(root);
  return { ok: baselineCore.ok && !mutation.ok && !searchMutation.ok && !renameMutation.ok && restoration.ok, baseline: baselineCore, mutation, searchMutation, renameMutation, restoration };
}

export function assertSiteShellContract(root = document) {
  const result = auditSiteShell(root);
  if (!result.ok) throw new Error(`Site shell contract failed: ${result.missing.map((item) => item.id).join(', ')}`);
  return result;
}

if (typeof window !== 'undefined') window.MATERIAL_DESIGNER_SITE_SHELL_AUDIT = auditSiteShell;
