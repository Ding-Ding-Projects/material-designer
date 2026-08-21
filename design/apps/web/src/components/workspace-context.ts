import type { WorkspaceContextItem } from '@open-design/contracts';
import type { Translate } from '../i18n';

export function workspaceContextLinkedDir(item: WorkspaceContextItem): string | null {
  if (item.kind !== 'local-code' && item.kind !== 'project') return null;
  const dir = item.absolutePath?.trim();
  return dir || null;
}

export function workspaceContextLinkedDirs(items: WorkspaceContextItem[]): string[] {
  const dirs = items
    .map(workspaceContextLinkedDir)
    .filter((dir): dir is string => Boolean(dir));
  return Array.from(new Set(dirs));
}

// Human label for a workspace context kind. Keep this mapping in one place so
// chips, mention rows, quick switching and the home composer all use the same
// localized vocabulary. The project/local-code/folder family intentionally
// shares the existing folder label: the user-supplied item label/path carries
// the more specific name without inventing a second untranslated string.
export function workspaceContextKindLabel(
  kind: WorkspaceContextItem['kind'],
  t: Translate,
): string {
  switch (kind) {
    case 'browser': return t('chat.designToolbox.context.browser');
    case 'design-files': return t('chat.designToolbox.context.designFiles');
    case 'design-system': return t('chat.designToolbox.context.designSystem');
    case 'folder':
    case 'project':
    case 'local-code': return t('chat.designToolbox.context.folder');
    case 'terminal': return t('chat.designToolbox.context.terminal');
    case 'side-chat': return t('chat.designToolbox.context.sideChat');
    case 'live-artifact': return t('chat.designToolbox.context.liveArtifact');
    case 'file':
    default: return t('chat.designToolbox.context.file');
  }
}

// The single most useful identifier to surface for a context item: the folder
// it points at, else the URL, else the project id / title. Empty when the item
// carries no locator (the hover card then shows only the type).
export function workspaceContextDetailLine(item: WorkspaceContextItem): string {
  return (
    item.absolutePath?.trim() ||
    item.url?.trim() ||
    item.path?.trim() ||
    item.title?.trim() ||
    ''
  );
}
