import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type FormEventHandler,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { joinClassNames } from './class-names';
import styles from './dialog.module.css';

type DialogTag = 'div' | 'form';

type DialogLayout = 'default' | 'sectioned';

export interface DialogProps {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  backdropClassName?: string;
  includeChromeClassName?: boolean;
  id?: string;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  layout?: DialogLayout;
  as?: DialogTag;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  [key: `data-${string}`]: string | number | undefined;
}

/**
 * What counts as reachable by Tab.
 *
 * `:not([disabled])` and the negative-tabindex exclusion matter: a disabled
 * button and an element parked at `tabindex="-1"` are both focusable by
 * script but never by Tab, so treating them as trap boundaries sends focus
 * somewhere the user cannot reach with the key they just pressed.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // Deliberately an attribute test rather than a layout one. `offsetParent`
    // would be the more thorough check in a browser and is always null under
    // jsdom, where every dialog test runs — so a layout-based filter reports
    // "nothing is focusable" in exactly the environment that asserts this
    // behaviour, and the trap would swallow every Tab in the suite.
    (element) => !element.closest('[hidden],[aria-hidden="true"]'),
  );
}

type DialogSectionProps = ComponentPropsWithoutRef<'div'>;

type DialogHeadingProps = ComponentPropsWithoutRef<'h2'>;

type DialogDescriptionProps = ComponentPropsWithoutRef<'p'>;

export function Dialog({
  children,
  onClose,
  className,
  backdropClassName,
  includeChromeClassName = true,
  id,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = false,
  layout = 'default',
  as = 'div',
  onSubmit,
  ...dataAttributes
}: DialogProps) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  // A callback ref rather than a typed object ref, because the surface is a
  // <form> or a <div> depending on `as`, and one ref object cannot be both
  // without a cast that says nothing true.
  const captureSurface = (node: HTMLElement | null) => {
    surfaceRef.current = node;
  };

  useEffect(() => {
    if (!onClose || !closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose]);

  /**
   * Keep Tab inside the dialog, and give focus back when it closes.
   *
   * `aria-modal="true"` below is a promise to assistive technology that the
   * rest of the page is inert. Without this effect that promise was false:
   * Tab walked straight out of the dialog onto the controls behind the
   * backdrop, which are visually obscured and — for a confirmation dialog —
   * are exactly the controls the user was asked to stop and think about.
   *
   * Focus moves to the first tab stop on open rather than staying on
   * whatever opened the dialog, and returns to that opener on close, so a
   * keyboard user is neither dropped at the top of the document nor left
   * where a dialog used to be.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableWithin(surface)[0] ?? surface;
    initial.focus();

    function handleTab(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const surfaceNow = surfaceRef.current;
      if (!surfaceNow) return;

      const stops = focusableWithin(surfaceNow);
      if (stops.length === 0) {
        // Nothing to land on inside, so the only correct destination is the
        // dialog itself; letting Tab escape would break the modal promise.
        event.preventDefault();
        surfaceNow.focus();
        return;
      }

      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      // Focus outside the dialog entirely means something moved it there —
      // pull it back rather than trying to work out where it came from.
      if (!(active instanceof HTMLElement) || !surfaceNow.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      // Only restore if focus is still ours to give back. A dialog that
      // deliberately moved focus elsewhere on close — or one closed by
      // navigating away — must not have it yanked backwards.
      const active = document.activeElement;
      const stillInside =
        active instanceof HTMLElement && surface.contains(active);
      if (opener?.isConnected && (stillInside || active === document.body)) {
        opener.focus();
      }
    };
  }, []);

  const sharedProps = {
    id,
    className: joinClassNames(
      includeChromeClassName ? styles.dialog : undefined,
      includeChromeClassName && layout === 'sectioned' ? styles.dialogSectioned : undefined,
      includeChromeClassName ? 'modal' : undefined,
      className,
    ),
    onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
    role,
    // -1 keeps the surface out of the Tab order while still letting the trap
    // park focus on it when the dialog has no focusable content of its own.
    tabIndex: -1,
    'aria-modal': 'true' as const,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    ...dataAttributes,
  };

  return (
    <div
      className={joinClassNames(
        includeChromeClassName ? styles.backdrop : undefined,
        includeChromeClassName ? 'modal-backdrop' : undefined,
        backdropClassName,
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      {as === 'form' ? (
        <form ref={captureSurface} {...sharedProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div ref={captureSurface} {...sharedProps}>{children}</div>
      )}
    </div>
  );
}

export function DialogHeader({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.header, className)} {...props} />;
}

export function DialogBody({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.body, className)} {...props} />;
}

export function DialogFooter({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.footer, className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogHeadingProps) {
  return <h2 className={joinClassNames(styles.title, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return <p className={joinClassNames(styles.description, className)} {...props} />;
}
