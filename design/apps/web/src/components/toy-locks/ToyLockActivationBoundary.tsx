import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import {
  interceptLockedActivationForRoute,
  type AttemptBudget,
  type LockedActivationResult,
  type LockedTarget,
  type ToyLockActivationSource,
} from '../../security/toy-lock-core';

import styles from './ToyLockActivationBoundary.module.css';

export interface ToyLockActivationBoundaryProps {
  readonly target: LockedTarget;
  readonly budget: AttemptBudget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onRequestAuthentication: (
    result: Extract<LockedActivationResult, { kind: 'authentication-required' | 'attempts-exhausted' }>,
    source: ToyLockActivationSource,
  ) => void;
  readonly onInvoked?: () => void;
  readonly testId?: string;
}

export interface ToyLockActivationBoundaryHandle {
  activate(source?: ToyLockActivationSource): LockedActivationResult;
}

/**
 * Operable wrapper for native controls that cannot receive events once
 * disabled. Capture-phase handlers intercept every input route before a child
 * can invoke its protected action, while the imperative handle covers code
 * paths that would otherwise call the action directly.
 */
export const ToyLockActivationBoundary = forwardRef<
  ToyLockActivationBoundaryHandle,
  ToyLockActivationBoundaryProps
>(function ToyLockActivationBoundary({
  target,
  budget,
  children,
  className,
  onRequestAuthentication,
  onInvoked,
  testId,
}, ref) {
  const recentRequestRef = useRef<{ at: number; source: ToyLockActivationSource } | null>(null);

  const activate = useCallback((source: ToyLockActivationSource): LockedActivationResult => {
    const result = interceptLockedActivationForRoute(target, budget, source, () => onInvoked?.());
    if (result.kind === 'invoked') {
      recentRequestRef.current = null;
      return result;
    }
    const now = Date.now();
    const previous = recentRequestRef.current;
    if (previous == null || now - previous.at > 300) {
      recentRequestRef.current = { at: now, source };
      onRequestAuthentication(result, source);
    }
    return result;
  }, [budget, onInvoked, onRequestAuthentication, target]);

  useImperativeHandle(ref, () => ({
    activate,
  }), [activate]);

  const intercept = useCallback((source: ToyLockActivationSource, event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (!target.locked) return;
    event.preventDefault();
    event.stopPropagation();
    activate(source);
  }, [activate, target.locked]);

  const onClickCapture = (event: ReactMouseEvent<HTMLSpanElement>) => intercept('assistive', event);
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') intercept('keyboard', event);
  };
  const onPointerDownCapture = (event: ReactPointerEvent<HTMLSpanElement>) => intercept('pointer', event);
  const onTouchStartCapture = (event: ReactTouchEvent<HTMLSpanElement>) => intercept('touch', event);

  return (
    <span
      className={`${styles.boundary}${className ? ` ${className}` : ''}`}
      aria-disabled={target.locked || undefined}
      data-toy-lock-locked={target.locked ? 'true' : 'false'}
      data-toy-lock-target={target.targetId}
      data-testid={testId}
      onClickCapture={onClickCapture}
      onKeyDownCapture={onKeyDownCapture}
      onPointerDownCapture={onPointerDownCapture}
      onTouchStartCapture={onTouchStartCapture}
    >
      {children}
    </span>
  );
});
