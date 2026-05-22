/**
 * Фабрики и хелперы для «расчётного дела».
 */
import type {
  Dossier,
  Measured,
  MeasuredSource,
  Meta,
  Scenario,
  Station,
  StationType,
} from './types';

/** Хелпер измеримой величины с провенансом. */
export function measured(
  value: number | null,
  unit?: string,
  source: MeasuredSource = 'operator',
  note?: string
): Measured {
  return { value, unit, source, note };
}

/** Пустая станция заданного типа — карточка готова к заполнению в wizard. */
export function createEmptyStation(stationType: StationType = 'fire'): Station {
  return {
    input: {
      station_type: stationType,
      purpose: 'пожаротушение-общее',
      Q: measured(null, 'м³/ч'),
      H: measured(null, 'м'),
      reservation_scheme: '1/1',
      working_pumps: 1,
      reserve_pumps: 1,
      jockey_required: false,
      assumptions: [],
    },
  };
}

/** Пустое расчётное дело с одной станцией. */
export function createEmptyDossier(caseId: string, scenario: Scenario = 'подбор-с-нуля'): Dossier {
  const meta: Meta = { case_id: caseId, scenario };
  return { meta, stations: [createEmptyStation('fire')] };
}

/** Глубокая копия дела (для иммутабельных шагов конвейера). */
export function cloneDossier(d: Dossier): Dossier {
  return JSON.parse(JSON.stringify(d)) as Dossier;
}
