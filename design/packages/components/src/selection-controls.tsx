import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { joinClassNames } from './class-names';
import styles from './selection-controls.module.css';

export interface SelectionControlProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

interface SelectionControlOptions {
  type: 'checkbox' | 'radio';
  role?: 'switch';
  className?: string;
}

function SelectionControl({
  type,
  role,
  className,
  label,
  description,
  id,
  'aria-describedby': ariaDescribedBy,
  ...inputProps
}: SelectionControlProps & SelectionControlOptions) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');
  const inputId = id ?? `selection-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <label className={joinClassNames(styles.control, className)} data-md-component="selection-control">
      <input
        {...inputProps}
        id={inputId}
        type={type}
        role={role}
        aria-describedby={describedBy}
        data-md-control={role === 'switch' ? 'switch' : type}
      />
      <span className={joinClassNames(styles.indicator, role === 'switch' && styles.switchIndicator)} aria-hidden="true">
        {role === 'switch' ? <span className={styles.switchThumb} /> : null}
      </span>
      <span className={styles.copy}>
        <span className={styles.label}>{label}</span>
        {description ? <span className={styles.description} id={descriptionId}>{description}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox(props: SelectionControlProps) {
  return <SelectionControl {...props} type="checkbox" />;
}

export function Radio(props: SelectionControlProps) {
  return <SelectionControl {...props} type="radio" />;
}

export function Switch(props: SelectionControlProps) {
  return <SelectionControl {...props} type="checkbox" role="switch" />;
}
