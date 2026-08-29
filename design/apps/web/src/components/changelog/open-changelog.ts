// One way in to the changelog viewer, from anywhere.
//
// The dialog is mounted once at the app root, and every surface that offers
// the changelog — Settings → About today, any other version surface later —
// dispatches this event rather than owning its own copy of the dialog or
// threading a callback down through the tree. That is the same shape the app
// already uses for `RUNS_CHANGED_EVENT` and the AMR login status.
//
// Deliberately a tiny module of its own: a settings panel that only wants to
// open the viewer should not have to import it.

export const CHANGELOG_OPEN_EVENT = 'od:open-changelog';
export const CHANGELOG_MOUNT_IDS = ['C0', 'C2', 'C7', 'C12'] as const;
export type ChangelogMountId = (typeof CHANGELOG_MOUNT_IDS)[number];

export interface ChangelogOpenDetail {
  readonly mountId?: ChangelogMountId;
}

/** Only the named mount may consume an open event. */
export function isChangelogOpenForMount(
  detail: ChangelogOpenDetail | undefined,
  mountId: ChangelogMountId,
): boolean {
  return detail?.mountId === mountId;
}

export function openChangelogViewer(mountId: ChangelogMountId = 'C12'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ChangelogOpenDetail>(CHANGELOG_OPEN_EVENT, { detail: { mountId } }));
}
