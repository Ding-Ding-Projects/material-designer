import type { StatusHubMountId } from './StatusHubCard';

export const STATUS_HUB_OPEN_EVENT = 'od:open-status-hub';

export interface StatusHubOpenDetail {
  readonly mountId?: StatusHubMountId;
}

/** Dispatch a local open signal without implying that the Hub received anything. */
export function openStatusHub(mountId: StatusHubMountId = 'C0'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StatusHubOpenDetail>(STATUS_HUB_OPEN_EVENT, { detail: { mountId } }));
}
