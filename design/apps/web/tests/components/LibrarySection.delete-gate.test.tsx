// @vitest-environment jsdom
//
// Deleting from the Library used to be the least-guarded destructive action in
// the product: the per-card "Remove" ran on the first click with no
// confirmation at all, and the bulk dialog was answered by one press of an
// autofocused button — which a stray Enter supplies. Both now route through the
// super-confirmation gate, and these tests hold that line: the gate has to
// appear, it has to name the assets by their own titles, and nothing may reach
// the daemon until both keys and the whole slider are behind it.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: false }),
}));

const fetchLibraryAssets = vi.fn(async (): Promise<LibraryAsset[]> => []);
const fetchLibraryAsset = vi.fn(async (): Promise<LibraryAsset | null> => null);
const deleteLibraryAsset = vi.fn(async (_id: string): Promise<boolean> => true);

vi.mock('../../src/providers/registry', () => ({
  fetchLibraryAssets: (...args: unknown[]) => fetchLibraryAssets(...(args as [])),
  fetchAllLibraryAssets: (...args: unknown[]) =>
    fetchLibraryAssets(...(args as [])).then((assets) => ({ ok: true, assets, nextOffset: null })),
  fetchLibraryAsset: (...args: unknown[]) => fetchLibraryAsset(...(args as [])),
  deleteLibraryAsset: (...args: unknown[]) => deleteLibraryAsset(...(args as [string])),
  libraryAssetRawUrl: (id: string) => `/raw/${id}`,
  applyLibraryAsset: vi.fn(),
  editLibraryAssetAsPage: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchDesignSystems: vi.fn(async () => []),
  fetchLibraryAssetAsFile: vi.fn(),
  syncLibrary: vi.fn(),
}));

import { LibrarySection } from '../../src/components/LibrarySection';

function makeAsset(over: Partial<LibraryAsset> = {}): LibraryAsset {
  const now = 1_700_000_000_000;
  const id = over.id ?? 'asset-1';
  return {
    id,
    kind: 'image',
    storage: 'owned',
    capturedAt: now,
    archivedDate: '2024-01-01',
    contentHash: `hash-${id}`,
    tags: [],
    sources: [],
    createdAt: now,
    updatedAt: now,
    sourceTitle: 'A photo',
    ...over,
  };
}

/**
 * Both keys, then the slider end to end. The gate rations how far one input
 * event may carry the slider, so a single jump to 100 lands at 20 and stops —
 * five advances is the minimum, and driving it that way here is the gesture a
 * person actually has to make rather than a way around the control.
 */
function authorizeDestructiveGate(): void {
  const gate = screen.getByTestId('destructive-gate');
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
  for (const value of ['20', '40', '60', '80', '100']) {
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value },
    });
  }
}

function gateItemText(): string[] {
  return within(screen.getByTestId('destructive-gate-items'))
    .getAllByRole('listitem')
    .map((node) => node.textContent ?? '');
}

describe('LibrarySection delete gate', () => {
  beforeEach(() => {
    fetchLibraryAssets.mockReset().mockResolvedValue([makeAsset()]);
    fetchLibraryAsset.mockReset().mockResolvedValue(null);
    deleteLibraryAsset.mockReset().mockResolvedValue(true);
    (globalThis as { EventSource?: unknown }).EventSource = class {
      addEventListener() {}
      close() {}
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('names the asset in the gate and deletes nothing until it is authorized', async () => {
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('A photo');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByTestId('destructive-gate')).toBeTruthy();
    expect(deleteLibraryAsset).not.toHaveBeenCalled();
    // The asset's own title, plus what a Library-owned asset actually loses.
    expect(gateItemText()[0]).toContain('A photo');
    expect(gateItemText()[0]).toContain('the file stored in your Library');

    authorizeDestructiveGate();

    await waitFor(() => {
      expect(deleteLibraryAsset).toHaveBeenCalledWith('asset-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('A photo')).toBeNull();
    });
  });

  it('keeps the asset when the gate is dismissed', async () => {
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('A photo');
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement;
    // Focused first so the gate has a real origin to return focus to —
    // `fireEvent.click` does not move focus the way a pointer or Enter does.
    remove.focus();
    fireEvent.click(remove);

    fireEvent.click(screen.getByTestId('destructive-gate-exit'));

    await waitFor(() => {
      expect(screen.queryByTestId('destructive-gate')).toBeNull();
    });
    expect(deleteLibraryAsset).not.toHaveBeenCalled();
    expect(screen.getByText('A photo')).toBeTruthy();
    expect(document.activeElement).toBe(remove);
  });

  it('tells the truth about a referenced asset, whose file stays in its project', async () => {
    fetchLibraryAssets.mockResolvedValue([
      makeAsset({
        id: 'asset-ref',
        storage: 'referenced',
        sourceTitle: 'Synced hero',
        originProjectId: 'project-1',
        relPath: 'assets/hero.png',
      }),
    ]);
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('Synced hero');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const [first] = gateItemText();
    expect(first).toContain('Synced hero');
    expect(first).toContain('stays in the project that owns it');
    // Still irreversible: the caption, OCR text, tags and palette go with the
    // row, and Sync derives an asset again rather than restoring what was
    // there. Claiming otherwise would be the gate lying in the safe direction.
    expect(screen.getByTestId('destructive-gate-reversibility').textContent).toMatch(
      /cannot be undone/i,
    );
  });

  it('lists every selected asset before a bulk delete, and deletes them all once authorized', async () => {
    fetchLibraryAssets.mockResolvedValue([
      makeAsset({ id: 'asset-1', sourceTitle: 'A photo' }),
      makeAsset({ id: 'asset-2', sourceTitle: 'A second photo' }),
    ]);
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('A photo');
    for (const check of screen.getAllByRole('button', { name: 'Select asset' })) {
      fireEvent.click(check);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));

    // A count alone is the number the user already knew; what they cannot check
    // without the list is *which* two.
    const items = gateItemText();
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('A photo');
    expect(items[1]).toContain('A second photo');
    expect(deleteLibraryAsset).not.toHaveBeenCalled();

    authorizeDestructiveGate();

    await waitFor(() => {
      expect(deleteLibraryAsset).toHaveBeenCalledTimes(2);
    });
    expect(deleteLibraryAsset.mock.calls.map(([id]) => id).sort()).toEqual([
      'asset-1',
      'asset-2',
    ]);
    await waitFor(() => {
      expect(screen.queryByText('A second photo')).toBeNull();
    });
  });

  it('holds the gate open and keeps the asset when the daemon refuses the delete', async () => {
    deleteLibraryAsset.mockResolvedValue(false);
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('A photo');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    authorizeDestructiveGate();

    await waitFor(() => {
      expect(deleteLibraryAsset).toHaveBeenCalledWith('asset-1');
    });
    // A refused delete used to be swallowed: the row vanished from the grid
    // and came back on the next reload with nothing said. The gate stays open
    // reporting the failure, and the asset is still there.
    await waitFor(() => {
      expect(screen.getByTestId('destructive-gate').getAttribute('data-phase')).toBe('failed');
    });
    // Scoped outside the gate deliberately. The gate names the asset it is
    // about to delete, so a bare text query matches twice while it is open —
    // and the thing being asserted is that the asset is still in the GRID,
    // which a match inside the gate would not show.
    const gate = screen.getByTestId('destructive-gate');
    const stillInTheGrid = screen
      .getAllByText('A photo')
      .some((node) => !gate.contains(node));
    expect(stillInTheGrid).toBe(true);
  });
});
