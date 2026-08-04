// The UI-scale control is the appearance editor's accessibility affordance:
// someone raises it because the default is too small to read. It used to be
// implemented with CSS `zoom` in the renderer, which magnified the paint and
// left the layout viewport alone — so at 150% and 200% the window grew a
// horizontal scrollbar, the home heading was cut off mid-word, and the status
// bar was pushed off the bottom edge. Moving it to the host's zoom factor is
// what makes the layout reflow, so these handlers are load-bearing.
//
// Everything here is driven through plain object mocks — `ui-scale.ts` is
// declared structurally precisely so this suite needs no Electron.

import { describe, expect, test } from "vitest";

import {
  MAX_UI_SCALE_FACTOR,
  MIN_UI_SCALE_FACTOR,
  UI_SCALE_IPC_CHANNEL,
  clampUiScaleFactor,
  registerUiScaleHandler,
  type UiScaleInvokeEvent,
  type UiScaleIpc,
  type UiScaleSurface,
  type UiScaleWebContents,
} from "../../src/main/ui-scale.js";

type UiScaleHandler = (event: UiScaleInvokeEvent, factor: unknown) => unknown;

type MockIpc = {
  handlers: Map<string, UiScaleHandler>;
  ipc: UiScaleIpc;
  removed: string[];
};

function createIpc(): MockIpc {
  const handlers = new Map<string, UiScaleHandler>();
  const removed: string[] = [];
  const ipc: UiScaleIpc = {
    handle: (channel, listener) => {
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.set(channel, listener);
    },
    removeHandler: (channel) => {
      removed.push(channel);
      handlers.delete(channel);
    },
  };
  return { handlers, ipc, removed };
}

type MockWindow = {
  applied: number[];
  destroyed: boolean;
  webContents: UiScaleWebContents;
  window: UiScaleSurface;
};

function createWindow(): MockWindow {
  const applied: number[] = [];
  const webContents: UiScaleWebContents = {
    setZoomFactor: (factor) => {
      applied.push(factor);
    },
  };
  const state = { destroyed: false };
  const window: UiScaleSurface = {
    isDestroyed: () => state.destroyed,
    webContents,
  };
  return {
    applied,
    get destroyed() {
      return state.destroyed;
    },
    set destroyed(value: boolean) {
      state.destroyed = value;
    },
    webContents,
    window,
  };
}

describe("clampUiScaleFactor", () => {
  test("passes an in-range factor through unchanged", () => {
    expect(clampUiScaleFactor(1)).toBe(1);
    expect(clampUiScaleFactor(1.25)).toBe(1.25);
    expect(clampUiScaleFactor(1.5)).toBe(1.5);
  });

  test("clamps to the supported range rather than trusting the renderer", () => {
    expect(clampUiScaleFactor(40)).toBe(MAX_UI_SCALE_FACTOR);
    expect(clampUiScaleFactor(0.01)).toBe(MIN_UI_SCALE_FACTOR);
    expect(clampUiScaleFactor(-3)).toBe(MIN_UI_SCALE_FACTOR);
  });

  test("accepts a numeric string, because IPC payloads are untyped", () => {
    expect(clampUiScaleFactor("1.5")).toBe(1.5);
  });

  // Guessing 1 here would silently discard a scale the user had chosen every
  // time a malformed message arrived, which is worse than doing nothing.
  test("refuses a value that is not a number at all", () => {
    expect(clampUiScaleFactor("wide")).toBeNull();
    expect(clampUiScaleFactor(Number.NaN)).toBeNull();
    expect(clampUiScaleFactor(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampUiScaleFactor({})).toBeNull();
  });

  // `Number(null)`, `Number(false)` and `Number("")` are all 0, which would
  // clamp to the minimum: a message carrying no factor would halve the window
  // rather than being ignored.
  test("refuses the values a bare Number() would turn into zero", () => {
    expect(clampUiScaleFactor(null)).toBeNull();
    expect(clampUiScaleFactor(undefined)).toBeNull();
    expect(clampUiScaleFactor(false)).toBeNull();
    expect(clampUiScaleFactor("")).toBeNull();
    expect(clampUiScaleFactor("   ")).toBeNull();
  });
});

describe("registerUiScaleHandler", () => {
  test("applies the requested factor to the window's web contents", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);

    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);
    expect(handler).toBeTypeOf("function");
    expect(handler?.({ sender: target.webContents }, 1.5)).toBe(1.5);
    expect(target.applied).toEqual([1.5]);
  });

  // Chromium persists a zoom level per origin, so returning to 100% has to be
  // an explicit setZoomFactor(1) rather than a skipped no-op.
  test("applies 1 explicitly, so a previous factor is actually undone", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);

    handler?.({ sender: target.webContents }, 2);
    handler?.({ sender: target.webContents }, 1);

    expect(target.applied).toEqual([2, 1]);
  });

  test("clamps an out-of-range request before applying it", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);

    expect(handler?.({ sender: target.webContents }, 12)).toBe(MAX_UI_SCALE_FACTOR);
    expect(target.applied).toEqual([MAX_UI_SCALE_FACTOR]);
  });

  test("ignores a malformed factor instead of resetting the window", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);

    expect(handler?.({ sender: target.webContents }, "wide")).toBeNull();
    expect(target.applied).toEqual([]);
  });

  // `webviewTag: true` plus one shared preload means an embedded guest frame
  // reaches this channel too.
  test("rejects a sender that is not the main window", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);
    const guest: UiScaleWebContents = { setZoomFactor: () => undefined };

    expect(() => handler?.({ sender: guest }, 2)).toThrow(/main Material Designer window/);
    expect(target.applied).toEqual([]);
  });

  test("does nothing for a destroyed window", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    const handler = handlers.get(UI_SCALE_IPC_CHANNEL);
    target.destroyed = true;

    expect(handler?.({ sender: target.webContents }, 2)).toBeNull();
    expect(target.applied).toEqual([]);
  });

  // `createDesktopRuntime` can run twice in a dev hot-reload and
  // `ipcMain.handle` throws on a duplicate channel.
  test("clears a previous registration and can be registered twice", () => {
    const { ipc, removed } = createIpc();
    const target = createWindow();
    registerUiScaleHandler(ipc, target.window);
    expect(() => registerUiScaleHandler(ipc, target.window)).not.toThrow();
    expect(removed).toEqual([UI_SCALE_IPC_CHANNEL, UI_SCALE_IPC_CHANNEL]);
  });

  test("the disposer removes the handler again", () => {
    const { handlers, ipc } = createIpc();
    const target = createWindow();
    const dispose = registerUiScaleHandler(ipc, target.window);

    dispose();

    expect(handlers.has(UI_SCALE_IPC_CHANNEL)).toBe(false);
  });
});
