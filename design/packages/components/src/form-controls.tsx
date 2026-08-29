import {
  cloneElement,
  forwardRef,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { joinClassNames } from './class-names';
import styles from './form-controls.module.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={joinClassNames(styles.control, className)} data-md-control="input" {...props} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={joinClassNames(styles.control, styles.textarea, className)}
      data-md-control="textarea"
      {...props}
    />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={joinClassNames(styles.control, styles.select, className)} data-md-control="select" {...props} />;
});

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode;
  children: ReactElement;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

/**
 * A labelled field keeps the input, its supporting text, and its validation
 * message in one accessible relationship. It is deliberately a composition
 * primitive: product surfaces can choose their layout without reimplementing
 * `label`, `aria-describedby`, or `aria-invalid` wiring.
 */
export function Field({
  label,
  children,
  description,
  error,
  required = false,
  className,
  ...props
}: FieldProps) {
  const fieldId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');
  const childProps = children.props as Record<string, unknown>;
  const controlId = typeof childProps.id === 'string' && childProps.id.length > 0
    ? childProps.id
    : `${fieldId}-control`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [
    typeof childProps['aria-describedby'] === 'string' ? childProps['aria-describedby'] : undefined,
    descriptionId,
    errorId,
  ].filter((value): value is string => Boolean(value)).join(' ') || undefined;
  const control = cloneElement(children as ReactElement<Record<string, unknown>>, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : childProps['aria-invalid'],
    'aria-required': required ? true : childProps['aria-required'],
  });

  return (
    <div {...props} className={joinClassNames(styles.field, className)} data-md-component="field">
      <label className={styles.label} htmlFor={controlId}>
        <span>{label}</span>
        {required ? <span className={styles.required} aria-hidden="true">*</span> : null}
      </label>
      {control}
      {description ? <div className={styles.description} id={descriptionId}>{description}</div> : null}
      {error ? <div className={styles.error} id={errorId} role="alert">{error}</div> : null}
    </div>
  );
}

export interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  required?: boolean;
}

export function FieldLabel({ children, required = false, className, ...props }: FieldLabelProps) {
  return (
    <label className={joinClassNames(styles.label, className)} {...props}>
      <span>{children}</span>
      {required ? <span className={styles.required} aria-hidden="true">*</span> : null}
    </label>
  );
}

export interface FieldMessageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function FieldDescription({ children, className, ...props }: FieldMessageProps) {
  return <div className={joinClassNames(styles.description, className)} {...props}>{children}</div>;
}

export function FieldError({ children, className, ...props }: FieldMessageProps) {
  return <div className={joinClassNames(styles.error, className)} role="alert" {...props}>{children}</div>;
}
