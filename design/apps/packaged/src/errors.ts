export class PackagedPathAccessError extends Error {
  readonly title: string;

  constructor(message: string, options?: { cause?: unknown; title?: string }) {
    super(message, options);
    this.name = "PackagedPathAccessError";
    this.title = options?.title ?? "Material Designer cannot access its data folder";
  }
}

/**
 * User-facing text for a fatal startup failure. Keeps whatever the failure
 * already says (sidecar failures name their own log file) and never renders an
 * empty box for a thrown non-Error value.
 */
export function describeStartupFailure(error: unknown): string {
  const detail = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";
  if (detail.length === 0) {
    return "Material Designer failed to start and reported no details.";
  }
  if (error instanceof PackagedPathAccessError) return detail;
  return `Material Designer failed to start.

${detail}`;
}
