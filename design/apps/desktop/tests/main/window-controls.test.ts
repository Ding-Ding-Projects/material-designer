// The Windows shell hides the OS caption bar (`titleBarStyle: "hidden"`), so
// the renderer's Material Design 3 title bar is the ONLY way to minimize,
// maximize or close the app there. That makes these four handlers load-bearing
// chrome rather than a convenience, and it makes their sender check a real
// boundary: the app runs with `webviewTag: true` and every frame shares one
// preload, so an embedded design-browser guest reaches the same channels.
//
// Everything here is driven through plain object mocks — `window-controls.ts`
// is declared structurally precisely so this suite needs no Electron.

import { describe, expect, test } from "vitest";

import {
  WINDOW_CONTROL_IPC_CHANNELS,
  WINDOW_MAXIMIZED_EVENT,
  attachWindowMaximizedBroadcast,
  registerWindowControlHandlers,
  type WindowControlsInvokeEvent,
  type WindowControlsIpc,
  type WindowControlsSurface,
} from "../../src/main/window-controls.js";

type WindowControlHandler = (event: WindowControlsInvokeEvent) => unknown;

type MockIpc = {
  handlers: Map<string, WindowControlHandler>;
  ipc: WindowControlsIpc;
  removed: string[];
};

function createIpc(): MockIpc {
  const handlers = new Map<string, WindowControlHandler>();
  const removed: string[] = [];
  const ipc: WindowControlsIpc = {
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
  calls: string[];
  destroy: () => void;
  emit: (event: "maximize" | "unmaximize") => void;
  sent: Array<{ args: unknown[]; channel: string }>;
  setMaximized: (value: boolean) => void;
  window: WindowControlsSurface;
};

function createWindow(initial: { maximized?: boolean } = {}): MockWindow {
  const calls: string[] = [];
  const sent: Array<{ args: unknown[]; channel: string }> = [];
  const listeners = new Map<string, Array<() => void>>();
  let destroyed = false;
  let maximized = initial.maximized ?? false;
  const window: WindowControlsSurface = {
    close: () => {
      calls.push("close");
    },
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    maximize: () => {
      calls.push("maximize");
      maximized = true;
    },
    minimize: () => {
      calls.push("minimize");
    },
    on: (event: "maximize" | "unmaximize", listener: () => void) => {
      const bucket = listeners.get(event) ?? [];
      bucket.push(listener);
      listeners.set(event, bucket);
      return undefined;
    },
    unmaximize: () => {
      calls.push("unmaximize");
      maximized = false;
    },
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sent.push({ args, channel });
      },
    },
  };
  return {
    calls,
    destroy: () => {
      destroyed = true;
    },
    emit: (event) => {
      for (const listener of listeners.get(event) ?? []) listener();
    },
    sent,
    setMaximized: (value) => {
      maximized = value;
    },
    window,
  };
}

function handlerFor(ipc: MockIpc, channel: string): WindowControlHandler {
  const handler = ipc.handlers.get(channel);
  if (handler == null) throw new Error(`no handler registered for ${channel}`);
  return handler;
}

/** An invoke event whose sender is the main window's own web contents. */
function fromMainWindow(window: WindowControlsSurface): WindowControlsInvokeEvent {
  return { sender: window.webContents };
}

/** An invoke event from any other frame sharing the preload — a webview guest. */
function fromOtherFrame(): WindowControlsInvokeEvent {
  return { sender: { send: () => undefined } };
}

const ALL_CHANNELS = [
  WINDOW_CONTROL_IPC_CHANNELS.MINIMIZE,
  WINDOW_CONTROL_IPC_CHANNELS.TOGGLE_MAXIMIZE,
  WINDOW_CONTROL_IPC_CHANNELS.CLOSE,
  WINDOW_CONTROL_IPC_CHANNELS.IS_MAXIMIZED,
];

describe("registerWindowControlHandlers", () => {
  test("registers exactly the four title-bar channels", () => {
    const ipc = createIpc();
    const mock = createWindow();

    registerWindowControlHandlers(ipc.ipc, mock.window);

    expect([...ipc.handlers.keys()].sort()).toEqual([...ALL_CHANNELS].sort());
  });

  test("minimizes the main window", () => {
    const ipc = createIpc();
    const mock = createWindow();
    registerWindowControlHandlers(ipc.ipc, mock.window);

    const result = handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.MINIMIZE)(fromMainWindow(mock.window));

    expect(mock.calls).toEqual(["minimize"]);
    expect(result).toBeUndefined();
  });

  test("closes the main window", () => {
    const ipc = createIpc();
    const mock = createWindow();
    registerWindowControlHandlers(ipc.ipc, mock.window);

    handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.CLOSE)(fromMainWindow(mock.window));

    expect(mock.calls).toEqual(["close"]);
  });

  test("toggles maximize in both directions and answers with the state that landed", () => {
    const ipc = createIpc();
    const mock = createWindow();
    registerWindowControlHandlers(ipc.ipc, mock.window);
    const toggle = handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.TOGGLE_MAXIMIZE);

    expect(toggle(fromMainWindow(mock.window))).toBe(true);
    expect(mock.calls).toEqual(["maximize"]);

    expect(toggle(fromMainWindow(mock.window))).toBe(false);
    expect(mock.calls).toEqual(["maximize", "unmaximize"]);
  });

  test("reports the current maximized state without touching the window", () => {
    const ipc = createIpc();
    const mock = createWindow();
    registerWindowControlHandlers(ipc.ipc, mock.window);
    const isMaximized = handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.IS_MAXIMIZED);

    expect(isMaximized(fromMainWindow(mock.window))).toBe(false);

    mock.setMaximized(true);

    expect(isMaximized(fromMainWindow(mock.window))).toBe(true);
    expect(mock.calls).toEqual([]);
  });

  test("rejects every channel when the sender is not the main window", () => {
    const ipc = createIpc();
    const mock = createWindow();
    registerWindowControlHandlers(ipc.ipc, mock.window);

    for (const channel of ALL_CHANNELS) {
      expect(() => handlerFor(ipc, channel)(fromOtherFrame())).toThrow(
        /only available to the main Material Designer window/,
      );
    }

    // A rejected sender must not have moved the window on its way out.
    expect(mock.calls).toEqual([]);
  });

  test("stays inert once the window is destroyed", () => {
    const ipc = createIpc();
    const mock = createWindow({ maximized: true });
    registerWindowControlHandlers(ipc.ipc, mock.window);
    mock.destroy();

    expect(handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.MINIMIZE)(fromMainWindow(mock.window))).toBeUndefined();
    expect(handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.CLOSE)(fromMainWindow(mock.window))).toBeUndefined();
    expect(handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.TOGGLE_MAXIMIZE)(fromMainWindow(mock.window))).toBe(false);
    expect(handlerFor(ipc, WINDOW_CONTROL_IPC_CHANNELS.IS_MAXIMIZED)(fromMainWindow(mock.window))).toBe(false);
    expect(mock.calls).toEqual([]);
  });

  test("clears any previous registration first, so a second runtime can start", () => {
    const ipc = createIpc();
    const mock = createWindow();

    registerWindowControlHandlers(ipc.ipc, mock.window);
    // `ipcMain.handle` throws on a duplicate channel; a dev hot-reload builds a
    // second runtime against the same ipcMain.
    expect(() => registerWindowControlHandlers(ipc.ipc, mock.window)).not.toThrow();

    expect(ipc.removed).toEqual([...ALL_CHANNELS, ...ALL_CHANNELS]);
  });

  test("removes its handlers when the runtime disposes them", () => {
    const ipc = createIpc();
    const mock = createWindow();

    const dispose = registerWindowControlHandlers(ipc.ipc, mock.window);
    dispose();

    expect(ipc.handlers.size).toBe(0);
    expect(ipc.removed).toEqual([...ALL_CHANNELS, ...ALL_CHANNELS]);
  });
});

describe("attachWindowMaximizedBroadcast", () => {
  test("fans both OS transitions out to the renderer with the state that landed", () => {
    const mock = createWindow();
    attachWindowMaximizedBroadcast(mock.window);

    // Electron emits these AFTER the change, so the broadcast reads the window
    // back rather than inferring the state from which event fired.
    mock.setMaximized(true);
    mock.emit("maximize");
    mock.setMaximized(false);
    mock.emit("unmaximize");

    expect(mock.sent).toEqual([
      { args: [true], channel: WINDOW_MAXIMIZED_EVENT },
      { args: [false], channel: WINDOW_MAXIMIZED_EVENT },
    ]);
  });

  test("keeps reporting every transition, not just the first", () => {
    const mock = createWindow();
    attachWindowMaximizedBroadcast(mock.window);

    for (const maximized of [true, false, true]) {
      mock.setMaximized(maximized);
      mock.emit(maximized ? "maximize" : "unmaximize");
    }

    expect(mock.sent.map((entry) => entry.args[0])).toEqual([true, false, true]);
  });

  test("does not send into a destroyed window", () => {
    const mock = createWindow();
    attachWindowMaximizedBroadcast(mock.window);
    mock.destroy();

    mock.emit("maximize");
    mock.emit("unmaximize");

    expect(mock.sent).toEqual([]);
  });
});
