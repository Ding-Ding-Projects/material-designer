// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OpenDesignHostUpdaterOpenDialogListener,
  OpenDesignHostUpdaterStatusListener,
  OpenDesignHostUpdaterStatusSnapshot,
} from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { UpdateDialog } from '../../src/components/UpdateDialog';
import { I18nProvider } from '../../src/i18n';

const UPDATE_DIALOG_CSS = readFileSync(new URL('../../src/components/UpdateDialog.module.css', import.meta.url), 'utf8');

function idleStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: {
      canApplyInPlace: true,
      canDownload: true,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: 'beta',
    currentVersion: '1.2.3',
    enabled: true,
    mode: 'js-incremental',
    platform: 'darwin',
    state: 'idle',
    supported: true,
    ...overrides,
  };
}

function payloadReadyStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return idleStatus({
    artifact: {
      name: 'open-design-1.2.4-payload.zip',
      platformKey: 'mac',
      type: 'payload',
      url: 'https://example.test/open-design-1.2.4-payload.zip',
    },
    availableVersion: '1.2.4',
    downloadPath: '/tmp/open-design-1.2.4-payload.zip',
    state: 'downloaded',
    ...overrides,
  });
}

function availableStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return idleStatus({
    artifact: {
      name: 'open-design-1.2.4-payload.zip',
      platformKey: 'mac',
      type: 'payload',
      url: 'https://example.test/open-design-1.2.4-payload.zip',
    },
    availableVersion: '1.2.4',
    state: 'available',
    ...overrides,
  });
}

describe('UpdateDialog', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it('renders the exact release notes target supplied by update metadata', async () => {
    let statusListener: OpenDesignHostUpdaterStatusListener | null = null;
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus({
      metadata: { releaseNotesUrl: 'https://example.test/releases/v1.2.4' },
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => idleStatus()),
          subscribe: vi.fn((listener) => {
            statusListener = listener;
            return vi.fn();
          }),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      statusListener?.(ready);
      await Promise.resolve();
    });
    await act(async () => {
      openDialogListener?.({ source: 'metadata-url-test' });
      await Promise.resolve();
    });

    const link = await screen.findByTestId('update-dialog-release-notes');
    expect(link.getAttribute('data-release-notes-url')).toBe('https://example.test/releases/v1.2.4');
  });

  it('updates silently in the background and opens ready state only after the native menu request', async () => {
    let statusListener: OpenDesignHostUpdaterStatusListener | null = null;
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus();
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => idleStatus()),
          subscribe: vi.fn((listener) => {
            statusListener = listener;
            return vi.fn();
          }),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      statusListener?.(ready);
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });
    const dialog = await screen.findByRole('dialog', { name: 'Check for updates' });
    expect(dialog.querySelector('.od-brand-glyph')).toBeTruthy();
    expect(screen.getByText('v1.2.4 is ready. Better experiences and smarter design await.')).toBeTruthy();
    expect(screen.queryByText('Version 1.2.3')).toBeNull();
    expect(screen.getByRole('button', { name: 'Explore new features' })).toBeTruthy();
  });

  it('uses restart-to-install copy for a ready Windows Squirrel Setup.exe', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus({
      artifact: {
        name: 'Setup.exe',
        platformKey: 'win',
        type: 'installer',
        url: 'https://example.test/Setup.exe',
      },
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      downloadPath: '/tmp/open-design-updater/Setup.exe',
      platform: 'win32',
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'windows-update-menu' });
      await Promise.resolve();
    });

    await screen.findByRole('dialog', { name: 'Check for updates' });
    expect(screen.getByRole('button', { name: 'Restart to install update' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  });

  it('shows reinstall copy and the operator link when the feed forces the installer route', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus({
      artifact: {
        name: 'open-design-1.2.4-setup.exe',
        platformKey: 'win',
        type: 'installer',
        url: 'https://example.test/open-design-1.2.4-setup.exe',
      },
      reinstall: {
        installedVersion: '1.0.0',
        minVersion: '1.2.0',
        reason: 'outer-below-min',
        url: 'https://example.com/reinstall-help',
      },
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    await screen.findByRole('dialog', { name: 'Check for updates' });
    expect(
      screen.getByText('Material Designer 1.2.4 requires a full reinstall. Material Designer will close and open the installer.'),
      screen.getByText('OpenDesign 1.2.4 requires a full reinstall. OpenDesign will close and open the installer.'),
    ).toBeTruthy();
    expect(screen.getByTestId('update-dialog-reinstall-learn-more')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore new features' })).toBeNull();
  });

  it('starts an explicit auto-downloading check when opened from an idle menu state', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const check = vi.fn(async () => idleStatus({ state: 'not-available' }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check,
          status: vi.fn(async () => idleStatus()),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    await waitFor(() => expect(check).toHaveBeenCalledWith({
      payload: { autoDownload: true, source: 'mac-app-menu' },
    }));
    expect(await screen.findByText("You're already on the latest version. (v1.2.3)")).toBeTruthy();
    expect(screen.queryByText('Version 1.2.3')).toBeNull();
    const releaseNotes = screen.getByRole('button', { name: 'Explore new features' });
    expect(releaseNotes.parentElement?.children).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('keeps copy and actions focused as an update moves from available to downloading and installing', async () => {
    let statusListener: OpenDesignHostUpdaterStatusListener | null = null;
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const available = availableStatus();
    const downloading = availableStatus({
      progress: { receivedBytes: 42, totalBytes: 100 },
      state: 'downloading',
    });
    const download = vi.fn(async () => downloading);
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          download,
          status: vi.fn(async () => available),
          subscribe: vi.fn((listener) => {
            statusListener = listener;
            return vi.fn();
          }),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    expect(await screen.findByText('v1.2.4 is available. Download it to install the update.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Explore new features' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));

    expect(await screen.findByText('Downloading update 42%.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore new features' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download update' })).toBeNull();

    await act(async () => {
      statusListener?.(availableStatus({ state: 'installing' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Installing update...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore new features' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart to install update' })).toBeNull();
  });

  it('replaces technical check errors with concise recovery copy', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const failed = idleStatus({
      error: { code: 'network-timeout', message: 'ETIMEDOUT https://updates.example.test/latest.yml' },
      state: 'error',
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check: vi.fn(async () => failed),
          status: vi.fn(async () => idleStatus()),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    expect(await screen.findByText("Couldn't check for updates. Please try again shortly.")).toBeTruthy();
    expect(screen.queryByText(/ETIMEDOUT/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explore new features' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('offers a manual download instead of another check when in-app updates are unsupported', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const openExternal = vi.fn(async () => ({ ok: true as const }));
    const unsupported = idleStatus({ enabled: false, state: 'unsupported', supported: false });
    restoreHost = installMockOpenDesignHost({
      host: {
        shell: { openExternal },
        updater: {
          status: vi.fn(async () => unsupported),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    expect(await screen.findByText("In-app updates aren't available here. Download the latest version from Releases.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore new features' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download manually' }));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith('https://github.com/Ding-Ding-Projects/material-designer/releases'));
  });

  it('defaults to Later when tasks are active and requires an explicit Restart anyway override', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus();
    const blocked = payloadReadyStatus({
      error: {
        code: 'active-runs-blocked',
        details: { activeRunCount: 2 },
        message: 'tasks are active',
      },
    });
    const installed = payloadReadyStatus({
      installResult: {
        openedAt: '2026-07-16T12:00:00.000Z',
        path: '/tmp/open-design-1.2.4-payload.zip',
      },
      state: 'installing',
    });
    const install = vi.fn()
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce(installed);
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Restart to install update' }));

    expect(await screen.findByText('Material Designer is still working')).toBeTruthy();
    expect(await screen.findByText('OpenDesign is still working')).toBeTruthy();
    expect(screen.getByText('2 active tasks are still running. Restarting now will interrupt them.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Restart anyway' }));
    await waitFor(() => expect(install).toHaveBeenLastCalledWith({
      payload: { force: true, source: 'mac-app-menu' },
    }));
    await waitFor(() => expect(quit).toHaveBeenCalledWith({
      payload: { force: true, source: 'mac-app-menu' },
    }));
  });

  it('traps focus in the modal and restores focus to the opener on every dismissal path', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus({
      artifact: {
        name: 'Setup.exe',
        platformKey: 'win',
        type: 'installer',
        url: 'https://example.test/Setup.exe',
      },
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      downloadPath: '/tmp/open-design-updater/Setup.exe',
      platform: 'win32',
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(
      <>
        <button data-testid="update-opener" type="button">Open updates</button>
        <I18nProvider initial="en"><UpdateDialog /></I18nProvider>
      </>,
    );
    const opener = screen.getByTestId('update-opener');
    const openDialog = async () => {
      opener.focus();
      await act(async () => {
        openDialogListener?.({ source: 'windows-update-menu' });
        await Promise.resolve();
      });
      return screen.findByRole('dialog', { name: 'Check for updates' });
    };

    await openDialog();
    const closeButton = screen.getByRole('button', { name: 'Close' });
    const restartButton = screen.getByRole('button', { name: 'Restart to install update' });
    restartButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(restartButton).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();

    await openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();

    const outsideDismissDialog = await openDialog();
    const backdrop = outsideDismissDialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('restores focus to the opener after a successful restart handoff', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus();
    const installed = payloadReadyStatus({
      installResult: {
        openedAt: '2026-08-06T12:00:00.000Z',
        path: '/tmp/open-design-1.2.4-payload.zip',
      },
      state: 'installing',
    });
    const install = vi.fn(async () => installed);
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(
      <>
        <button data-testid="update-opener" type="button">Open updates</button>
        <I18nProvider initial="en"><UpdateDialog /></I18nProvider>
      </>,
    );
    const opener = screen.getByTestId('update-opener');
    opener.focus();
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });
    await screen.findByRole('dialog', { name: 'Check for updates' });

    fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' }));
    await waitFor(() => expect(quit).toHaveBeenCalledWith({
      payload: { force: false, source: 'mac-app-menu' },
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('keeps a failed installer handoff retryable after the installer was opened', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const ready = payloadReadyStatus({
      artifact: {
        name: 'Setup.exe',
        platformKey: 'win',
        type: 'installer',
        url: 'https://example.test/Setup.exe',
      },
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      downloadPath: '/tmp/open-design-updater/Setup.exe',
      platform: 'win32',
    });
    const installed = {
      ...ready,
      installResult: {
        openedAt: '2026-08-06T12:00:00.000Z',
        path: '/tmp/open-design-updater/Setup.exe',
      },
      state: 'downloaded' as const,
    };
    const install = vi.fn(async () => installed);
    const quit = vi.fn(async () => ({ ok: false as const, reason: 'quit failed' }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => ready),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => {
      openDialogListener?.({ source: 'windows-update-menu' });
      await Promise.resolve();
    });
    await screen.findByRole('dialog', { name: 'Check for updates' });

    fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' }));
    await waitFor(() => expect(quit).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Restart to install update' })).toBeEnabled();
  });

  it('stops progress interpolation under reduced motion', () => {
    const reducedMotionBlock = UPDATE_DIALOG_CSS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/u,
    )?.[1] ?? '';
    expect(reducedMotionBlock).toMatch(/\.progress span\s*\{[\s\S]*transition:\s*none;/u);
  });
});
