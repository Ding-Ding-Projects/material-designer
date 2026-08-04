/**
 * The text the web shell renders while the client bundle is still loading.
 *
 * Playwright synchronises startup on this string being hidden or absent, which
 * makes it the one literal in the suite that fails *silently* when it is wrong:
 * a wait for text the app never renders is satisfied the instant it is
 * evaluated, so a stale copy does not turn a test red, it turns every startup
 * gate in that file into a no-op and makes the whole UI suite flaky for reasons
 * nobody can reproduce.
 *
 * Importing it from here is what stops the product string and the 42 waits from
 * drifting apart, and `scripts/check-loading-shell.sh` proves on every push that
 * this constant still matches what `apps/web/app/[[...slug]]/client-app.tsx`
 * actually renders.
 */
export const LOADING_SHELL_TEXT = 'Loading Material Designer…';
