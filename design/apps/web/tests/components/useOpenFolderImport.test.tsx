// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hostAvailable = vi.hoisted(() => vi.fn(() => true));
const workspaceState = vi.hoisted(() => ({
  context: null,
  failure: undefined as 'unavailable' | undefined,
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
  hostAvailable.mockReturnValue(true);
  workspaceState.failure = undefined;
  vi.mocked(pickAndImportHostProject).mockReset();
  vi.unstubAllGlobals();
});

describe('useOpenFolderImport', () => {
  it('rechecks host availability at action time before selecting the pure-web route', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    hostAvailable.mockReturnValue(false);
    const hook = renderHook(() => useOpenFolderImport({
      folderDialogTitle: 'Choose a folder',
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
    workspaceState.failure = 'unavailable';
    const hook = renderHook(() => useOpenFolderImport({
      folderDialogTitle: 'Choose a folder',
      onImportFolderResponse: vi.fn(),
    }));

    await act(async () => {
      await hook.result.current.openFolder();
    });

    expect(pickAndImportHostProject).not.toHaveBeenCalled();
    expect(hook.result.current.error).toEqual({
      message: 'Workspace context is unavailable. Try again when workspace sync finishes.',
    });
    expect(hook.result.current.importing).toBe(false);
  });
});
