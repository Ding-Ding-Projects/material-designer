// Driving the super-confirmation gate from a Playwright test.
//
// Irreversible deletes across the product — a conversation, a project file, a
// design system, an automation, a saved API key — used to be answered by a
// blocking `window.confirm`, which in Playwright meant `page.on('dialog')` and
// a one-line `dialog.accept()`. They now go through the app's own gate, so a
// test that wants to reach the delete has to make the gesture a user makes:
// turn two independent keys, then run a slider from end to end.
//
// The slider rations forward travel (see `SLIDER_ADVANCE_MAX` in
// `apps/web/src/components/destructive/gateMachine.ts`), so one `End` press
// lands part-way rather than authorizing. That rationing is the whole point of
// the control, so this helper presses `End` repeatedly rather than reaching
// past it — five presses is the minimum the ration allows.

import type { Locator, Page } from '@playwright/test';

/** How many `End` presses the ration needs to carry the slider to 100%. */
const SLIDER_ADVANCES = 5;

/**
 * Authorize whichever destructive gate is currently open on the page.
 *
 * Pass `scope` when more than one gate could plausibly be mounted; by default
 * the page-level test id is used, which is unique because the gate is a modal.
 */
export async function authorizeDestructiveGate(
  page: Page,
  scope?: Locator,
): Promise<void> {
  const gate = (scope ?? page).getByTestId('destructive-gate');
  await gate.waitFor({ state: 'visible' });
  await gate.getByTestId('destructive-gate-key-first').click();
  await gate.getByTestId('destructive-gate-key-second').click();
  const slider = gate.getByTestId('destructive-gate-slider');
  await slider.focus();
  for (let advance = 0; advance < SLIDER_ADVANCES; advance += 1) {
    await slider.press('End');
  }
}

/**
 * Back out of an open gate without running anything.
 *
 * The emergency exit is always available, and reporting it as cancellation is
 * only truthful while the action has not started — which is exactly the state
 * a test that never touched the slider is in.
 */
export async function dismissDestructiveGate(
  page: Page,
  scope?: Locator,
): Promise<void> {
  const gate = (scope ?? page).getByTestId('destructive-gate');
  await gate.waitFor({ state: 'visible' });
  await gate.getByTestId('destructive-gate-exit').click();
}
