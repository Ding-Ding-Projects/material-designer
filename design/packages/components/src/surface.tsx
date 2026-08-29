import { createElement, forwardRef, useEffect, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

import { joinClassNames } from './class-names';
import styles from './surface.module.css';

export type SurfaceLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  level?: SurfaceLevel;
  as?: ElementType;
  interactive?: boolean;
  children: ReactNode;
}

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  { level = 0, as = 'div', interactive = false, className, children, ...props },
  ref,
) {
  return createElement(as, {
    ...props,
    ref,
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
}

/** A painted, viewport-bounded overlay for menus, popovers, and anchored panels. */
export const OverlaySurface = forwardRef<HTMLElement, OverlaySurfaceProps>(function OverlaySurface(
  { onDismiss, closeOnEscape = true, ...props },
  ref,
) {
  useEffect(() => {
    if (!onDismiss || !closeOnEscape) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onDismiss]);

  return <Surface {...props} ref={ref} level={props.level ?? 3} className={joinClassNames(styles.overlay, props.className)} />;
});
