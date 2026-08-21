import { describe, expect, it } from 'vitest';

import {
  assertDesktopScaffoldCollisions,
  createDesktopScaffoldFiles,
  createDesktopStarterFiles,
  desktopScaffoldState,
} from '../src/desktop-scaffold.js';

describe('desktop application scaffold service', () => {
  it('creates project-specific starter and secure shell files from one state revision', () => {
    const state = desktopScaffoldState({ entryFile: 'index.html', revision: 3 });
    const files = createDesktopScaffoldFiles({
      projectName: 'Orders Desk',
      projectId: 'orders-desk',
      entryFile: 'index.html',
      revision: 3,
    });
    const starter = createDesktopStarterFiles('Orders Desk');
    expect(state.revision).toBe(3);
    expect(files.map((file) => file.role)).toEqual([
      'readme', 'package', 'config', 'main', 'preload', 'renderer',
    ]);
    expect(starter.map((file) => file.path)).toEqual(['index.html', 'styles.css', 'app.js']);
    const main = files.find((file) => file.role === 'main')?.body ?? '';
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
    expect(main).toContain('will-attach-webview');
    expect(main).toContain('setWindowOpenHandler');
    expect(main).toContain('parsed.protocol !== \'file:\'');
    expect(main).not.toMatch(/[A-Z]:\\|\/Users\//);
  });

  it('rejects absolute, escaping, and non-HTML entry files', () => {
    for (const entryFile of ['/index.html', '../index.html', 'C:/index.html', 'index.js']) {
      expect(() => createDesktopScaffoldFiles({
        projectName: 'Safe project',
        entryFile,
      })).toThrow();
    }
  });

  it('rejects case-insensitive generated path collisions before writing', () => {
    expect(() => assertDesktopScaffoldCollisions([
      { relPath: 'Desktop/PACKAGE.JSON' },
    ])).toThrow(/desktop scaffold path already exists/i);
  });
});
