// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { ProjectArchiveAction } from '../../src/components/ProjectArchiveAction';

const exportProjectArchive = vi.fn();

vi.mock('../../src/runtime/exports', () => ({
  exportProjectArchive: (...args: unknown[]) => exportProjectArchive(...args),
}));

vi.mock('../../src/components/HandoffButton', () => ({
  HandoffButton: (props: { projectKind: string; targetPath?: string | null }) => (
    <div
      data-testid="export-editor-handoff"
      data-project-kind={props.projectKind}
      data-target-path={props.targetPath ?? ''}
    />
  ),
}));

afterEach(() => {
  cleanup();
  exportProjectArchive.mockReset();
});

function renderAction() {
  return render(
    <I18nProvider initial="en">
      <ProjectArchiveAction
        projectId="project-1"
        projectKind="prototype"
        projectName="Project One"
      />
    </I18nProvider>,
  );
}

describe('ProjectArchiveAction', () => {
  it('is project-scoped and stays available without an active file', () => {
    renderAction();
    expect(screen.getByTestId('project-export-action')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export complete website handoff ZIP' })).toBeTruthy();
  });

  it('shows streaming progress and exposes the exact staged export to the editor handoff', async () => {
    exportProjectArchive.mockImplementation(async (options: { onProgress: (value: { bytesReceived: number; totalBytes: number }) => void }) => {
      options.onProgress({ bytesReceived: 25, totalBytes: 100 });
      return {
        ok: true,
        receipt: {
          schema: 'open-design.project-export-receipt.v1',
          target: 'project',
          projectId: 'project-1',
          token: 'receipt-token',
          filename: 'project-one.zip',
          bytes: 100,
          sha256: 'a'.repeat(64),
          editorPath: 'C:/app-data/project-one.zip',
          downloadUrl: '/api/projects/project-1/archive/staged/receipt-token',
          expiresAt: 1,
          archiveDigestScope: 'complete ZIP byte stream',
        },
      };
    });

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: 'Export complete website handoff ZIP' }));
    await waitFor(() => expect(screen.getByText(/25%/)).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('export-editor-handoff').getAttribute('data-target-path'))
      .toBe('C:/app-data/project-one.zip'));
    expect(screen.getByTestId('export-editor-handoff').getAttribute('data-project-kind'))
      .toBe('prototype');
  });

  it('keeps cancellation as a distinct result rather than reporting success', async () => {
    let resolve!: (value: { ok: false; cancelled: true }) => void;
    exportProjectArchive.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderAction();
    fireEvent.click(screen.getByRole('button', { name: 'Export complete website handoff ZIP' }));
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    expect(exportProjectArchive).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    resolve({ ok: false, cancelled: true });
    await waitFor(() => expect(screen.queryByTestId('export-editor-handoff')).toBeNull());
  });
});
