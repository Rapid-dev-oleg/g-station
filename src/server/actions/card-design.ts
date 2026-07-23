'use server';

/**
 * Дизайн карточки РЕЗУЛЬТАТА расчёта — конфиг блоков (CardLayout) на типе.
 * Приложение рисует блоки из каталога; здесь — чтение/сохранение конфига и
 * ИИ-помощник (инженер описывает словами → ИИ переставляет/скрывает/переименует
 * блоки). Никакого произвольного HTML: ИИ возвращает только список блоков из
 * каталога, мы валидируем его перед сохранением. Типы общие → доступ супер-админу.
 */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { requireSuperAdmin } from '@/server/auth';
import { runKimiAgent } from '@/server/ai/kimi-agent';
import {
  CARD_BLOCK_CATALOG, coerceCardLayout, validateCardLayout, type CardLayout,
} from '@/lib/card/layout';

export type ActionResult = { ok: true } | { ok: false; error: string };

const revalidate = (code: string) => {
  revalidatePath(`/admin/types/${code}/card`);
};

export async function getCardDesign(code: string): Promise<{
  code: string;
  name: string;
  layout: CardLayout;
  customized: boolean;
} | null> {
  await requireSuperAdmin();
  const t = await db.systemType.findUnique({ where: { code }, select: { code: true, name: true, cardLayout: true } });
  if (!t) return null;
  return { code: t.code, name: t.name, layout: coerceCardLayout(t.cardLayout), customized: t.cardLayout != null };
}

/** Сохранить дизайн карточки типа (валидируется по каталогу блоков). */
export async function saveCardLayout(code: string, layout: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const valid = validateCardLayout(layout);
  if (typeof valid === 'string') return { ok: false, error: valid };
  const exists = await db.systemType.findUnique({ where: { code }, select: { code: true } });
  if (!exists) return { ok: false, error: 'Тип не найден' };
  await db.systemType.update({ where: { code }, data: { cardLayout: valid as object } });
  revalidate(code);
  return { ok: true };
}

/** Сбросить к дизайну по умолчанию (cardLayout → null). */
export async function resetCardLayout(code: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await db.systemType.update({ where: { code }, data: { cardLayout: Prisma.DbNull } });
  revalidate(code);
  return { ok: true };
}

function extractLayoutJson(out: string): unknown | null {
  const marked = out.match(/<<<RESULT>>>\n?([\s\S]*?)\n?<<<END_RESULT>>>/);
  let raw = (marked ? marked[1] : out).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  if (raw[0] !== '[') {
    const arr = raw.match(/\[[\s\S]*\]/);
    if (arr) raw = arr[0];
  }
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * ИИ-помощник дизайна карточки. Инженер описывает словами («смету наверх»,
 * «скрой гейты», «переименуй состав в спецификацию»), ИИ возвращает ПОЛНЫЙ
 * новый список блоков. Ничего не сохраняет — редактор показывает результат,
 * инженер применяет и жмёт «Сохранить».
 */
export async function proposeCardLayout(
  code: string,
  instruction: string,
  current: CardLayout,
): Promise<{ ok: true; layout: CardLayout } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if (!instruction.trim()) return { ok: false, error: 'Опишите, как изменить карточку' };
  const exists = await db.systemType.findUnique({ where: { code }, select: { code: true } });
  if (!exists) return { ok: false, error: 'Тип не найден' };

  const catalog = CARD_BLOCK_CATALOG.map((b) => `- "${b.type}" — ${b.label}: ${b.description}`).join('\n');
  const prompt =
    'Ты — конструктор ДИЗАЙНА КАРТОЧКИ РЕЗУЛЬТАТА расчёта насосной станции. Карточка = ' +
    'упорядоченный список блоков из фиксированного КАТАЛОГА. Тебе дают ИНСТРУКЦИЮ инженера ' +
    'и ТЕКУЩИЙ список блоков (JSON). Верни ПОЛНЫЙ новый список блоков — массив JSON — между ' +
    'строками-маркерами <<<RESULT>>> и <<<END_RESULT>>> (каждый маркер на своей строке). ' +
    'Меняй только то, что просит инструкция. Никаких пояснений вне маркеров.\n\n' +
    'ПРАВИЛА:\n' +
    '- Каждый блок: {"type":"<тип из каталога>", "title":"<своя подпись, необязательно>", "hidden":<true чтобы скрыть, необязательно>}.\n' +
    '- Порядок в массиве = порядок блоков в карточке (сверху вниз).\n' +
    '- Каждый тип блока встречается НЕ БОЛЕЕ одного раза.\n' +
    '- Использовать можно ТОЛЬКО типы из каталога ниже — новых не придумывать.\n' +
    '- Чтобы убрать блок — либо удали из массива, либо поставь "hidden": true.\n\n' +
    `КАТАЛОГ БЛОКОВ:\n${catalog}\n\n` +
    `ИНСТРУКЦИЯ ИНЖЕНЕРА:\n${instruction.trim()}\n\n` +
    `=== ТЕКУЩИЙ СПИСОК БЛОКОВ ===\n${JSON.stringify(current, null, 2)}\n=== КОНЕЦ ===`;

  let output: string;
  try {
    ({ output } = await runKimiAgent({ prompt, timeoutMs: 3 * 60 * 1000 }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ошибка ИИ' };
  }

  const parsed = extractLayoutJson(output);
  const valid = validateCardLayout(parsed);
  if (typeof valid === 'string') return { ok: false, error: `ИИ предложил некорректный дизайн (${valid}) — уточните запрос` };
  return { ok: true, layout: valid };
}
