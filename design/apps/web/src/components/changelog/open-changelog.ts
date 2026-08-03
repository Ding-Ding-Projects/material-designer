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

export function openChangelogViewer(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGELOG_OPEN_EVENT));
}
