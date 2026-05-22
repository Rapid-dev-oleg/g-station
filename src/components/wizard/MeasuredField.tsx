'use client';

import { NumberInput, Select } from '@/components/ui';
import type { Measured, MeasuredSource } from '@/lib/dossier/types';
import styles from './Wizard.module.css';

/** Источники, доступные оператору в wizard. */
const SOURCE_OPTIONS: { value: MeasuredSource; label: string }[] = [
  { value: 'operator', label: 'Оператор' },
  { value: 'extracted', label: 'Извлечено' },
  { value: 'derived', label: 'Выведено' },
  { value: 'assumed', label: 'Допущение' },
];

export interface MeasuredFieldProps {
  label: string;
  value: Measured | undefined;
  unit?: string;
  required?: boolean;
  hint?: string;
  onChange: (next: Measured) => void;
}

/**
 * Поле измеримой величины: число + единица + источник (провенанс).
 * Источник показывает инженеру, что проверять на гейтах.
 */
export function MeasuredField({
  label,
  value,
  unit,
  required,
  hint,
  onChange,
}: MeasuredFieldProps) {
  const m: Measured = value ?? { value: null, unit, source: 'operator' };

  return (
    <div className={styles.measured}>
      <div className={styles.measuredRow}>
        <NumberInput
          label={label}
          required={required}
          hint={hint}
          suffix={m.unit ?? unit}
          value={m.value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...m,
              unit: m.unit ?? unit,
              value: raw === '' ? null : Number(raw),
            });
          }}
        />
        <Select
          className={styles.sourceSelect}
          label="Источник"
          options={SOURCE_OPTIONS}
          value={m.source ?? 'operator'}
          onChange={(e) =>
            onChange({ ...m, source: e.target.value as MeasuredSource })
          }
        />
      </div>
    </div>
  );
}
