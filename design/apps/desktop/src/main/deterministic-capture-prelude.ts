import {
  validateDeterministicParityCaptureRunId,
  type DeterministicParityRoute,
} from "./deterministic-parity-route.js";

/**
 * Build the capture-only document prelude without touching application-owned
 * storage. The route tuple and run id are read-only renderer inputs; ordinary
 * profile bytes remain exactly where the application found them.
 */
export function deterministicCapturePrelude(
  route: DeterministicParityRoute,
  runId: string,
): string {
  const tuple = JSON.stringify(route.tuple);
  const validatedRunId = validateDeterministicParityCaptureRunId(runId);
  return `(() => {
    const tuple = Object.freeze(${tuple});
    const epoch = Date.parse(tuple.time);
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [epoch])); }
      static now() { return epoch; }
    }
    Object.defineProperty(globalThis, "Date", { value: FrozenDate, configurable: false, writable: false });
    let randomState = tuple.randomSeed >>> 0;
    const seededRandom = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    Object.defineProperty(Math, "random", { value: seededRandom, configurable: false, writable: false });
    Object.defineProperty(globalThis, "__MATERIAL_DESIGNER_CAPTURE_TUPLE__", {
      value: tuple,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(globalThis, "__MATERIAL_DESIGNER_CAPTURE_RUN_ID__", {
      value: ${JSON.stringify(validatedRunId)},
      configurable: false,
      writable: false,
    });
    const root = document.documentElement;
    const mark = () => {
      if (!document.documentElement) return;
      document.documentElement.dataset.odParityRouteId = ${JSON.stringify(route.id)};
      root.setAttribute("data-theme", tuple.theme);
      const style = document.createElement("style");
      style.id = "material-designer-deterministic-motion";
      style.textContent = "*,*::before,*::after{animation-delay:-99999s!important;animation-duration:.001s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;transition-duration:0s!important;scroll-behavior:auto!important}";
      document.documentElement.appendChild(style);
    };
    if (root) mark(); else document.addEventListener("DOMContentLoaded", mark, { once: true });
    // Capture must not mutate ordinary user storage. The route and run id are
    // exposed through non-writable globals; the real app remains responsible
    // for rendering its own route and no prior profile bytes are rewritten.
  })();`;
}
