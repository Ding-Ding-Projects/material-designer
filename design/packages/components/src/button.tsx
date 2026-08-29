import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

import { joinClassNames } from './class-names';
import styles from './button.module.css';

/** Material 3 button variants plus the legacy aliases retained for callers. */
export type ButtonVariant =
  | 'default'
  | 'filled'
  | 'tonal'
  | 'outlined'
  | 'text'
  | 'elevated'
  | 'danger'
  | 'primary'
  | 'primary-ghost'
  | 'ghost'
  | 'subtle';
export type ButtonSize = 'default' | 'small' | 'large' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the button disabled while the caller's work is in flight. */
  loading?: boolean;
  /** Makes the button fill its available inline size. */
  fullWidth?: boolean;
}

const variantClassNames: Record<ButtonVariant, string | undefined> = {
  default: joinClassNames(styles.outlined),
  filled: joinClassNames(styles.filled),
  tonal: joinClassNames(styles.tonal),
  outlined: joinClassNames(styles.outlined),
  text: joinClassNames(styles.text),
  elevated: joinClassNames(styles.elevated),
  danger: joinClassNames(styles.danger),
  primary: joinClassNames(styles.filled),
  'primary-ghost': joinClassNames(styles.tonal),
  ghost: joinClassNames(styles.text),
  subtle: joinClassNames(styles.tonal),
};

const sizeClassNames: Record<ButtonSize, string | undefined> = {
  default: undefined,
  small: joinClassNames(styles.small),
  large: joinClassNames(styles.large),
  icon: joinClassNames(styles.icon, 'icon-btn'),
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    type = 'button',
    variant = 'default',
    size = 'default',
    loading = false,
    fullWidth = false,
    disabled = false,
    'aria-busy': ariaBusy,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={joinClassNames(
        styles.button,
        variantClassNames[variant],
        sizeClassNames[size],
        fullWidth && styles.fullWidth,
        className,
      )}
      data-md-variant={variant}
      data-md-size={size}
      data-md-component="button"
      data-loading={loading || undefined}
      aria-busy={loading || ariaBusy || undefined}
      disabled={disabled || loading}
      {...props}
    />
  );
});
