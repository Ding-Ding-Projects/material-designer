// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hostAvailable = vi.hoisted(() => vi.fn(() => true));
const workspaceState = vi.hoisted(() => ({
  context: null as null | {
    lifecycleState: string;
    memberStatus: string;
    permissions: { canShareProjects: boolean; canWriteSyncedFiles: boolean };
    role: string;
    workspaceId: string;
    workspaceMemberId: string;
    workspaceType: string;
  },
  failure: 'unavailable' as string | null,
  loading: false,
}));

vi.mock('@open-design/host', () => ({
  isOpenDesignHostAvailable: hostAvailable,
  pickAndImportHostProject: vi.fn(),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => workspaceState,
}));

import { pickAndImportHostProject } from '@open-design/host';
import { useOpenFolderImport } from '../../src/components/useOpenFolderImport';

afterEach(() => {
  cleanup();
  vi.mocked(pickAndImportHostProject).mockReset();
  hostAvailable.mockReturnValue(true);
  workspaceState.context = null;
  workspaceState.failure = 'unavailable';
  workspaceState.loading = false;
});

describe('useOpenFolderImport', () => {
  it('rechecks host availability at action time before selecting the pure-web route', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    hostAvailable.mockReturnValue(false);
    const hook = renderHook(() => useOpenFolderImport({
      onImportFolder: vi.fn(),
      onImportFolderResponse: vi.fn(),
    }));

    hostAvailable.mockReturnValue(true);
    await act(async () => {
      await hook.result.current.openFolder();
    });

    expect(pickAndImportHostProject).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.result.current.importing).toBe(false);
  });

  it('surfaces an unavailable workspace authority through the existing import error state', async () => {
    const hook = renderHook(() => useOpenFolderImport({
      onImportFolderResponse: vi.fn(),
    }));

    await act(async () => {
      await hook.result.current.openFolder();
    });

    expect(pickAndImportHostProject).not.toHaveBeenCalled();
    expect(hook.result.current.error).toEqual({
      message: 'Could not open folder picker',
      details: 'Workspace context is unavailable. Try again when workspace sync finishes.',
    });
    expect(hook.result.current.importing).toBe(false);
  });

  it('forwards the localized title through the host bridge and keeps failure copy localized', async () => {
    workspaceState.context = {
      lifecycleState: 'active',
      memberStatus: 'active',
      permissions: { canShareProjects: true, canWriteSyncedFiles: true },
      role: 'owner',
      workspaceId: 'workspace-folder-picker',
      workspaceMemberId: 'member-folder-picker',
      workspaceType: 'team',
    };
    workspaceState.failure = null;
    vi.mocked(pickAndImportHostProject).mockResolvedValue({
      ok: false,
      reason: 'desktop auth secret not registered',
    });

    const hook = renderHook(() => useOpenFolderImport({
      folderDialogTitle: 'Select a code folder to link',
      onImportFolderResponse: vi.fn(),
    }));

    await act(async () => {
      await hook.result.current.openFolder();
    });

    expect(pickAndImportHostProject).toHaveBeenCalledWith({
      folderDialogTitle: 'Select a code folder to link',
      skillId: null,
      workspaceContext: workspaceState.context,
    });
    expect(hook.result.current.error).toEqual({
      message: 'Could not open folder picker',
      details: 'Open folder failed: desktop auth secret not registered',
    });
  });
});
