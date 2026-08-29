// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary, LibraryAsset } from '@open-design/contracts';

import { DesignSystemSwitchPicker } from '../../src/components/DesignSystemSwitchPicker';
import { DesignSystemsSection } from '../../src/components/DesignSystemsSection';
import { LibrarySection } from '../../src/components/LibrarySection';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const workspaceHarness = vi.hoisted(() => ({ state: null as any }));
const registryMocks = vi.hoisted(() => ({
  fetchDesignSystems: vi.fn(),
  fetchDesignSystemsResult: vi.fn(),
  fetchLibraryAssets: vi.fn(),
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => workspaceHarness.state,
  };
});

vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: false }),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    fetchDesignSystems: registryMocks.fetchDesignSystems,
    fetchDesignSystemsResult: registryMocks.fetchDesignSystemsResult,
    fetchLibraryAssets: registryMocks.fetchLibraryAssets,
    fetchLibraryAsset: vi.fn(async () => null),
    libraryAssetRawUrl: (id: string) => `/raw/${id}`,
  };
});

const CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-catalog',
  workspaceMemberId: 'member-catalog',
  workspaceType: 'personal',
});

const SYSTEM_A: DesignSystemSummary = {
  id: 'user:account-a',
  title: 'Account A System',
  category: 'Custom',
  summary: 'Old account catalog row',
  source: 'user',
  status: 'draft',
  isEditable: true,
};

const SYSTEM_B: DesignSystemSummary = {
  ...SYSTEM_A,
  id: 'user:account-b',
  title: 'Account B System',
  summary: 'Current account catalog row',
};

const ASSET: LibraryAsset = {
  id: 'asset-account-fence',
  kind: 'image',
  storage: 'owned',
  capturedAt: 1,
  contentHash: 'asset-account-fence-hash',
  tags: [],
  sources: [],
  sourceTitle: 'Catalog fence asset',
  createdAt: 1,
  updatedAt: 1,
};

const cfg = { disabledDesignSystems: [] } as unknown as AppConfig;

function setWorkspaceState(
  accountGeneration: number,
  identityChangePending = false,
) {
  workspaceHarness.state = {
    context: CONTEXT,
    resourceReadIdentity: {
      context: CONTEXT,
      // Deliberately stable across the simulated sign-in boundary. The
      // monotonic account generation must carry the invalidation on its own.
      generation: 'directory-stable',
    },
    accountGeneration,
    loading: false,
    identityChangePending,
  };
}

function pickerTree() {
  return (
    <I18nProvider initial="en">
      <DesignSystemSwitchPicker
        t={(key) => key}
        currentDesignSystemId={null}
        onSelect={async () => true}
        onBack={() => {}}
      />
    </I18nProvider>
  );
}

function sectionTree() {
  return (
    <I18nProvider initial="en">
      <DesignSystemsSection cfg={cfg} setCfg={() => {}} />
    </I18nProvider>
  );
}

function libraryTree() {
  return (
    <I18nProvider initial="en">
      <LibrarySection active onOpenProject={() => {}} />
    </I18nProvider>
  );
}

beforeEach(() => {
  setWorkspaceState(1);
  registryMocks.fetchDesignSystems.mockReset();
  registryMocks.fetchDesignSystemsResult.mockReset();
  registryMocks.fetchLibraryAssets.mockReset().mockResolvedValue([ASSET]);
  (globalThis as { EventSource?: unknown }).EventSource = class {
    addEventListener() {}
    close() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('design-system catalog account generation fences', () => {
  it('keeps a late old-account picker response from replacing the current catalog', async () => {
    const oldAccount = deferred<{ ok: true; designSystems: DesignSystemSummary[] }>();
    registryMocks.fetchDesignSystemsResult
      .mockReturnValueOnce(oldAccount.promise)
      .mockResolvedValueOnce({ ok: true, designSystems: [SYSTEM_B] });
    const view = render(pickerTree());
    await waitFor(() => expect(registryMocks.fetchDesignSystemsResult).toHaveBeenCalledTimes(1));

    setWorkspaceState(2, true);
    view.rerender(pickerTree());
    expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
    expect(screen.queryByText(SYSTEM_B.title)).toBeNull();

    setWorkspaceState(2, false);
    view.rerender(pickerTree());
    await screen.findByText(SYSTEM_B.title);

    await act(async () => {
      oldAccount.resolve({ ok: true, designSystems: [SYSTEM_A] });
      await Promise.resolve();
    });
    expect(screen.getByText(SYSTEM_B.title)).toBeTruthy();
    expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
  });

  it('keeps a late old-account settings response from replacing the current catalog', async () => {
    const oldAccount = deferred<DesignSystemSummary[]>();
    registryMocks.fetchDesignSystems
      .mockReturnValueOnce(oldAccount.promise)
      .mockResolvedValueOnce([SYSTEM_B]);
    const view = render(sectionTree());
    await waitFor(() => expect(registryMocks.fetchDesignSystems).toHaveBeenCalledTimes(1));

    setWorkspaceState(2, true);
    view.rerender(sectionTree());
    expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
    expect(screen.queryByText(SYSTEM_B.title)).toBeNull();

    setWorkspaceState(2, false);
    view.rerender(sectionTree());
    await screen.findByText(SYSTEM_B.title);

    await act(async () => {
      oldAccount.resolve([SYSTEM_A]);
      await Promise.resolve();
    });
    expect(screen.getByText(SYSTEM_B.title)).toBeTruthy();
    expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
  });

  it('keeps a late old-account Library menu response from replacing the current catalog', async () => {
    const oldAccount = deferred<DesignSystemSummary[]>();
    registryMocks.fetchDesignSystems
      .mockReturnValueOnce(oldAccount.promise)
      .mockResolvedValueOnce([SYSTEM_B]);
    const view = render(libraryTree());

    await screen.findByText(ASSET.sourceTitle!);
    fireEvent.click(screen.getByRole('button', { name: 'Select asset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use in design system' }));
    await waitFor(() => expect(registryMocks.fetchDesignSystems).toHaveBeenCalledTimes(1));

    setWorkspaceState(2, true);
    view.rerender(libraryTree());
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
    });

    setWorkspaceState(2, false);
    view.rerender(libraryTree());
    fireEvent.click(screen.getByRole('button', { name: 'Use in design system' }));
    await screen.findByText(SYSTEM_B.title);

    await act(async () => {
      oldAccount.resolve([SYSTEM_A]);
      await Promise.resolve();
    });
    expect(screen.getByText(SYSTEM_B.title)).toBeTruthy();
    expect(screen.queryByText(SYSTEM_A.title)).toBeNull();
  });
});
