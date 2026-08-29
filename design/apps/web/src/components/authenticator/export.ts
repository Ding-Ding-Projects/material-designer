export interface LocalExportSaver {
  save(filename: string, content: string, mediaType: string): Promise<void> | void;
}

export const browserExportSaver: LocalExportSaver = {
  save(filename, content, mediaType) {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('Local file save is unavailable in this renderer.');
    }
    const blob = new Blob([content], { type: mediaType });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = 'noreferrer';
      anchor.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },
};

export async function saveAuthenticatorExport(saver: LocalExportSaver | undefined, filename: string, content: string): Promise<void> {
  await (saver ?? browserExportSaver).save(filename, content, 'application/json;charset=utf-8');
}
