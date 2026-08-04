// One way in to the version-history panel, from anywhere.
//
// Same shape as `changelog/open-changelog.ts`, and for the same reason: the
// panel is mounted once at the app root, and every surface that offers history
// — Settings today, a record's own context menu later — dispatches this event
// rather than owning a second copy of the dialog or threading a callback down
// through the tree.
//
// A revision id may travel with the event so a surface can open history *at*
// something rather than at the top of the list.

export const HISTORY_OPEN_EVENT = 'od:open-version-history';

export interface OpenVersionHistoryDetail {
  /** Select this revision once the list has loaded. */
  readonly revisionId?: string;
  /** Pre-select this domain's filter, e.g. opening history from Settings. */
  readonly domainId?: string;
}

export function openVersionHistory(detail: OpenVersionHistoryDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HISTORY_OPEN_EVENT, { detail }));
}
