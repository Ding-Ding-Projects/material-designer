// Accessible select primitive with a field-owned filter.
//
// The filter stays plain text until regex is explicitly enabled. Its
// RegexSearchField owns the query, flags, validation, and anchored builder, so
// every select instance remains isolated from every other one.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './Icon';
import { RegexSearchField, useRegexSearch } from './regex';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Explains why a disabled trigger cannot open its surface. */
  disabledReason?: string;
  /** A locked trigger remains an unlock target through its operable wrapper. */
  locked?: boolean;
  onLockedActivate?: () => void;
  lockedReason: string;
}

export interface CustomSelectGroup {
  label: string;
  options: CustomSelectOption[];
}

export type CustomSelectItem = CustomSelectOption | CustomSelectGroup;

export interface CustomSelectProps {
  value: string;
  options: CustomSelectItem[];
  onChange: (value: string) => void;
  ariaLabel: string;
  labelledBy?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  portal?: boolean;
  title?: string;
  onFocus?: () => void;
  testId?: string;
  /** Text and accessible label for this select instance's local filter. */
  searchLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  resultCountLabel: (count: number) => string;
  /** Optional target-specific context-menu handoff for the trigger. */
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Stable caller-owned id. Duplicate ids are reported and marked. */
  ownerId?: string;
}

interface FlatOption extends CustomSelectOption {
  group?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function isGroup(item: CustomSelectItem): item is CustomSelectGroup {
  return 'options' in item;
}

function flattenOptions(items: CustomSelectItem[]): FlatOption[] {
  return items.flatMap((item) =>
    isGroup(item)
      ? item.options.map((option) => ({ ...option, group: item.label }))
      : [item],
  );
}

function isOwnedRegexSurface(target: EventTarget | null, ownerId: string): boolean {
  if (!(target instanceof Element)) return false;
  const owner = target.closest('[data-regex-owner]');
  return owner?.getAttribute('data-regex-owner') === `${ownerId}-filter`;
}

export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  className,
  triggerClassName,
  menuClassName,
  disabled = false,
  disabledReason,
  locked = false,
  onLockedActivate,
  lockedReason,
  placeholder,
  portal = true,
  title,
  onFocus,
  ownerId,
  testId,
  searchLabel,
  searchPlaceholder,
  noResultsLabel,
  resultCountLabel,
  onContextMenu,
}: CustomSelectProps) {
  const reactId = useId();
  const idBase = reactId.replace(/:/g, '');
  const resolvedOwnerId = ownerId ?? testId ?? idBase;
  const domOwnerId = resolvedOwnerId.replace(/[^A-Za-z0-9_-]/g, '-');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const activeSourceValueRef = useRef(value);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [duplicateOwner, setDuplicateOwner] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);

  const flatOptions = useMemo(() => flattenOptions(options), [options]);
  const selected = flatOptions.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder ?? value;
  const visibleOptions = useMemo(
    () => flatOptions.filter((option) =>
      search.matches(`${option.label}\n${option.value}\n${option.group ?? ''}`),
    ),
    [flatOptions, search.matches],
  );
  const enabledOptions = useMemo(
    () => visibleOptions.filter((option) => !option.disabled),
    [visibleOptions],
  );
  const flatOptionsRef = useRef(flatOptions);
  const enabledOptionsRef = useRef(enabledOptions);
  flatOptionsRef.current = flatOptions;
  enabledOptionsRef.current = enabledOptions;
  const duplicateOptionValues = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const option of flatOptions) {
      if (seen.has(option.value)) duplicates.add(option.value);
      seen.add(option.value);
    }
    return duplicates;
  }, [flatOptions]);
  const optionIdByValue = useMemo(
    () => new Map(flatOptions.map((option, index) => [option.value, `${domOwnerId}-option-${index}`])),
    [domOwnerId, flatOptions],
  );
  const activeOptionId = open && activeValue ? optionIdByValue.get(activeValue) : undefined;

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 4;
    const viewportPad = 12;
    const below = window.innerHeight - rect.bottom - viewportPad;
    const above = rect.top - viewportPad;
    const available = Math.max(1, Math.max(below, above) - gap);
    const maxHeight = Math.min(360, available);
    const openAbove = below < Math.min(220, available) && above > below;
    setPosition({
      top: openAbove ? Math.max(viewportPad, rect.top - maxHeight - gap) : rect.bottom + gap,
      left: Math.min(
        Math.max(viewportPad, rect.left),
        Math.max(viewportPad, window.innerWidth - rect.width - viewportPad),
      ),
      width: rect.width,
      maxHeight,
    });
  }, []);

  const restoreFocus = useCallback(() => {
    if (!buttonRef.current?.isConnected) return;
    buttonRef.current.focus({ preventScroll: true });
  }, []);

  const closeMenu = useCallback((shouldRestoreFocus = true) => {
    setOpen(false);
    setQuery('');
    if (shouldRestoreFocus) restoreFocus();
  }, [restoreFocus]);

  const activateLocked = useCallback(() => {
    if (!locked) return false;
    onLockedActivate?.();
    return true;
  }, [locked, onLockedActivate]);

  useEffect(() => {
    if (!portal) return;
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, portal, updatePosition]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      activeSourceValueRef.current = value;
      return;
    }
    if (wasOpenRef.current && activeSourceValueRef.current === value) return;
    const selectedOption = flatOptionsRef.current.find(
      (option) => option.value === value && !option.disabled,
    );
    setActiveValue(selectedOption?.value ?? enabledOptionsRef.current[0]?.value ?? '');
    wasOpenRef.current = true;
    activeSourceValueRef.current = value;
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    if (enabledOptions.some((option) => option.value === activeValue)) return;
    setActiveValue(enabledOptions[0]?.value ?? '');
  }, [activeValue, enabledOptions, open]);

  useEffect(() => {
    if (locked && open) {
      setOpen(false);
      setQuery('');
    }
  }, [locked, open]);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    const active = document.getElementById(activeOptionId);
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId, open]);

  useEffect(() => {
    const matches = Array.from(document.querySelectorAll<HTMLElement>('[data-select-owner]'))
      .filter((node) => node.getAttribute('data-select-owner') === resolvedOwnerId);
    setDuplicateOwner(matches.length > 1);
    if (matches.length > 1) console.error(`Duplicate select owner id: ${resolvedOwnerId}`);
  }, [resolvedOwnerId]);

  useEffect(() => {
    if (duplicateOptionValues.size > 0) {
      console.error(`Duplicate select option values: ${Array.from(duplicateOptionValues).join(',')}`);
    }
  }, [duplicateOptionValues]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (buttonRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      if (isOwnedRegexSurface(target, domOwnerId)) return;
      const opensAnotherSelect = target instanceof Element
        && target.closest('[data-dropdown-opener]') != null;
      closeMenu(!opensAnotherSelect);
    };
    const onScrollOrResize = () => {
      if (portal) updatePosition();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [closeMenu, domOwnerId, open, portal, updatePosition]);

  const choose = useCallback((nextValue: string) => {
    const next = flatOptions.find((option) => option.value === nextValue);
    if (!next || next.disabled) return;
    onChange(next.value);
    closeMenu(true);
  }, [closeMenu, flatOptions, onChange]);

  const moveActive = useCallback((direction: 1 | -1, edge?: 'first' | 'last') => {
    if (!enabledOptions.length) return;
    if (edge === 'first') {
      setActiveValue(enabledOptions[0]!.value);
      return;
    }
    if (edge === 'last') {
      setActiveValue(enabledOptions[enabledOptions.length - 1]!.value);
      return;
    }
    const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    setActiveValue(enabledOptions[nextIndex]!.value);
  }, [activeValue, enabledOptions]);

  const onSearchKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveActive(1, 'first');
    } else if (event.key === 'End') {
      event.preventDefault();
      moveActive(-1, 'last');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeValue);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
    }
  }, [activeValue, choose, closeMenu, moveActive]);

  const menu = (
    <div
      ref={menuRef}
      id={`${domOwnerId}-menu`}
      className={[
        'od-select-menu',
        portal ? 'portal' : 'inline',
        menuClassName,
      ].filter(Boolean).join(' ')}
      role="listbox"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeOptionId}
      style={
        portal && position
          ? {
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }
          : undefined
      }
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="od-select-search" role="none">
        <RegexSearchField
          search={search}
          fieldLabel={searchLabel}
          ariaLabel={searchLabel}
          ariaControls={`${domOwnerId}-options`}
          ariaActiveDescendant={activeOptionId}
          fieldId={`${resolvedOwnerId}-filter`}
          placeholder={searchPlaceholder}
          testId={testId ? `${testId}-filter` : undefined}
          focusScopeId={`${domOwnerId}-filter`}
          popoverZIndex={10000}
          autoFocus
          onKeyDown={onSearchKeyDown}
        />
        <span className="od-select-result-count" role="status" aria-live="polite">
          {resultCountLabel(visibleOptions.length)}
        </span>
      </div>
      <div id={`${domOwnerId}-options`} className="od-select-options" role="none">
        {visibleOptions.length === 0 ? (
          <div className="od-select-no-results" role="status" data-testid={testId ? `${testId}-no-results` : undefined}>
            {noResultsLabel}
          </div>
        ) : options.map((item) => {
          if (isGroup(item)) {
            const groupOptions = item.options.filter((option) =>
              visibleOptions.some((visible) => visible.value === option.value),
            );
            if (groupOptions.length === 0) return null;
            return (
              <div className="od-select-group" key={`group:${item.label}`}>
                <div className="od-select-group-label">{item.label}</div>
                {groupOptions.map((option) => (
                  <SelectOptionButton
                    key={option.value}
                    option={option}
                    selected={option.value === value}
                    active={option.value === activeValue}
                    id={optionIdByValue.get(option.value)}
                    onChoose={choose}
                    onActive={setActiveValue}
                  />
                ))}
              </div>
            );
          }
          if (!visibleOptions.some((visible) => visible.value === item.value)) return null;
          return (
            <SelectOptionButton
              key={item.value}
              option={item}
              selected={item.value === value}
              active={item.value === activeValue}
              id={optionIdByValue.get(item.value)}
              onChoose={choose}
              onActive={setActiveValue}
            />
          );
        })}
      </div>
    </div>
  );

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (activateLocked()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' && open) {
      event.preventDefault();
      moveActive(1, 'first');
      return;
    }
    if (event.key === 'End' && open) {
      event.preventDefault();
      moveActive(-1, 'last');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(activeValue || value);
      else setOpen(true);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  };

  const trigger = (
      <button
        ref={buttonRef}
        type="button"
        className={['od-select-trigger', triggerClassName].filter(Boolean).join(' ')}
        role="combobox"
        value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${domOwnerId}-menu`}
        aria-activedescendant={activeOptionId}
        aria-describedby={labelledBy}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        disabled={disabled || locked}
        aria-disabled={disabled || locked || undefined}
        title={locked ? lockedReason : disabled ? disabledReason ?? title : title}
        data-testid={testId}
        data-dropdown-opener="true"
        data-select-owner={resolvedOwnerId}
        data-owner-duplicate={duplicateOwner || undefined}
        onClick={() => {
          if (activateLocked()) return;
          if (open) closeMenu(true);
          else setOpen(true);
        }}
        onContextMenu={onContextMenu}
        onKeyDown={onButtonKeyDown}
        onFocus={onFocus}
      >
        <span id={`${idBase}-value`} className="od-select-value">
          {selectedLabel}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
  );

  return (
    <div
      className={['od-select', className].filter(Boolean).join(' ')}
      data-locked={locked || undefined}
      data-option-duplicate={duplicateOptionValues.size > 0 || undefined}
    >
      {locked ? (
        <span
          className="od-select-locked-wrapper"
          role="button"
          tabIndex={0}
          aria-label={`${ariaLabel}: locked`}
          aria-disabled="true"
          title={lockedReason}
          onPointerDown={(event) => {
            event.preventDefault();
            activateLocked();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activateLocked();
          }}
        >
          {trigger}
        </span>
      ) : trigger}
      {open ? (portal ? (position ? createPortal(menu, document.body) : null) : menu) : null}
    </div>
  );
}

function SelectOptionButton({
  option,
  selected,
  active,
  id,
  onChoose,
  onActive,
}: {
  option: CustomSelectOption;
  selected: boolean;
  active: boolean;
  id?: string;
  onChoose: (value: string) => void;
  onActive: (value: string) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      className={[
        'od-select-option',
        selected ? 'selected' : '',
        active ? 'active' : '',
      ].filter(Boolean).join(' ')}
      role="option"
      aria-selected={selected}
      data-option-value={option.value}
      tabIndex={-1}
      disabled={option.disabled}
      onMouseEnter={() => onActive(option.value)}
      onClick={() => onChoose(option.value)}
    >
      <span className="od-select-option-label">{option.label}</span>
      <span className="od-select-option-check" aria-hidden>
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}
