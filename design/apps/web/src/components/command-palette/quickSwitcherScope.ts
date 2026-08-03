// The quick switcher, exposed as a scope inside the command palette.
//
// `QuickSwitcher.tsx` is untouched: it keeps Cmd/Ctrl+P, its own overlay and
// its own recents, and it stays the fast path for "open a file". What this file
// adds is a way for the palette — which mounts at the app shell, far above the
// project workspace that owns the file list — to search the same things with
// the same ranking.
//
// It does that by borrowing rather than reimplementing. `scoreMatch` and
// `scoreWorkspaceContextMatch` are imported from the quick switcher itself, so
// the two surfaces cannot rank the same query differently; if someone tunes the
// fuzzy scoring, both move together. The data arrives through a tiny publish
// store because the workspace is the only component that knows the file list,
// and threading it up through the shell would mean a prop drilled through every
// view that does not care about it.

import { useSyncExternalStore } from 'react';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { pushRecent } from '../../quickSwitcherRecents';
import type { ProjectFile } from '../../types';
import { scoreMatch, scoreWorkspaceContextMatch } from '../QuickSwitcher';

export interface QuickSwitcherScopeSource {
  projectId: string;
  files: readonly ProjectFile[];
  workspaceContexts: readonly WorkspaceContextItem[];
  openFile: (name: string) => void;
  openTab: (tabId: string) => void;
}

let source: QuickSwitcherScopeSource | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Publish the currently mounted workspace as the palette's file scope. Returns
 * the teardown, so a caller can `useEffect(() => publishQuickSwitcherScope(…), […])`
 * and have unmount clear the scope. Clearing checks identity first: two
 * workspaces mounting and unmounting out of order must not let the older one's
 * teardown wipe the newer one's registration.
 */
export function publishQuickSwitcherScope(next: QuickSwitcherScopeSource): () => void {
  source = next;
  emit();
  return () => {
    if (source !== next) return;
    source = null;
    emit();
  };
}

export function readQuickSwitcherScope(): QuickSwitcherScopeSource | null {
  return source;
}

export function subscribeQuickSwitcherScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function serverSnapshot(): QuickSwitcherScopeSource | null {
  return null;
}

export function useQuickSwitcherScope(): QuickSwitcherScopeSource | null {
  return useSyncExternalStore(
    subscribeQuickSwitcherScope,
    readQuickSwitcherScope,
    serverSnapshot,
  );
}

export interface QuickSwitcherScopeResult {
  id: string;
  kind: 'file' | 'tab';
  title: string;
  detail: string;
  run: () => void;
}

function baseName(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(index + 1) : name;
}

function dirName(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index) : '';
}

/**
 * Rank files and workspace tabs for a query, exactly as the quick switcher
 * would. An empty query lists tabs first and then files by mtime, which is the
 * quick switcher's own no-query ordering minus its recents lookup — recents are
 * per-project browser state the palette has no reason to mutate just by opening.
 */
export function quickSwitcherScopeResults(
  scope: QuickSwitcherScopeSource | null,
  query: string,
  limit = 50,
): QuickSwitcherScopeResult[] {
  if (!scope) return [];
  const needle = query.trim().toLowerCase();
  const tabs = scope.workspaceContexts.filter((item) => item.tabId);

  const fileResult = (file: ProjectFile): QuickSwitcherScopeResult => ({
    id: `file:${file.name}`,
    kind: 'file',
    title: baseName(file.name),
    detail: dirName(file.name) || file.kind.toUpperCase(),
    run: () => {
      scope.openFile(file.name);
      pushRecent(scope.projectId, file.name);
    },
  });
  const tabResult = (item: WorkspaceContextItem): QuickSwitcherScopeResult => ({
    id: `tab:${item.kind}:${item.id}`,
    kind: 'tab',
    title: item.label,
    detail: item.url || item.path || item.absolutePath || item.title || item.kind,
    run: () => {
      if (item.tabId) scope.openTab(item.tabId);
    },
  });

  if (!needle) {
    return [
      ...tabs.map(tabResult),
      ...[...scope.files].sort((a, b) => b.mtime - a.mtime).map(fileResult),
    ].slice(0, limit);
  }

  const scored: Array<{ score: number; result: QuickSwitcherScopeResult }> = [];
  for (const item of tabs) {
    const score = scoreWorkspaceContextMatch(item, needle);
    if (score > 0) scored.push({ score, result: tabResult(item) });
  }
  for (const file of scope.files) {
    const score = scoreMatch(file, needle);
    if (score > 0) scored.push({ score, result: fileResult(file) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.result);
}
