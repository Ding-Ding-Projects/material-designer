// An ordinary search input, plus one affordance that opens this field's own
// regex builder in a popover anchored beside it.
//
// The field renders the input inside a thin flex host so the affordance sits
// next to it in whatever toolbar the host component already has; the input
// keeps its original class, so every existing style rule that targeted it
// still applies.
//
// The popover is portalled to the body and positioned from the host's rect.
// Anchoring by measurement rather than by `position: absolute` is what lets a
// field inside a modal, a scroll container or an `overflow: hidden` toolbar
// open a builder that is not clipped by its surroundings.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { VisuallyHidden } from '@open-design/components';

import { useT } from '../../i18n';
import { RegexBuilder } from './RegexBuilder';
import type { RegexSearchController } from './useRegexSearch';
import styles from './RegexSearchField.module.css';

const POPOVER_WIDTH = 420;
const VIEWPORT_MARGIN = 12;
const MIN_ROOM_BELOW = 260;

interface Anchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

export interface RegexSearchFieldProps {
  /** This field's own controller. Never share one between two fields. */
  search: RegexSearchController;
  /** Names what the field searches; the builder heading and toggle use it. */
  fieldLabel: string;
  id?: string;
  /** Goes on the `<input>`, so existing selectors keep matching. */
  className?: string;
  /** Goes on the flex host that holds the input and the affordance. */
  hostClassName?: string;
  toggleClassName?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Stable menu/list id for the owning field's result collection. */
  ariaControls?: string;
  /** Optional active result id, used by listbox/menu owners while this field has focus. */
  ariaActiveDescendant?: string;
  testId?: string;
  autoFocus?: boolean;
  spellCheck?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  /** Include the portalled builder in a surrounding modal's focus scope. */
  focusScopeId?: string;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onFocus?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** Additional field-level description (for example a persistent regex error). */
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

export function RegexSearchField({
  search,
  fieldLabel,
  id,
  className,
  hostClassName,
  toggleClassName,
  placeholder,
  ariaLabel,
  ariaControls,
  ariaActiveDescendant,
  testId,
  autoFocus,
  spellCheck = false,
  autoComplete = 'off',
  disabled = false,
  focusScopeId,
  inputRef,
  onFocus,
  onKeyDown,
  ariaDescribedBy,
  ariaInvalid,
}: RegexSearchFieldProps) {
  const t = useT();
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const hostRef = useRef<HTMLSpanElement | null>(null);
  const inputNodeRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const setInputNode = useCallback(
    (node: HTMLInputElement | null) => {
      inputNodeRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host || typeof window === 'undefined') return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2));
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - VIEWPORT_MARGIN;
    // Flip upward only when there is genuinely more room there — a builder
    // that jumps above a field with 250px below it reads as a glitch.
    const placeAbove = below < MIN_ROOM_BELOW && above > below;
    setAnchor({
      left,
      width,
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      // Bounded to the room actually available, and the card scrolls inside
      // that bound rather than hiding whatever did not fit.
      maxHeight: Math.max(1, (placeAbove ? above : below) - 6),
      above: placeAbove,
    });
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) inputNodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onViewportChange = () => measure();
    window.addEventListener('resize', onViewportChange);
    // Capture phase: a field inside a scrolling panel must re-anchor when that
    // panel scrolls, and those scroll events never reach the window otherwise.
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, measure]);

  // Focus the first control inside the builder so a keyboard user lands in it
  // rather than having to tab past the whole page to reach it.
  useEffect(() => {
    if (!open) return;
    const frame = window.setTimeout(() => {
      const first = popoverRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);
    return () => window.clearTimeout(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(hostRef.current?.contains(target) || popoverRef.current?.contains(target));
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  const popoverStyle: CSSProperties = anchor
    ? {
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        width: anchor.width,
        maxHeight: anchor.maxHeight,
        transform: anchor.above ? 'translateY(-100%)' : undefined,
      }
    : { position: 'fixed', top: 0, left: 0, width: POPOVER_WIDTH };

  const regexOn = search.mode === 'regex';

  return (
    <span className={`${styles.host}${hostClassName ? ` ${hostClassName}` : ''}`} ref={hostRef}>
      <input
        ref={setInputNode}
        id={id}
        type="search"
        className={className}
        value={search.query}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-controls={ariaControls}
        aria-activedescendant={ariaActiveDescendant}
        aria-describedby={[
          regexOn ? `${popoverId}-mode` : null,
          ariaDescribedBy ?? null,
        ].filter(Boolean).join(' ') || undefined}
        aria-invalid={ariaInvalid || undefined}
        autoFocus={autoFocus}
        spellCheck={spellCheck}
        autoComplete={autoComplete}
        disabled={disabled}
        data-testid={testId}
        data-regex-mode={search.mode}
        onFocus={onFocus}
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
          }
          onKeyDown?.(event);
        }}
      />

      <button
        ref={toggleRef}
        type="button"
        className={`${styles.toggle}${regexOn ? ` ${styles.toggleActive}` : ''}${
          toggleClassName ? ` ${toggleClassName}` : ''
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popoverId : undefined}
        aria-label={t('regexSearch.toggleAria', { field: fieldLabel })}
        title={
          regexOn ? t('regexSearch.toggleTitleRegex') : t('regexSearch.toggleTitleText')
        }
        data-testid={testId ? `${testId}-regex-toggle` : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close(true);
          else setOpen(true);
        }}
      >
        <span className={styles.toggleGlyph} aria-hidden>
          .*
        </span>
      </button>

      <VisuallyHidden>
        <span id={`${popoverId}-mode`} role="status">
          {regexOn ? t('regexSearch.modeStatusRegex') : t('regexSearch.modeStatusText')}
        </span>
      </VisuallyHidden>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={t('regexBuilder.title')}
              className={styles.popover}
              style={popoverStyle}
              data-focus-scope={focusScopeId}
              data-file-viewer-menu-builder={focusScopeId}
              data-testid={testId ? `${testId}-regex-popover` : undefined}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }}
            >
              <RegexBuilder
                search={search}
                fieldLabel={fieldLabel}
                onClose={() => close(true)}
                testIdPrefix={testId ? `${testId}-regex` : undefined}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
