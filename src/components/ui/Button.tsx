import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, leftIcon, rightIcon, children, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(styles.btn, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});
