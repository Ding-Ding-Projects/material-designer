import { useCallback, useState } from 'react';
import {
  isOpenDesignHostAvailable,
  pickAndImportHostProject,
  type OpenDesignHostProjectImportSuccess,
} from '@open-design/host';
import { useT } from '../i18n';
import { pickLocalFolderPath } from '../state/projects';
import { resolvedWorkspaceContextForWrite } from '../state/projects';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import { formatPickAndImportFailure } from '../utils/pickAndImportError';

interface UseOpenFolderImportArgs {
  folderDialogTitle: string;
  skillId?: string | null;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
}

export function useOpenFolderImport({
  folderDialogTitle,
  skillId,
  onImportFolder,
  onImportFolderResponse,
}: UseOpenFolderImportArgs) {
  const t = useT();
  const workspaceContextState = useWorkspaceContext();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const hasHostPickAndImport = isOpenDesignHostAvailable();
  const available = hasHostPickAndImport ? Boolean(onImportFolderResponse) : Boolean(onImportFolder);
  const pickerTitle = folderDialogTitle ?? t('workingDirPicker.title');

  const openFolder = useCallback(async () => {
    // Read the bridge at action time too. A renderer can mount before the
    // desktop preload finishes installing its bridge; using the render-time
    // snapshot would incorrectly send that desktop action to the raw daemon
    // picker.
    const hostPickAndImportAvailable = isOpenDesignHostAvailable();
    if (hostPickAndImportAvailable) {
      if (!onImportFolderResponse) return;
      setError(null);
      setImporting(true);
      try {
        const result = await pickAndImportHostProject({
          folderDialogTitle,
          skillId: skillId ?? null,
          workspaceContext: resolvedWorkspaceContextForWrite(workspaceContextState),
        });
        if (!result) return;
        if (result.ok === true) {
          await onImportFolderResponse(result);
          return;
        }
        if ('canceled' in result && result.canceled === true) return;
        setError({
          message: t('chat.linkedFolderPickError'),
          details: formatPickAndImportFailure(result),
        });
      } catch (err) {
        setError({
          message: t('chat.linkedFolderPickError'),
          details: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setImporting(false);
      }
      return;
    }

    if (!onImportFolder) return;
    setError(null);
    setImporting(true);
    try {
      const selectedPath = await pickLocalFolderPath({ pureWebOnly: true, title: folderDialogTitle });
      if (!selectedPath) return;
      await onImportFolder(selectedPath);
    } catch (err) {
      setError({
        message: t('chat.linkedFolderPickError'),
        details: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  }, [
    onImportFolder,
    onImportFolderResponse,
    skillId,
    folderDialogTitle,
    t,
    workspaceContextState,
  ]);

  return {
    available,
    clearError: () => setError(null),
    error,
    importing,
    openFolder,
  };
}
