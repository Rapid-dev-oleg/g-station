'use client';

/**
 * Поток «Новый расчёт из ТЗ» — шаг 1 расчётного конвейера.
 *
 * 1. Загрузка пакета документов (.txt/.pdf/.docx/.xlsx, можно несколько) → парсинг ИИ.
 * 2a. Если карточка полная — автосабмит: создание клиента/проекта/системы,
 *     запуск расчёта, редирект на /projects/[id]/systems/[sid]/calc.
 * 2b. Если что-то не извлеклось — экран ревью: вся карточка с провенансом,
 *     недостающее, выбор/создание клиента и проекта.
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
  NumberInput,
  Select,
} from '@/components/ui';
import { sourceLabel } from '@/lib/format/labels';
import type { FireParams, Measured, Meta, StationInput } from '@/lib/dossier/types';
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

/** Опции для Select-полей карточки. */
const PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: 'наружное-ПТ', label: 'Наружное пожаротушение' },
  { value: 'ВПВ', label: 'Внутренний противопожарный водопровод' },
  { value: 'АУПТ', label: 'АУПТ (спринклер/дренчер)' },
  { value: 'пожаротушение-общее', label: 'Пожаротушение (общее)' },
  { value: 'хоз-питьевое', label: 'Хоз-питьевое' },
  { value: 'повышение-давления', label: 'Повышение давления' },
  { value: 'береговая-ПНС', label: 'Береговая ПНС' },
];

const RESERVATION_OPTIONS: { value: string; label: string }[] = [
  { value: '1/0', label: '1/0 (один рабочий, без резерва)' },
  { value: '1/1', label: '1/1 (один рабочий, один резервный)' },
  { value: '2/1', label: '2/1 (два рабочих, один резервный)' },
  { value: '2/2', label: '2/2 (два рабочих, два резервных)' },
  { value: '3/1', label: '3/1 (три рабочих, один резервный)' },
];

/** Единицы по умолчанию для измеряемых полей карточки. */
const DEFAULT_UNITS: Record<string, string> = {
  Q: 'м³/ч',
  H: 'м',
  system_pressure: 'м',
  inlet_pressure: 'м',
  fire_flow_rate: 'л/с',
  fire_duration: 'мин',
  stream_flow: 'л/с',
  replenishment_time: 'ч',
};

/**
 * Человекочитаемые названия полей расчётного дела.
 * Используется и для перевода JSON-pointer'ов AJV-ошибок,
 * и для рендера серверного списка `missing` (имена пропущенных полей).
 */
const FIELD_LABELS: Record<string, string> = {
  // meta
  case_id: 'идентификатор дела',
  object_name: 'название объекта',
  customer: 'заказчик',
  engineer: 'инженер',
  scenario: 'сценарий',
  deadline: 'срок',
  // input — гидравлика
  Q: 'подача Q',
  H: 'напор H',
  system_pressure: 'давление в системе',
  inlet_pressure: 'давление на вводе',
  // input — назначение и схема
  purpose: 'назначение станции',
  reservation_scheme: 'схема резервирования',
  working_pumps: 'рабочих насосов',
  reserve_pumps: 'резервных насосов',
  jockey_required: 'жокей-насос',
  jockey_Q: 'подача жокея',
  jockey_H: 'напор жокея',
  start_type: 'тип пуска',
  // input — исполнение
  station_enclosure: 'исполнение станции',
  installation_place: 'место установки',
  collector_material: 'материал коллектора',
  climate_execution: 'климатическое исполнение',
  ip_rating: 'степень защиты IP',
  manufacturer_preference: 'предпочтительные производители',
  pump_type_required: 'требуемый тип насоса',
  // input — пожарные параметры
  fire_params: 'пожарные параметры',
  fire_duration: 'продолжительность пожара',
  fire_flow_rate: 'расход на тушение',
  streams_count: 'число струй',
  stream_flow: 'расход струи',
  replenishment_time: 'время восполнения',
  // input — резервуары
  reservoirs: 'резервуары',
  required: 'наличие',
  count: 'количество',
  volume: 'объём',
  material: 'материал',
  // input — электроснабжение
  power_supply: 'электроснабжение',
  category: 'категория надёжности',
  inputs: 'число вводов',
  avr: 'АВР',
  voltage: 'напряжение',
  // прочее
  assumptions: 'допущения',
  special_requirements: 'особые требования',
  dispatch_requirements: 'требования к диспетчеризации',
  pumping_medium: 'перекачиваемая среда',
  limits: 'ограничения',
  // верхний уровень
  stations: 'станция',
  input: 'параметры станции',
  meta: 'мета',
};

/** Переводит сообщения AJV в русский. */
function humanizeAjvMessage(msg: string): string {
  if (!msg) return '';
  if (msg === 'must be string') return 'должно быть строкой';
  if (msg === 'must be object') return 'должно быть объектом (число + единица)';
  if (msg === 'must be integer') return 'должно быть целым числом';
  if (msg === 'must be number') return 'должно быть числом';
  if (msg === 'must be boolean') return 'должно быть «да/нет»';
  if (msg === 'must be array') return 'должно быть списком';
  if (msg === 'must NOT have additional properties') return 'лишнее поле';
  if (msg === 'must be equal to one of the allowed values') return 'значение вне списка допустимых';
  const req = msg.match(/^must have required property '(.+)'$/);
  if (req) return `обязательное поле «${FIELD_LABELS[req[1]] ?? req[1]}» не заполнено`;
  const fmt = msg.match(/^must match format "(.+)"$/);
  if (fmt) return `не соответствует формату ${fmt[1]}`;
  return msg;
}

/** Переводит одну AJV-ошибку из вида `/a/b/c: must be X` в человекочитаемую строку. */
function humanizeValidationError(err: string): string {
  // Серверная сторона может вернуть готовое русскоязычное сообщение — пропускаем как есть.
  if (!err.includes(':')) return err;
  const idx = err.indexOf(':');
  const path = err.slice(0, idx).trim();
  const msg = err.slice(idx + 1).trim();

  if (path === '(корень)' || path === '') {
    return humanizeAjvMessage(msg);
  }

  // Сегменты: пропускаем числовые индексы массивов и слово «stations»/«input»/«meta».
  const segs = path.split('/').filter(Boolean);
  const named = segs.filter((s) => !/^\d+$/.test(s) && s !== 'stations' && s !== 'input' && s !== 'meta');
  if (named.length === 0) return humanizeAjvMessage(msg);

  const labels = named.map((s) => FIELD_LABELS[s] ?? s);
  const head = labels.map((l, i) => (i === 0 ? l[0].toUpperCase() + l.slice(1) : l)).join(' → ');
  return `${head}: ${humanizeAjvMessage(msg)}`;
}

/** Имя поля из серверного списка `missing` → человекочитаемая строка. */
function humanizeMissingField(key: string): string {
  const label = FIELD_LABELS[key];
  if (!label) return key;
  return label[0].toUpperCase() + label.slice(1);
}

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

/**
 * Редактируемое поле для Measured-значения: NumberInput + единица в суффиксе,
 * плюс мини-строка с бейджем источника и пометкой ИИ.
 */
function MeasuredField({
  label,
  value,
  unit,
  required,
  onChange,
}: {
  label: string;
  value: Measured | undefined;
  unit: string;
  required?: boolean;
  onChange: (next: Measured) => void;
}) {
  const cur = value?.value;
  const src = value?.source;
  const s = src ? sourceLabel(src) : null;
  const effectiveUnit = value?.unit ?? unit;
  return (
    <div>
      <NumberInput
        label={label}
        required={required}
        suffix={effectiveUnit}
        value={cur === null || cur === undefined ? '' : cur}
        step="any"
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.').trim();
          const num = raw === '' ? null : Number(raw);
          onChange({
            value: Number.isFinite(num as number) ? (num as number) : null,
            unit: effectiveUnit,
            source: 'operator',
            note: value?.note,
          });
        }}
      />
      {(s || value?.note) && (
        <div className={styles.paramFoot} style={{ marginTop: 4 }}>
          {s && <Badge variant={s.variant} size="md">{s.label}</Badge>}
          {value?.note && <span>{value.note}</span>}
        </div>
      )}
    </div>
  );
}

// ── компонент ──────────────────────────────────────────────────────────────

export function IntakeFlow({ ownerId, projects }: IntakeFlowProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
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

  const SUPPORTED_EXT = /\.(txt|pdf|docx|xlsx)$/i;

  /** Принимает FileList/массив — фильтрует по поддерживаемым форматам и добавляет к выбору. */
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => SUPPORTED_EXT.test(f.name));
    if (incoming.length === 0) {
      setError('Поддерживаемые форматы: .txt, .pdf, .docx, .xlsx');
      return;
    }
    setFiles((prev) => {
      // Дедупликация по имени + размеру.
      const key = (f: File) => `${f.name}::${f.size}`;
      const seen = new Set(prev.map(key));
      const next = [...prev];
      for (const f of incoming) {
        if (!seen.has(key(f))) next.push(f);
      }
      return next;
    });
    setError(null);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearFiles = () => {
    setFiles([]);
    setError(null);
  };

  const runParse = () => {
    if (files.length === 0) return;
    setError(null);
    startParsing(async () => {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await parseUploadedDocument(fd, ownerId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Автосабмит сработал — сразу на calc.
      if (res.mode === 'redirect') {
        router.replace(res.redirect);
        router.refresh();
        return;
      }
      // Иначе — обычный ревью-режим.
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

  // ── редактирование карточки ──────────────────────────────────────────────

  /** Записать Measured-поле первого уровня (Q/H/system_pressure/inlet_pressure). */
  const setMeasured = (key: keyof StationInput, next: Measured) => {
    setInput((prev) => ({ ...prev, [key]: next }));
  };

  /** Записать поле в input.fire_params. */
  const setFireParam = <K extends keyof FireParams>(key: K, next: FireParams[K]) => {
    setInput((prev) => ({
      ...prev,
      fire_params: { ...(prev.fire_params ?? {}), [key]: next },
    }));
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
          accept=".txt,.pdf,.docx,.xlsx"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            addFiles(e.target.files);
            // Сбрасываем value, чтобы можно было выбрать тот же файл ещё раз.
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        {files.length === 0 ? (
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
              addFiles(e.dataTransfer.files);
            }}
          >
            <span className={styles.dropIcon}>
              <IconUpload />
            </span>
            <div className={styles.dropTitle}>
              Загрузите пакет документов технического задания
            </div>
            <div className={styles.dropHint}>
              Перетащите один или несколько файлов сюда или нажмите для выбора ·
              форматы .txt, .pdf, .docx, .xlsx
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className={styles.fileRow}>
                <span style={{ color: 'var(--brand)' }}>
                  <IconFile />
                </span>
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.note}>
                  {(f.size / 1024).toFixed(0)} КБ
                </span>
                <Button variant="ghost" onClick={() => removeFile(i)}>
                  Убрать
                </Button>
              </div>
            ))}
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                Добавить ещё файлы
              </Button>
              <Button variant="ghost" onClick={clearFiles}>
                Очистить
              </Button>
            </div>
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.actions}>
          <Button
            leftIcon={<IconSparkles />}
            disabled={files.length === 0 || parsing}
            onClick={runParse}
          >
            {parsing
              ? 'Разбираем документы…'
              : files.length > 1
                ? `Распарсить пакет (${files.length})`
                : 'Распарсить документ'}
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
        subtitle={
          result.files.length === 1
            ? `Извлечено из «${result.files[0].filename}» (${result.files[0].format.toUpperCase()}) — проверьте и поправьте`
            : `Извлечено из ${result.files.length} файлов (${result.files.map((f) => f.format.toUpperCase()).join(', ')}) — проверьте и поправьте`
        }
      >
        {/* Гидравлика */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Гидравлика</div>
          <div className={styles.grid}>
            <MeasuredField
              label="Подача Q"
              required
              value={input.Q}
              unit={DEFAULT_UNITS.Q}
              onChange={(m) => setMeasured('Q', m)}
            />
            <MeasuredField
              label="Напор H"
              required
              value={input.H}
              unit={DEFAULT_UNITS.H}
              onChange={(m) => setMeasured('H', m)}
            />
            <MeasuredField
              label="Давление в системе"
              value={input.system_pressure}
              unit={DEFAULT_UNITS.system_pressure}
              onChange={(m) => setMeasured('system_pressure', m)}
            />
            <MeasuredField
              label="Давление на вводе"
              value={input.inlet_pressure}
              unit={DEFAULT_UNITS.inlet_pressure}
              onChange={(m) => setMeasured('inlet_pressure', m)}
            />
          </div>
        </div>

        {/* Назначение и схема */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Назначение и резервирование</div>
          <div className={styles.grid}>
            <Select
              label="Назначение"
              required
              placeholder="— выберите назначение —"
              options={PURPOSE_OPTIONS}
              value={input.purpose ?? ''}
              onChange={(e) =>
                setInput((prev) => ({
                  ...prev,
                  purpose: (e.target.value || undefined) as StationInput['purpose'] | undefined,
                }))
              }
            />
            <Select
              label="Схема резервирования"
              required
              placeholder="— выберите схему —"
              options={RESERVATION_OPTIONS}
              value={input.reservation_scheme ?? ''}
              onChange={(e) =>
                setInput((prev) => ({
                  ...prev,
                  reservation_scheme:
                    (e.target.value || undefined) as StationInput['reservation_scheme'] | undefined,
                }))
              }
            />
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
            <MeasuredField
              label="Расход на тушение"
              value={fp.fire_flow_rate}
              unit={DEFAULT_UNITS.fire_flow_rate}
              onChange={(m) => setFireParam('fire_flow_rate', m)}
            />
            <MeasuredField
              label="Продолжительность пожара"
              value={fp.fire_duration}
              unit={DEFAULT_UNITS.fire_duration}
              onChange={(m) => setFireParam('fire_duration', m)}
            />
            <NumberInput
              label="Число струй"
              suffix="шт"
              value={fp.streams_count ?? ''}
              min={0}
              step={1}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = raw === '' ? undefined : Math.trunc(Number(raw));
                setFireParam('streams_count', Number.isFinite(n as number) ? (n as number) : undefined);
              }}
            />
            <MeasuredField
              label="Расход струи"
              value={fp.stream_flow}
              unit={DEFAULT_UNITS.stream_flow}
              onChange={(m) => setFireParam('stream_flow', m)}
            />
            <MeasuredField
              label="Время восполнения"
              value={fp.replenishment_time}
              unit={DEFAULT_UNITS.replenishment_time}
              onChange={(m) => setFireParam('replenishment_time', m)}
            />
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
                <li key={i}>{humanizeMissingField(m)}</li>
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
                <li key={i}>{humanizeValidationError(e)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              setFiles([]);
            }}
          >
            Загрузить другие документы
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
