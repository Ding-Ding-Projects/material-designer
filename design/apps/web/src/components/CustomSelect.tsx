import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { RegexSearchField, useRegexSearch } from './regex';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectGroup {
  label: string;
  options: CustomSelectOption[];
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
  options: CustomSelectItem[];
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
  const enabledOptionsRef = useRef(enabledOptions);
  flatOptionsRef.current = flatOptions;
  enabledOptionsRef.current = enabledOptions;
  const optionIdByValue = useMemo(
    () => new Map(flatOptions.map((option, index) => [option.value, `${idBase}-option-${index}`])),
    [flatOptions, idBase],
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
    const selectedOption = flatOptionsRef.current.find((option) => option.value === value && !option.disabled);
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

  const choose = (nextValue: string) => {
    const next = flatOptions.find((option) => option.value === nextValue);
    if (!next || next.disabled) return;
    onChange(next.value);
    closeMenu(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    setActiveValue(enabledOptions[nextIndex]!.value);
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (enabledOptions[0]) setActiveValue(enabledOptions[0].value);
    } else if (event.key === 'End') {
      event.preventDefault();
      if (enabledOptions.at(-1)) setActiveValue(enabledOptions.at(-1)!.value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeValue);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
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
      if (open) {
        choose(activeValue || value);
      } else {
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      id={`${idBase}-menu`}
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
        aria-controls={`${idBase}-menu`}
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
