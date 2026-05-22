import clsx from 'clsx';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={clsx(styles.avatar, size === 'sm' && styles.sm, size === 'lg' && styles.lg, className)}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
