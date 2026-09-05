export interface AtomicReplaceOperations {
  rename(source: string, destination: string): Promise<void>;
}

export interface AtomicReplaceOptions {
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
}

const transientRenameCodes = new Set(['EPERM', 'EACCES', 'EBUSY']);
const defaultDelay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function replaceFileAtomically(
  operations: AtomicReplaceOperations,
  temporary: string,
  destination: string,
  options: AtomicReplaceOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? 4;
  const delay = options.delay ?? defaultDelay;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operations.rename(temporary, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!transientRenameCodes.has(code ?? '') || attempt === attempts) throw error;
      await delay(attempt * 25);
    }
  }
}
