// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostEditorsResponse } from '@open-design/contracts';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openPathInExternalEditor = vi.fn();
const openProjectInEditor = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openPathInExternalEditor: (...args: unknown[]) => openPathInExternalEditor(...args),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchHostEditors.mockReset();
  openPathInExternalEditor.mockReset();
  openProjectInEditor.mockReset();
});

describe('HandoffButton staged export target', () => {
  it('opens the exact receipt path and never substitutes the project directory', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'win32',
      editors: [{ id: 'vscode', label: 'Visual Studio Code', available: true }],
    });
    openPathInExternalEditor.mockResolvedValue({ ok: true });

    render(
      <I18nProvider initial="en">
        <HandoffButton
          projectId="project-1"
          projectKind="prototype"
          projectDir="C:/projects/project-one"
          targetPath="C:/app-data/exports/receipt-123.zip"
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('handoff-trigger'));

    await waitFor(() => expect(openPathInExternalEditor).toHaveBeenCalledWith(
      'C:/app-data/exports/receipt-123.zip',
      'vscode',
    ));
    expect(openProjectInEditor).not.toHaveBeenCalled();
  });
});
