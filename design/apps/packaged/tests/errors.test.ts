import { describe, expect, it } from "vitest";

import { describeStartupFailure, PackagedPathAccessError } from "../src/errors.js";

describe("describeStartupFailure", () => {
  it("keeps a path-access message exactly as written", () => {
    const error = new PackagedPathAccessError("The data folder is read-only.");
    expect(describeStartupFailure(error)).toBe("The data folder is read-only.");
  });

  it("prefixes any other fatal startup failure", () => {
    const text = describeStartupFailure(new Error("daemon exited before reporting status"));
    expect(text).toContain("Material Designer failed to start.");
    expect(text).toContain("daemon exited before reporting status");
  });

  it("keeps a thrown string", () => {
    expect(describeStartupFailure("Could not find ffmpeg executable")).toContain(
      "Could not find ffmpeg executable",
    );
  });

  it("never renders an empty box", () => {
    expect(describeStartupFailure({})).toBe(
      "Material Designer failed to start and reported no details.",
    );
    expect(describeStartupFailure(new Error("   "))).toBe(
      "Material Designer failed to start and reported no details.",
    );
  });
});
