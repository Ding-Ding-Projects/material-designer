import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mediaIndex = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "media",
  "index.ts",
);

// `@ffmpeg-installer/ffmpeg` throws at import time when the platform binary is
// not on disk, which a packaged build's daemon is. A top-level import therefore
// killed daemon boot -- and with it the whole app -- over an optional encoder.
describe("ffmpeg resolution", () => {
  const source = readFileSync(mediaIndex, "utf8");

  it("never imports the installer at module scope", () => {
    expect(source).not.toMatch(/^\s*import .*['"]@ffmpeg-installer\/ffmpeg['"]/m);
  });

  it("resolves the binary lazily behind an env override", () => {
    expect(source).toMatch(/^function resolveFfmpegPath\(\): string \{$/m);
    expect(source).toContain("process.env.HYPERFRAMES_FFMPEG_PATH");
    expect(source).toMatch(/^\s*const ffmpegPath = resolveFfmpegPath\(\);$/m);
  });
});
