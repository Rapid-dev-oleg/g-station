'use client';

import { Button, Card } from '@/components/ui';
import type { Meta, Measured, StationInput } from '@/lib/dossier/types';

/** Значение Measured → строка «12 м³/ч». */
function mv(m?: Measured | null, dash = '—'): string {
  if (!m || m.value == null) return dash;
  return `${m.value} ${m.unit ?? ''}`.trim();
}

const PURPOSE_LABEL: Record<string, string> = {
  'наружное-ПТ': 'Наружное пожаротушение',
  ВПВ: 'Внутренний противопожарный водопровод',
  АУПТ: 'АУПТ (спринклер/дренчер)',
  'пожаротушение-общее': 'Пожаротушение (общее)',
  'хоз-питьевое': 'Хоз-питьевое',
  'повышение-давления': 'Повышение давления',
  'береговая-ПНС': 'Береговая ПНС',
};

const ENCLOSURE_LABEL: Record<string, string> = {
  'моноблок-на-раме': 'Моноблок на раме',
  'технологический-павильон': 'Технологический павильон',
  'блок-бокс': 'Блок-бокс',
  'подземное-стеклопластик': 'Подземное (стеклопластик)',
  'стеклопластиковый-колодец': 'Стеклопластиковый колодец',
  'в-чужом-резервуаре': 'В чужом резервуаре',
  'береговой-модуль': 'Береговой модуль',
};

/** Строка определения «метка — значение». */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Компактная карточка распознанных параметров (что извлёк Kimi из ТЗ).
 * Сгруппирована по смыслу; читаемая сводка, не 6-шаговый ручной ввод.
 * Полное редактирование с быстрыми кнопками — следующий этап.
 */
export function CardSummary({
  meta,
  input,
  onNext,
}: {
  systemId: string;
  meta: Meta;
  input: StationInput;
  onNext: () => void;
}) {
  const cols: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0 28px',
  };

  return (
    <Card>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
        Распознано из ТЗ. Проверьте параметры — расчёт пойдёт по ним.
      </div>

      <div style={cols}>
        <Group title="Объект и заказчик">
          <Row label="Объект" value={meta.object_name ?? '—'} />
          <Row label="Заказчик" value={meta.customer ?? '—'} />
        </Group>

        <Group title="Назначение">
          <Row label="Назначение" value={PURPOSE_LABEL[input.purpose ?? ''] ?? input.purpose ?? '—'} />
          <Row label="Схема резервирования" value={input.reservation_scheme ?? '—'} />
          <Row label="Жокей-насос" value={input.jockey_required ? 'да' : 'нет'} />
        </Group>

        <Group title="Гидравлика">
          <Row label="Расход Q" value={mv(input.Q)} />
          <Row label="Напор H" value={mv(input.H)} />
          {input.inlet_pressure?.value != null && (
            <Row label="Давление на вводе" value={mv(input.inlet_pressure)} />
          )}
        </Group>

        <Group title="Исполнение">
          <Row label="Корпус" value={ENCLOSURE_LABEL[input.station_enclosure ?? ''] ?? input.station_enclosure ?? '—'} />
          <Row label="Размещение" value={input.installation_place ?? '—'} />
          <Row label="Материал коллектора" value={input.collector_material ?? '—'} />
        </Group>
      </div>

      {(input.special_requirements?.length ?? 0) > 0 && (
        <Group title="Особые требования">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {input.special_requirements!.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Group>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onNext} rightIcon={<span>→</span>}>
          К расчёту
        </Button>
      </div>
    </Card>
  );
}
