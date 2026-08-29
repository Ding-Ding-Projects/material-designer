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
  readonly id?: string;
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export interface CustomSelectGroup {
  readonly id?: string;
  readonly label: string;
  readonly options: readonly CustomSelectOption[];
}

export type CustomSelectItem = CustomSelectOption | CustomSelectGroup;

export type LockedActivationInput = 'pointer' | 'keyboard' | 'programmatic';
export type LockedActivationReceiptPhase = 'requested' | 'opened' | 'completed' | 'cancelled';

export interface LockedActivationRequest {
  readonly targetId: string;
  readonly input: LockedActivationInput;
}

export interface LockedActivationReceipt {
  readonly targetId: string;
  readonly phase: LockedActivationReceiptPhase;
}

export interface CustomSelectProps {
  value: string;
  options: readonly CustomSelectItem[];
  onChange: (value: string) => void;
  ariaLabel: string;
  labelledBy?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  /** Explains why a disabled trigger cannot open its surface. */
  disabledReason?: string;
  /** A locked trigger remains an unlock target through its operable wrapper. */
  locked?: boolean;
  onLockedActivate: (request: LockedActivationRequest) => LockedActivationReceipt;
  lockedReason: string;
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
  duplicateOptionLabel: string;
  disabledOptionLabel: string;
  /** Optional target-specific context-menu handoff for the trigger. */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  /** Stable caller-owned id. Duplicate ids are reported and marked. */
  ownerId?: string;
}

interface FlatOption extends CustomSelectOption {
  group?: string;
  sourceKey: string;
  stableId: string;
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

function flattenOptions(items: readonly CustomSelectItem[]): FlatOption[] {
  return items.flatMap((item, itemIndex) => {
    if (isGroup(item)) {
      return item.options.map((option, optionIndex) => ({
        ...option,
        group: item.label,
        sourceKey: `group-${itemIndex}-${optionIndex}`,
        stableId: option.id ?? option.value,
      }));
    }
    return [{
      ...item,
      sourceKey: `item-${itemIndex}`,
      stableId: item.id ?? item.value,
    }];
  });
}

function isOwnedRegexSurface(target: EventTarget | null, ownerId: string): boolean {
  if (!(target instanceof Element)) return false;
  const owner = target.closest('[data-regex-owner]');
  return owner?.getAttribute('data-regex-owner') === `${ownerId}-filter`;
}

function hasDuplicateOwnerId(ownerId: string): boolean {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-select-owner]'))
    .filter((node) => node.getAttribute('data-select-owner') === ownerId).length > 1;
}

function hasDuplicateDomOwnerId(domOwnerId: string): boolean {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-select-dom-owner]'))
    .filter((node) => node.getAttribute('data-select-dom-owner') === domOwnerId).length > 1;
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
  duplicateOptionLabel,
  disabledOptionLabel,
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
  const ownerIdentityCollision = duplicateOwner
    || hasDuplicateOwnerId(resolvedOwnerId)
    || hasDuplicateDomOwnerId(domOwnerId);
  const lockedActivationFromKeyRef = useRef(false);
  const pointerActivationRef = useRef(false);
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
  const flatOptionsRef = useRef(flatOptions);
  flatOptionsRef.current = flatOptions;
  const duplicateOptionValues = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const option of flatOptions) {
      if (seen.has(option.value)) duplicates.add(option.value);
      seen.add(option.value);
    }
    return duplicates;
  }, [flatOptions]);
  const duplicateOptionIds = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const option of flatOptions) {
      if (seen.has(option.stableId)) duplicates.add(option.stableId);
      seen.add(option.stableId);
    }
    return duplicates;
  }, [flatOptions]);
  const duplicateOptionDomIds = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const option of flatOptions) {
      const domId = option.stableId.replace(/[^A-Za-z0-9_-]/g, '-');
      if (seen.has(domId)) duplicates.add(domId);
      seen.add(domId);
    }
    return duplicates;
  }, [flatOptions]);
  const invalidOptionValues = useMemo(
    () => new Set([...duplicateOptionValues, ...duplicateOptionIds, ...duplicateOptionDomIds]),
    [duplicateOptionDomIds, duplicateOptionIds, duplicateOptionValues],
  );
  const isInvalidOption = useCallback(
    (option: FlatOption) => duplicateOptionValues.has(option.value)
      || duplicateOptionIds.has(option.stableId)
      || duplicateOptionDomIds.has(option.stableId.replace(/[^A-Za-z0-9_-]/g, '-')),
    [duplicateOptionDomIds, duplicateOptionIds, duplicateOptionValues],
  );
  const enabledOptions = useMemo(
    () => visibleOptions.filter((option) =>
      !option.disabled && !isInvalidOption(option),
    ),
    [isInvalidOption, visibleOptions],
  );
  const enabledOptionsRef = useRef(enabledOptions);
  enabledOptionsRef.current = enabledOptions;
  const optionIdBySourceKey = useMemo(
    () => new Map(flatOptions.map((option, index) => [
      option.sourceKey,
      `${domOwnerId}-option-${option.stableId.replace(/[^A-Za-z0-9_-]/g, '-')}${isInvalidOption(option) ? `-${index}` : ''}`,
    ])),
    [domOwnerId, flatOptions, isInvalidOption],
  );
  const optionBySourceKey = useMemo(
    () => new Map(flatOptions.map((option) => [option.sourceKey, option])),
    [flatOptions],
  );
  const activeFlatOption = enabledOptions.find((option) => option.value === activeValue);
  const activeOptionId = open && activeFlatOption
    ? optionIdBySourceKey.get(activeFlatOption.sourceKey)
    : undefined;

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
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const left = window.innerWidth <= viewportPad * 2 + 1
      ? Math.max(0, Math.min(rect.left, maxLeft))
      : Math.min(
        Math.max(viewportPad, rect.left),
        Math.max(viewportPad, maxLeft - viewportPad),
      );
    const rawTop = openAbove ? rect.top - maxHeight - gap : rect.bottom + gap;
    const maxTop = Math.max(0, window.innerHeight - maxHeight);
    const top = window.innerHeight <= viewportPad * 2 + 1
      ? Math.max(0, Math.min(rawTop, maxTop))
      : Math.max(viewportPad, Math.min(rawTop, Math.max(viewportPad, maxTop - viewportPad)));
    setPosition({
      top,
      left,
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

  const activateLocked = useCallback((input: LockedActivationInput) => {
    if (!locked || ownerIdentityCollision) return false;
    let receipt: LockedActivationReceipt;
    try {
      receipt = onLockedActivate({ targetId: resolvedOwnerId, input });
    } catch {
      console.error('Locked select activation was refused.');
      return false;
    }
    if (!receipt || receipt.targetId !== resolvedOwnerId
      || !['requested', 'opened', 'completed', 'cancelled'].includes(receipt.phase)) {
      console.error('Locked select activation did not return a valid lifecycle receipt.');
      return false;
    }
    return receipt.phase === 'opened' || receipt.phase === 'completed';
  }, [locked, onLockedActivate, ownerIdentityCollision, resolvedOwnerId]);

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
    const domMatches = Array.from(document.querySelectorAll<HTMLElement>('[data-select-dom-owner]'))
      .filter((node) => node.getAttribute('data-select-dom-owner') === domOwnerId);
    const collision = matches.length > 1 || domMatches.length > 1;
    setDuplicateOwner(collision);
    if (collision) console.error('Duplicate select owner identity was refused.');
  }, [domOwnerId, resolvedOwnerId]);

  useEffect(() => {
    if (invalidOptionValues.size > 0) {
      console.error('Duplicate select options were refused before activation.');
    }
  }, [invalidOptionValues]);

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
    if (ownerIdentityCollision
      || !next || next.disabled || isInvalidOption(next)) return;
    onChange(next.value);
    closeMenu(true);
  }, [closeMenu, flatOptions, isInvalidOption, onChange, ownerIdentityCollision]);

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
        ) : options.map((item, itemIndex) => {
          if (isGroup(item)) {
            const groupOptions = item.options
              .map((option, optionIndex) => optionBySourceKey.get(`group-${itemIndex}-${optionIndex}`))
              .filter((option): option is FlatOption => Boolean(option))
              .filter((option) => visibleOptions.some((visible) => visible.sourceKey === option.sourceKey));
            if (groupOptions.length === 0) return null;
            return (
              <div className="od-select-group" key={`group:${item.id ?? item.label}:${itemIndex}`}>
                <div className="od-select-group-label">{item.label}</div>
                {groupOptions.map((option) => (
                  <SelectOptionButton
                    key={option.sourceKey}
                    option={option}
                    selected={option.value === value}
                    active={option.value === activeValue}
                    invalid={isInvalidOption(option)}
                    invalidReason={duplicateOptionLabel}
                    disabledReason={disabledOptionLabel}
                    id={optionIdBySourceKey.get(option.sourceKey)}
                    onChoose={choose}
                    onActive={setActiveValue}
                  />
                ))}
              </div>
            );
          }
          const option = optionBySourceKey.get(`item-${itemIndex}`);
          if (!option || !visibleOptions.some((visible) => visible.sourceKey === option.sourceKey)) return null;
          return (
            <SelectOptionButton
              key={option.sourceKey}
              option={option}
              selected={option.value === value}
              active={option.value === activeValue}
              invalid={isInvalidOption(option)}
              invalidReason={duplicateOptionLabel}
              disabledReason={disabledOptionLabel}
              id={optionIdBySourceKey.get(option.sourceKey)}
              onChoose={choose}
              onActive={setActiveValue}
            />
          );
        })}
      </div>
    </div>
  );

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (ownerIdentityCollision) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (activateLocked('keyboard')) {
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
        aria-labelledby={labelledBy}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        disabled={disabled || locked}
        aria-disabled={disabled || locked || undefined}
        title={locked ? lockedReason : disabled ? disabledReason ?? title : title}
        data-testid={testId}
        data-dropdown-opener="true"
        data-select-owner={resolvedOwnerId}
        data-owner-duplicate={ownerIdentityCollision || undefined}
        data-select-dom-owner={domOwnerId}
        data-option-duplicate={invalidOptionValues.size > 0 || undefined}
        onClick={() => {
          if (ownerIdentityCollision) return;
          if (locked && activateLocked('programmatic')) return;
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
      data-option-duplicate={invalidOptionValues.size > 0 || undefined}
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
            pointerActivationRef.current = true;
          }}
          onClick={() => {
            if (lockedActivationFromKeyRef.current) {
              lockedActivationFromKeyRef.current = false;
              return;
            }
            const input = pointerActivationRef.current ? 'pointer' : 'programmatic';
            pointerActivationRef.current = false;
            activateLocked(input);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pointerActivationRef.current = false;
            lockedActivationFromKeyRef.current = true;
            activateLocked('keyboard');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            if (activateLocked('programmatic')) onContextMenu?.(event);
          }}
        >
          {trigger}
        </span>
      ) : trigger}
      {(locked || (disabled && disabledReason)) ? (
        <span className="od-select-disabled-reason">
          {locked ? lockedReason : disabledReason}
        </span>
      ) : null}
      {open ? (portal ? (position ? createPortal(menu, document.body) : null) : menu) : null}
    </div>
  );
}

function SelectOptionButton({
  option,
  selected,
  active,
  invalid,
  invalidReason,
  disabledReason,
  id,
  onChoose,
  onActive,
}: {
  option: CustomSelectOption;
  selected: boolean;
  active: boolean;
  invalid: boolean;
  invalidReason: string;
  disabledReason: string;
  id?: string;
  onChoose: (value: string) => void;
  onActive: (value: string) => void;
}) {
  const reason = invalid
    ? invalidReason
    : option.disabled
      ? option.disabledReason ?? disabledReason
      : undefined;
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
      disabled={option.disabled || invalid}
      title={reason}
      aria-label={reason ? `${option.label}: ${reason}` : option.label}
      onMouseEnter={() => onActive(option.value)}
      onClick={() => onChoose(option.value)}
    >
      <span className="od-select-option-label">
        {option.label}
        {invalid ? <span className="od-select-option-reason"> ({invalidReason})</span> : null}
        {!invalid && option.disabled ? <span className="od-select-option-reason"> ({option.disabledReason ?? disabledReason})</span> : null}
      </span>
      <span className="od-select-option-check" aria-hidden>
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}
