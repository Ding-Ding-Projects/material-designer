// Accessible select primitive with a field-owned filter.
//
// The filter stays plain text until regex is explicitly enabled. Its
// RegexSearchField owns the query, flags, validation, and anchored builder, so
// every select instance remains isolated from every other one.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
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

export type LockedActivationInput = 'pointer' | 'keyboard' | 'programmatic' | 'context';
export type LockedActivationReceiptPhase = 'requested' | 'opened' | 'completed' | 'cancelled';

export interface LockedActivationRequest {
  targetId: string;
  input: LockedActivationInput;
}

export interface LockedActivationReceipt {
  targetId: string;
  phase: LockedActivationReceiptPhase;
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
  disabledReason?: string;
  locked?: boolean;
  lockedReason?: string;
  onLockedActivate?: (request: LockedActivationRequest) => LockedActivationReceipt;
  placeholder?: string;
  portal?: boolean;
  title?: string;
  onFocus?: () => void;
  testId?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  resultCountLabel?: (count: number) => string;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}

interface FlatOption extends CustomSelectOption {
  group?: string;
  sourceKey: string;
  stableId: string;
}

interface MenuPosition {
  top?: number;
  bottom?: number;
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

function eventBelongsToOwnedBuilder(event: Event, portalRoot: HTMLElement | null): boolean {
  if (!portalRoot) return false;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const candidates = path.length > 0 ? path : [event.target];
  return candidates.some((candidate) => candidate === portalRoot
    || (candidate instanceof Node && portalRoot.contains(candidate)));
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
  lockedReason = 'This control is locked.',
  onLockedActivate,
  placeholder,
  portal = true,
  title,
  onFocus,
  testId,
  searchLabel = `${ariaLabel} options`,
  searchPlaceholder = 'Filter options',
  noResultsLabel = 'No options match this filter.',
  resultCountLabel = (count) => `${count} options`,
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
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const resolvedOwnerId = testId ?? idBase;
  const builderPortalRootRef = useRef<HTMLDivElement | null>(null);
  const lockedPointerActivation = useRef(false);

  const registerBuilderPortal = useCallback((node: HTMLDivElement | null) => {
    builderPortalRootRef.current = node;
  }, []);

  const flatOptions = useMemo(() => flattenOptions(options), [options]);
  const selected = flatOptions.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder ?? value;
  const visibleOptions = useMemo(
    () => flatOptions.filter((option) => search.matches(`${option.label}\n${option.value}\n${option.group ?? ''}`)),
    [flatOptions, search.matches],
  );
  const enabledOptions = useMemo(
    () => visibleOptions.filter((option) => !option.disabled),
    [visibleOptions],
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
    const maxHeight = Math.max(160, Math.min(300, Math.max(below, above) - gap));
    const openAbove = below < 180 && above > below;
    setPosition({
      ...(openAbove
        ? { bottom: Math.max(viewportPad, window.innerHeight - rect.top + gap) }
        : { top: rect.bottom + gap }),
      left: Math.min(
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
    if (!open || enabledOptions.some((option) => option.value === activeValue)) return;
    setActiveValue(enabledOptions[0]?.value ?? '');
  }, [activeValue, enabledOptions, open]);

  useEffect(() => {
    if (locked && open) {
      setOpen(false);
      setQuery('');
    }
  }, [locked, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      if (eventBelongsToOwnedBuilder(event, builderPortalRootRef.current)) return;
      setOpen(false);
      setQuery('');
      buttonRef.current?.focus({ preventScroll: true });
    };
    const onScrollOrResize = () => {
      if (portal) updatePosition();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, portal, updatePosition]);

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
    if (!locked || !onLockedActivate) return false;
    let receipt: LockedActivationReceipt;
    try {
      receipt = onLockedActivate({ targetId: resolvedOwnerId, input });
    } catch {
      return false;
    }
    if (!receipt || receipt.targetId !== resolvedOwnerId
      || !['requested', 'opened', 'completed', 'cancelled'].includes(receipt.phase)) {
      return false;
    }
    return receipt.phase === 'opened' || receipt.phase === 'completed';
  }, [locked, onLockedActivate, resolvedOwnerId]);

  const choose = useCallback((nextValue: string) => {
    const next = flatOptions.find((option) => option.value === nextValue);
    if (ownerIdentityCollision
      || !next || next.disabled || isInvalidOption(next)) return;
    onChange(next.value);
    closeMenu(true);
  };

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

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab' && open) {
      setOpen(false);
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
      if (enabledOptions[0]) setActiveValue(enabledOptions[0].value);
      return;
    }
    if (event.key === 'End' && open) {
      event.preventDefault();
      if (enabledOptions.at(-1)) setActiveValue(enabledOptions.at(-1)!.value);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  }, [activeValue, choose, closeMenu, moveActive]);

  const onButtonBlur = (event: FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (buttonRef.current?.contains(next) || menuRef.current?.contains(next))) return;
    setOpen(false);
  };

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
              bottom: position.bottom,
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
          ariaControls={`${idBase}-options`}
          placeholder={searchPlaceholder}
          {...(testId ? { testId: `${testId}-filter` } : {})}
          focusScopeId={`${idBase}-filter`}
          portalRootRef={registerBuilderPortal}
          autoFocus
          onKeyDown={onSearchKeyDown}
        />
        <span className="od-select-result-count" role="status" aria-live="polite">
          {resultCountLabel(visibleOptions.length)}
        </span>
      </div>
      <div id={`${idBase}-options`} className="od-select-options" role="none">
        {visibleOptions.length === 0 ? (
          <div className="od-select-no-results" role="status" data-testid={testId ? `${testId}-no-results` : undefined}>
            {noResultsLabel}
          </div>
        ) : options.map((item) => {
          if (isGroup(item)) {
            const groupOptions = item.options.filter((option) => visibleOptions.some((visible) => visible.value === option.value));
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
        style={{ pointerEvents: locked ? 'none' : undefined }}
        aria-disabled={disabled || locked || undefined}
        title={locked ? lockedReason : disabled ? disabledReason ?? title : title}
        data-testid={testId}
        data-dropdown-opener="true"
        data-select-owner={resolvedOwnerId}
        onClick={() => {
          if (locked) {
            activateLocked('programmatic');
            return;
          }
          setOpen((current) => !current);
        }}
        onContextMenu={onContextMenu}
        onKeyDown={onButtonKeyDown}
        onBlur={onButtonBlur}
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
            lockedPointerActivation.current = true;
          }}
          onClick={() => {
            const input = lockedPointerActivation.current ? 'pointer' : 'programmatic';
            lockedPointerActivation.current = false;
            activateLocked(input);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            lockedPointerActivation.current = false;
            activateLocked('keyboard');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            activateLocked('context');
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
  id?: string | undefined;
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
      disabled={option.disabled || invalid}
      title={invalid ? invalidReason : option.disabledReason ?? disabledReason}
      aria-label={invalid ? `${option.label}: ${invalidReason}` : `${option.label}: ${option.disabledReason ?? disabledReason}`}
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
