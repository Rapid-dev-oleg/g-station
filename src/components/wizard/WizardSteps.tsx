'use client';

import { NumberInput, Input, Select } from '@/components/ui';
import type { KnsSystem, FireSystem, VnsSystem, SystemConfig } from '@/lib/types';
import styles from './Wizard.module.css';

type UpdateFn = (path: string, value: any) => void;

function CheckboxRow({ items, get, set }: { items: { key: string; label: string }[]; get: (k: string) => boolean; set: (k: string, v: boolean) => void }) {
  return (
    <div className={styles.checkboxRow}>
      {items.map((i) => (
        <label key={i.key} className={styles.checkboxItem}>
          <input type="checkbox" checked={!!get(i.key)} onChange={(e) => set(i.key, e.target.checked)} />
          {i.label}
        </label>
      ))}
    </div>
  );
}

// =============================== KNS ===============================
export function KnsStep({ stepKey, system, update }: { stepKey: string; system: KnsSystem; update: UpdateFn }) {
  const d = system.data;
  const num = (path: string, label: string, hint?: string, suffix?: string, step = 1) => (
    <NumberInput
      label={label}
      hint={hint}
      step={step}
      suffix={suffix}
      value={(d as any)[path] ?? ''}
      onChange={(e) => update(`data.${path}`, e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );

  switch (stepKey) {
    case 'purpose':
      return (
        <div className={styles.stepBody}>
          <Input
            label="Название системы"
            value={system.name}
            onChange={(e) => update('name', e.target.value)}
          />
          <div className={styles.grid2}>
            <Select
              label="Подтип КНС"
              value={d.subtype}
              onChange={(e) => update('data.subtype', e.target.value)}
              options={[
                { value: 'hozbyt', label: 'Хоз-бытовая' },
                { value: 'livnevka', label: 'Ливневая' },
                { value: 'production', label: 'Производственная' },
                { value: 'drenage', label: 'Дренажная' },
              ]}
            />
            <Select
              label="Среда"
              hint="СП 32.13330"
              value={d.medium}
              onChange={(e) => update('data.medium', e.target.value)}
              options={[
                { value: 'hozbyt', label: 'Хоз-бытовые стоки' },
                { value: 'livnevka', label: 'Ливневые стоки' },
                { value: 'production', label: 'Производственные стоки' },
                { value: 'drenage', label: 'Дренаж' },
                { value: 'mixed', label: 'Смешанные' },
              ]}
            />
          </div>
          <div className={styles.grid3}>
            {num('Tmin', 'Tmin', undefined, '°C')}
            {num('Tmax', 'Tmax', undefined, '°C')}
            {num('density', 'Плотность', undefined, 'кг/м³')}
          </div>
          <label className={styles.checkboxItem}>
            <input type="checkbox" checked={d.exProof} onChange={(e) => update('data.exProof', e.target.checked)} />
            Взрывозащищённое исполнение
          </label>
        </div>
      );
    case 'hydraulics':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            {num('Qmax', 'Q макс.', undefined, 'м³/ч', 0.1)}
            {num('Qavg', 'Q сред.', undefined, 'м³/ч', 0.1)}
            {num('Qmin', 'Q мин.', undefined, 'м³/ч', 0.1)}
          </div>
          <div className={styles.grid3}>
            {num('Kgen', 'Kgen', 'Коэф. неравномерности', '')}
            {num('hoursPerDay', 'Часов/сутки', undefined, 'ч')}
            {num('headRequired', 'Проектный H', 'СП 32.13330 — потребный напор', 'м', 0.1)}
          </div>
        </div>
      );
    case 'structure':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid2}>
            <Select
              label="Установка"
              value={d.installation}
              onChange={(e) => update('data.installation', e.target.value)}
              options={[
                { value: 'underground_vertical', label: 'Подземная, вертикальная' },
                { value: 'underground_horizontal', label: 'Подземная, горизонтальная' },
                { value: 'aboveground_blockbox', label: 'Наземная в блок-боксе' },
              ]}
            />
            <Select
              label="Материал корпуса"
              value={d.corpusMaterial}
              onChange={(e) => update('data.corpusMaterial', e.target.value)}
              options={[
                { value: 'PE', label: 'Полиэтилен' },
                { value: 'fiberglass', label: 'Стеклопластик' },
                { value: 'concrete', label: 'Бетон' },
                { value: 'stainless', label: 'Нерж. сталь' },
              ]}
            />
          </div>
          <div className={styles.grid4}>
            {num('diameter', 'Диаметр', undefined, 'мм')}
            {num('depth', 'Глубина', undefined, 'мм')}
            {num('neckHeight', 'Горловина', undefined, 'мм')}
            {num('groundwaterLevel', 'УГВ', 'Уровень грунт. вод', 'мм')}
          </div>
          <div className={styles.grid3}>
            <label className={styles.checkboxItem}>
              <input type="checkbox" checked={d.underRoadway} onChange={(e) => update('data.underRoadway', e.target.checked)} />
              Под проезжей частью
            </label>
            <Select
              label="Класс люка"
              value={d.hatchClass ?? ''}
              onChange={(e) => update('data.hatchClass', e.target.value || undefined)}
              placeholder="не выбран"
              options={[
                { value: 'A15', label: 'A15 (пешеходный)' },
                { value: 'B125', label: 'B125 (придомовой)' },
                { value: 'D400', label: 'D400 (проезжая часть)' },
              ]}
            />
            <Select
              label="Тип грунта"
              value={d.soilType ?? 'normal'}
              onChange={(e) => update('data.soilType', e.target.value)}
              options={[
                { value: 'normal', label: 'Обычный' },
                { value: 'pucinistyy', label: 'Пучинистый' },
                { value: 'rocky', label: 'Скальный' },
              ]}
            />
          </div>
        </div>
      );
    case 'connections':
      return (
        <div className={styles.stepBody}>
          <h3>Подвод</h3>
          <div className={styles.grid4}>
            {num('supplyDepth', 'Глубина', undefined, 'мм')}
            {num('supplyDiameter', 'Ø', undefined, 'мм')}
            <Select
              label="Материал"
              value={d.supplyMaterial}
              onChange={(e) => update('data.supplyMaterial', e.target.value)}
              options={[
                { value: 'PP', label: 'PP' },
                { value: 'PVC', label: 'PVC' },
                { value: 'PE', label: 'PE' },
                { value: 'castiron', label: 'Чугун' },
                { value: 'stainless', label: 'Нерж. сталь' },
              ]}
            />
            {num('supplyCount', 'Кол-во подводов')}
          </div>
          <div className={styles.grid3}>
            {num('supplyDirection', 'Направление, час')}
            <Select
              label="Тип соединения"
              value={d.supplyConnection}
              onChange={(e) => update('data.supplyConnection', e.target.value)}
              options={[
                { value: 'socket', label: 'Раструбное' },
                { value: 'flange', label: 'Фланцевое' },
                { value: 'welded', label: 'Сварное' },
              ]}
            />
          </div>
          <h3>Напорный трубопровод</h3>
          <div className={styles.grid4}>
            {num('pressureCount', 'Кол-во ниток')}
            {num('pressureDepth', 'Глубина', undefined, 'мм')}
            {num('pressureDiameter', 'Ø', undefined, 'мм')}
            <Select
              label="Материал"
              value={d.pressureMaterial}
              onChange={(e) => update('data.pressureMaterial', e.target.value)}
              options={[
                { value: 'PE', label: 'PE' },
                { value: 'PP', label: 'PP' },
                { value: 'steel', label: 'Сталь' },
                { value: 'stainless', label: 'Нерж.' },
              ]}
            />
          </div>
          <div className={styles.grid4}>
            {num('pressureLength', 'Длина', undefined, 'м', 0.1)}
            {num('pressureGeodeticDelta', 'Δh геод.', undefined, 'м', 0.1)}
            {num('pressureBendsCount', 'Отводов 90°')}
            {num('pressureValvesCount', 'Задвижек')}
          </div>
        </div>
      );
    case 'pumps':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            {num('workingPumps', 'Рабочих')}
            {num('reservePumps', 'Резервных')}
            {num('warehousePumps', 'Складских')}
          </div>
          <div className={styles.grid2}>
            <Select
              label="Тип насоса"
              value={d.pumpInstallType}
              onChange={(e) => update('data.pumpInstallType', e.target.value)}
              options={[
                { value: 'submersible', label: 'Погружной' },
                { value: 'dry_centrifugal', label: 'Сухой центробежный' },
              ]}
            />
            <Select
              label="Предпочт. бренд"
              value={d.preferredBrand ?? 'any'}
              onChange={(e) => update('data.preferredBrand', e.target.value)}
              options={[
                { value: 'any', label: 'Без предпочтения' },
                { value: 'WILO', label: 'WILO' },
                { value: 'Grundfos', label: 'Grundfos' },
                { value: 'CNP', label: 'CNP' },
                { value: 'Wellmix', label: 'Wellmix' },
              ]}
            />
          </div>
          <div className={styles.grid2}>
            <Select
              label="Тип пуска"
              value={d.startType}
              onChange={(e) => update('data.startType', e.target.value)}
              options={[
                { value: 'direct', label: 'Прямой' },
                { value: 'star_delta', label: 'Звезда-треугольник' },
                { value: 'soft', label: 'Плавный пуск' },
                { value: 'vfd', label: 'ЧРП' },
              ]}
            />
            <Select
              label="Режим ЧРП"
              value={d.vfdMode ?? 'none'}
              onChange={(e) => update('data.vfdMode', e.target.value)}
              options={[
                { value: 'none', label: 'Не используется' },
                { value: 'master', label: 'На ведущий' },
                { value: 'each', label: 'На каждый' },
              ]}
            />
          </div>
        </div>
      );
    case 'automation':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            <Select
              label="Размещение ШУ"
              value={d.panelLocation}
              onChange={(e) => update('data.panelLocation', e.target.value)}
              options={[
                { value: 'outdoor', label: 'Уличное' },
                { value: 'indoor', label: 'В помещении' },
              ]}
            />
            {num('panelDistance', 'Расстояние от КНС', undefined, 'м')}
            {num('cableDirection', 'Направление кабеля, час')}
          </div>
          <div className={styles.grid2}>
            <Select
              label="Категория электроснабжения"
              value={String(d.electricalCategory ?? 2)}
              onChange={(e) => update('data.electricalCategory', Number(e.target.value))}
              options={[
                { value: '1', label: 'I категория' },
                { value: '2', label: 'II категория' },
                { value: '3', label: 'III категория' },
              ]}
            />
            <Select
              label="Диспетчеризация"
              value={d.dispatch}
              onChange={(e) => update('data.dispatch', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'gsm', label: 'GSM' },
                { value: 'ethernet', label: 'Ethernet' },
                { value: 'modbus_rtu', label: 'Modbus RTU' },
                { value: 'opc_ua', label: 'OPC UA' },
              ]}
            />
          </div>
          <CheckboxRow
            items={[
              { key: 'avr', label: 'АВР' },
              { key: 'dryRun', label: 'Защита от сухого хода' },
              { key: 'overheat', label: 'Защита от перегрева' },
              { key: 'phaseControl', label: 'Контроль фаз' },
            ]}
            get={(k) => (d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
        </div>
      );
    case 'options':
      return (
        <div className={styles.stepBody}>
          <CheckboxRow
            items={[
              { key: 'basket', label: 'Корзина для мусора' },
              { key: 'baffle', label: 'Отбойник на входе' },
              { key: 'wellBeforeKns', label: 'Колодец до КНС' },
              { key: 'wellAfterKns', label: 'Колодец после КНС' },
              { key: 'gasAnalyzer', label: 'Газоанализатор' },
              { key: 'flexibleHose', label: 'Гибкий рукав' },
              { key: 'elasticCouplings', label: 'Упругие муфты' },
              { key: 'bellowCompensators', label: 'Сильфонные компенсаторы' },
              { key: 'flangeKit', label: 'Комплект фланцев' },
              { key: 'strappingBelts', label: 'Стяжные ремни' },
            ]}
            get={(k) => !!(d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
          <div className={styles.grid3}>
            <Select
              label="Расходомер"
              value={d.flowMeter}
              onChange={(e) => update('data.flowMeter', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'electromagnetic', label: 'Электромагнитный' },
                { value: 'ultrasonic', label: 'Ультразвуковой' },
              ]}
            />
            <Select
              label="Аварийный сигнал"
              value={d.alarmSignal}
              onChange={(e) => update('data.alarmSignal', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'siren', label: 'Сирена' },
                { value: 'flasher', label: 'Проблесковый маячок' },
              ]}
            />
            <Select
              label="Подъёмное устройство"
              value={d.liftingDevice}
              onChange={(e) => update('data.liftingDevice', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'manual_hoist', label: 'Ручная таль' },
                { value: 'electric_telpher', label: 'Электр. тельфер' },
              ]}
            />
          </div>
        </div>
      );
    default:
      return null;
  }
}

// =============================== FIRE ===============================
export function FireStep({ stepKey, system, update }: { stepKey: string; system: FireSystem; update: UpdateFn }) {
  const d = system.data;
  const num = (path: string, label: string, hint?: string, suffix?: string, step = 1) => (
    <NumberInput
      label={label}
      hint={hint}
      step={step}
      suffix={suffix}
      value={(d as any)[path] ?? ''}
      onChange={(e) => update(`data.${path}`, e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );

  switch (stepKey) {
    case 'purpose':
      return (
        <div className={styles.stepBody}>
          <Input label="Название системы" value={system.name} onChange={(e) => update('name', e.target.value)} />
          <div className={styles.grid2}>
            <Select
              label="Подтип"
              value={d.subtype}
              onChange={(e) => update('data.subtype', e.target.value)}
              options={[
                { value: 'VPV', label: 'Внутренний пожарный водопровод' },
                { value: 'AUPT_sprinkler', label: 'АУПТ спринклерная' },
                { value: 'AUPT_drencher', label: 'АУПТ дренчерная' },
                { value: 'fine_spray', label: 'Тонкораспылённая' },
                { value: 'foam', label: 'Пенная' },
                { value: 'combined', label: 'Объединённая' },
              ]}
            />
            <Select
              label="Категория помещения"
              value={d.premisesCategory ?? 'D'}
              onChange={(e) => update('data.premisesCategory', e.target.value)}
              hint="СП 12.13130"
              options={['A', 'B', 'V', 'G', 'D'].map((v) => ({ value: v, label: v }))}
            />
          </div>
          <div className={styles.grid3}>
            {num('floors', 'Этажность')}
            {num('height', 'Высота', undefined, 'м')}
            {num('protectedArea', 'Защищаемая S', undefined, 'м²')}
          </div>
          <Select
            label="Размещение"
            value={d.installLocation}
            onChange={(e) => update('data.installLocation', e.target.value)}
            options={[
              { value: 'separate_building', label: 'В отдельном помещении' },
              { value: 'inside_premises', label: 'Внутри здания' },
            ]}
          />
        </div>
      );
    case 'hydraulics':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid4}>
            {num('Q', 'Q', 'СП 10.13130', 'м³/ч', 0.1)}
            {num('H', 'H', 'СП 10.13130', 'м', 0.1)}
            {num('streamsCount', 'Кол-во струй')}
            {num('workTime', 'Время работы', 'мин', 'мин')}
          </div>
          <div className={styles.grid3}>
            {num('pressureAtNozzle', 'P у наконечника', undefined, 'МПа', 0.01)}
            <Select
              label="Высота компактной струи"
              value={String(d.compactStreamHeight ?? '')}
              onChange={(e) => update('data.compactStreamHeight', Number(e.target.value))}
              placeholder="—"
              options={[
                { value: '8', label: '8 м' },
                { value: '12', label: '12 м' },
                { value: '16', label: '16 м' },
              ]}
            />
            {num('dictatingElevation', 'Отметка диктующей', undefined, 'м')}
          </div>
          <div className={styles.grid3}>
            {num('Tmin', 'Tmin', undefined, '°C')}
            {num('Tmax', 'Tmax', undefined, '°C')}
            {num('density', 'Плотность', undefined, 'кг/м³')}
          </div>
        </div>
      );
    case 'structure':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid2}>
            <Select
              label="Источник"
              value={d.source}
              onChange={(e) => update('data.source', e.target.value)}
              options={[
                { value: 'city_water', label: 'Городской водопровод' },
                { value: 'reservoir', label: 'Резервуар' },
                { value: 'artesian_well', label: 'Артезианская скважина' },
              ]}
            />
            <Select
              label="Среда"
              value={d.medium}
              onChange={(e) => update('data.medium', e.target.value)}
              options={[
                { value: 'drinking', label: 'Питьевая' },
                { value: 'river', label: 'Речная' },
                { value: 'tech', label: 'Техническая' },
              ]}
            />
          </div>
          <div className={styles.grid3}>
            {num('cityGuaranteedHead', 'Гарант. напор города', undefined, 'м', 0.1)}
            {num('reservoirVolume', 'V резервуара', undefined, 'м³', 0.1)}
            {num('refillRate', 'Скорость наполнения', undefined, 'ч')}
          </div>
        </div>
      );
    case 'connections':
      return (
        <div className={styles.stepBody}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Для пожаротушения трубопровод проектируется отдельным сетевиком. На этом шаге фиксируем основные параметры.
          </p>
          <div className={styles.grid2}>
            <Select
              label="Степень защиты ШУ"
              value={d.ipRating}
              onChange={(e) => update('data.ipRating', e.target.value)}
              options={[
                { value: 'IP54', label: 'IP54' },
                { value: 'IP55', label: 'IP55' },
                { value: 'IP65', label: 'IP65' },
              ]}
            />
            {num('ambientTemp', 'T помещения', undefined, '°C')}
          </div>
        </div>
      );
    case 'pumps':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            {num('stationsCount', 'Кол-во станций')}
            {num('workingPumps', 'Рабочих')}
            {num('reservePumps', 'Резервных')}
          </div>
          <div className={styles.grid2}>
            <Select
              label="Тип привода"
              value={d.driveType}
              onChange={(e) => update('data.driveType', e.target.value)}
              options={[
                { value: 'electric', label: 'Электрический' },
                { value: 'electric_with_diesel', label: 'Электр. + дизель' },
              ]}
            />
            <Select
              label="Предпочт. бренд"
              value={d.preferredBrand ?? 'any'}
              onChange={(e) => update('data.preferredBrand', e.target.value)}
              options={[
                { value: 'any', label: 'Без предпочтения' },
                { value: 'WILO', label: 'WILO' },
                { value: 'Grundfos', label: 'Grundfos' },
                { value: 'CNP', label: 'CNP' },
                { value: 'G-Fire', label: 'G-Fire (Wellmix)' },
              ]}
            />
          </div>
          <label className={styles.checkboxItem}>
            <input type="checkbox" checked={!!d.jockeyPump} onChange={(e) => update('data.jockeyPump', e.target.checked)} />
            Жокей-насос
          </label>
        </div>
      );
    case 'automation':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid2}>
            <Select
              label="Категория электроснабжения"
              value={String(d.electricalCategory)}
              onChange={(e) => update('data.electricalCategory', Number(e.target.value))}
              options={[{ value: '1', label: 'I категория (обязательно)' }]}
            />
          </div>
          <CheckboxRow
            items={[
              { key: 'avr', label: 'АВР' },
              { key: 'dryRun', label: 'Защита от сухого хода' },
              { key: 'overheat', label: 'Защита от перегрева' },
              { key: 'signalToWatchpoint', label: 'Сигнал на пост' },
            ]}
            get={(k) => !!(d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
          <h3>Сигналы (выведение на ПКЦ)</h3>
          <CheckboxRow
            items={[
              { key: 'signals.pumpsRunning', label: 'Работа насосов' },
              { key: 'signals.pumpsAlarm', label: 'Авария насосов' },
              { key: 'signals.feed1', label: 'Ввод 1' },
              { key: 'signals.feed2', label: 'Ввод 2' },
              { key: 'signals.autoMode', label: 'Автоматический режим' },
              { key: 'signals.manualMode', label: 'Ручной режим' },
              { key: 'signals.avrMode', label: 'Работа АВР' },
              { key: 'signals.valvesPosition', label: 'Положение задвижек' },
            ]}
            get={(k) => {
              const [obj, key] = k.split('.');
              return !!(d as any)[obj]?.[key];
            }}
            set={(k, v) => {
              const [obj, key] = k.split('.');
              update(`data.${obj}.${key}`, v);
            }}
          />
        </div>
      );
    case 'options':
      return (
        <div className={styles.stepBody}>
          <CheckboxRow
            items={[
              { key: 'collectorSuction', label: 'Всасывающий коллектор' },
              { key: 'collectorPressure', label: 'Напорный коллектор' },
              { key: 'checkValves', label: 'Обратные клапаны' },
              { key: 'flangeKit', label: 'Комплект фланцев' },
              { key: 'certificateTRTS', label: 'Сертификат ТР ТС' },
            ]}
            get={(k) => !!(d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
        </div>
      );
    default:
      return null;
  }
}

// =============================== VNS ===============================
export function VnsStep({ stepKey, system, update }: { stepKey: string; system: VnsSystem; update: UpdateFn }) {
  const d = system.data;
  const num = (path: string, label: string, hint?: string, suffix?: string, step = 1) => (
    <NumberInput
      label={label}
      hint={hint}
      step={step}
      suffix={suffix}
      value={(d as any)[path] ?? ''}
      onChange={(e) => update(`data.${path}`, e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );

  switch (stepKey) {
    case 'purpose':
      return (
        <div className={styles.stepBody}>
          <Input label="Название системы" value={system.name} onChange={(e) => update('name', e.target.value)} />
          <div className={styles.grid2}>
            <Select
              label="Подтип ВНС"
              value={d.subtype}
              onChange={(e) => update('data.subtype', e.target.value)}
              options={[
                { value: 'booster_drinking', label: 'Хоз-питьевая бустерная' },
                { value: 'booster_production', label: 'Производственная бустерная' },
                { value: 'booster_filter_backwash', label: 'Промывка фильтров' },
                { value: 'booster_dosage', label: 'Дозирование' },
                { value: 'spec_screw', label: 'Спец. насос (винтовой/перистальтический)' },
                { value: 'spec_vfd_single', label: 'Одиночный с ЧРП' },
              ]}
            />
            <Select
              label="Среда"
              value={d.medium}
              onChange={(e) => update('data.medium', e.target.value)}
              options={[
                { value: 'drinking', label: 'Питьевая' },
                { value: 'tech', label: 'Техническая' },
                { value: 'drenage', label: 'Дренаж' },
                { value: 'sludge', label: 'Осадок / шлам' },
                { value: 'mixed', label: 'Смешанная' },
              ]}
            />
          </div>
          <div className={styles.grid3}>
            {num('Tmin', 'Tmin', undefined, '°C')}
            {num('Tmax', 'Tmax', undefined, '°C')}
            {num('density', 'Плотность', undefined, 'кг/м³')}
          </div>
          <Select
            label="Качество воды"
            value={d.waterQuality ?? 'sanpin'}
            onChange={(e) => update('data.waterQuality', e.target.value)}
            options={[
              { value: 'sanpin', label: 'СанПиН' },
              { value: 'tech', label: 'Техническая' },
              { value: 'hot', label: 'ГВС' },
              { value: 'sludge', label: 'Шлам/осадок' },
            ]}
          />
        </div>
      );
    case 'hydraulics':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            {num('Qmax', 'Q макс.', undefined, 'м³/ч', 0.1)}
            {num('Qavg', 'Q сред.', undefined, 'м³/ч', 0.1)}
            {num('Qmin', 'Q мин.', undefined, 'м³/ч', 0.1)}
          </div>
          <div className={styles.grid3}>
            {num('H', 'Потребный H', undefined, 'м', 0.1)}
            {num('geodeticHead', 'Δh геод.', undefined, 'м', 0.1)}
            {num('freeHeadAtPoint', 'Свободный напор', 'у диктующего', 'м', 0.1)}
          </div>
        </div>
      );
    case 'structure':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid2}>
            <Select
              label="Источник"
              value={d.source}
              onChange={(e) => update('data.source', e.target.value)}
              options={[
                { value: 'city_water', label: 'Городской водопровод' },
                { value: 'reservoir', label: 'Резервуар' },
                { value: 'artesian_well', label: 'Артезианская скважина' },
                { value: 'tank', label: 'Накопительная ёмкость' },
              ]}
            />
            {num('tankHeight', 'Высота ёмкости', undefined, 'мм')}
          </div>
          <div className={styles.grid2}>
            <NumberInput
              label="Объём мембранного бака"
              value={d.membraneTankVolume ?? ''}
              suffix="л"
              onChange={(e) => update('data.membraneTankVolume', e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <label className={styles.checkboxItem}>
              <input type="checkbox" checked={!!d.membraneTank} onChange={(e) => update('data.membraneTank', e.target.checked)} />
              Установлен мембранный бак
            </label>
          </div>
        </div>
      );
    case 'connections':
      return (
        <div className={styles.stepBody}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Обвязка собирается под выбранный насос; параметры можно уточнить после расчёта.</p>
          <div className={styles.grid3}>
            <Select
              label="Фильтр на входе"
              value={d.inletFilter ?? 'none'}
              onChange={(e) => update('data.inletFilter', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'coarse', label: 'Грубая' },
                { value: 'fine', label: 'Тонкая' },
              ]}
            />
            <Select
              label="Расходомер"
              value={d.flowMeter ?? 'none'}
              onChange={(e) => update('data.flowMeter', e.target.value)}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'electromagnetic', label: 'Электромагнитный' },
                { value: 'ultrasonic', label: 'Ультразвуковой' },
              ]}
            />
            <label className={styles.checkboxItem}>
              <input type="checkbox" checked={!!d.manometers} onChange={(e) => update('data.manometers', e.target.checked)} />
              Манометры
            </label>
          </div>
        </div>
      );
    case 'pumps':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid3}>
            {num('workingPumps', 'Рабочих')}
            {num('reservePumps', 'Резервных')}
            {num('warehousePumps', 'Складских')}
          </div>
          <div className={styles.grid2}>
            <Select
              label="Тип установки"
              value={d.pumpInstallType}
              onChange={(e) => update('data.pumpInstallType', e.target.value)}
              options={[
                { value: 'vertical_multi', label: 'Вертикальный многоступенчатый' },
                { value: 'horizontal', label: 'Горизонтальный консольный' },
                { value: 'screw', label: 'Винтовой' },
                { value: 'peristaltic', label: 'Перистальтический' },
                { value: 'diaphragm', label: 'Мембранный' },
                { value: 'submersible', label: 'Погружной' },
              ]}
            />
            <Select
              label="Предпочт. бренд"
              value={d.preferredBrand ?? 'any'}
              onChange={(e) => update('data.preferredBrand', e.target.value)}
              options={[
                { value: 'any', label: 'Без предпочтения' },
                { value: 'Wellmix', label: 'Wellmix' },
                { value: 'CNP', label: 'CNP' },
                { value: 'WILO', label: 'WILO' },
                { value: 'Grundfos', label: 'Grundfos' },
                { value: 'АРЕОПАГ', label: 'АРЕОПАГ' },
                { value: 'СЕТУНЬ ИНЖИНИРИНГ', label: 'СЕТУНЬ ИНЖИНИРИНГ' },
              ]}
            />
          </div>
        </div>
      );
    case 'automation':
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid2}>
            <Select
              label="Регулирование"
              value={d.regulation}
              onChange={(e) => update('data.regulation', e.target.value)}
              options={[
                { value: 'cascade', label: 'Каскадное' },
                { value: 'vfd_master', label: 'ЧРП на ведущий' },
                { value: 'vfd_each', label: 'ЧРП на каждый' },
                { value: 'cascade_vfd', label: 'Каскад + ЧРП' },
              ]}
            />
            <Select
              label="Тип пуска"
              value={d.startType}
              onChange={(e) => update('data.startType', e.target.value)}
              options={[
                { value: 'direct', label: 'Прямой' },
                { value: 'star_delta', label: 'Звезда-треугольник' },
                { value: 'soft', label: 'Плавный пуск' },
                { value: 'vfd', label: 'ЧРП' },
              ]}
            />
          </div>
          <CheckboxRow
            items={[
              { key: 'dryRun', label: 'Защита от сухого хода' },
              { key: 'pressureSensor', label: 'Датчик давления' },
              { key: 'panelIncludedInPump', label: 'ШУ заводской комплектации' },
              { key: 'vfdInsteadOfPanel', label: 'ЧРП вместо ШУ' },
            ]}
            get={(k) => !!(d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
          <Select
            label="Размещение ШУ"
            value={d.panelLocation}
            onChange={(e) => update('data.panelLocation', e.target.value)}
            options={[
              { value: 'indoor', label: 'В помещении' },
              { value: 'outdoor', label: 'Уличное' },
            ]}
          />
        </div>
      );
    case 'options':
      return (
        <div className={styles.stepBody}>
          <CheckboxRow
            items={[
              { key: 'valves', label: 'Запорная арматура' },
              { key: 'checkValves', label: 'Обратные клапаны' },
              { key: 'elasticCouplings', label: 'Упругие муфты' },
              { key: 'compensators', label: 'Компенсаторы' },
              { key: 'vibrationDampers', label: 'Виброопоры' },
              { key: 'collectors', label: 'Коллекторы' },
              { key: 'withoutCollector', label: 'Без коллекторов' },
              { key: 'intermittent', label: 'Периодический режим' },
              { key: 'exProof', label: 'Взрывозащищ. исполнение' },
            ]}
            get={(k) => !!(d as any)[k]}
            set={(k, v) => update(`data.${k}`, v)}
          />
        </div>
      );
    default:
      return null;
  }
}

export function renderStep(stepKey: string, system: SystemConfig, update: UpdateFn) {
  if (system.type === 'KNS') return <KnsStep stepKey={stepKey} system={system} update={update} />;
  if (system.type === 'FIRE') return <FireStep stepKey={stepKey} system={system} update={update} />;
  return <VnsStep stepKey={stepKey} system={system} update={update} />;
}
