import { useRef, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useT } from '../i18n';
import {
  exportProjectArchive,
  type ProjectArchiveReceipt,
} from '../runtime/exports';
import { Icon } from './Icon';
import { HandoffButton } from './HandoffButton';

export interface ProjectArchiveActionProps {
  projectId: string;
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
  projectName,
  projectDir,
  workspaceContext,
}: ProjectArchiveActionProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number | null } | null>(null);
  const [receipt, setReceipt] = useState<ProjectArchiveReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  async function startExport(): Promise<void> {
    if (busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress({ received: 0, total: null });
    setReceipt(null);
    setError(null);
    try {
      const result = await exportProjectArchive({
        projectId,
        fallbackTitle: projectName,
        workspaceContext,
        signal: controller.signal,
        onProgress: ({ bytesReceived, totalBytes }) => {
          setProgress({ received: bytesReceived, total: totalBytes });
        },
      });
      if (result.ok) {
        setReceipt(result.receipt);
      } else if (!result.cancelled) {
        setError(result.error);
      }
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  }

  function cancelExport(): void {
    controllerRef.current?.abort();
  }

  const progressLabel = progress
    ? progress.total
      ? `${t('fileViewer.exportingProgress')} ${Math.min(100, Math.round((progress.received / progress.total) * 100))}%`
      : t('fileViewer.exportingProgress')
    : t('fileViewer.exportingProgress');

  return (
    <div className="project-export-action" data-testid="project-export-action">
      <button
        type="button"
        className="ws-tab-action share project-export-action__trigger"
        onClick={() => void startExport()}
        disabled={busy || !projectId}
        aria-label={t('fileViewer.exportWebsiteHandoff')}
        title={t('fileViewer.exportWebsiteHandoff')}
      >
        <Icon name={busy ? 'spinner' : 'download'} size={15} />
        <span>{busy ? progressLabel : t('fileViewer.exportWebsiteHandoff')}</span>
      </button>
      {busy ? (
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
            projectName={projectName}
            projectDir={projectDir}
            targetPath={receipt.editorPath}
            workspaceContext={workspaceContext}
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
