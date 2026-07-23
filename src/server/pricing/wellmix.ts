/**
 * Клиент Wellmix API — источник подбора насосов (kind='api', provider='wellmix').
 * Живой вызов на шаге «Подбор»: по рабочей точке Q/H возвращает конкретные насосы
 * с ценой и наличием по складам. Спецификация — docs/reference/wellmix-api.md.
 *
 * Конфиг/секрет берутся из записи Source (реестр источников, редактируется в UI):
 *   baseUrl  — https://wellmix-pump.ru/api/
 *   token    — api-токен (секрет)
 *   config   — { endpoints?: { params?, select? } }
 */

export interface WellmixSource {
  baseUrl?: string | null;
  token?: string | null;
  config?: unknown;
}

export interface PumpQuery {
  q: number; // расход, м³/ч  → efficiency
  h: number; // напор, м      → pressure
  powerFrom?: number;
  powerTo?: number;
  numberOfPumps?: number;
  series?: string | string[];
}

const DEF_SELECT = 'performance/get/';
const DEF_PARAMS = 'parameters/get/';

function endpoints(config: unknown): { params: string; select: string } {
  const c = (config ?? {}) as { endpoints?: { params?: string; select?: string } };
  return { params: c.endpoints?.params ?? DEF_PARAMS, select: c.endpoints?.select ?? DEF_SELECT };
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function getJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { status: 'error', error: `не-JSON ответ (${res.status})`, raw: text.slice(0, 300) }; }
  } finally {
    clearTimeout(t);
  }
}

/** Оставляем в ответе агенту только полезное для подбора (без графиков/html). */
function trimPump(p: Record<string, unknown>) {
  const wh = Array.isArray(p.warehouses) ? p.warehouses : [];
  return {
    id: p.id, name: p.name, article: p.article, price: p.price, available: p.available,
    type: p.type, expenditure: p.expenditure, nominal_pressure: p.nominal_pressure,
    maximum_pressure: p.maximum_pressure, power: p.power, kpd: p.kpd, npsh: p.npsh,
    energy_efficiency_class: p.energy_efficiency_class,
    nozzle_suction: p.nozzle_on_the_suction_side, nozzle_discharge: p.nozzle_on_the_pressure_side,
    mounting_length: p.mounting_length, weight: p.weight,
    warehouses: (wh as Record<string, unknown>[]).map((w) => ({
      name: w.name, availability: w.availability,
      transits: Array.isArray(w.transits) ? w.transits : undefined,
    })),
  };
}

/** Справочники Wellmix (серии, DN и т.п.) — parameters/get. */
export async function wellmixParameters(src: WellmixSource): Promise<unknown> {
  if (!src.baseUrl) return { status: 'error', error: 'у источника нет baseUrl' };
  if (!src.token) return { status: 'error', error: 'у источника не задан токен (укажите в реестре источников)' };
  const url = `${joinUrl(src.baseUrl, endpoints(src.config).params)}?token=${encodeURIComponent(src.token)}`;
  return getJson(url);
}

/** Подбор насосов Wellmix по рабочей точке Q/H — performance/get. */
export async function wellmixSelectPumps(
  src: WellmixSource,
  q: PumpQuery,
): Promise<{ status: string; error?: string; count?: number; pumps?: unknown[] }> {
  if (!src.baseUrl) return { status: 'error', error: 'у источника нет baseUrl' };
  if (!src.token) return { status: 'error', error: 'у источника не задан токен (укажите в реестре источников)' };

  const params = new URLSearchParams();
  params.set('token', src.token);
  params.set('efficiency', String(q.q));
  params.set('pressure', String(q.h));
  if (q.powerFrom != null) params.set('power_from', String(q.powerFrom));
  if (q.powerTo != null) params.set('power_to', String(q.powerTo));
  if (q.numberOfPumps != null) params.set('number_of_pumps', String(q.numberOfPumps));
  if (q.series != null) {
    const s = Array.isArray(q.series) ? q.series.join(',') : q.series;
    if (s) params.set('series', s);
  }

  const url = `${joinUrl(src.baseUrl, endpoints(src.config).select)}?${params.toString()}`;
  const res = (await getJson(url)) as { status?: string; error?: string; data?: { pumps?: unknown[] }; pumps?: unknown[] };

  if (res?.status === 'error') return { status: 'error', error: res.error ?? 'ошибка API' };
  const pumps = res?.data?.pumps ?? res?.pumps ?? [];
  const trimmed = (Array.isArray(pumps) ? pumps : []).map((p) => trimPump(p as Record<string, unknown>));
  return { status: 'success', count: trimmed.length, pumps: trimmed };
}
