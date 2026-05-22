import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  suffix?: ReactNode;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, suffix, leftIcon, className, ...rest },
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
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
        <input
          ref={ref}
          id={fieldId}
          className={clsx(styles.input, suffix && styles.withSuffix, leftIcon && styles.withLeftIcon)}
          {...rest}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {error ? <div className={styles.error}>{error}</div> : hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
});
