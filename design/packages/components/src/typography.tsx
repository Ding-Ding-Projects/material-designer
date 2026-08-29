import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

import { joinClassNames } from './class-names';
import styles from './typography.module.css';

export type TypographyVariant =
  | 'displayLarge'
  | 'displayMedium'
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall';

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  variant?: TypographyVariant;
  as?: ElementType;
  children: ReactNode;
}

/** M3 type-scale primitive with semantic element control. */
export function Typography({
  variant = 'bodyMedium',
  as = 'p',
  className,
  children,
  ...props
}: TypographyProps) {
  return createElement(as, {
    ...props,
    className: joinClassNames(styles.root, styles[variant], className),
    'data-md-component': 'typography',
    'data-typography': variant,
  }, children);
}

export function Heading(props: Omit<TypographyProps, 'variant'> & { variant?: Extract<TypographyVariant, `display${string}` | `headline${string}` | `title${string}`> }) {
  return <Typography {...props} variant={props.variant ?? 'headlineSmall'} />;
}

export function Label(props: Omit<TypographyProps, 'variant'> & { variant?: Extract<TypographyVariant, `label${string}`> }) {
  return <Typography {...props} as={props.as ?? 'span'} variant={props.variant ?? 'labelLarge'} />;
}
