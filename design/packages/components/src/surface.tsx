import { createContext, createElement, forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode, type RefObject } from 'react';

import { joinClassNames } from './class-names';
import styles from './surface.module.css';

export type SurfaceLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  level?: SurfaceLevel;
  as?: ElementType;
  interactive?: boolean;
  type?: 'button' | 'submit' | 'reset';
  href?: string;
  children?: ReactNode;
}

const NATIVE_INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
interface DetailsOwner {
  id: string;
}

const DetailsOwnerContext = createContext<DetailsOwner | undefined>(undefined);

interface OverlayEntry {
  id: symbol;
  node: HTMLElement | null;
  config: {
    onDismiss?: () => void;
    closeOnEscape: boolean;
    dismissOnOutsidePress: boolean;
    returnFocusRef?: RefObject<HTMLElement>;
  };
  dismissed: boolean;
}

const overlayStack: OverlayEntry[] = [];
let overlayListenersInstalled = false;

function topOverlay(): OverlayEntry | undefined {
  return overlayStack[overlayStack.length - 1];
}

function dismissOverlay(entry: OverlayEntry) {
  if (entry.dismissed || typeof entry.config.onDismiss !== 'function') return false;
  entry.dismissed = true;
  const index = overlayStack.indexOf(entry);
  if (index >= 0) overlayStack.splice(index, 1);
  try {
    entry.config.onDismiss?.();
  } finally {
    entry.config.returnFocusRef?.current?.focus();
  }
  return true;
}

function installOverlayListeners() {
  if (overlayListenersInstalled || typeof document === 'undefined') return;
  document.addEventListener('keydown', overlayKeyDown);
  document.addEventListener('pointerdown', overlayPointerDown);
  overlayListenersInstalled = true;
}

function uninstallOverlayListeners() {
  if (!overlayListenersInstalled || typeof document === 'undefined' || overlayStack.length > 0) return;
  // The handlers are stored on the document by `installOverlayListeners`.
  // Keeping one stable pair avoids one listener per portal and makes the
  // topmost ownership rule observable and deterministic.
  document.removeEventListener('keydown', overlayKeyDown);
  document.removeEventListener('pointerdown', overlayPointerDown);
  overlayListenersInstalled = false;
}

function overlayKeyDown(event: KeyboardEvent) {
  const entry = topOverlay();
  if (!entry || typeof entry.config.onDismiss !== 'function' || !entry.config.closeOnEscape || event.key !== 'Escape') return;
  event.preventDefault();
  dismissOverlay(entry);
}

function overlayPointerDown(event: PointerEvent) {
  const entry = topOverlay();
  if (!entry || typeof entry.config.onDismiss !== 'function' || !entry.config.dismissOnOutsidePress) return;
  const target = event.target;
  if (target instanceof Node && !entry.node?.contains(target)) dismissOverlay(entry);
}

function registerOverlay(entry: OverlayEntry): () => void {
  overlayStack.push(entry);
  installOverlayListeners();
  return () => {
    const index = overlayStack.indexOf(entry);
    if (index >= 0) overlayStack.splice(index, 1);
    uninstallOverlayListeners();
  };
}

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  { level = 0, as = 'div', interactive = false, className, children, type, href, ...props },
  ref,
) {
  if (interactive && (typeof as !== 'string' || !NATIVE_INTERACTIVE_TAGS.has(as))) {
    throw new Error('Surface interactive requires a native interactive element via as');
  }
  if (interactive && as === 'a' && (!href || href.trim().length === 0)) {
    throw new Error('Surface interactive anchors require a non-empty href');
  }
  if ((as === 'input' || as === 'textarea') && children != null) {
    throw new Error(`Surface ${as} cannot receive children`);
  }
  if (as === 'summary') {
    throw new Error('Surface summary requires SummarySurface inside DetailsSurface');
  }
  return createElement(as, {
    ...props,
    ref,
    ...(href ? { href } : {}),
    ...(as === 'button' ? { type: type ?? 'button' } : type ? { type } : {}),
    className: joinClassNames(styles.surface, interactive && styles.interactive, className),
    'data-md-component': 'surface',
    'data-surface-level': level,
  }, children);
});

export type DetailsSurfaceProps = Omit<SurfaceProps, 'as' | 'interactive' | 'type' | 'href'>;

export const DetailsSurface = forwardRef<HTMLDetailsElement, DetailsSurfaceProps>(function DetailsSurface(
  { children, className, ...props },
  ref,
) {
  const ownerId = useId();
  const owner = useRef<DetailsOwner>({ id: ownerId });
  const { detailsOwner: _callerClaim, ...detailsProps } = props as DetailsSurfaceProps & { detailsOwner?: boolean };
  return (
    <details {...detailsProps} ref={ref} className={joinClassNames(styles.surface, className)} data-md-component="details-surface" data-md-details-owner={owner.current.id}>
      <DetailsOwnerContext.Provider value={owner.current}>{children}</DetailsOwnerContext.Provider>
    </details>
  );
});

export type SummarySurfaceProps = Omit<SurfaceProps, 'as' | 'interactive' | 'type' | 'href'>;

export const SummarySurface = forwardRef<HTMLElement, SummarySurfaceProps>(function SummarySurface(
  { children, className, ...props },
  ref,
) {
  const owner = useContext(DetailsOwnerContext);
  if (!owner) throw new Error('SummarySurface requires a mounted DetailsSurface owner');
  const { detailsOwner: _callerClaim, ...summaryProps } = props as SummarySurfaceProps & { detailsOwner?: boolean };
  const localRef = useRef<HTMLElement | null>(null);
  const setRef = (node: HTMLElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  useLayoutEffect(() => {
    const summary = localRef.current;
    const details = summary?.parentElement;
    if (!summary || details?.tagName !== 'DETAILS' || details.dataset.mdDetailsOwner !== owner.id) {
      throw new Error('SummarySurface requires a mounted DetailsSurface owner');
    }
  }, [owner]);
  return createElement('summary', {
    ...summaryProps,
    ref: setRef,
    className: joinClassNames(styles.surface, className),
    'data-md-component': 'summary-surface',
  }, children);
});

export interface StateLayerProps extends HTMLAttributes<HTMLSpanElement> {
  state?: 'hover' | 'focus' | 'pressed' | 'dragged';
}

export function StateLayer({ state = 'hover', className, ...props }: StateLayerProps) {
  return <span {...props} aria-hidden="true" className={joinClassNames(styles.stateLayer, className)} data-state={state} />;
}

export interface OverlaySurfaceProps extends SurfaceProps {
  onDismiss?: () => void;
  closeOnEscape?: boolean;
  /** Outside pointer dismissal is opt-in so anchored panels stay open by default. */
  dismissOnOutsidePress?: boolean;
  /** Returns focus to the opener after Escape or outside dismissal. */
  returnFocusRef?: RefObject<HTMLElement>;
}

/** A painted, viewport-bounded overlay for menus, popovers, and anchored panels. */
export const OverlaySurface = forwardRef<HTMLElement, OverlaySurfaceProps>(function OverlaySurface(
  {
    onDismiss,
    closeOnEscape = true,
    dismissOnOutsidePress = false,
    returnFocusRef,
    ...props
  },
  ref,
) {
  const localRef = useRef<HTMLElement | null>(null);
  const overlayId = useRef(Symbol('overlay'));
  const initialConfig: OverlayEntry['config'] = {
    closeOnEscape,
    dismissOnOutsidePress,
  };
  if (onDismiss) initialConfig.onDismiss = onDismiss;
  if (returnFocusRef) initialConfig.returnFocusRef = returnFocusRef;
  const configRef = useRef<OverlayEntry['config']>(initialConfig);
  Object.assign(configRef.current, { onDismiss, closeOnEscape, dismissOnOutsidePress, returnFocusRef });
  const setRef = (node: HTMLElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    const entry: OverlayEntry = {
      id: overlayId.current,
      get node() { return localRef.current; },
      config: configRef.current,
      dismissed: false,
    };
    return registerOverlay(entry);
  }, []);

  return <Surface {...props} ref={setRef} level={props.level ?? 3} className={joinClassNames(styles.overlay, props.className)} />;
});
