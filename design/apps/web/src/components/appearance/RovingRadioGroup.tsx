import {
  useCallback,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/** Per-option presentation props; selection and focus state stay owned here. */
export type RovingRadioOptionProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'role' | 'tabIndex' | 'aria-checked' | 'onClick' | 'onKeyDown'
>;

export interface RovingRadioGroupProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  groupProps?: Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label' | 'onKeyDown'> & { 'data-od-setting'?: string };
  optionProps?: (option: T, active: boolean) => RovingRadioOptionProps;
  children: (option: T, active: boolean) => ReactNode;
}

/**
 * A native-button radio group with one tab stop and complete arrow-key
 * navigation. The caller supplies only the option content and styling; the
 * group owns `aria-checked`, roving `tabIndex`, selection, and focus so seed,
 * density, font, and accent controls cannot drift into four subtly different
 * keyboard behaviours.
 */
export function RovingRadioGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  style,
  groupProps,
  optionProps,
  children,
}: RovingRadioGroupProps<T>) {
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const selectedIndex = options.indexOf(value);

  const focusOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (option == null) return;
      onChange(option);
      optionRefs.current.get(option)?.focus();
    },
    [onChange, options],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (options.length === 0) return;
      const focusedIndex = options.findIndex(
        (option) => optionRefs.current.get(option) === document.activeElement,
      );
      const currentIndex = focusedIndex >= 0
        ? focusedIndex
        : selectedIndex >= 0
          ? selectedIndex
          : 0;
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % options.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + options.length) % options.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = options.length - 1;
      }
      if (nextIndex == null) return;
      event.preventDefault();
      focusOption(nextIndex);
    },
    [focusOption, options, selectedIndex],
  );

  return (
    <div
      {...groupProps}
      className={className}
      style={style}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      data-roving-radio-group="true"
    >
      {options.map((option, index) => {
        const active = option === value;
        const props = optionProps?.(option, active);
        const tabIndex = active || (selectedIndex < 0 && index === 0) ? 0 : -1;
        return (
          <button
            {...props}
            key={option}
            ref={(node) => {
              if (node) optionRefs.current.set(option, node);
              else optionRefs.current.delete(option);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndex}
            onClick={() => onChange(option)}
          >
            {children(option, active)}
          </button>
        );
      })}
    </div>
  );
}
