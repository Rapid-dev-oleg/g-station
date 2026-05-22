'use client';

/**
 * Поток «Новый расчёт из ТЗ» — шаг 1 расчётного конвейера.
 *
 * 1. Загрузка документа (.txt/.pdf/.docx) → парсинг ИИ.
 * 2. Экран ревью: вся карточка параметров с провенансом, недостающее,
 *    выбор/создание клиента и проекта, валидация обязательных полей.
 * 3. Подтверждение → создание сущностей → переход к расчёту.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  IconArrowRight,
  IconCheck,
  IconFile,
  IconSparkles,
  IconUpload,
  Input,
  Select,
} from '@/components/ui';
import { sourceLabel } from '@/lib/format/labels';
import type { Measured, Meta, StationInput } from '@/lib/dossier/types';
import {
  commitIntake,
  parseUploadedDocument,
  type ParseResult,
} from '@/server/actions/parse';
import styles from './Intake.module.css';

// ── входные пропсы ─────────────────────────────────────────────────────────

export interface IntakeFlowProps {
  ownerId: string;
  projects: { id: string; name: string; clientName: string }[];
}

// ── подписи перечислений (для человекочитаемого вывода) ────────────────────

const LABELS: Record<string, string> = {
  'наружное-ПТ': 'Наружное пожаротушение',
  ВПВ: 'Внутренний противопожарный водопровод',
  АУПТ: 'АУПТ (спринклер/дренчер)',
  'пожаротушение-общее': 'Пожаротушение (общее)',
  'хоз-питьевое': 'Хоз-питьевое',
  'повышение-давления': 'Повышение давления',
  'береговая-ПНС': 'Береговая ПНС',
  'углеродистая-сталь': 'Углеродистая сталь',
  'нержавеющая-сталь': 'Нержавеющая сталь',
  'моноблок-на-раме': 'Моноблок на раме',
  'технологический-павильон': 'Технологический павильон',
  'блок-бокс': 'Блок-бокс',
  'подземное-стеклопластик': 'Подземное (стеклопластик)',
  'стеклопластиковый-колодец': 'Стеклопластиковый колодец',
  'в-чужом-резервуаре': 'В чужом резервуаре',
  'береговой-модуль': 'Береговой модуль',
  'в-помещении': 'В помещении',
  'под-заливом': 'Под заливом',
  заглублённая: 'Заглублённая',
  'на-берегу': 'На берегу',
};

const lbl = (v?: string | null) => (v ? LABELS[v] ?? v : '—');

/** Обязательные поля карточки (по JSON Schema input.required + базовые). */
const REQUIRED_FIELDS: { key: keyof StationInput; label: string }[] = [
  { key: 'purpose', label: 'Назначение станции' },
  { key: 'Q', label: 'Подача Q' },
  { key: 'H', label: 'Напор H' },
  { key: 'reservation_scheme', label: 'Схема резервирования' },
];

// ── вспомогательные ────────────────────────────────────────────────────────

function measuredText(m?: Measured): string {
  if (!m || m.value === null || m.value === undefined) return '—';
  return `${m.value}${m.unit ? ' ' + m.unit : ''}`;
}

/** Карточка одного параметра с пометкой провенанса. */
function Param({
  label,
  value,
  source,
  note,
}: {
  label: string;
  value: string;
  source?: string;
  note?: string;
}) {
  const s = source ? sourceLabel(source) : null;
  return (
    <div className={styles.paramCard}>
      <div className={styles.paramLabel}>{label}</div>
      <div className={styles.paramValue}>{value}</div>
      <div className={styles.paramFoot}>
        {s && <Badge variant={s.variant} size="md">{s.label}</Badge>}
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}

// ── компонент ──────────────────────────────────────────────────────────────

export function IntakeFlow({ ownerId, projects }: IntakeFlowProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, startParsing] = useTransition();
  const [committing, startCommit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ParseResult | null>(null);
  // Редактируемая карточка (инженер правит на гейте 1).
  const [input, setInput] = useState<Partial<StationInput>>({});
  const [meta, setMeta] = useState<Partial<Meta>>({});

  // Выбор клиента и проекта.
  const [clientMode, setClientMode] = useState<'matched' | 'new' | 'none'>('none');
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [objectName, setObjectName] = useState('');
  const [systemName, setSystemName] = useState('Пожарная насосная станция');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // ── загрузка и парсинг ───────────────────────────────────────────────────

  const onPickFile = (f: File | null) => {
    setFile(f);
    setError(null);
  };

  const runParse = () => {
    if (!file) return;
    setError(null);
    startParsing(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await parseUploadedDocument(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r = res.result;
      setResult(r);
      setInput(r.input);
      setMeta(r.meta);
      // Предзаполнение полей проекта из ТЗ.
      setObjectName(r.meta.object_name ?? '');
      setProjectName(
        r.meta.object_name
          ? `${r.meta.object_name} — НС пожаротушения`
          : 'Расчёт из ТЗ',
      );
      // Режим клиента: найден → matched; распознан новый → new; нет → none.
      if (r.matchedClient) setClientMode('matched');
      else if (r.client) setClientMode('new');
      else setClientMode('none');
    });
  };

  // ── валидация обязательных полей ──────────────────────────────────────────

  const validate = (): string[] => {
    const errs: string[] = [];
    for (const f of REQUIRED_FIELDS) {
      const v = input[f.key];
      if (f.key === 'Q' || f.key === 'H') {
        const m = v as Measured | undefined;
        if (!m || m.value === null || m.value === undefined) {
          errs.push(`Не заполнено обязательное поле: ${f.label}`);
        }
      } else if (v === undefined || v === null) {
        errs.push(`Не заполнено обязательное поле: ${f.label}`);
      }
    }
    if (projectMode === 'new') {
      if (!projectName.trim()) errs.push('Укажите название проекта');
      if (!objectName.trim()) errs.push('Укажите название объекта');
      if (clientMode === 'none') {
        errs.push('Для нового проекта выберите или создайте клиента');
      }
    } else if (!projectId) {
      errs.push('Выберите существующий проект');
    }
    if (!systemName.trim()) errs.push('Укажите название системы');
    return errs;
  };

  // ── подтверждение ─────────────────────────────────────────────────────────

  const runCommit = () => {
    if (!result) return;
    const errs = validate();
    setValidationErrors(errs);
    if (errs.length > 0) return;

    startCommit(async () => {
      const clientArg =
        clientMode === 'matched' && result.matchedClient
          ? ({ mode: 'existing', id: result.matchedClient.id } as const)
          : clientMode === 'new' && result.client
            ? ({ mode: 'new', data: result.client } as const)
            : ({ mode: 'none' } as const);

      const projectArg =
        projectMode === 'existing'
          ? ({ mode: 'existing', id: projectId } as const)
          : ({
              mode: 'new',
              name: projectName.trim(),
              objectName: objectName.trim(),
              deadline: meta.deadline ?? null,
            } as const);

      const res = await commitIntake({
        ownerId,
        client: clientArg,
        project: projectArg,
        systemName: systemName.trim(),
        meta,
        input: input as StationInput,
      });

      if (!res.ok) {
        setValidationErrors(res.errors);
        return;
      }
      router.push(
        `/projects/${res.projectId}/systems/${res.systemId}/calc`,
      );
      router.refresh();
    });
  };

  // ── рендер: шаг загрузки ──────────────────────────────────────────────────

  if (!result) {
    return (
      <Card>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.pdf,.docx"
          style={{ display: 'none' }}
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        {!file ? (
          <div
            className={dragOver ? `${styles.dropzone} ${styles.dropzoneActive}` : styles.dropzone}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPickFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <span className={styles.dropIcon}>
              <IconUpload />
            </span>
            <div className={styles.dropTitle}>
              Загрузите документ технического задания
            </div>
            <div className={styles.dropHint}>
              Перетащите файл сюда или нажмите для выбора · форматы .txt, .pdf, .docx
            </div>
          </div>
        ) : (
          <div className={styles.fileRow}>
            <span style={{ color: 'var(--brand)' }}>
              <IconFile />
            </span>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.note}>
              {(file.size / 1024).toFixed(0)} КБ
            </span>
            <Button variant="ghost" onClick={() => onPickFile(null)}>
              Заменить
            </Button>
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.actions}>
          <Button
            leftIcon={<IconSparkles />}
            disabled={!file || parsing}
            onClick={runParse}
          >
            {parsing ? 'Разбираем документ…' : 'Распарсить документ'}
          </Button>
        </div>
      </Card>
    );
  }

  // ── рендер: экран ревью ───────────────────────────────────────────────────

  const fp = input.fire_params ?? {};
  const rv = input.reservoirs ?? {};
  const ps = input.power_supply ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Карточка параметров станции"
        subtitle={`Извлечено из «${result.filename}» (${result.format.toUpperCase()}) — проверьте и поправьте`}
      >
        {/* Гидравлика */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Гидравлика</div>
          <div className={styles.grid}>
            <Param label="Подача Q" value={measuredText(input.Q)} source={input.Q?.source} note={input.Q?.note} />
            <Param label="Напор H" value={measuredText(input.H)} source={input.H?.source} note={input.H?.note} />
            <Param label="Давление в системе" value={measuredText(input.system_pressure)} source={input.system_pressure?.source} />
            <Param label="Давление на вводе" value={measuredText(input.inlet_pressure)} source={input.inlet_pressure?.source} note={input.inlet_pressure?.note} />
          </div>
        </div>

        {/* Назначение и схема */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Назначение и резервирование</div>
          <div className={styles.grid}>
            <Param label="Назначение" value={lbl(input.purpose)} />
            <Param label="Схема резервирования" value={input.reservation_scheme ?? '—'} />
            <Param label="Рабочих насосов" value={String(input.working_pumps ?? '—')} />
            <Param label="Резервных насосов" value={String(input.reserve_pumps ?? '—')} />
            <Param label="Жокей-насос" value={input.jockey_required ? 'Да' : 'Нет'} />
            {input.jockey_required && (
              <>
                <Param label="Q жокея" value={measuredText(input.jockey_Q)} source={input.jockey_Q?.source} />
                <Param label="H жокея" value={measuredText(input.jockey_H)} source={input.jockey_H?.source} />
              </>
            )}
            <Param label="Тип пуска" value={input.start_type ?? '—'} />
          </div>
        </div>

        {/* Исполнение */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Исполнение и коллектор</div>
          <div className={styles.grid}>
            <Param label="Исполнение станции" value={lbl(input.station_enclosure)} />
            <Param label="Место установки" value={lbl(input.installation_place)} />
            <Param label="Материал коллектора" value={lbl(input.collector_material)} />
            <Param label="Климатическое исполнение" value={input.climate_execution ?? '—'} />
          </div>
        </div>

        {/* Пожарные параметры */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Пожарные параметры</div>
          <div className={styles.grid}>
            <Param label="Расход на тушение" value={measuredText(fp.fire_flow_rate)} source={fp.fire_flow_rate?.source} />
            <Param label="Продолжительность пожара" value={measuredText(fp.fire_duration)} source={fp.fire_duration?.source} />
            <Param label="Число струй" value={String(fp.streams_count ?? '—')} />
            <Param label="Расход струи" value={measuredText(fp.stream_flow)} source={fp.stream_flow?.source} />
            <Param label="Время восполнения" value={measuredText(fp.replenishment_time)} source={fp.replenishment_time?.source} />
          </div>
        </div>

        {/* Резервуары */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Резервуары запаса воды</div>
          <div className={styles.grid}>
            <Param label="Резервуары нужны" value={rv.required ? 'Да' : 'Нет'} />
            {rv.required && (
              <>
                <Param label="Количество" value={String(rv.count ?? '—')} />
                <Param label="Объём одного" value={measuredText(rv.volume)} source={rv.volume?.source} note={rv.volume?.note} />
                <Param label="Материал" value={rv.material ?? '—'} />
              </>
            )}
          </div>
        </div>

        {/* Электроснабжение */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Электроснабжение</div>
          <div className={styles.grid}>
            <Param label="Категория надёжности" value={ps.category ?? '—'} />
            <Param label="Число вводов" value={String(ps.inputs ?? '—')} />
            <Param label="АВР" value={ps.avr === undefined ? '—' : ps.avr ? 'Да' : 'Нет'} />
            <Param label="Напряжение" value={ps.voltage ?? '—'} />
          </div>
        </div>

        {/* Допущения */}
        {(input.assumptions?.length ?? 0) > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Принятые допущения</div>
            {input.assumptions!.map((a, i) => (
              <div key={i} className={styles.assumptionItem}>
                <Badge variant="warning" size="md">допущение</Badge> {a}
              </div>
            ))}
          </div>
        )}

        {/* Особые требования */}
        {(input.special_requirements?.length ?? 0) > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Особые требования ТЗ</div>
            {input.special_requirements!.map((a, i) => (
              <div key={i} className={styles.assumptionItem}>{a}</div>
            ))}
          </div>
        )}

        {/* Недостающее */}
        {result.missing.length > 0 && (
          <div className={styles.missingBox}>
            <strong>Не найдено в ТЗ — требует ввода инженером:</strong>
            <ul className={styles.missingList}>
              {result.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Заказчик */}
      <Card title="Заказчик">
        {result.matchedClient ? (
          <div className={styles.section}>
            <p className={styles.note}>
              В базе найден похожий клиент:{' '}
              <strong>{result.matchedClient.shortName}</strong>
              {result.matchedClient.inn && ` · ИНН ${result.matchedClient.inn}`}
            </p>
            <div className={styles.choiceRow}>
              <label className={styles.choice}>
                <input
                  type="radio"
                  checked={clientMode === 'matched'}
                  onChange={() => setClientMode('matched')}
                />
                Использовать найденного клиента
              </label>
              {result.client && (
                <label className={styles.choice}>
                  <input
                    type="radio"
                    checked={clientMode === 'new'}
                    onChange={() => setClientMode('new')}
                  />
                  Создать нового из ТЗ
                </label>
              )}
              <label className={styles.choice}>
                <input
                  type="radio"
                  checked={clientMode === 'none'}
                  onChange={() => setClientMode('none')}
                />
                Без клиента
              </label>
            </div>
          </div>
        ) : result.client ? (
          <div className={styles.section}>
            <p className={styles.note}>
              Из документа распознан клиент (в базе не найден):
            </p>
            <div className={styles.grid} style={{ marginTop: 8 }}>
              <Param label="Краткое имя" value={result.client.shortName} source="extracted" />
              {result.client.fullName && (
                <Param label="Полное наименование" value={result.client.fullName} source="extracted" />
              )}
              {result.client.inn && <Param label="ИНН" value={result.client.inn} source="extracted" />}
              {result.client.contactName && (
                <Param label="Контактное лицо" value={result.client.contactName} source="extracted" />
              )}
              {result.client.phone && <Param label="Телефон" value={result.client.phone} source="extracted" />}
              {result.client.email && <Param label="Email" value={result.client.email} source="extracted" />}
            </div>
            <div className={styles.choiceRow} style={{ marginTop: 12 }}>
              <label className={styles.choice}>
                <input
                  type="radio"
                  checked={clientMode === 'new'}
                  onChange={() => setClientMode('new')}
                />
                Создать этого клиента
              </label>
              <label className={styles.choice}>
                <input
                  type="radio"
                  checked={clientMode === 'none'}
                  onChange={() => setClientMode('none')}
                />
                Без клиента (пропустить)
              </label>
            </div>
          </div>
        ) : (
          <p className={styles.note}>
            В документе реквизиты заказчика не обнаружены. Клиент необязателен —
            можно продолжить без него (для нового проекта клиент потребуется).
          </p>
        )}
      </Card>

      {/* Проект и система */}
      <Card title="Проект и система">
        <div className={styles.choiceRow}>
          <label className={styles.choice}>
            <input
              type="radio"
              checked={projectMode === 'new'}
              onChange={() => setProjectMode('new')}
            />
            Создать новый проект
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              checked={projectMode === 'existing'}
              onChange={() => setProjectMode('existing')}
            />
            Добавить в существующий проект
          </label>
        </div>

        {projectMode === 'new' ? (
          <div className={styles.grid}>
            <Input
              label="Название проекта"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <Input
              label="Название объекта"
              required
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
            />
          </div>
        ) : (
          <Select
            label="Существующий проект"
            required
            placeholder="— выберите проект —"
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.clientName}`,
            }))}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        )}

        <div style={{ marginTop: 14 }}>
          <Input
            label="Название системы (насосной станции)"
            required
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
          />
        </div>

        {validationErrors.length > 0 && (
          <div className={styles.errorBox}>
            <strong>Проверьте обязательные поля:</strong>
            <ul className={styles.missingList}>
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
          >
            Загрузить другой документ
          </Button>
          <Button
            rightIcon={committing ? <IconCheck /> : <IconArrowRight />}
            disabled={committing}
            onClick={runCommit}
          >
            {committing ? 'Создаём…' : 'Продолжить к расчёту'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
