import { useEffect, useMemo, useState } from 'react';
import { getOpenDesignHost, type OpenDesignHostWindowControls } from '@open-design/host';
import { useT } from '../i18n';
import { RemixIcon } from './RemixIcon';
import styles from './WindowTitleBar.module.css';

// The renderer's replacement for the operating system's caption bar, drawn to
// the Material Design 3 contract transcribed in `mockups/open-design-m3`: a
// 40px surface-container strip, one hairline border along the bottom, the
// brand mark, a flexible drag region, and three 46px caption buttons.
//
// It renders only where the operating system draws no caption bar of its own.
// The desktop main process sets `titleBarStyle: "hidden"` on win32 and exposes
// the `windowControls` bridge namespace there and nowhere else, so the two
// halves of the test below are really one question — "is this the frameless
// Windows shell?" — asked in a way that cannot paint dead buttons if either
// half changes. macOS and Linux keep their native chrome and get nothing.
function resolveWindowControls(): OpenDesignHostWindowControls | null {
  const host = getOpenDesignHost();
  if (host == null) return null;
  if (host.client.type !== 'desktop' || host.client.platform !== 'win32') return null;
  return host.windowControls ?? null;
}

export function WindowTitleBar() {
  const t = useT();
  // Resolved once. The preload injects the bridge before any page script runs
  // and never removes it, so re-resolving per render could only churn the
  // subscription effect below.
  const controls = useMemo(() => resolveWindowControls(), []);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (controls == null) return;
    let live = true;
    // Seed from the window's real state rather than assuming restored: a
    // session reopened maximized, or a launch straight into a snap layout,
    // both reach first paint already maximized.
    void controls
      .isMaximized()
      .then((value) => {
        if (live) setMaximized(value);
      })
      .catch(() => {
        // A refused or failed probe leaves the restored glyph in place; the
        // subscription below corrects it on the next real state change.
      });
    // Windows changes the state behind the app's back — a snap layout, Win+Up,
    // a drag off the top edge, a double-clicked drag region — so the glyph has
    // to follow the window rather than the last button press.
    const unsubscribe = controls.subscribeMaximized((value) => {
      if (live) setMaximized(value);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [controls]);

  if (controls == null) return null;

  const minimizeLabel = t('titleBar.minimize');
  // One button, two actions: maximized it restores, restored it maximizes. The
  // accessible name has to say which, or a screen-reader user is told the
  // opposite of what pressing it does.
  const toggleLabel = maximized ? t('titleBar.restore') : t('titleBar.maximize');
  const closeLabel = t('titleBar.close');

  return (
    <div
      className={styles.bar}
      // Stable hook for the shell's row template (`styles/shell.css`), which
      // has to know whether this bar is on screen without repeating the
      // platform test above.
      data-window-title-bar="true"
    >
      {/* The flexible drag region. Double-clicking it toggles maximize, the
          way a native caption bar does; the buttons sit outside it so a
          double-click on Close cannot also maximize the window. */}
      <div
        className={styles.drag}
        onDoubleClick={() => {
          void controls.toggleMaximize();
        }}
      >
        <span className={`${styles.logo} od-brand-glyph`} aria-hidden="true" />
        <span className={styles.name}>{t('app.brand')}</span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          title={minimizeLabel}
          aria-label={minimizeLabel}
          onClick={() => {
            void controls.minimize();
          }}
        >
          <RemixIcon name="subtract-line" size={16} />
        </button>
        <button
          type="button"
          className={styles.button}
          title={toggleLabel}
          aria-label={toggleLabel}
          onClick={() => {
            void controls.toggleMaximize();
          }}
        >
          <RemixIcon name={maximized ? 'checkbox-multiple-blank-line' : 'checkbox-blank-line'} size={15} />
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.close}`}
          title={closeLabel}
          aria-label={closeLabel}
          onClick={() => {
            void controls.close();
          }}
        >
          <RemixIcon name="close-line" size={17} />
        </button>
      </div>
    </div>
  );
}
