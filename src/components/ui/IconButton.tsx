import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'danger';
  bordered?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'md', variant = 'default', bordered, className, type = 'button', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        styles.iconBtn,
        styles[size],
        variant === 'danger' && styles.danger,
        bordered && styles.bordered,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
