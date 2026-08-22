export interface DeferredDownloadResult {
  ok: boolean;
  reason?: 'unavailable' | 'failed';
}

/**
 * Start a local text download and revoke its object URL only after the browser
 * has consumed the click. Returning a result lets the caller raise a localized
 * non-blocking notification instead of claiming that a button worked.
 */
export function downloadTextDeferred(
  text: string,
  fileName: string,
  mimeType: string,
): Promise<DeferredDownloadResult> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
  const urlApi = URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  };
  if (!urlApi.createObjectURL) return Promise.resolve({ ok: false, reason: 'unavailable' });
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    url = urlApi.createObjectURL(new Blob([text], { type: mimeType }));
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.position = 'fixed';
    anchor.style.left = '-10000px';
    document.body.appendChild(anchor);
    anchor.click();
    return new Promise((resolve) => {
      const finish = () => {
        if (anchor?.isConnected) anchor.remove();
        if (url) urlApi.revokeObjectURL?.(url);
        resolve({ ok: true });
      };
      const timer = typeof window !== 'undefined'
        ? window.setTimeout(finish, 0)
        : setTimeout(finish, 0);
      void timer;
    });
  } catch {
    if (anchor?.isConnected) anchor.remove();
    if (url) urlApi.revokeObjectURL?.(url);
    return Promise.resolve({ ok: false, reason: 'failed' });
  }
}
