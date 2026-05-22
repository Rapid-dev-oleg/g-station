import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  suffix?: ReactNode;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, hint, error, required, suffix, className, ...rest },
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
        <input
          ref={ref}
          id={fieldId}
          type="number"
          inputMode="decimal"
          className={clsx(styles.input, suffix && styles.withSuffix)}
          {...rest}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {error ? <div className={styles.error}>{error}</div> : hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
});
