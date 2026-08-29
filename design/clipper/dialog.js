// Small shared dialog primitive for extension-owned surfaces.
//
// It keeps the extension page honest when the host cannot provide the web
// application's React dialog: Escape follows the caller's cancellation route,
// Tab remains inside the surface, and disposal removes every listener.
(function () {
  function focusable(root) {
    return [...root.querySelectorAll('button:not([hidden]):not([disabled]), [href]:not([hidden]), input:not([hidden]):not([disabled])')];
  }

  function mount(root, options = {}) {
    if (!root) return () => {};
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        options.onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable(root);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }

  globalThis.OD_CLIPPER_DIALOG = { mount };
})();
