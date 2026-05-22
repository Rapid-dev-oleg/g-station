import type { SystemConfig } from '@/lib/types';

export type WizardStepKey =
  | 'purpose'
  | 'hydraulics'
  | 'structure'
  | 'connections'
  | 'pumps'
  | 'automation'
  | 'options'
  | 'calc'
  | 'preview';

export const WIZARD_STEPS: { key: WizardStepKey; label: string; hint: string }[] = [
  { key: 'purpose', label: 'Назначение', hint: 'СП 30.13330 — категории помещений и тип среды' },
  { key: 'hydraulics', label: 'Гидравлика', hint: 'Расходы, напор, температурный режим' },
  { key: 'structure', label: 'Конструктив', hint: 'Корпус, материал, исполнение' },
  { key: 'connections', label: 'Подключения', hint: 'Подвод/напор — диаметры, материалы' },
  { key: 'pumps', label: 'Насосы', hint: 'Кол-во, исполнение, бренд' },
  { key: 'automation', label: 'Автоматика', hint: 'Шкаф управления, защита, диспетчеризация' },
  { key: 'options', label: 'Комплектация', hint: 'Аксессуары и опции' },
  { key: 'calc', label: 'Подбор', hint: 'Расчёт оборудования и BOM' },
  { key: 'preview', label: 'Превью', hint: 'Проверьте перед сохранением в проект' },
];

export type WizardSystem = SystemConfig;
