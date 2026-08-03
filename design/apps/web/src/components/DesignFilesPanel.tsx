import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAnalytics } from '../analytics/provider';
import { trackFileManagerClick } from '../analytics/events';
import { useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { projectFileUrl, projectRawUrl } from '../providers/registry';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind, ProjectFolder } from '../types';
import {
  createFileSystemReadError,
  FILE_SYSTEM_READ_ERROR_MESSAGE,
  isFileSystemReadError,
} from '../utils/fileSystemErrors';
import { isVisualStabilityMode } from '../utils/visualStability';
import { BulkActionBar, type BulkAction } from './bulk/BulkActionBar';
import { BulkPreviewDialog } from './bulk/BulkPreviewDialog';
import { bulkOutcomeMessage } from './bulk/messages';
import {
  bulkPlanCounts,
  bulkPlanRunnable,
  planBulkAction,
  type BulkPlan,
  type BulkSkipReason,
} from './bulk/plan';
import type { BulkRunProgress, BulkRunResult } from './bulk/run';
import {
  clearSelection,
  describeSelection,
  extendTo,
  invertWithin,
  isSelected,
  emptySelection,
  pruneSelection,
  selectAllOf,
  selectionIds,
  selectionKeyDown,
  selectOnly,
  toggleOne,
  type SelectionState,
} from './bulk/selection';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { selectInitialDesignPreviewFile } from './design-files/designArtifacts';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { getPluginFolderCandidates } from './design-files/pluginFolders';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import {
  isEditableTarget,
  runShortcut,
  type ShortcutHandler,
} from './shortcuts/useShortcuts';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import { Toast } from './Toast';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/**
 * What a batch delete actually did, reported back to the panel.
 *
 * Three lists rather than a count, because "deleted", "the server refused" and
 * "you stopped it before we got here" call for three different things from the
 * user and folding them into one number throws that away.
 */
export interface BulkDeleteReport {
  readonly deleted: readonly string[];
  readonly failed: readonly string[];
  readonly notAttempted: readonly string[];
}

export interface BulkDeleteOptions {
  /** Called before each file, then once more with `null` when the run ends. */
  readonly onProgress?: (done: number, current: string | null) => void;
  /** Checked between files; nothing already in flight is interrupted. */
  readonly signal?: { readonly aborted: boolean };
}

/** The bulk action the preview dialog is currently reviewing. */
type BulkActionId = 'open' | 'download' | 'copyPaths' | 'delete';

/**
 * A file, as the bulk machinery sees it: an id and something to show a human.
 * The id is the full path because that is what every callback here takes; the
 * label is the basename, because a preview listing forty full paths is a
 * preview nobody reads.
 */
interface FileBulkItem {
  readonly id: string;
  readonly label: string;
  readonly localPath?: string;
}

/**
 * Why a file was held back. Tokens, not sentences — `describeBulkSkip` below
 * turns them into copy, so the reason has to survive `t()` like everything else.
 */
const SKIP_BUSY: BulkSkipReason = 'busy';
const SKIP_NO_LOCAL_PATH: BulkSkipReason = 'noLocalPath';
const SKIP_OVER_TAB_LIMIT: BulkSkipReason = 'overTabLimit';

/**
 * How many files "Open in tabs" will actually open at once.
 *
 * A user who selects three hundred files and asks for tabs does not want three
 * hundred tabs, and the workspace would be unusable if they got them. The cap
 * is enforced in the plan rather than silently in the loop, so the preview says
 * out loud which files are being left closed and why.
 */
const BULK_OPEN_TAB_LIMIT = 12;

export interface DesignFilesNavState {
  kindFilter: Set<ProjectFileKind>;
  currentDir: string;
  page: number;
  pageSize: number | 'all';
}

interface Props {
  projectId: string;
  // Basename of the project's working directory when the user has chosen a
  // real folder (e.g. "openclaw"). Shown as the breadcrumb root instead of
  // the generic "project" label. Undefined for default-storage projects.
  rootDirName?: string;
  // True while the host is reindexing a freshly replaced working dir. Drives
  // a loading overlay so the panel doesn't sit silently on the stale tree.
  reloading?: boolean;
  // True while the chat agent is generating. The footer swaps its idle
  // drop/upload hint for the typewriter "tip" line while a run is in flight.
  running?: boolean;
  files: ProjectFile[];
  // Persisted folders from `/api/projects/:id/folders`, including empty ones
  // that no file lives under. Without these, a folder only appears once a file
  // with a matching path prefix exists, so empty (user-created or imported)
  // folders would vanish from the tree.
  folders?: ProjectFolder[];
  liveArtifacts: LiveArtifactWorkspaceEntry[];
  onRefreshFiles: () => Promise<void> | void;
  onOpenFile: (name: string) => void;
  onOpenLiveArtifact: (tabId: LiveArtifactWorkspaceEntry['tabId']) => void;
  onRenameFile: (from: string, to: string) => Promise<ProjectFile | null> | ProjectFile | null;
  onDeleteFile: (name: string) => void;
  /**
   * Delete several files. The panel has already shown the user the exact list
   * and anything it is skipping, so this must not confirm again; it reports
   * what happened instead, and the panel turns that into a non-blocking toast.
   */
  onDeleteFiles: (
    names: string[],
    options?: BulkDeleteOptions,
  ) => Promise<BulkDeleteReport | void> | BulkDeleteReport | void;
  onUpload: () => void;
  onUploadFiles: (files: File[]) => void;
  onPaste: () => void;
  onNewSketch: () => void;
  onOpenBrowser?: () => void;
  onCreateDesignSystem?: () => void;
  onCreateDesignSystemFromProject?: () => void;
  createDesignSystemFromProjectBusy?: boolean;
  onDuplicateProject?: () => void;
  duplicateProjectBusy?: boolean;
  /** Opens the "Select from library" picker to pull registry assets in. */
  onSelectFromLibrary?: () => void;
  // Reports the folder the panel is currently viewing so the parent can create
  // new files (upload / paste / new sketch / dropped files) under it instead
  // of the project root. Fires whenever the user navigates folders.
  onCurrentDirChange?: (dir: string) => void;
  uploadError?: string | null;
  onClearUploadError?: () => void;
  preferredPreviewFile?: string | null;
  autoPreviewDesignArtifacts?: boolean;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  navState?: DesignFilesNavState;
  onNavStateChange?: (state: DesignFilesNavState) => void;
}

interface ActionNotice {
  message: string;
  url?: string;
}

// Display-only refinement of ProjectFileKind. The contract `kind` lumps all
// source under `code`; the Design Files surface splits CSS/SCSS/etc. into a
// dedicated "Stylesheets" section to mirror Claude Design. Everything else
// maps 1:1 to its kind.
type FileCategory = ProjectFileKind | 'stylesheet';

// Section render order. Empty categories are skipped; the FOLDERS section is
// pinned above all of these from the directory list.
const SECTION_ORDER: FileCategory[] = [
  'html',
  'stylesheet',
  'code',
  'document',
  'text',
  'image',
  'sketch',
  'pdf',
  'presentation',
  'spreadsheet',
  'video',
  'audio',
  'binary',
];

const STYLESHEET_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less']);
const HTML_THUMBNAIL_INLINE_MAX_BYTES = 512 * 1024;

function fileCategory(file: ProjectFile): FileCategory {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (STYLESHEET_EXTENSIONS.has(ext)) return 'stylesheet';
  return file.kind;
}

type FileSystemEntryWithReader = FileSystemEntry & {
  createReader?: () => FileSystemDirectoryReader;
};
type FileSystemFileEntryWithFile = FileSystemFileEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};
type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

function buildActionNotice(message: string, url?: string): ActionNotice {
  const trimmedMessage = message.trim();
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return { message: trimmedMessage };
  const normalizedMessage = trimmedMessage.replace(new RegExp(`\\s*${escapeRegExp(trimmedUrl)}\\s*$`), '');
  return { message: normalizedMessage.trim() || trimmedUrl, url: trimmedUrl };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ActionNoticeView({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  return (
    <>
      <span>{notice.message}</span>
      {notice.url ? (
        <>
          {' '}
          <a href={notice.url} target="_blank" rel="noreferrer">
            {notice.url}
          </a>
        </>
      ) : null}
    </>
  );
}

// Useful-info tips that rotate one at a time in the panel footer, ordered as
// a loose journey: file basics → feeding context → generating → iterating →
// exporting/sharing → community. A tip with a `url` renders its typed line as
// a link to that destination.
const USEFUL_TIPS: ReadonlyArray<{ key: keyof Dict; url?: string }> = [
  { key: 'designFiles.usefulInfoTip' },
  { key: 'designFiles.usefulInfoTip2' },
  { key: 'designFiles.usefulInfoTip9' },
  { key: 'designFiles.usefulInfoTip10' },
  { key: 'designFiles.usefulInfoTip4' },
  { key: 'designFiles.usefulInfoTip11' },
  { key: 'designFiles.usefulInfoTip12' },
  { key: 'designFiles.usefulInfoTip13' },
  { key: 'designFiles.usefulInfoTip14' },
  { key: 'designFiles.usefulInfoTip15' },
  { key: 'designFiles.usefulInfoTip5' },
  { key: 'designFiles.usefulInfoTip6', url: 'https://discord.gg/mHAjSMV6gz' },
  { key: 'designFiles.usefulInfoTip7', url: 'https://github.com/nexu-io/open-design' },
  { key: 'designFiles.usefulInfoTip8', url: 'https://x.com/OpenDesignHQ' },
  { key: 'designFiles.usefulInfoTip16', url: 'https://www.threads.com/@opendesign.ai' },
  { key: 'designFiles.usefulInfoTip17', url: 'https://www.instagram.com/opendesign.ai/' },
  { key: 'designFiles.usefulInfoTip18', url: 'https://www.youtube.com/@Open-Design-ai' },
  { key: 'designFiles.usefulInfoTip19', url: 'https://www.linkedin.com/company/open-design-ai/' },
  {
    key: 'designFiles.usefulInfoTip20',
    url: 'https://www.xiaohongshu.com/user/profile/691effad000000003002978f',
  },
];
const TIP_TYPE_MS = 32; // per-character typing speed
const TIP_HOLD_MS = 3800; // pause on a fully-typed tip before advancing

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Footer "tip" line that types out one tip at a time (typewriter), holds, then
// advances to the next — mirroring Claude Design's empty-state hint. It is
// intentionally auxiliary while a run is active; the preview status bar owns
// progress and recovery feedback. Under prefers-reduced-motion the full tip is
// shown immediately and just cycles.
function RotatingTip({ auxiliary = false }: { auxiliary?: boolean }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  // Resolve tips each render but read them through a ref so the typing effect
  // depends only on `index` — depending on the (re-created) array would reset
  // the typewriter on every render and never advance.
  const tipsRef = useRef<string[]>([]);
  tipsRef.current = USEFUL_TIPS.map(({ key }) => t(key));

  useEffect(() => {
    const tips = tipsRef.current;
    const full = tips[index] ?? '';
    if (isVisualStabilityMode()) {
      setIndex(0);
      setTyped(tips[0] ?? '');
      return;
    }
    if (prefersReducedMotion()) {
      setTyped(full);
      if (tips.length < 2) return;
      const hold = window.setTimeout(
        () => setIndex((i) => (i + 1) % tips.length),
        TIP_HOLD_MS,
      );
      return () => window.clearTimeout(hold);
    }
    setTyped('');
    let i = 0;
    let holdTimer = 0;
    const typeTimer = window.setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(typeTimer);
        if (tips.length < 2) return;
        holdTimer = window.setTimeout(
          () => setIndex((p) => (p + 1) % tips.length),
          TIP_HOLD_MS,
        );
      }
    }, TIP_TYPE_MS);
    return () => {
      window.clearInterval(typeTimer);
      window.clearTimeout(holdTimer);
    };
  }, [index]);

  return (
    <div className={`df-useful-info${auxiliary ? ' df-useful-info-auxiliary' : ''}`}>
      <div className="df-useful-info-head">
        <Icon name="sparkles" size={12} />
        <span className="df-useful-info-label">{t('designFiles.usefulInfoLabel')}</span>
      </div>
      <span className="df-useful-info-tip">
        {USEFUL_TIPS[index]?.url ? (
          <a className="df-tip-link" href={USEFUL_TIPS[index].url} target="_blank" rel="noreferrer">
            {typed}
          </a>
        ) : (
          typed
        )}
        <span className="df-tip-caret" aria-hidden />
      </span>
    </div>
  );
}

/**
 * Full-panel browser for a project's `.od/projects/<id>/` folder. Mirrors
 * Claude Design's "Design Files" surface: a single-line toolbar (up / refresh
 * / breadcrumbs + actions), semantic sections (Folders, Stylesheets, Scripts,
 * Documents, Images …), hover-revealed row checkbox + menu, a right-side
 * preview pane, and a static "useful info" footer. Triggered as a sticky
 * first tab in FileWorkspace.
 */
export function DesignFilesPanel({
  projectId,
  rootDirName,
  reloading,
  running = false,
  files,
  folders,
  liveArtifacts,
  onOpenFile,
  onOpenLiveArtifact,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onUpload,
  onUploadFiles,
  onPaste,
  onNewSketch,
  onOpenBrowser,
  onCreateDesignSystem,
  onCreateDesignSystemFromProject,
  createDesignSystemFromProjectBusy = false,
  onDuplicateProject,
  duplicateProjectBusy = false,
  onSelectFromLibrary,
  uploadError = null,
  onClearUploadError,
  preferredPreviewFile = null,
  autoPreviewDesignArtifacts = false,
  onCurrentDirChange,
  onPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
  navState,
  onNavStateChange,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dropReadError, setDropReadError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  const MENU_ESTIMATED_HEIGHT = 180;
  const MENU_SAFE_PADDING = 8;
  const [preview, setPreview] = useState<string | null>(null);
  const autoPreviewAppliedRef = useRef(false);
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const lastKeyPress = useRef<Map<string, number>>(new Map());
  const [deleting, setDeleting] = useState(false);
  // The bulk action currently under review, its plan, and — once it is running
  // — the progress and the flag that stops it. `bulkAbortRef` is a ref rather
  // than state because the running loop reads it between items and must see the
  // latest value, not the one captured when the run started.
  const [bulkReview, setBulkReview] = useState<
    { action: BulkActionId; plan: BulkPlan<FileBulkItem> } | null
  >(null);
  const [bulkProgress, setBulkProgress] = useState<BulkRunProgress | null>(null);
  const bulkAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const [bulkNotice, setBulkNotice] = useState<
    { id: number; message: string; tone: 'success' | 'error' | 'default'; role: 'status' | 'alert' } | null
  >(null);
  const bulkNoticeIdRef = useRef(0);
  const bulkTitleId = useId();
  const [installingFolder, setInstallingFolder] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<ActionNotice | null>(null);
  const [renaming, setRenaming] = useState<{ name: string; draft: string; saving: boolean } | null>(null);
  const [copiedLocalPath, setCopiedLocalPath] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState<string>(() => navState?.currentDir ?? '');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  // Keep the parent's create-target in sync with the folder being viewed, so
  // uploads / pastes / new sketches / dropped files land in the open folder
  // rather than the project root.
  useEffect(() => {
    onCurrentDirChange?.(currentDir);
  }, [currentDir, onCurrentDirChange]);

  useEffect(() => {
    onNavStateChange?.({
      kindFilter: navState?.kindFilter ?? new Set(),
      currentDir,
      page: 0,
      pageSize: 30,
    });
  }, [currentDir, navState?.kindFilter, onNavStateChange]);

  // Derive immediate subdirectories and files at the current directory level
  // from the flat files list. Files with names like "a/b/c.html" contribute
  // "a" as a directory when currentDir is '' and "b" when currentDir is "a".
  const { dirsAtCurrentDir, filesAtCurrentDir } = useMemo(() => {
    const prefix = currentDir === '' ? '' : `${currentDir}/`;
    const dirs = new Set<string>();
    const localFiles: ProjectFile[] = [];
    for (const f of files) {
      if (!f.name.startsWith(prefix)) continue;
      const remainder = f.name.slice(prefix.length);
      const slashIdx = remainder.indexOf('/');
      if (slashIdx === -1) {
        localFiles.push(f);
      } else {
        dirs.add(remainder.slice(0, slashIdx));
        if (currentDir === '') localFiles.push(f);
      }
    }
    // Also surface persisted folders (including empty ones with no files under
    // them) as immediate children of the current directory.
    for (const folder of folders ?? []) {
      if (!folder.path.startsWith(prefix)) continue;
      const remainder = folder.path.slice(prefix.length);
      if (!remainder) continue; // the current directory itself
      const slashIdx = remainder.indexOf('/');
      dirs.add(slashIdx === -1 ? remainder : remainder.slice(0, slashIdx));
    }
    return {
      dirsAtCurrentDir: [...dirs].sort((a, b) => a.localeCompare(b)),
      filesAtCurrentDir: localFiles,
    };
  }, [files, folders, currentDir]);

  // Group files at the current level into semantic sections, ordered by
  // SECTION_ORDER. Files within a section sort most-recently-modified first.
  const sections = useMemo(() => {
    const grouped = new Map<FileCategory, ProjectFile[]>();
    for (const f of filesAtCurrentDir) {
      const category = fileCategory(f);
      const bucket = grouped.get(category) ?? [];
      bucket.push(f);
      grouped.set(category, bucket);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => b.mtime - a.mtime);
    }
    return SECTION_ORDER.filter((category) => grouped.has(category)).map(
      (category) => [category, grouped.get(category)!] as const,
    );
  }, [filesAtCurrentDir]);

  // Reset selection and renaming state when the user navigates into or out of
  // a directory.
  useEffect(() => {
    setSelection(clearSelection());
    setRenaming(null);
  }, [currentDir]);

  // Navigate up to the nearest ancestor that still exists when the current
  // directory disappears (e.g. after deleting the last file in a subfolder).
  // A directory "exists" if it has files under it OR is a persisted folder
  // (possibly empty) — otherwise navigating into an empty folder would bounce
  // straight back to the root.
  useEffect(() => {
    if (currentDir === '') return;
    const dirExists = (dir: string) =>
      files.some((f) => f.name.startsWith(`${dir}/`)) ||
      (folders ?? []).some((fo) => fo.path === dir || fo.path.startsWith(`${dir}/`));
    if (dirExists(currentDir)) return;
    const parts = currentDir.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (dirExists(ancestor)) {
        setCurrentDir(ancestor);
        return;
      }
    }
    setCurrentDir('');
  }, [files, folders, currentDir]);

  const pluginFolders = useMemo(() => getPluginFolderCandidates(files), [files]);

  // Prune selections that no longer exist in the current file list
  // (e.g. after a refresh or delete within the same project).
  // Cross-project leaks are handled by the parent remounting this
  // component via key={projectId}.
  //
  // `pruneSelection` returns the same object when nothing was dropped, so this
  // does not re-render on every `files` identity change.
  useEffect(() => {
    const names = files.map((f) => f.name);
    setSelection((prev) => (prev.ids.size === 0 ? prev : pruneSelection(prev, names)));
  }, [files]);

  const previewFile = useMemo(
    () => files.find((f) => f.name === preview) ?? null,
    [preview, files],
  );

  const initialPreviewFile = useMemo(
    () =>
      autoPreviewDesignArtifacts
        ? selectInitialDesignPreviewFile(files, preferredPreviewFile)
        : null,
    [autoPreviewDesignArtifacts, files, preferredPreviewFile],
  );

  useEffect(() => {
    if (autoPreviewAppliedRef.current) return;
    if (!initialPreviewFile) return;
    autoPreviewAppliedRef.current = true;
    setPreview(initialPreviewFile.name);
  }, [initialPreviewFile]);

  useEffect(() => {
    if (!preview) return;
    if (files.some((f) => f.name === preview)) return;
    setPreview(null);
  }, [files, preview]);

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos]);

  useEffect(() => {
    const onClipboardPaste = (event: ClipboardEvent) => {
      if (shouldIgnoreClipboardFilePaste(event.target)) return;
      const pastedFiles = filesFromClipboardData(event.clipboardData);
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      setDropReadError(null);
      onClearUploadError?.();
      onUploadFiles(pastedFiles);
    };
    window.addEventListener('paste', onClipboardPaste);
    return () => window.removeEventListener('paste', onClipboardPaste);
  }, [onClearUploadError, onUploadFiles]);
  useEffect(() => {
    if (!projectMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && projectMenuRef.current?.contains(target)) return;
      setProjectMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectMenuOpen]);

  // The rows on screen, in render order. Ranges and "select all on this page"
  // are both defined against this and nothing else, so a shift-click never
  // reaches a row the user cannot see.
  const pageNames = useMemo(() => filesAtCurrentDir.map((f) => f.name), [filesAtCurrentDir]);
  // Every file in the project, folders included. This is the other universe:
  // "select everything" here genuinely means everything, which is why it is
  // labelled with its own count rather than sharing a button with the page.
  const everyMatchNames = useMemo(() => files.map((f) => f.name), [files]);
  const selectionSummary = useMemo(
    () => describeSelection(selection, pageNames, everyMatchNames),
    [selection, pageNames, everyMatchNames],
  );

  /**
   * A click on a row's checkbox or its selectable surface.
   *
   * Shift extends from the anchor, Ctrl/Cmd toggles one, and a bare click on a
   * checkbox toggles too — the checkbox is a toggle by its own affordance, and
   * having it clear the rest of the selection would be a trap.
   */
  function selectRow(
    name: string,
    modifiers: { shift?: boolean; toggle?: boolean } = {},
  ) {
    setSelection((prev) => {
      if (modifiers.shift) return extendTo(prev, name, pageNames);
      if (modifiers.toggle) return toggleOne(prev, name);
      return selectOnly(name);
    });
  }

  function toggleSelect(name: string) {
    setSelection((prev) => toggleOne(prev, name));
  }

  function clearRowSelection() {
    setSelection(clearSelection());
  }

  function openMenuFor(name: string, el: HTMLElement) {
    const rect = el.closest('.df-row-menu')?.getBoundingClientRect();
    if (!rect) return;

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.bottom + 4;
    } else if (spaceAbove >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.top - MENU_ESTIMATED_HEIGHT - 4;
    } else {
      top = Math.max(
        MENU_SAFE_PADDING,
        viewportHeight - MENU_ESTIMATED_HEIGHT - MENU_SAFE_PADDING,
      );
    }

    const left = Math.max(MENU_SAFE_PADDING, rect.right - 160);

    setMenuPos({ name, top, left });
  }

  async function copyLocalPath(fileName: string) {
    const localPath = files.find((file) => file.name === fileName)?.localPath;
    if (!localPath) return;
    const copied = await copyToClipboard(localPath);
    if (copied) {
      setCopiedLocalPath(fileName);
      window.setTimeout(() => {
        setCopiedLocalPath((current) => (current === fileName ? null : current));
      }, 1600);
    }
  }

  function startRename(name: string) {
    setMenuPos(null);
    setPreview(name);
    const draft = currentDir === '' ? name : name.slice(currentDir.length + 1);
    setRenaming({ name, draft, saving: false });
  }

  async function commitRename(name: string, draft: string) {
    const nextBasename = draft.trim();
    if (!nextBasename) {
      setRenaming(null);
      return;
    }
    const nextName = currentDir === '' ? nextBasename : `${currentDir}/${nextBasename}`;
    if (nextName === name) {
      setRenaming(null);
      return;
    }
    setRenaming({ name, draft, saving: true });
    try {
      const renamed = await onRenameFile(name, nextName);
      if (!renamed) throw new Error('Rename failed');
      setPreview((curr) => (curr === name ? renamed.name : curr));
      // A renamed file keeps its place in the selection. Dropping it would be
      // the surprise: the row is still on screen, still ticked-looking to the
      // user, and would then be quietly missing from the next bulk action.
      setSelection((prev) => {
        if (!prev.ids.has(name)) return prev;
        const ids = new Set(prev.ids);
        ids.delete(name);
        ids.add(renamed.name);
        const base = new Set(prev.base);
        if (base.delete(name)) base.add(renamed.name);
        return {
          ids,
          anchor: prev.anchor === name ? renamed.name : prev.anchor,
          base,
          scope: prev.scope,
        };
      });
      setRenaming(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setRenaming({ name, draft, saving: false });
    }
  }

  /**
   * The selection, as bulk items, in the order the project lists them.
   *
   * Built from `files` rather than from the page so a selection made with
   * "select everything" survives navigating into a folder for long enough to be
   * reviewed — the preview would otherwise show only the rows that happen to be
   * on screen and quietly under-report what the button is about to do.
   */
  const selectedItems = useMemo<FileBulkItem[]>(() => {
    const byName = new Map(files.map((f) => [f.name, f] as const));
    return selectionIds(selection, everyMatchNames).flatMap((name) => {
      const file = byName.get(name);
      if (!file) return [];
      const slash = name.lastIndexOf('/');
      return [
        {
          id: name,
          label: slash === -1 ? name : name.slice(slash + 1),
          localPath: file.localPath,
        },
      ];
    });
  }, [files, selection, everyMatchNames]);

  /**
   * What each action refuses to touch, and why.
   *
   * Written as one function per action rather than a shared "is this file ok"
   * because the answers genuinely differ: an agent writing to a file makes it
   * unsafe to delete but perfectly safe to open, and a file with no local path
   * cannot have its path copied while remaining downloadable.
   */
  function planFor(action: BulkActionId): BulkPlan<FileBulkItem> {
    const selectedIds = selection.ids;
    if (action === 'delete') {
      return planBulkAction(selectedItems, selectedIds, (item) =>
        activePluginActionPaths.has(item.id) ? SKIP_BUSY : null,
      );
    }
    if (action === 'copyPaths') {
      return planBulkAction(selectedItems, selectedIds, (item) =>
        item.localPath ? null : SKIP_NO_LOCAL_PATH,
      );
    }
    if (action === 'open') {
      const allowed = new Set(
        selectedItems.slice(0, BULK_OPEN_TAB_LIMIT).map((item) => item.id),
      );
      return planBulkAction(selectedItems, selectedIds, (item) =>
        allowed.has(item.id) ? null : SKIP_OVER_TAB_LIMIT,
      );
    }
    return planBulkAction(selectedItems, selectedIds);
  }

  function describeBulkSkip(reason: BulkSkipReason): string {
    if (reason === SKIP_BUSY) return t('designFiles.bulkSkipBusy');
    if (reason === SKIP_NO_LOCAL_PATH) return t('designFiles.bulkSkipNoLocalPath');
    if (reason === SKIP_OVER_TAB_LIMIT) {
      return t('designFiles.bulkSkipOverTabLimit', { n: BULK_OPEN_TAB_LIMIT });
    }
    return reason;
  }

  function bulkTitleFor(action: BulkActionId, count: number): string {
    if (action === 'delete') return t('designFiles.bulkDeleteTitle', { n: count });
    if (action === 'download') return t('designFiles.bulkDownloadTitle', { n: count });
    if (action === 'copyPaths') return t('designFiles.bulkCopyPathsTitle', { n: count });
    return t('designFiles.bulkOpenTitle', { n: count });
  }

  function bulkConfirmLabelFor(action: BulkActionId, count: number): string {
    if (action === 'delete') return t('designFiles.deleteSelected', { n: count });
    if (action === 'download') return t('designFiles.downloadSelected', { n: count });
    if (action === 'copyPaths') return t('designFiles.bulkCopyPaths', { n: count });
    return t('designFiles.bulkOpen', { n: count });
  }

  /** Open the review step. Nothing runs until the user confirms it. */
  function reviewBulk(action: BulkActionId) {
    if (selection.ids.size === 0) return;
    bulkAbortRef.current = { aborted: false };
    setBulkProgress(null);
    setBulkReview({ action, plan: planFor(action) });
  }

  function closeBulkReview() {
    bulkAbortRef.current.aborted = true;
    setBulkReview(null);
    setBulkProgress(null);
  }

  function reportBulkOutcome(result: BulkRunResult<FileBulkItem>, plan: BulkPlan<FileBulkItem>) {
    const outcome = bulkOutcomeMessage(t, result, plan);
    setBulkNotice({
      id: (bulkNoticeIdRef.current += 1),
      message: outcome.message,
      tone: outcome.tone,
      role: outcome.role,
    });
  }

  async function runBulkReview() {
    const review = bulkReview;
    if (!review || !bulkPlanRunnable(review.plan)) return;
    const items = review.plan.willChange;

    if (review.action === 'delete') {
      if (deleting) return;
      setDeleting(true);
      setBulkProgress({ total: items.length, done: 0, succeeded: 0, failed: 0, current: items[0]?.label ?? null });
      const signal = bulkAbortRef.current;
      try {
        // The parent owns the loop because it also owns the tab and sketch
        // bookkeeping each deletion invalidates. It reports back per file so the
        // progress here is real rather than a spinner pretending to be one.
        const report = await onDeleteFiles(items.map((item) => item.id), {
          onProgress: (done, current) => {
            setBulkProgress((prev) =>
              prev ? { ...prev, done, current } : prev,
            );
          },
          signal,
        });
        const byId = new Map(items.map((item) => [item.id, item] as const));
        const pick = (names: readonly string[] | undefined) =>
          (names ?? []).flatMap((name) => {
            const item = byId.get(name);
            return item ? [item] : [];
          });
        const result: BulkRunResult<FileBulkItem> = report
          ? {
              succeeded: pick(report.deleted),
              failed: pick(report.failed).map((item) => ({ item, error: 'refused' })),
              notAttempted: pick(report.notAttempted),
              cancelled: report.notAttempted.length > 0,
            }
          : // A parent that reports nothing back is not evidence of success, so
            // the panel says what it actually knows: the request was sent.
            { succeeded: items, failed: [], notAttempted: [], cancelled: false };
        reportBulkOutcome(result, review.plan);
      } finally {
        setDeleting(false);
        setBulkReview(null);
        setBulkProgress(null);
      }
      // The selection is deliberately left alone: an all-fail run should leave
      // the user's picks intact to retry, and the prune effect drops whatever
      // actually went once `files` refreshes.
      return;
    }

    if (review.action === 'download') {
      setBulkReview(null);
      setBulkProgress(null);
      await handleBatchDownload(items.map((item) => item.id));
      return;
    }

    if (review.action === 'copyPaths') {
      const paths = items.flatMap((item) => (item.localPath ? [item.localPath] : []));
      const copied = await copyToClipboard(paths.join('\n'));
      setBulkReview(null);
      reportBulkOutcome(
        copied
          ? { succeeded: items, failed: [], notAttempted: [], cancelled: false }
          : {
              succeeded: [],
              failed: items.map((item) => ({ item, error: 'clipboard' })),
              notAttempted: [],
              cancelled: false,
            },
        review.plan,
      );
      return;
    }

    for (const item of items) onOpenFile(item.id);
    setBulkReview(null);
    reportBulkOutcome(
      { succeeded: items, failed: [], notAttempted: [], cancelled: false },
      review.plan,
    );
  }

  const bulkActions: BulkAction[] = [
    {
      id: 'open',
      label: t('designFiles.openInTab'),
      icon: 'external-link',
      onRun: () => reviewBulk('open'),
    },
    {
      id: 'download',
      label: t('designFiles.download'),
      icon: 'download',
      onRun: () => {
        trackFileManagerClick(analytics.track, {
          page_name: 'file_manager',
          area: 'file_manager',
          element: 'download_as_zip',
        });
        reviewBulk('download');
      },
    },
    {
      id: 'copyPaths',
      label: t('designFiles.copyLocalPath'),
      icon: 'copy',
      onRun: () => reviewBulk('copyPaths'),
    },
    {
      id: 'delete',
      label: t('designFiles.delete'),
      icon: 'trash',
      danger: true,
      disabled: deleting,
      testId: 'design-files-batch-delete',
      onRun: () => reviewBulk('delete'),
    },
  ];

  function downloadOne(name: string) {
    const a = document.createElement('a');
    a.href = projectFileUrl(projectId, name);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Everything one file row can do — the single list the context menu renders
   * AND the key handler dispatches from.
   *
   * That sharing is the whole point. An item carries `shortcutId` only when the
   * binding genuinely fires here, `rowShortcutHandlers` installs exactly those
   * bindings, and `ContextMenu` draws exactly those keycaps. There is no second
   * place where a key could be advertised without being wired, or wired without
   * being advertised.
   *
   * "Open in tab" carries no shortcut on purpose: the row's name button opens on
   * a double Enter, not a single one, and printing "Enter" beside it would teach
   * a key that does something else.
   */
  function rowActions(name: string): ContextMenuItem[] {
    const file = files.find((candidate) => candidate.name === name);
    return [
      {
        id: 'open',
        label: t('designFiles.openInTab'),
        icon: 'external-link',
        onSelect: () => onOpenFile(name),
      },
      {
        id: 'rename',
        label: t('common.rename'),
        icon: 'pencil',
        shortcutId: 'designFiles.rename',
        onSelect: () => startRename(name),
      },
      {
        id: 'copyPath',
        label:
          copiedLocalPath === name
            ? t('designFiles.copiedLocalPath')
            : t('designFiles.copyLocalPath'),
        icon: 'copy',
        disabled: !file?.localPath,
        onSelect: () => {
          void copyLocalPath(name);
        },
      },
      {
        id: 'download',
        label: t('designFiles.download'),
        icon: 'download',
        onSelect: () => downloadOne(name),
      },
      {
        id: 'delete',
        label: t('designFiles.delete'),
        icon: 'trash',
        danger: true,
        separatorBefore: true,
        shortcutId: 'designFiles.delete',
        testId: `design-file-delete-${name}`,
        onSelect: () => onDeleteFile(name),
      },
    ];
  }

  /** The bindings above, as handlers. Derived, never written out a second time. */
  function rowShortcutHandlers(name: string): ShortcutHandler[] {
    return rowActions(name).flatMap((item) =>
      item.shortcutId && !item.disabled ? [{ id: item.shortcutId, run: item.onSelect }] : [],
    );
  }

  function renderFileRow(f: ProjectFile, category: FileCategory) {
    const active = preview === f.name;
    const rowSelected = isSelected(selection, f.name);
    const isHovered = hover === f.name;
    const renameState = renaming?.name === f.name ? renaming : null;
    return (
      <div
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        data-row-id={f.name}
        className={`df-row df-file-row ${active ? 'active' : ''} ${rowSelected ? 'selected' : ''}`}
        onMouseEnter={() => setHover(f.name)}
        onMouseLeave={() => setHover((c) => (c === f.name ? null : c))}
        // Right-click opens the same menu as the ⋯ handle, at the pointer. It
        // is the gesture people reach for first on a file row, and until now it
        // fell through to the browser's own menu.
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isSelected(selection, f.name)) selectRow(f.name);
          setMenuPos({ name: f.name, top: e.clientY, left: e.clientX });
        }}
        // Row-scoped shortcuts, dispatched from the same table the context menu
        // draws its keycaps from. The rename field is exempt: F2 and Delete
        // belong to the text while it is being edited.
        onKeyDown={(e) => {
          if (isEditableTarget(e.target)) return;
          const fired = runShortcut(rowShortcutHandlers(f.name), e);
          if (fired) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <span
          className="df-row-check"
          onClick={(e) => {
            e.stopPropagation();
            selectRow(f.name, { shift: e.shiftKey, toggle: !e.shiftKey });
          }}
          role="checkbox"
          aria-checked={rowSelected}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (e.shiftKey) selectRow(f.name, { shift: true });
              else toggleSelect(f.name);
            }
          }}
        >
          <span className="df-row-check-box" aria-hidden>
            {rowSelected ? <Icon name="check" size={12} /> : null}
          </span>
        </span>
        <span
          className="df-row-icon df-row-openable"
          data-kind={category}
          aria-hidden
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          {categoryGlyph(category)}
        </span>
        <div className="df-row-name-wrap">
          {renameState ? (
            <input
              autoFocus
              className="df-rename-input"
              value={renameState.draft}
              disabled={renameState.saving}
              onChange={(e) => setRenaming({ ...renameState, draft: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                if (e.currentTarget.dataset.skipRenameCommit === '1') return;
                void commitRename(f.name, renameState.draft);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.dataset.skipRenameCommit = '1';
                  void commitRename(f.name, renameState.draft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget.dataset.skipRenameCommit = '1';
                  setRenaming(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="df-row-name-btn"
              onClick={() => setPreview(f.name)}
              onDoubleClick={() => onOpenFile(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const now = Date.now();
                  const last = lastKeyPress.current.get(f.name) ?? 0;
                  if (now - last < 300) {
                    lastKeyPress.current.delete(f.name);
                    onOpenFile(f.name);
                  } else {
                    lastKeyPress.current.set(f.name, now);
                    setPreview(f.name);
                  }
                }
              }}
            >
              <span className="df-row-name-wrap">
                <span
                  className="df-row-name"
                  title={currentDir === '' ? f.name : f.name.slice(currentDir.length + 1)}
                >
                  {currentDir === '' ? f.name : f.name.slice(currentDir.length + 1)}
                </span>
                <span className="df-row-sub">{categoryLabel(category, t)}</span>
              </span>
            </button>
          )}
        </div>
        <span
          className="df-row-size df-row-openable"
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          {humanBytes(f.size)}
        </span>
        <span
          className="df-row-time df-row-openable"
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          {relativeTime(f.mtime, t)}
        </span>
        <span
          data-testid={`design-file-menu-${f.name}`}
          className="df-row-menu"
          style={isHovered || active ? { opacity: 1 } : undefined}
          role="button"
          tabIndex={0}
          aria-label={t('designFiles.rowMenu')}
          onClick={(e) => {
            e.stopPropagation();
            openMenuFor(f.name, e.target as HTMLElement);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              openMenuFor(f.name, e.currentTarget as HTMLElement);
            }
          }}
        >
          ⋯
        </span>
      </div>
    );
  }

  function renderDirRow(dirName: string) {
    const fullPath = currentDir === '' ? dirName : `${currentDir}/${dirName}`;
    const prefix = `${fullPath}/`;
    const count = files.filter((f) => f.name.startsWith(prefix)).length;
    return (
      <div key={`dir:${fullPath}`} className="df-row df-dir-row" onClick={() => setCurrentDir(fullPath)}>
        <span className="df-row-check" aria-hidden />
        <span className="df-row-icon" data-kind="folder" aria-hidden>
          <Icon name="folder" size={14} />
        </span>
        <div className="df-row-name-wrap">
          <button type="button" className="df-row-name-btn" onClick={() => setCurrentDir(fullPath)}>
            <span className="df-row-name-wrap">
              <span className="df-row-name" title={dirName}>{dirName}</span>
              <span className="df-row-sub">{t('designFiles.folderCount', { n: count })}</span>
            </span>
          </button>
        </div>
        <span className="df-row-size" />
        <span className="df-row-time" />
        <span className="df-row-menu df-row-menu-placeholder" aria-hidden />
      </div>
    );
  }

  async function handleBatchDownload(fileList: string[]) {
    if (fileList.length === 0) return;
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/archive/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileList }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `request failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const header = resp.headers.get('content-disposition') || '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
      let filename = 'project.zip';
      if (star && star[1]) {
        try {
          filename = decodeURIComponent(star[1]);
        } catch {
          filename = star[1];
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.warn('[batchDownload] failed:', err);
    }
  }

  async function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    setDropReadError(null);
    try {
      const dropped = await filesFromDataTransfer(ev.dataTransfer);
      if (dropped.length > 0) onUploadFiles(dropped);
    } catch (error) {
      if (!isFileSystemReadError(error)) throw error;
      setDropReadError(FILE_SYSTEM_READ_ERROR_MESSAGE);
    }
  }

  async function handlePluginFolderAgentAction(
    relativePath: string,
    action: PluginFolderAgentAction,
  ) {
    if (!onPluginFolderAgentAction || installingFolder || sharingFolder) return;
    setInstallNotice(null);
    if (action === 'install') {
      setInstallingFolder(relativePath);
    } else {
      setSharingFolder(`${action}:${relativePath}`);
    }
    try {
      const outcome = await onPluginFolderAgentAction(relativePath, action);
      const url = outcome && typeof outcome === 'object' && typeof outcome.url === 'string'
        ? outcome.url
        : '';
      const message = outcome && typeof outcome === 'object' && typeof outcome.message === 'string'
        ? outcome.message
        : '';
      if (message || url) setInstallNotice(buildActionNotice(message || url, url));
    } catch (err) {
      setInstallNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setInstallingFolder(null);
      setSharingFolder(null);
    }
  }

  const fileActions = (
    <div className="df-actions">
      {LIBRARY_UI_VISIBLE && onSelectFromLibrary ? (
        <button
          type="button"
          data-testid="design-files-library-trigger"
          onClick={onSelectFromLibrary}
          title={t('designFiles.library.title')}
        >
          <Icon name="layers-filled" size={13} />
          <span>{t('designFiles.library.label')}</span>
        </button>
      ) : null}
      <button type="button" onClick={onNewSketch} title={t('designFiles.newSketch')}>
        <Icon name="pencil" size={13} />
        <span>{t('designFiles.newSketch')}</span>
      </button>
      <button type="button" onClick={onPaste} title={t('designFiles.paste.title')}>
        <Icon name="file" size={13} />
        <span>{t('designFiles.paste.label')}</span>
      </button>
      <button
        type="button"
        data-testid="design-files-upload-trigger"
        onClick={onUpload}
        title={t('designFiles.upload.title')}
      >
        <Icon name="upload" size={13} />
        <span>{t('designFiles.upload.label')}</span>
      </button>
      {onCreateDesignSystemFromProject || onDuplicateProject ? (
        <div className="df-project-menu-anchor" ref={projectMenuRef}>
          <button
            type="button"
            className="df-project-menu-trigger"
            aria-label={t('designFiles.projectMenu')}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            title={t('designFiles.projectMenu')}
            onClick={() => setProjectMenuOpen((current) => !current)}
          >
            <Icon name="more-horizontal" size={14} />
          </button>
          {projectMenuOpen ? (
            <div className="df-project-menu" role="menu">
              {onCreateDesignSystemFromProject ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={createDesignSystemFromProjectBusy}
                  onClick={() => {
                    trackFileManagerClick(analytics.track, {
                      page_name: 'file_manager',
                      area: 'file_manager',
                      element: 'create_design_system_from_project',
                    });
                    setProjectMenuOpen(false);
                    onCreateDesignSystemFromProject();
                  }}
                >
                  <Icon name={createDesignSystemFromProjectBusy ? 'spinner' : 'blocks'} size={13} />
                  <span>{t('designFiles.createDesignSystemFromProject')}</span>
                </button>
              ) : null}
              {onDuplicateProject ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={duplicateProjectBusy}
                  onClick={() => {
                    trackFileManagerClick(analytics.track, {
                      page_name: 'file_manager',
                      area: 'file_manager',
                      element: 'duplicate_project',
                    });
                    setProjectMenuOpen(false);
                    onDuplicateProject();
                  }}
                >
                  <Icon name={duplicateProjectBusy ? 'spinner' : 'copy'} size={13} />
                  <span>{t('designFiles.duplicateProject')}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const breadcrumbs = (
    <nav className="df-breadcrumbs" aria-label={t('designFiles.crumbs')}>
      {currentDir === '' ? (
        <span className="df-breadcrumb-current">
          {rootDirName ?? t('designFiles.crumbs')}
        </span>
      ) : (
        <button
          type="button"
          className="df-breadcrumb-btn"
          onClick={() => setCurrentDir('')}
        >
          {rootDirName ?? t('designFiles.crumbs')}
        </button>
      )}
      {currentDir.split('/').filter(Boolean).map((segment, idx, parts) => {
        const path = parts.slice(0, idx + 1).join('/');
        const isLast = idx === parts.length - 1;
        return (
          <span key={path} className="df-breadcrumb-segment">
            <span className="df-breadcrumb-sep" aria-hidden>/</span>
            {isLast ? (
              <span className="df-breadcrumb-current">{segment}</span>
            ) : (
              <button
                type="button"
                className="df-breadcrumb-btn"
                onClick={() => setCurrentDir(path)}
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );

  const visibleUploadError = uploadError ?? dropReadError;
  const hasSelection = selection.ids.size > 0;

  return (
    <div
      className={`df-panel ${previewFile ? '' : 'no-preview'} ${hasSelection ? 'has-selection' : ''}`}
      // Panel-scoped rather than window-scoped: Ctrl+A must still mean
      // select-all-text everywhere else in the app, and only means
      // select-all-files while focus is somewhere inside this panel.
      onKeyDown={(event) => {
        if (isEditableTarget(event.target)) return;
        const focused =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>('[data-row-id]')?.dataset.rowId ?? null
            : null;
        const result = selectionKeyDown(event, {
          state: selection,
          page: pageNames,
          everyMatch: everyMatchNames,
          focusedId: focused,
        });
        if (!result) return;
        event.preventDefault();
        setSelection(result.next);
        if (result.focusId) {
          // Matched by walking the rows rather than by building a selector: a
          // file name is user-supplied and may contain quotes or brackets, and
          // an unescaped one would silently match nothing.
          const rows = event.currentTarget.querySelectorAll<HTMLElement>('[data-row-id]');
          for (const row of Array.from(rows)) {
            if (row.dataset.rowId !== result.focusId) continue;
            row.querySelector<HTMLElement>('.df-row-check')?.focus();
            break;
          }
        }
      }}
    >
      {reloading ? (
        <div className="df-reloading-overlay" data-testid="design-files-reloading">
          <span className="loading-spinner">
            <Icon name="spinner" size={16} />
            <span className="loading-spinner-label">{t('common.loading')}</span>
          </span>
        </div>
      ) : null}
      <div className="df-main">
        <div className="df-topbar">
          <div className="df-topbar-left">{breadcrumbs}</div>
          <div className="df-topbar-right">{fileActions}</div>
        </div>
        <div
          className="df-body"
          onDragEnter={(ev) => {
            ev.preventDefault();
            dragDepthRef.current += 1;
            setDraggingFiles(true);
          }}
          onDragOver={(ev) => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(ev) => {
            if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
              dragDepthRef.current = 0;
              setDraggingFiles(false);
              return;
            }
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setDraggingFiles(false);
          }}
          onDrop={handleDrop}
        >
          {visibleUploadError && !preview ? (
            <div className="df-upload-banner" data-testid="upload-error-banner">
              <span>{visibleUploadError}</span>
              {onClearUploadError || dropReadError ? (
                <button
                  type="button"
                  data-testid="upload-error-dismiss"
                  onClick={() => {
                    setDropReadError(null);
                    onClearUploadError?.();
                  }}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
          {hasSelection ? (
            <BulkActionBar
              summary={selectionSummary}
              actions={bulkActions}
              onSelectPage={() => setSelection(selectAllOf(pageNames, 'page'))}
              onSelectEveryMatch={() => setSelection(selectAllOf(everyMatchNames, 'match'))}
              onInvert={() =>
                setSelection((prev) =>
                  prev.scope === 'match'
                    ? invertWithin(prev, everyMatchNames, 'match')
                    : invertWithin(prev, pageNames, 'page'),
                )
              }
              onClear={clearRowSelection}
              testId="design-files-batch-bar"
            />
          ) : null}
          {files.length === 0 && liveArtifacts.length === 0 && (folders?.length ?? 0) === 0 ? (
            <div className="df-empty" data-testid="design-files-empty">
              <div className="df-empty-pill">
                <span className="df-empty-title">
                  {t('designFiles.empty')}
                </span>
                <div className="df-empty-actions">
                  <button
                    type="button"
                    className="df-empty-cta df-empty-cta-primary"
                    data-testid="design-files-empty-new-sketch"
                    onClick={onNewSketch}
                    title={t('designFiles.newSketch')}
                  >
                    <Icon name="pencil" size={13} />
                    <span>{t('designFiles.newSketch')}</span>
                  </button>
                  {onOpenBrowser ? (
                    <button
                      type="button"
                      className="df-empty-cta df-empty-cta-secondary"
                      data-testid="design-files-empty-open-browser"
                      onClick={onOpenBrowser}
                      aria-label={t('workspace.newBrowserDescription')}
                      title={t('workspace.newBrowserDescription')}
                    >
                      <Icon name="globe" size={13} />
                      <span>{t('workspace.newBrowser')}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="df-empty-cta df-empty-cta-tertiary"
                    data-testid="design-files-empty-create-document"
                    onClick={onPaste}
                    title={t('designFiles.paste.title')}
                  >
                    <Icon name="file" size={13} />
                    <span>{t('designFiles.paste.label')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {liveArtifacts.length > 0 ? (
                <div className="df-section" key="live-artifacts">
                  <div className="df-section-label">{t('designFiles.sectionLiveArtifacts')}</div>
                  {liveArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      type="button"
                      data-testid={`design-file-row-${artifact.tabId}`}
                      className="df-row df-row-live-artifact"
                      onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
                      onClick={() => onOpenLiveArtifact(artifact.tabId)}
                    >
                      <span className="df-row-icon" data-kind="live-artifact" aria-hidden>
                        ◉
                      </span>
                      <span className="df-row-name-wrap">
                        <span className="df-row-name" title={artifact.title}>
                          {artifact.title}
                        </span>
                        <span className="df-row-sub">
                          <span>{t('designFiles.kindLiveArtifact')}</span>
                          <LiveArtifactBadges
                            compact
                            status={artifact.status}
                            refreshStatus={artifact.refreshStatus}
                          />
                        </span>
                      </span>
                      <span className="df-row-time">
                        {relativeTime(Date.parse(artifact.updatedAt) || Date.now(), t)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {pluginFolders.length > 0 ? (
                <div className="df-section" key="plugin-folders">
                  <div className="df-section-label">
                    Plugin folders
                    <span className="df-section-count">{pluginFolders.length}</span>
                  </div>
                  {installNotice ? (
                    <div className="df-inline-notice" role="status">
                      <ActionNoticeView notice={installNotice} />
                    </div>
                  ) : null}
                  {pluginFolders.filter((folder) => !hiddenPluginActionPaths.has(folder.path)).map((folder) => {
                    const actionBusy = activePluginActionPaths.has(folder.path);
                    return (
                    <div
                      key={folder.path}
                      className="df-row df-row-plugin-folder"
                      data-testid={`design-plugin-folder-${folder.path}`}
                    >
                      <button
                        type="button"
                        className="df-row-folder-main"
                        onClick={() => setPreview(folder.manifestPath)}
                      >
                        <span className="df-row-icon" data-kind="folder" aria-hidden>
                          DIR
                        </span>
                        <span className="df-row-name-wrap">
                          <span className="df-row-name">{folder.path}</span>
                          <span className="df-row-sub">
                            {folder.fileCount} files · ready to add to My plugins
                          </span>
                        </span>
                      </button>
                      <span className="df-row-time">{relativeTime(folder.updatedAt, t)}</span>
                      {onPluginFolderAgentAction ? (
                        <div className="df-plugin-actions">
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-install-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'install')
                            }
                          >
                            {installingFolder === folder.path ? 'Sending…' : 'Add to My plugins'}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-publish-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'publish')
                            }
                          >
                            {sharingFolder === `publish:${folder.path}` ? 'Sending…' : 'Publish repo'}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-contribute-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'contribute')
                            }
                          >
                            {sharingFolder === `contribute:${folder.path}` ? 'Sending…' : 'Open Design PR'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )})}
                </div>
              ) : null}
              {dirsAtCurrentDir.length > 0 ? (
                <div className="df-section" key="folders">
                  <div className="df-section-label">
                    {t('designFiles.sectionFolders')}
                    <span className="df-section-count">{dirsAtCurrentDir.length}</span>
                  </div>
                  {dirsAtCurrentDir.map((d) => renderDirRow(d))}
                </div>
              ) : null}
              {sections.map(([category, sectionFiles]) => (
                <div className="df-section" key={`cat:${category}`}>
                  <div className="df-section-label">
                    {sectionLabel(category, t)}
                    <span className="df-section-count">{sectionFiles.length}</span>
                  </div>
                  {sectionFiles.map((f) => renderFileRow(f, category))}
                </div>
              ))}
            </>
          )}
          <div className="df-footer-info">
            {running ? (
              <RotatingTip auxiliary />
            ) : (
              <div className="df-drop-hint">
                <span className="df-drop-hint-label">
                  <Icon name="upload" size={12} />
                  {t('designFiles.dropLabel')}
                </span>
                <span className="df-drop-hint-desc">{t('designFiles.dropDesc')}</span>
              </div>
            )}
          </div>
        </div>
        {draggingFiles ? (
          <div className="df-drop-overlay" aria-hidden>
            <div className="df-drop-overlay-card">
              <Icon name="upload" size={22} />
              <span className="label">{t('designFiles.dropTitle')}</span>
              <span className="desc">{t('designFiles.dropDesc')}</span>
            </div>
          </div>
        ) : null}
      </div>
      {preview && previewFile ? (
        // Key on the file name so React unmounts the previous DfPreview
        // (and its iframe / image element) when the user clicks a
        // different file. Without this, React diffing reuses the same
        // iframe DOM node and the browser keeps showing the first
        // file's contents — only the `src` prop changes but the iframe
        // never actually navigates.
        <DfPreview
          key={previewFile.name}
          projectId={projectId}
          file={previewFile}
          onOpen={() => onOpenFile(previewFile.name)}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {menuPos ? (
        <ContextMenu
          items={rowActions(menuPos.name)}
          x={menuPos.left}
          y={menuPos.top}
          ariaLabel={menuPos.name}
          onClose={() => setMenuPos(null)}
          testId="design-file-menu-popover"
        />
      ) : null}
      {bulkReview ? (
        <BulkPreviewDialog
          plan={bulkReview.plan}
          titleId={bulkTitleId}
          title={bulkTitleFor(bulkReview.action, bulkPlanCounts(bulkReview.plan).willChange)}
          confirmLabel={bulkConfirmLabelFor(
            bulkReview.action,
            bulkPlanCounts(bulkReview.plan).willChange,
          )}
          danger={bulkReview.action === 'delete'}
          describeSkip={describeBulkSkip}
          progress={bulkProgress}
          onCancel={closeBulkReview}
          onStop={() => {
            // Stops between files. Anything already in flight finishes, and the
            // report says how many were never attempted rather than counting
            // them as done.
            bulkAbortRef.current.aborted = true;
          }}
          onConfirm={() => void runBulkReview()}
          testId="design-files-bulk-review"
        />
      ) : null}
      {bulkNotice ? (
        <Toast
          key={bulkNotice.id}
          message={bulkNotice.message}
          tone={bulkNotice.tone}
          role={bulkNotice.role}
          onDismiss={() => setBulkNotice(null)}
        />
      ) : null}
    </div>
  );
}

function DfPreview({
  projectId,
  file,
  onOpen,
  onClose,
}: {
  projectId: string;
  file: ProjectFile;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const url = projectFileUrl(projectId, file.name);
  const rendersSketchJson = isRenderableSketchJson(file);
  const openPreviewLabel = `${t('designFiles.previewOpen')} ${file.name}`;
  const thumbCanOpen = file.kind !== 'audio' && file.kind !== 'video';
  return (
    <aside className="df-preview">
      <button
        type="button"
        className="df-preview-close"
        onClick={onClose}
        title={t('designFiles.previewClose')}
        aria-label={t('designFiles.previewClose')}
      >
        <Icon name="close" size={13} />
      </button>
      <div className={`df-preview-thumb${thumbCanOpen ? ' is-openable' : ''}`}>
        {rendersSketchJson ? (
          <SketchPreview projectId={projectId} file={file} />
        ) : file.kind === 'image' || file.kind === 'sketch' ? (
          <img
            src={`${url}?v=${Math.round(file.mtime)}`}
            alt={file.name}
            loading="lazy"
            decoding="async"
          />
        ) : file.kind === 'html' ? (
          <HtmlPreviewThumbnail projectId={projectId} file={file} />
        ) : file.kind === 'video' ? (
          <video
            src={`${url}?v=${Math.round(file.mtime)}`}
            controls
            playsInline
            preload="metadata"
          />
        ) : file.kind === 'audio' ? (
          <audio src={`${url}?v=${Math.round(file.mtime)}`} controls preload="metadata" />
        ) : (
          <FilePreviewPlaceholder file={file} />
        )}
        {thumbCanOpen ? (
          <button
            type="button"
            className="df-preview-thumb-open"
            onClick={onOpen}
            title={openPreviewLabel}
            aria-label={openPreviewLabel}
          />
        ) : null}
      </div>
      <div className="df-preview-meta" data-testid="design-file-preview">
        <button type="button" className="df-preview-open-cta" onClick={onOpen}>
          <Icon name="eye" size={14} />
          <span>{t('designFiles.previewOpen')}</span>
        </button>
        <div className="df-preview-name">{file.name}</div>
        <div className="df-preview-kind">{categoryLabel(fileCategory(file), t)}</div>
        <div className="df-preview-stats">
          {t('designFiles.modifiedExt', {
            time: relativeTime(file.mtime, t),
            size: humanBytes(file.size),
            ext: fileExtensionLabel(file.name),
          })}
        </div>
        <a className="df-preview-download" href={url} download={file.name}>
          <Icon name="download" size={13} />
          <span>{t('designFiles.download')}</span>
        </a>
      </div>
    </aside>
  );
}

function HtmlPreviewThumbnail({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const tooLargeForThumbnail = file.size > HTML_THUMBNAIL_INLINE_MAX_BYTES;
  const url = projectFileUrl(projectId, file.name);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  useEffect(() => {
    setSrcDoc(null);
    if (tooLargeForThumbnail) return;
    const controller = new AbortController();
    let cancelled = false;
    void fetch(`${url}?v=${Math.round(file.mtime)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (cancelled || html === null) return;
        const nextSrcDoc = buildSrcdoc(html, { baseHref: projectRawUrl(projectId, baseDirForFile(file.name)) });
        if (!cancelled) setSrcDoc(nextSrcDoc);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) setSrcDoc(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [file.mtime, file.name, projectId, tooLargeForThumbnail, url]);

  if (tooLargeForThumbnail || srcDoc === null) {
    return <FilePreviewPlaceholder file={file} title={t('designFiles.previewOpen')} />;
  }

  return (
    <iframe
      title={file.name}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-downloads"
      loading="lazy"
    />
  );
}

function FilePreviewPlaceholder({
  file,
  title,
}: {
  file: ProjectFile;
  title?: string;
}) {
  return (
    <div className="df-preview-placeholder" title={title}>
      {categoryGlyph(fileCategory(file))}
    </div>
  );
}

function baseDirForFile(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index + 1) : '';
}

function fileExtensionLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toUpperCase();
}

// Plural section header for a category. Reuses existing plural labels where a
// dedicated one exists; otherwise falls back to the singular type label so
// each category gets a distinct, readable header.
function sectionLabel(category: FileCategory, t: TranslateFn): string {
  switch (category) {
    case 'html':
      return t('designFiles.sectionPages');
    case 'stylesheet':
      return t('designFiles.sectionStylesheets');
    case 'code':
      return t('designFiles.sectionScripts');
    case 'document':
      return t('designFiles.sectionDocuments');
    case 'image':
      return t('designFiles.sectionImages');
    case 'sketch':
      return t('designFiles.sectionSketches');
    case 'binary':
      return t('designFiles.sectionOther');
    default:
      return categoryLabel(category, t);
  }
}

// Singular row subtitle for a category.
function categoryLabel(category: FileCategory, t: TranslateFn): string {
  if (category === 'stylesheet') return t('designFiles.kindStylesheet');
  return kindLabel(category, t);
}

function categoryGlyph(category: FileCategory): string {
  if (category === 'stylesheet') return '#';
  return kindGlyph(category);
}

function filesFromClipboardData(clipboardData: DataTransfer | null): File[] {
  const files = Array.from(clipboardData?.files ?? []);
  if (files.length > 0) return files.map(normalizePastedFile);
  const items = Array.from(clipboardData?.items ?? []);
  return items
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [normalizePastedFile(file)] : [];
    });
}

function normalizePastedFile(file: File): File {
  if (file.name.trim()) return file;
  const extension = extensionForMimeType(file.type);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return new File([file], `pasted-${stamp}${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/svg+xml') return '.svg';
  if (mimeType === 'text/html') return '.html';
  if (mimeType === 'text/plain') return '.txt';
  return '';
}

function shouldIgnoreClipboardFilePaste(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[contenteditable="true"]')) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const fallbackFiles = Array.from(dataTransfer.files ?? []);
  if (items.length === 0) return fallbackFiles;

  const results = await Promise.allSettled(items.map(filesFromDataTransferItem));
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) {
    if (fallbackFiles.length > 0) return fallbackFiles;
    throw rejected.reason;
  }
  const files = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  return files.length > 0 ? files : fallbackFiles;
}

async function filesFromDataTransferItem(item: DataTransferItem): Promise<File[]> {
  const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.();
  if (!entry) {
    const file = item.kind === 'file' ? item.getAsFile() : null;
    return file ? [file] : [];
  }
  return filesFromFileSystemEntry(entry);
}

async function filesFromFileSystemEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await fileFromEntry(entry as FileSystemFileEntryWithFile)];
  if (!entry.isDirectory) return [];

  const reader = (entry as FileSystemEntryWithReader).createReader?.();
  if (!reader) return [];

  const files: File[] = [];
  for (;;) {
    const entries = await readEntryBatch(reader);
    if (entries.length === 0) break;
    const nested = await Promise.all(entries.map(filesFromFileSystemEntry));
    files.push(...nested.flat());
  }
  return files;
}

function fileFromEntry(entry: FileSystemFileEntryWithFile): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, (error) => {
      reject(createFileSystemReadError('Could not read dropped file', error));
    });
  });
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, (error) => {
      reject(createFileSystemReadError('Could not read dropped folder', error));
    });
  });
}

function kindGlyph(kind: ProjectFileKind): string {
  if (kind === 'html') return '⟨⟩';
  if (kind === 'image') return '▣';
  if (kind === 'sketch') return '✎';
  if (kind === 'text') return '¶';
  if (kind === 'code') return '{}';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'document') return 'DOC';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'spreadsheet') return 'XLS';
  return '·';
}

function kindLabel(kind: ProjectFileKind, t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'text') return t('designFiles.kindText');
  if (kind === 'code') return t('designFiles.kindCode');
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

function relativeTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  if (diff < 30 * day)
    return t('designFiles.weeksAgo', { n: Math.floor(diff / (7 * day)) });
  return new Date(ts).toLocaleDateString();
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
