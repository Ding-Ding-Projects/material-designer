// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OpenDesignHostWindowControls,
  OpenDesignHostWindowMaximizedListener,
} from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { WindowTitleBar } from '../../src/components/WindowTitleBar';
import { en } from '../../src/i18n/locales/en';

// The bar is drawn only where the operating system draws no caption bar, so
// every case here is really about one question: does this host look like the
// frameless Windows shell? The mock bridge lets us answer it four ways —
// absent, wrong platform, right platform without the namespace, and both.

function createWindowControls(maximized = false) {
  const listeners = new Set<OpenDesignHostWindowMaximizedListener>();
  const unsubscribed = vi.fn();
  const controls = {
    close: vi.fn(async (): Promise<void> => undefined),
    isMaximized: vi.fn(async (): Promise<boolean> => maximized),
    minimize: vi.fn(async (): Promise<void> => undefined),
    subscribeMaximized: vi.fn((listener: OpenDesignHostWindowMaximizedListener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribed();
      };
    }),
    toggleMaximize: vi.fn(async (): Promise<boolean> => !maximized),
  };
  const push = (value: boolean) => {
    act(() => {
      for (const listener of [...listeners]) listener(value);
    });
  };
  return { controls, push, unsubscribed };
}

let uninstallHost: (() => void) | null = null;

function installHost(platform: string, windowControls?: OpenDesignHostWindowControls): void {
  uninstallHost?.();
  uninstallHost = installMockOpenDesignHost({
    host: {
      // defaultHost() already reports client.type 'desktop'; only the platform
      // and the optional namespace vary between these cases.
      client: { platform },
      windowControls,
    },
  });
}

// The glyph moved from a class-named <i> to a Material Symbol, whose CSS
// Module class is hashed and whose text content is a ligature. `data-symbol`
// is the stable handle the component publishes in place of the old class.
function glyphOf(button: HTMLElement): string {
  return button.querySelector('[data-symbol]')?.getAttribute('data-symbol') ?? '';
}

afterEach(() => {
  cleanup();
  uninstallHost?.();
  uninstallHost = null;
  vi.clearAllMocks();
});

describe('WindowTitleBar', () => {
  it('renders nothing when no host bridge is present', () => {
    const { container } = render(<WindowTitleBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on a desktop host that is not win32', () => {
    const { controls } = createWindowControls();
    installHost('darwin', controls);
    const { container } = render(<WindowTitleBar />);
    expect(container.firstChild).toBeNull();
    expect(controls.subscribeMaximized).not.toHaveBeenCalled();
  });

  it('renders nothing on win32 when the host exposes no window controls', () => {
    installHost('win32');
    const { container } = render(<WindowTitleBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the brand mark and three named caption buttons on the frameless Windows shell', async () => {
    const { controls } = createWindowControls();
    installHost('win32', controls);
    const { container } = render(<WindowTitleBar />);

    expect(container.querySelector('[data-window-title-bar]')).not.toBeNull();
    expect(screen.getByText(en['app.brand'])).toBeTruthy();
    expect(await screen.findByRole('button', { name: en['titleBar.minimize'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: en['titleBar.maximize'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: en['titleBar.close'] })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('drives the bridge from the caption buttons', async () => {
    const { controls } = createWindowControls();
    installHost('win32', controls);
    render(<WindowTitleBar />);

    fireEvent.click(await screen.findByRole('button', { name: en['titleBar.minimize'] }));
    expect(controls.minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: en['titleBar.maximize'] }));
    expect(controls.toggleMaximize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: en['titleBar.close'] }));
    expect(controls.close).toHaveBeenCalledTimes(1);
  });

  it('seeds the glyph and the label from isMaximized()', async () => {
    const { controls } = createWindowControls(true);
    installHost('win32', controls);
    render(<WindowTitleBar />);

    const restore = await screen.findByRole('button', { name: en['titleBar.restore'] });
    expect(controls.isMaximized).toHaveBeenCalledTimes(1);
    expect(glyphOf(restore)).toBe('filter_none');
    expect(screen.queryByRole('button', { name: en['titleBar.maximize'] })).toBeNull();
  });

  it('follows the window when it is maximized behind the app', async () => {
    const { controls, push } = createWindowControls();
    installHost('win32', controls);
    render(<WindowTitleBar />);

    const maximize = await screen.findByRole('button', { name: en['titleBar.maximize'] });
    expect(glyphOf(maximize)).toBe('check_box_outline_blank');

    // A snap layout or Win+Up never touches the button, so the push is the
    // only thing that can keep the glyph honest.
    push(true);
    const restore = screen.getByRole('button', { name: en['titleBar.restore'] });
    expect(glyphOf(restore)).toBe('filter_none');

    push(false);
    expect(screen.getByRole('button', { name: en['titleBar.maximize'] })).toBeTruthy();
  });

  it('toggles maximize when the drag region is double-clicked, but not the buttons', async () => {
    const { controls } = createWindowControls();
    installHost('win32', controls);
    render(<WindowTitleBar />);

    await screen.findByRole('button', { name: en['titleBar.minimize'] });
    const dragRegion = screen.getByText(en['app.brand']).parentElement;
    expect(dragRegion).not.toBeNull();
    fireEvent.doubleClick(dragRegion as HTMLElement);
    expect(controls.toggleMaximize).toHaveBeenCalledTimes(1);

    // The caption buttons sit outside the drag region, so a double-click on
    // Close must not also maximize the window on its way up the tree.
    fireEvent.doubleClick(screen.getByRole('button', { name: en['titleBar.close'] }));
    expect(controls.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from the maximized push on unmount', async () => {
    const { controls, unsubscribed } = createWindowControls();
    installHost('win32', controls);
    const { unmount } = render(<WindowTitleBar />);

    await screen.findByRole('button', { name: en['titleBar.minimize'] });
    expect(controls.subscribeMaximized).toHaveBeenCalledTimes(1);
    expect(unsubscribed).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribed).toHaveBeenCalledTimes(1);
  });
});
