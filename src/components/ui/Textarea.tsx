import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, ...rest },
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
      <textarea ref={ref} id={fieldId} className={styles.textarea} {...rest} />
      {error ? <div className={styles.error}>{error}</div> : hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
});
