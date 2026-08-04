import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Widen the entry nav rail to its labelled state.
 *
 * The rail is persistent: collapsed it is the 88px icon column, expanded it
 * is 260px with a label beside every icon. Its destinations (`entry-nav-*`)
 * are clickable in both, but only the expanded rail is wide enough for a
 * click at the row's centre to land reliably, and only there do the labels
 * exist to assert on. This helper is idempotent — once expanded, the topbar
 * toggle is hidden, so it no-ops.
 */
export async function ensureRailOpen(page: Page): Promise<void> {
  const toggle = page.getByTestId('entry-rail-toggle');
  // The toggle is only present while collapsed (it's display:none once docked).
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
  }
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  await expect(page.locator('.entry-nav-rail')).toHaveAttribute('data-rail-expanded', 'true');
}

export async function openNewProjectModal(page: Page): Promise<void> {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  await ensureRailOpen(page);
  const railCreateButton = page.getByTestId('entry-nav-new-project');
  if (await railCreateButton.isVisible().catch(() => false)) {
    const point = await getActionablePoint(railCreateButton);
    if (point) {
      await page.mouse.click(point.x, point.y);
      await expect(page.getByTestId('new-project-modal')).toBeVisible();
      await expect(page.getByTestId('new-project-panel')).toBeVisible();
      return;
    }
  }

  const projectsNav = page.getByTestId('entry-nav-projects');
  if (await projectsNav.isVisible().catch(() => false)) {
    await projectsNav.scrollIntoViewIfNeeded();
    await projectsNav.click();
  } else if (!/\/projects$/.test(new URL(page.url()).pathname)) {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  }
  const projectsView = page.getByTestId('entry-view-projects');
  await expect(projectsView).toBeVisible();
  const createButton = projectsView
    .getByTestId('designs-new-project')
    .or(projectsView.getByTestId('designs-empty-new-project'))
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function getActionablePoint(locator: Locator): Promise<{ x: number; y: number } | null> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > window.innerWidth ||
      point.y > window.innerHeight
    ) {
      return null;
    }
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && element.contains(hit) ? point : null;
  }).catch(() => null);
}
