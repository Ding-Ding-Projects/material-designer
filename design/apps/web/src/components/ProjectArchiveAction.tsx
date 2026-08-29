import { useRef, useState } from 'react';
import type { ProjectExportTarget, WorkspaceCollabContext } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { useT } from '../i18n';
import {
  exportProjectArchive,
  type ProjectArchiveReceipt,
} from '../runtime/exports';
import { Icon } from './Icon';
import { HandoffButton } from './HandoffButton';

export interface ProjectArchiveActionProps {
  projectId: string;
  projectKind: TrackingProjectKind;
  projectName: string;
  projectDir?: string | null;
  workspaceContext?: WorkspaceCollabContext | null;
}

/**
 * Project-scoped complete-tree ZIP action. It intentionally lives outside the
 * active-file viewer, so an empty Design Files tab, a project with no selected
 * file, and a read-only share still have the same handoff affordance.
 */
export function ProjectArchiveAction({
  projectId,
  projectKind,
  projectName,
  projectDir,
  workspaceContext,
}: ProjectArchiveActionProps) {
  const t = useT();
  const [busyTarget, setBusyTarget] = useState<ProjectExportTarget | null>(null);
  const [progress, setProgress] = useState<{ received: number; total: number | null; phase: string } | null>(null);
  const [receipt, setReceipt] = useState<ProjectArchiveReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  async function startExport(target: ProjectExportTarget): Promise<void> {
    if (busyTarget) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusyTarget(target);
    setProgress({ received: 0, total: null, phase: t('fileViewer.exportingProgress') });
    setReceipt(null);
    setError(null);
    try {
      const result = await exportProjectArchive({
        projectId,
        target,
        fallbackTitle: projectName,
        workspaceContext,
        signal: controller.signal,
        onProgress: ({ bytesReceived, totalBytes, phase }) => {
          setProgress({ received: bytesReceived, total: totalBytes, phase });
        },
      });
      if (result.ok) {
        setReceipt(result.receipt);
      } else if (result.cancelled) {
        setError(`${t('fileViewer.exportFailed')} (${result.bytesReceived} bytes)`);
      } else {
        setError(result.error);
      }
    } finally {
      controllerRef.current = null;
      setBusyTarget(null);
    }
  }

  function cancelExport(): void {
    controllerRef.current?.abort();
  }

  const progressLabel = progress
    ? progress.total
      ? `${progress.phase} ${Math.min(100, Math.round((progress.received / progress.total) * 100))}% · ${progress.received} bytes`
      : `${progress.phase} · ${progress.received} bytes`
    : t('fileViewer.exportingProgress');

  return (
    <div className="project-export-action" data-testid="project-export-action" aria-busy={busyTarget !== null}>
      <button
        type="button"
        className="ws-tab-action share project-export-action__trigger"
        onClick={() => void startExport('project')}
        disabled={busyTarget !== null || !projectId}
        aria-label={t('fileViewer.exportWebsiteHandoff')}
        title={t('fileViewer.exportWebsiteHandoff')}
      >
        <Icon name={busyTarget === 'project' ? 'spinner' : 'download'} size={15} />
        <span>{busyTarget === 'project' ? progressLabel : t('fileViewer.exportWebsiteHandoff')}</span>
      </button>
      <button
        type="button"
        className="ws-tab-action project-export-action__scaffold"
        onClick={() => void startExport('desktop-scaffold')}
        disabled={busyTarget !== null || !projectId}
        aria-label={t('fileViewer.exportDesktopScaffold')}
        title={t('fileViewer.exportDesktopScaffold')}
      >
        <Icon name={busyTarget === 'desktop-scaffold' ? 'spinner' : 'folder'} size={15} />
        <span>{busyTarget === 'desktop-scaffold' ? progressLabel : t('fileViewer.exportDesktopScaffold')}</span>
      </button>
      {busyTarget ? (
        <progress
          className="project-export-action__progress"
          max={progress?.total ?? undefined}
          value={progress?.received ?? 0}
          aria-label={progressLabel}
        />
      ) : null}
      {busyTarget ? (
        <button
          type="button"
          className="ws-tab-action project-export-action__cancel"
          onClick={cancelExport}
          aria-label={t('common.cancel')}
        >
          {t('common.cancel')}
        </button>
      ) : null}
      {receipt ? (
        <div className="project-export-action__result" role="status" aria-live="polite">
          <span className="project-export-action__receipt">
            {t('fileViewer.exportDone')} · {receipt.filename}
          </span>
          <HandoffButton
            projectId={projectId}
            projectKind={projectKind}
            projectName={projectName}
            projectDir={projectDir}
            targetPath={receipt.editorPath}
            embedded
          />
        </div>
      ) : null}
      {error ? (
        <div className="project-export-action__error" role="alert">
          {t('fileViewer.exportFailed')} {error}
        </div>
      ) : null}
    </div>
  );
}
