'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Button,
  Card,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  Input,
  NumberInput,
  Select,
  Textarea,
} from '@/components/ui';
import type { Meta, Scenario, StationInput } from '@/lib/dossier/types';
import { updateSystemInput } from '@/server/actions/systems';
import { MeasuredField } from './MeasuredField';
import { WIZARD_STEPS, type WizardStepKey } from './steps';
import styles from './Wizard.module.css';

// ── option sets ──────────────────────────────────────────────────────────

const SCENARIO_OPTS: { value: Scenario; label: string }[] = [
  { value: 'подбор-с-нуля', label: 'Подбор с нуля' },
  { value: 'проверка-чужого-подбора', label: 'Проверка чужого подбора' },
  { value: 'подбор-на-аналог', label: 'Подбор на аналог' },
  { value: 'замена-конкурента', label: 'Замена конкурента' },
  { value: 'торги-аукцион', label: 'Торги / аукцион' },
  { value: 'переторжка', label: 'Переторжка' },
  { value: 'два-исполнения', label: 'Два исполнения' },
  { value: 'пересчёт-под-новый-СП', label: 'Пересчёт под новый СП' },
];

const PURPOSE_OPTS = [
  { value: 'наружное-ПТ', label: 'Наружное пожаротушение' },
  { value: 'ВПВ', label: 'Внутренний противопожарный водопровод' },
  { value: 'АУПТ', label: 'АУПТ (спринклер/дренчер)' },
  { value: 'пожаротушение-общее', label: 'Пожаротушение (общее)' },
  { value: 'хоз-питьевое', label: 'Хоз-питьевое' },
  { value: 'повышение-давления', label: 'Повышение давления' },
  { value: 'береговая-ПНС', label: 'Береговая ПНС' },
];

const SCHEME_OPTS = ['1/0', '1/1', '2/1', '2/2', '3/1'].map((v) => ({
  value: v,
  label: v,
}));

const START_OPTS = ['прямой', 'плавный', 'частотный', 'каскадный'].map((v) => ({
  value: v,
  label: v,
}));

const COLLECTOR_OPTS = [
  { value: 'углеродистая-сталь', label: 'Углеродистая сталь' },
  { value: 'нержавеющая-сталь', label: 'Нержавеющая сталь' },
];

const ENCLOSURE_OPTS = [
  { value: 'моноблок-на-раме', label: 'Моноблок на раме' },
  { value: 'технологический-павильон', label: 'Технологический павильон' },
  { value: 'блок-бокс', label: 'Блок-бокс' },
  { value: 'подземное-стеклопластик', label: 'Подземное (стеклопластик)' },
  { value: 'стеклопластиковый-колодец', label: 'Стеклопластиковый колодец' },
  { value: 'в-чужом-резервуаре', label: 'В чужом резервуаре' },
  { value: 'береговой-модуль', label: 'Береговой модуль' },
];

const PLACE_OPTS = [
  { value: 'в-помещении', label: 'В помещении' },
  { value: 'под-заливом', label: 'Под заливом' },
  { value: 'заглублённая', label: 'Заглублённая' },
  { value: 'на-берегу', label: 'На берегу' },
];

const POWER_CAT_OPTS = [
  { value: 'I', label: 'I категория' },
  { value: 'II', label: 'II категория' },
  { value: 'III', label: 'III категория' },
];

const CLIMATE_OPTS = ['стандарт', 'У-1', 'УХЛ1', 'УХЛ4'].map((v) => ({
  value: v,
  label: v,
}));

const IP_OPTS = ['IP54', 'IP55', 'IP65'].map((v) => ({ value: v, label: v }));

// ── component ────────────────────────────────────────────────────────────

export interface SystemWizardProps {
  systemId: string;
  projectId: string;
  initialMeta: Meta;
  initialInput: StationInput;
  /**
   * Действие на последнем шаге. Если задано — вызывается вместо перехода
   * на устаревшую страницу /calc (используется степпером SystemFlow).
   */
  onComplete?: () => void;
}

export function SystemWizard({
  systemId,
  projectId,
  initialMeta,
  initialInput,
  onComplete,
}: SystemWizardProps) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>(initialMeta);
  const [input, setInput] = useState<StationInput>(initialInput);
  const [stepIdx, setStepIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const stepKey: WizardStepKey = WIZARD_STEPS[stepIdx].key;
  const isLast = stepIdx === WIZARD_STEPS.length - 1;

  const patchInput = (patch: Partial<StationInput>) =>
    setInput((cur) => ({ ...cur, ...patch }));

  const patchMeta = (patch: Partial<Meta>) =>
    setMeta((cur) => ({ ...cur, ...patch }));

  /** Сохраняет текущее состояние шага через server action. */
  const save = (then?: () => void) => {
    setErrors([]);
    startTransition(async () => {
      const res = await updateSystemInput(systemId, { meta, input });
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString('ru-RU'));
        router.refresh();
        then?.();
      } else {
        setErrors(res.errors);
      }
    });
  };

  const goNext = () => {
    if (isLast) {
      save(() => {
        if (onComplete) onComplete();
        else router.push(`/projects/${projectId}/systems/${systemId}/calc`);
      });
    } else {
      save(() => setStepIdx((i) => i + 1));
    }
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.steps}>
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx(
              styles.stepBtn,
              i === stepIdx && styles.stepActive,
              i < stepIdx && styles.stepDone,
            )}
            onClick={() => save(() => setStepIdx(i))}
          >
            <span className={styles.stepNum}>{i < stepIdx ? '✓' : i + 1}</span>
            {s.title}
          </button>
        ))}
      </nav>

      <Card>
        <div className={styles.stepTitle}>{WIZARD_STEPS[stepIdx].title}</div>
        <div className={styles.stepHint}>{WIZARD_STEPS[stepIdx].hint}</div>

        {stepKey === 'purpose' && (
          <StepPurpose meta={meta} input={input} patchMeta={patchMeta} patchInput={patchInput} />
        )}
        {stepKey === 'hydraulics' && (
          <StepHydraulics input={input} patchInput={patchInput} />
        )}
        {stepKey === 'pumps' && <StepPumps input={input} patchInput={patchInput} />}
        {stepKey === 'fire' && <StepFire input={input} patchInput={patchInput} />}
        {stepKey === 'enclosure' && (
          <StepEnclosure input={input} patchInput={patchInput} />
        )}
        {stepKey === 'power' && <StepPower input={input} patchInput={patchInput} />}

        {errors.length > 0 && (
          <div className={styles.errorBox}>
            Не сохранено — ошибки валидации:
            <ul style={{ marginTop: 6, paddingLeft: 16, listStyle: 'disc' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            leftIcon={<IconArrowLeft />}
            disabled={stepIdx === 0 || pending}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          >
            Назад
          </Button>
          <div className={styles.saveRow}>
            {savedAt && !pending && (
              <span className={styles.savedHint}>Сохранено в {savedAt}</span>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => save()}
            >
              {pending ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button
              rightIcon={isLast ? <IconCheck /> : <IconArrowRight />}
              disabled={pending}
              onClick={goNext}
            >
              {isLast ? 'К расчёту' : 'Далее'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── steps ────────────────────────────────────────────────────────────────

type StepProps = {
  input: StationInput;
  patchInput: (patch: Partial<StationInput>) => void;
};

function StepPurpose({
  meta,
  input,
  patchMeta,
  patchInput,
}: {
  meta: Meta;
  input: StationInput;
  patchMeta: (p: Partial<Meta>) => void;
  patchInput: (p: Partial<StationInput>) => void;
}) {
  return (
    <div className={styles.grid}>
      <Input
        label="Объект"
        value={meta.object_name ?? ''}
        onChange={(e) => patchMeta({ object_name: e.target.value })}
      />
      <Input
        label="Заказчик"
        value={meta.customer ?? ''}
        onChange={(e) => patchMeta({ customer: e.target.value })}
      />
      <Select
        label="Сценарий"
        options={SCENARIO_OPTS}
        value={meta.scenario}
        onChange={(e) => patchMeta({ scenario: e.target.value as Scenario })}
      />
      <Select
        label="Назначение станции"
        required
        options={PURPOSE_OPTS}
        value={input.purpose}
        onChange={(e) =>
          patchInput({ purpose: e.target.value as StationInput['purpose'] })
        }
      />
    </div>
  );
}

function StepHydraulics({ input, patchInput }: StepProps) {
  return (
    <div className={styles.grid}>
      <MeasuredField
        label="Подача Q"
        required
        unit="м³/ч"
        value={input.Q}
        onChange={(Q) => patchInput({ Q })}
      />
      <MeasuredField
        label="Напор H"
        required
        unit="м"
        value={input.H}
        onChange={(H) => patchInput({ H })}
      />
      <MeasuredField
        label="Давление в системе"
        unit="МПа"
        value={input.system_pressure}
        onChange={(system_pressure) => patchInput({ system_pressure })}
      />
      <MeasuredField
        label="Давление на вводе"
        unit="МПа"
        value={input.inlet_pressure}
        onChange={(inlet_pressure) => patchInput({ inlet_pressure })}
      />
    </div>
  );
}

function StepPumps({ input, patchInput }: StepProps) {
  return (
    <>
      <div className={styles.grid} style={{ marginBottom: 20 }}>
        <Select
          label="Схема резервирования"
          required
          options={SCHEME_OPTS}
          value={input.reservation_scheme}
          onChange={(e) =>
            patchInput({
              reservation_scheme: e.target
                .value as StationInput['reservation_scheme'],
            })
          }
        />
        <Select
          label="Тип пуска"
          options={START_OPTS}
          value={input.start_type ?? ''}
          placeholder="— не задан —"
          onChange={(e) =>
            patchInput({
              start_type: (e.target.value || undefined) as StationInput['start_type'],
            })
          }
        />
        <NumberInput
          label="Рабочих насосов"
          value={input.working_pumps ?? ''}
          onChange={(e) =>
            patchInput({
              working_pumps: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
        <NumberInput
          label="Резервных насосов"
          value={input.reserve_pumps ?? ''}
          onChange={(e) =>
            patchInput({
              reserve_pumps: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.groupTitle}>Жокей-насос</div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          <input
            type="checkbox"
            checked={input.jockey_required ?? false}
            onChange={(e) => patchInput({ jockey_required: e.target.checked })}
          />
          Требуется жокей-насос
        </label>
        {input.jockey_required && (
          <div className={styles.grid}>
            <MeasuredField
              label="Q жокей-насоса"
              unit="м³/ч"
              value={input.jockey_Q}
              onChange={(jockey_Q) => patchInput({ jockey_Q })}
            />
            <MeasuredField
              label="H жокей-насоса"
              unit="м"
              value={input.jockey_H}
              onChange={(jockey_H) => patchInput({ jockey_H })}
            />
          </div>
        )}
      </div>
    </>
  );
}

function StepFire({ input, patchInput }: StepProps) {
  const fp = input.fire_params ?? {};
  const rv = input.reservoirs ?? {};
  const patchFire = (p: Partial<NonNullable<StationInput['fire_params']>>) =>
    patchInput({ fire_params: { ...fp, ...p } });
  const patchRes = (p: Partial<NonNullable<StationInput['reservoirs']>>) =>
    patchInput({ reservoirs: { ...rv, ...p } });

  return (
    <>
      <div className={styles.fieldGroup}>
        <div className={styles.groupTitle}>Пожарные параметры</div>
        <div className={styles.grid}>
          <MeasuredField
            label="Расход на пожаротушение"
            unit="л/с"
            value={fp.fire_flow_rate}
            onChange={(fire_flow_rate) => patchFire({ fire_flow_rate })}
          />
          <MeasuredField
            label="Продолжительность пожара"
            unit="ч"
            value={fp.fire_duration}
            onChange={(fire_duration) => patchFire({ fire_duration })}
          />
          <NumberInput
            label="Число струй"
            value={fp.streams_count ?? ''}
            onChange={(e) =>
              patchFire({
                streams_count:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          <MeasuredField
            label="Расход струи"
            unit="л/с"
            value={fp.stream_flow}
            onChange={(stream_flow) => patchFire({ stream_flow })}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.groupTitle}>Резервуары</div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          <input
            type="checkbox"
            checked={rv.required ?? false}
            onChange={(e) => patchRes({ required: e.target.checked })}
          />
          Требуются резервуары
        </label>
        {rv.required && (
          <div className={styles.grid}>
            <NumberInput
              label="Количество резервуаров"
              value={rv.count ?? ''}
              onChange={(e) =>
                patchRes({
                  count: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
            <MeasuredField
              label="Объём резервуара"
              unit="м³"
              value={rv.volume}
              onChange={(volume) => patchRes({ volume })}
            />
            <Select
              label="Материал"
              placeholder="— не задан —"
              options={[
                { value: 'сборный-металл', label: 'Сборный металл' },
                { value: 'стеклопластик', label: 'Стеклопластик' },
                { value: 'бетонный-чужой', label: 'Бетонный (чужой)' },
              ]}
              value={rv.material ?? ''}
              onChange={(e) =>
                patchRes({
                  material: (e.target.value ||
                    undefined) as NonNullable<StationInput['reservoirs']>['material'],
                })
              }
            />
          </div>
        )}
      </div>
    </>
  );
}

function StepEnclosure({ input, patchInput }: StepProps) {
  return (
    <div className={styles.grid}>
      <Select
        label="Исполнение станции"
        placeholder="— не задано —"
        options={ENCLOSURE_OPTS}
        value={input.station_enclosure ?? ''}
        onChange={(e) =>
          patchInput({
            station_enclosure: (e.target.value ||
              undefined) as StationInput['station_enclosure'],
          })
        }
      />
      <Select
        label="Место установки"
        placeholder="— не задано —"
        options={PLACE_OPTS}
        value={input.installation_place ?? ''}
        onChange={(e) =>
          patchInput({
            installation_place: (e.target.value ||
              undefined) as StationInput['installation_place'],
          })
        }
      />
      <Select
        label="Материал коллектора"
        placeholder="— не задан —"
        options={COLLECTOR_OPTS}
        value={input.collector_material ?? ''}
        onChange={(e) =>
          patchInput({
            collector_material: (e.target.value ||
              undefined) as StationInput['collector_material'],
          })
        }
      />
      <Select
        label="Климатическое исполнение"
        placeholder="— не задано —"
        options={CLIMATE_OPTS}
        value={input.climate_execution ?? ''}
        onChange={(e) =>
          patchInput({
            climate_execution: (e.target.value ||
              undefined) as StationInput['climate_execution'],
          })
        }
      />
    </div>
  );
}

function StepPower({ input, patchInput }: StepProps) {
  const ps = input.power_supply ?? {};
  const patchPower = (p: Partial<NonNullable<StationInput['power_supply']>>) =>
    patchInput({ power_supply: { ...ps, ...p } });

  return (
    <>
      <div className={styles.fieldGroup}>
        <div className={styles.groupTitle}>Электроснабжение</div>
        <div className={styles.grid}>
          <Select
            label="Категория электроснабжения"
            placeholder="— не задана —"
            options={POWER_CAT_OPTS}
            value={ps.category ?? ''}
            onChange={(e) =>
              patchPower({
                category: (e.target.value ||
                  undefined) as NonNullable<StationInput['power_supply']>['category'],
              })
            }
          />
          <NumberInput
            label="Число вводов"
            value={ps.inputs ?? ''}
            onChange={(e) =>
              patchPower({
                inputs: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          <Input
            label="Напряжение"
            placeholder="380 В"
            value={ps.voltage ?? ''}
            onChange={(e) => patchPower({ voltage: e.target.value || undefined })}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={ps.avr ?? false}
              onChange={(e) => patchPower({ avr: e.target.checked })}
            />
            АВР (автоматический ввод резерва)
          </label>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.groupTitle}>Автоматика и климат</div>
        <div className={styles.grid}>
          <Select
            label="Степень защиты IP"
            placeholder="— не задана —"
            options={IP_OPTS}
            value={input.ip_rating ?? ''}
            onChange={(e) =>
              patchInput({
                ip_rating: (e.target.value ||
                  undefined) as StationInput['ip_rating'],
              })
            }
          />
        </div>
        <Textarea
          label="Требования к диспетчеризации"
          rows={2}
          style={{ marginTop: 12 }}
          value={(input.dispatch_requirements ?? []).join('\n')}
          onChange={(e) =>
            patchInput({
              dispatch_requirements: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          hint="По одному требованию на строку"
        />
        <Textarea
          label="Особые требования"
          rows={2}
          style={{ marginTop: 12 }}
          value={(input.special_requirements ?? []).join('\n')}
          onChange={(e) =>
            patchInput({
              special_requirements: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          hint="По одному требованию на строку"
        />
      </div>
    </>
  );
}
