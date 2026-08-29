import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { joinClassNames } from './class-names';
import styles from './tabs.module.css';

export type TabsOrientation = 'horizontal' | 'vertical';

interface TabsContextValue {
  id: string;
  value: string | undefined;
  orientation: TabsOrientation;
  select: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`${component} must be used inside Tabs`);
  return context;
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'item';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return `${normalized}-${Math.abs(hash).toString(36)}`;
}

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  children: ReactNode;
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  orientation = 'horizontal',
  className,
  children,
  ...props
}: TabsProps) {
  const id = `tabs-${safeId(useId())}`;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const context = useMemo<TabsContextValue>(() => ({
    id,
    value,
    orientation,
    select: (nextValue: string) => {
      if (controlledValue === undefined) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
  }), [controlledValue, id, onValueChange, orientation, value]);

  return (
    <TabsContext.Provider value={context}>
      <div
        {...props}
        className={joinClassNames(styles.root, className)}
        data-md-component="tabs"
        data-orientation={orientation}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  'aria-label'?: string;
}

export function TabList({ children, className, onKeyDown, ...props }: TabListProps) {
  const { orientation } = useTabsContext('TabList');
  if (!props['aria-label'] && !props['aria-labelledby']) {
    throw new Error('TabList requires an accessible name via aria-label or aria-labelledby');
  }
  const moveKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
      (tab) => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true' && !tab.hidden,
    );
    const active = document.activeElement;
    const index = tabs.indexOf(active as HTMLButtonElement);
    let nextIndex: number | undefined;
    if (event.key === moveKey) nextIndex = index < 0 ? 0 : index + 1;
    if (event.key === backKey) nextIndex = index < 0 ? tabs.length - 1 : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex !== undefined && tabs.length > 0) {
      event.preventDefault();
      const wrapped = (nextIndex + tabs.length) % tabs.length;
      tabs[wrapped]?.focus();
    }
    onKeyDown?.(event);
  };

  return (
    <div
      {...props}
      className={joinClassNames(styles.list, className)}
      role="tablist"
      aria-orientation={orientation}
      data-md-component="tab-list"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: ReactNode;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, children, className, disabled = false, onClick, ...props },
  ref,
) {
  const context = useTabsContext('Tab');
  const tabId = `${context.id}-tab-${safeId(value)}`;
  const panelId = `${context.id}-panel-${safeId(value)}`;
  const selected = context.value === value;
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={joinClassNames(styles.tab, selected && styles.selected, className)}
      data-md-component="tab"
      data-state={selected ? 'selected' : 'unselected'}
      onClick={(event) => {
        if (!disabled) context.select(value);
        onClick?.(event);
      }}
    >
      <span className={styles.tabLabel}>{children}</span>
    </button>
  );
});

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children: ReactNode;
  keepMounted?: boolean;
}

export function TabPanel({ value, children, className, keepMounted = true, ...props }: TabPanelProps) {
  const context = useTabsContext('TabPanel');
  const selected = context.value === value;
  const panelId = `${context.id}-panel-${safeId(value)}`;
  const tabId = `${context.id}-tab-${safeId(value)}`;
  if (!keepMounted && !selected) return null;
  return (
    <div
      {...props}
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      hidden={!selected}
      className={joinClassNames(styles.panel, className)}
      data-md-component="tab-panel"
    >
      {children}
    </div>
  );
}
