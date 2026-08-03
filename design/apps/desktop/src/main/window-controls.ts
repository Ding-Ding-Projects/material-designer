/**
 * Main-process half of the Windows frameless title bar.
 *
 * On win32 the app window is created with `titleBarStyle: "hidden"` (see
 * `PLATFORM_WINDOW_CHROME` in `runtime.ts`), so the operating system draws no
 * caption bar and the renderer paints a Material Design 3 one instead. Those
 * custom buttons need a privileged route to minimize, maximize/restore and
 * close the window, and the button that toggles maximize needs to know which
 * glyph to show — so the window also pushes its maximized state whenever the
 * OS changes it.
 *
 * Every type here is declared structurally rather than against Electron's
 * classes, so the whole module can be exercised with plain object mocks:
 * `apps/desktop`'s vitest suite runs in a plain node environment with no
 * Electron available.
 */

/** The four request/response channels the renderer's title bar invokes. */
export const WINDOW_CONTROL_IPC_CHANNELS = Object.freeze({
  CLOSE: "od:window:close",
  IS_MAXIMIZED: "od:window:is-maximized",
  MINIMIZE: "od:window:minimize",
  TOGGLE_MAXIMIZE: "od:window:toggle-maximize",
} as const);

/** Main -> renderer push of the main window's maximized state. */
export const WINDOW_MAXIMIZED_EVENT = "od:window:maximized-changed";

export type WindowControlsWebContents = {
  send(channel: string, ...args: unknown[]): void;
};

export type WindowControlsSurface = {
  close(): void;
  isDestroyed(): boolean;
  isMaximized(): boolean;
  maximize(): void;
  minimize(): void;
  on(event: "maximize", listener: () => void): unknown;
  on(event: "unmaximize", listener: () => void): unknown;
  unmaximize(): void;
  webContents: WindowControlsWebContents;
};

export type WindowControlsInvokeEvent = {
  sender: WindowControlsWebContents;
};

export type WindowControlsIpc = {
  handle(channel: string, listener: (event: WindowControlsInvokeEvent) => unknown): void;
  removeHandler(channel: string): void;
};

const WINDOW_CONTROL_CHANNEL_LIST = [
  WINDOW_CONTROL_IPC_CHANNELS.MINIMIZE,
  WINDOW_CONTROL_IPC_CHANNELS.TOGGLE_MAXIMIZE,
  WINDOW_CONTROL_IPC_CHANNELS.CLOSE,
  WINDOW_CONTROL_IPC_CHANNELS.IS_MAXIMIZED,
] as const;

/**
 * Register the window-control channels for `window`, replacing any previous
 * registration first — `createDesktopRuntime` can run twice in a dev
 * hot-reload and `ipcMain.handle` throws on a duplicate channel, exactly as
 * the updater channels above it already guard against.
 *
 * Every handler rejects a sender that is not the main window's web contents.
 * The app runs with `webviewTag: true` and every frame in the process shares
 * one preload, so without that check an embedded design-browser guest — or any
 * child window — could minimize or close the application window out from under
 * the user. The message mirrors `requireMainWindowSender` in `runtime.ts`.
 *
 * A destroyed window is checked before the sender because reading
 * `webContents` off a destroyed BrowserWindow is not safe to rely on; there is
 * nothing left to protect at that point, so the handlers report a neutral
 * result instead of throwing.
 *
 * Returns a disposer that removes the handlers again.
 */
export function registerWindowControlHandlers(
  ipc: WindowControlsIpc,
  window: WindowControlsSurface,
): () => void {
  const requireMainWindowSender = (event: WindowControlsInvokeEvent): void => {
    if (event.sender !== window.webContents) {
      throw new Error("window controls are only available to the main Material Designer window");
    }
  };

  for (const channel of WINDOW_CONTROL_CHANNEL_LIST) {
    ipc.removeHandler(channel);
  }

  ipc.handle(WINDOW_CONTROL_IPC_CHANNELS.MINIMIZE, (event): void => {
    if (window.isDestroyed()) return;
    requireMainWindowSender(event);
    window.minimize();
  });

  ipc.handle(WINDOW_CONTROL_IPC_CHANNELS.TOGGLE_MAXIMIZE, (event): boolean => {
    if (window.isDestroyed()) return false;
    requireMainWindowSender(event);
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });

  ipc.handle(WINDOW_CONTROL_IPC_CHANNELS.CLOSE, (event): void => {
    if (window.isDestroyed()) return;
    requireMainWindowSender(event);
    window.close();
  });

  ipc.handle(WINDOW_CONTROL_IPC_CHANNELS.IS_MAXIMIZED, (event): boolean => {
    if (window.isDestroyed()) return false;
    requireMainWindowSender(event);
    return window.isMaximized();
  });

  return () => {
    for (const channel of WINDOW_CONTROL_CHANNEL_LIST) {
      ipc.removeHandler(channel);
    }
  };
}

/**
 * Push the window's maximized state to the renderer on every transition, so a
 * snap layout, a double-clicked drag region, Win+Up, or a drag off the top
 * edge keeps the custom title bar's glyph in step with the real window. The
 * state is read back from the window rather than inferred from which event
 * fired, because Electron emits these after the change has landed.
 */
export function attachWindowMaximizedBroadcast(window: WindowControlsSurface): void {
  const publish = (): void => {
    if (window.isDestroyed()) return;
    window.webContents.send(WINDOW_MAXIMIZED_EVENT, window.isMaximized());
  };
  window.on("maximize", publish);
  window.on("unmaximize", publish);
}
