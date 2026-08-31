import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { RegexSearchController } from '../regex/useRegexSearch';
import { useRegexSearch } from '../regex/useRegexSearch';
import { RegexSearchField } from '../regex/RegexSearchField';
import styles from './ConverterSearchableChoice.module.css';

const MAX_OPTIONS = 500;

function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* private preference storage is best effort */ }
}

export function usePersistedConverterSearch(storageKey: string): RegexSearchController {
  const [initial] = useState(() => ({
    mode: readStored(`${storageKey}:mode`) === 'regex' ? 'regex' as const : 'text' as const,
    flags: readStored(`${storageKey}:flags`).slice(0, 6) || undefined,
    sample: readStored(`${storageKey}:sample`).slice(0, 10_000) || undefined,
  }));
  const [query, setQuery] = useState(() => readStored(`${storageKey}:query`));
  const search = useRegexSearch(query, setQuery);
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    search.setMode(initial.mode);
    search.setSample(initial.sample ?? '');
    const desiredFlags = initial.flags ?? search.flags;
    for (const flag of ['g', 'i', 'm', 's', 'u'] as const) {
      if (search.flags.includes(flag) !== desiredFlags.includes(flag)) search.toggleFlag(flag);
    }
  }, [initial, search]);
  useEffect(() => writeStored(`${storageKey}:query`, search.query), [storageKey, search.query]);
  useEffect(() => writeStored(`${storageKey}:mode`, search.mode), [storageKey, search.mode]);
  useEffect(() => writeStored(`${storageKey}:flags`, search.flags), [storageKey, search.flags]);
  useEffect(() => writeStored(`${storageKey}:sample`, search.sample), [storageKey, search.sample]);
  return search;
}

export interface ConverterChoiceOption {
  value: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ConverterSearchableChoiceProps {
  id: string;
  label: string;
  value: string;
  options: readonly ConverterChoiceOption[];
  onChange: (value: string) => void;
  search: RegexSearchController;
  searchLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  testId?: string;
  focusScopeId?: string;
}

/** A native-select replacement with persistent, field-owned regex search. */
export function ConverterSearchableChoice({
  id,
  label,
  value,
  options,
  onChange,
  search,
  searchLabel,
  disabled = false,
  disabledReason,
  testId,
  focusScopeId,
}: ConverterSearchableChoiceProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const visible = options.slice(0, MAX_OPTIONS).filter((option) => search.matches(`${option.label} ${option.value} ${option.disabledReason ?? ''}`));
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const index = visible.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, value, visible]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const scope = focusScopeId ?? id;
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (rootRef.current?.contains(target)) return true;
      return [...document.querySelectorAll<HTMLElement>('[data-focus-scope]')].some((node) => node.getAttribute('data-focus-scope') === scope && node.contains(target));
    };
    const onPointerDown = (event: PointerEvent) => { if (!isInside(event.target)) close(false); };
    const onFocusIn = (event: FocusEvent) => { if (!isInside(event.target)) close(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('focusin', onFocusIn); };
  }, [close, focusScopeId, id, open]);

  const selectActive = useCallback(() => {
    const option = visible[activeIndex];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }, [activeIndex, close, onChange, visible]);

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    }
  };

  return (
    <div ref={rootRef} className={styles.field} data-converter-choice={id} data-focus-scope={focusScopeId}>
      <span className={styles.label} id={`${id}-label`}>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        id={id}
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-disabled={disabled}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        data-testid={testId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKeyDown}
      >
        <span>{(selected?.label ?? value) || 'Choose an option'}</span>
        <span aria-hidden className={styles.chevron}>▾</span>
      </button>
      {open ? (
        <div className={styles.popup} role="dialog" aria-label={`${label} choices`}>
          <RegexSearchField
            search={search}
            fieldLabel={searchLabel}
            ariaLabel={`Search ${searchLabel}`}
            ariaControls={`${id}-listbox`}
            testId={`${testId ?? id}-search`}
            focusScopeId={focusScopeId ?? id}
            autoFocus
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown') return;
              event.preventDefault();
              listRef.current?.focus();
            }}
          />
          <div
            ref={listRef}
            id={`${id}-listbox`}
            className={styles.options}
            role="listbox"
            aria-label={label}
            aria-activedescendant={visible[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) => Math.min(Math.max(visible.length - 1, 0), current + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              } else if (event.key === 'Home') {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                setActiveIndex(Math.max(0, visible.length - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                selectActive();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
              }
            }}
          >
            {visible.length === 0 ? <p className={styles.empty} role="status">No choices match this search.</p> : null}
            {visible.map((option, index) => (
              <button
                key={`${option.value}-${index}`}
                type="button"
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                disabled={option.disabled}
                title={option.disabled ? option.disabledReason : undefined}
                data-active={index === activeIndex}
                className={styles.option}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => { if (!option.disabled) { onChange(option.value); close(true); } }}
              >
                <span>{option.label}</span>
                {option.disabledReason ? <small>{option.disabledReason}</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
