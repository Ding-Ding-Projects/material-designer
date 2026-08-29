import { createElement, forwardRef, useEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode, type RefObject } from 'react';

import { joinClassNames } from './class-names';
import styles from './surface.module.css';

export type SurfaceLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  level?: SurfaceLevel;
  as?: ElementType;
  interactive?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children: ReactNode;
}

const NATIVE_INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  { level = 0, as = 'div', interactive = false, className, children, type, ...props },
  ref,
) {
  if (interactive && (typeof as !== 'string' || !NATIVE_INTERACTIVE_TAGS.has(as))) {
    throw new Error('Surface interactive requires a native interactive element via as');
  }
  return createElement(as, {
    ...props,
    ref,
    ...(as === 'button' ? { type: type ?? 'button' } : type ? { type } : {}),
    className: joinClassNames(styles.surface, interactive && styles.interactive, className),
    'data-md-component': 'surface',
    'data-surface-level': level,
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
  const setRef = (node: HTMLElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    if (!onDismiss || (!closeOnEscape && !dismissOnOutsidePress)) return;
    const dismiss = () => {
      onDismiss();
      returnFocusRef?.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape') return;
      event.preventDefault();
      dismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!dismissOnOutsidePress) return;
      const target = event.target;
      if (target instanceof Node && !localRef.current?.contains(target)) dismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeOnEscape, dismissOnOutsidePress, onDismiss, returnFocusRef]);

  return <Surface {...props} ref={setRef} level={props.level ?? 3} className={joinClassNames(styles.overlay, props.className)} />;
});
