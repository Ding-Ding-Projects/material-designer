import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  WIN_DAEMON_PREBUNDLE_ESM_DIRNAME_DEFINES,
  WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER,
} from "../../src/win/prebundle.js";

const packSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

// A CommonJS dependency bundled into the daemon's ESM output still reads
// `__dirname`/`__filename`. Before this contract, one such dependency imported
// at daemon boot threw `ReferenceError: __dirname is not defined in ES module
// scope`, the daemon exited 1, and the packaged app died before its first
// window with no message at all.
describe("windows daemon prebundle ESM globals", () => {
  it("declares uniquely named __dirname/__filename shims in the banner", () => {
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).toContain("const __odDirname =");
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).toContain("const __odFilename =");
    // A banner declaring the bare names collides with bundled chunks that
    // declare their own top-level `__filename` (SyntaxError: already declared).
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).not.toMatch(/const __filename\b/);
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).not.toMatch(/const __dirname\b/);
  });

  it("maps the bare identifiers onto those shims", () => {
    expect([...WIN_DAEMON_PREBUNDLE_ESM_DIRNAME_DEFINES]).toEqual([
      "--define:__dirname=__odDirname",
      "--define:__filename=__odFilename",
    ]);
  });

  it("passes the defines to the daemon prebundle esbuild invocation", () => {
    const source = readFileSync(join(packSrc, "win", "app.ts"), "utf8");
    expect(source).toMatch(/^\s*\.\.\.WIN_DAEMON_PREBUNDLE_ESM_DIRNAME_DEFINES,$/m);
  });
});
