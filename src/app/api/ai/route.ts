import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { askAi } from '@/server/ai';

/** Маршрут ИИ-запроса. POST { system?, prompt, model?, jsonMode? } → { content, model, usage }. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { system, prompt, model, jsonMode } = body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Поле prompt обязательно' }, { status: 400 });
    }
    const result = await askAi({ system, prompt, model, jsonMode });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
