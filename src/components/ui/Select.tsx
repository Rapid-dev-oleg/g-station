import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

export type SelectOption = { value: string; label: string };

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, options, placeholder, className, ...rest },
  ref
) {
  const fieldId = rest.id ?? rest.name;
  return (
    <div className={clsx(styles.wrapper, error && styles.hasError, className)}>
      {label && (
        <label htmlFor={fieldId} className={styles.label}>
          <span>
            {label}
            {required && <span className={styles.required}> *</span>}
          </span>
        </label>
      )}
      <div className={styles.fieldWrap}>
        <select ref={ref} id={fieldId} className={styles.select} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className={styles.error}>{error}</div> : hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
});
