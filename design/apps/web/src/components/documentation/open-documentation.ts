// One narrow entry point for opening the bundled documentation reader.
//
// The entry shell owns routing and the documentation reader owns article state.
// This event keeps those responsibilities separate: a palette row, help action,
// or another surface can request a destination without importing the reader or
// threading a callback through the shell.

export const DOCUMENTATION_OPEN_EVENT = 'od:open-documentation';

export interface OpenDocumentationDetail {
  /** Tell C0 to activate the documentation destination before focusing it. */
  readonly activation?: 'view' | 'article';
  /** Select this bundled article once the reader is mounted. */
  readonly path?: string;
  /** Scroll to this article heading after the selected article is rendered. */
  readonly hash?: string;
  /** Return focus to a deterministic reader target after activation. */
  readonly focus?: 'article' | 'search';
}

let pending: OpenDocumentationDetail | null = null;

export function openDocumentation(detail: OpenDocumentationDetail = {}): void {
  pending = detail;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOCUMENTATION_OPEN_EVENT, { detail }));
}

export function takePendingDocumentation(): OpenDocumentationDetail | null {
  const request = pending;
  pending = null;
  return request;
}

export function peekPendingDocumentation(): OpenDocumentationDetail | null {
  return pending;
}

export function clearPendingDocumentation(): void {
  pending = null;
}
