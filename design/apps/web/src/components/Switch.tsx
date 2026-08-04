import { Icon } from './Icon';
import styles from './Switch.module.css';

/**
 * Material Design 3 switch — 52×32 track, a handle that changes size with the
 * state, and an optional pair of icons.
 *
 * It is a `<button role="switch">` rather than a styled checkbox on purpose.
 * A checkbox reports `checked`, which assistive technology announces as
 * "checked"/"not checked"; a switch reports `aria-checked` on the switch role
 * and is announced as "on"/"off", which is what a control that takes effect
 * immediately should say. A button also gets Space and Enter activation and a
 * focus ring from the platform, so the keyboard path is the browser's rather
 * than a `keydown` handler that has to be remembered at every call site.
 *
 * The component is stateless. The host owns `checked` and is told when the
 * user asks for the other value; nothing here toggles optimistically, because
 * every current caller writes the change through the daemon and a switch that
 * flipped before the request landed would be lying about persisted state.
 */
export interface SwitchProps {
  /** Current state. */
  checked: boolean;
  /** Called with the value the user is asking for, not the current one. */
  onChange: (next: boolean) => void;
  /**
   * Accessible name. Required: a switch with no name is announced as "switch,
   * on" and the user has to guess what it governs.
   */
  label: string;
  disabled?: boolean;
  /**
   * Draw a check/cross glyph inside the handle. M3 makes this optional and
   * enlarges the unselected handle to 24px when it is present, so the two
   * variants are genuinely different anatomies rather than one with a hidden
   * element. Use it where the state is not otherwise labelled in the row.
   */
  withIcons?: boolean;
  /** Marks the element this switch controls, for assistive technology. */
  'aria-describedby'?: string;
  id?: string;
  className?: string;
  'data-testid'?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  withIcons = false,
  id,
  className,
  'aria-describedby': ariaDescribedBy,
  'data-testid': testId,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      {...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {})}
      {...(id ? { id } : {})}
      {...(testId ? { 'data-testid': testId } : {})}
      disabled={disabled}
      data-with-icons={withIcons ? 'true' : 'false'}
      className={[styles.switch, className].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.handle}>
        {withIcons ? (
          <span className={styles.icon} aria-hidden="true">
            <Icon name={checked ? 'check' : 'close'} size={16} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
