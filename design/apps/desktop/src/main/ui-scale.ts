/**
 * Main-process half of the appearance editor's UI-scale control.
 *
 * The renderer used to do this itself, with CSS `zoom` on the document
 * element. That magnifies the painted result without touching the layout
 * viewport: at 150% a 1280px window still lays out as 1280px and is then drawn
 * 1.5x larger, so the window grows a horizontal scrollbar, the heading is cut
 * off mid-word, and the status bar is pushed off the bottom edge. Viewport
 * units and width media queries are the mechanism — both keep answering with
 * the unscaled window — so no amount of per-rule patching in the stylesheets
 * reaches the whole problem.
 *
 * `webContents.setZoomFactor` is the standard fix and the only one available
 * to a page's host: it changes what a CSS pixel *is*, dividing the layout
 * viewport by the factor exactly as the browser's own zoom shortcut does. A
 * 1280x900 window at 200% becomes a 640x450 layout viewport, `100vh` means the
 * window again, the width media queries fire for the width the content
 * actually has, and `getBoundingClientRect` keeps returning coordinates in the
 * same space pointer events report — which CSS `zoom` does not.
 *
 * Every type here is declared structurally rather than against Electron's
 * classes, so the whole module can be exercised with plain object mocks:
 * `apps/desktop`'s vitest suite runs in a plain node environment with no
 * Electron available. This mirrors `window-controls.ts` deliberately.
 */

/** The single request channel the renderer's appearance runtime invokes. */
export const UI_SCALE_IPC_CHANNEL = "od:ui-scale:set";

/**
 * The bounds the appearance store already clamps to
 * (`apps/web/src/state/appearance.ts`). Restated rather than imported: the
 * main process must not trust a renderer-supplied number, and a compromised or
 * simply buggy renderer asking for 40x would leave the user with a window they
 * cannot operate well enough to undo it.
 */
export const MIN_UI_SCALE_FACTOR = 0.5;
export const MAX_UI_SCALE_FACTOR = 2;

/**
 * Clamp an untrusted factor into the supported range.
 *
 * Returns `null` — rather than a default — for a value that is not a finite
 * number at all. There is no sensible scale to guess from `NaN`, and silently
 * substituting 1 would reset a scale the user had deliberately set every time
 * a malformed message arrived.
 */
export function clampUiScaleFactor(value: unknown): number | null {
  // Deliberately narrower than a bare `Number(value)`: that coerces `null`,
  // `false` and `""` to 0, which would clamp to the minimum and shrink the
  // window to half size on a message that carried no factor at all.
  const factor =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(factor)) return null;
  if (factor < MIN_UI_SCALE_FACTOR) return MIN_UI_SCALE_FACTOR;
  if (factor > MAX_UI_SCALE_FACTOR) return MAX_UI_SCALE_FACTOR;
  return factor;
}

export type UiScaleWebContents = {
  setZoomFactor(factor: number): void;
};

export type UiScaleSurface = {
  isDestroyed(): boolean;
  webContents: UiScaleWebContents;
};

export type UiScaleInvokeEvent = {
  sender: UiScaleWebContents;
};

export type UiScaleIpc = {
  handle(channel: string, listener: (event: UiScaleInvokeEvent, factor: unknown) => unknown): void;
  removeHandler(channel: string): void;
};

/**
 * Register the UI-scale channel for `window`, replacing any previous
 * registration first — `createDesktopRuntime` can run twice in a dev
 * hot-reload and `ipcMain.handle` throws on a duplicate channel.
 *
 * The handler rejects a sender that is not the main window's web contents, for
 * the same reason the window controls do: the app runs with `webviewTag: true`
 * and every frame in the process shares one preload, so without that check an
 * embedded design-browser guest could rescale the application window out from
 * under the user.
 *
 * The handler resolves with the factor that was actually applied — or `null`
 * when nothing was — so a caller that wants to know can tell a clamped
 * request from an honoured one. Returns a disposer that removes the handler.
 */
export function registerUiScaleHandler(ipc: UiScaleIpc, window: UiScaleSurface): () => void {
  ipc.removeHandler(UI_SCALE_IPC_CHANNEL);

  ipc.handle(UI_SCALE_IPC_CHANNEL, (event, factor): number | null => {
    if (window.isDestroyed()) return null;
    if (event.sender !== window.webContents) {
      throw new Error("UI scale is only available to the main Material Designer window");
    }
    const clamped = clampUiScaleFactor(factor);
    if (clamped == null) return null;
    // Always applied, including at 1: Chromium persists a zoom level per
    // origin, so a window that was left at 200% and then set back to 100%
    // needs the explicit 1 to undo it. Skipping the no-op case here would
    // strand the previous factor for the rest of the session.
    window.webContents.setZoomFactor(clamped);
    return clamped;
  });

  return () => {
    ipc.removeHandler(UI_SCALE_IPC_CHANNEL);
  };
}
