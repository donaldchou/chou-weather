import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 統一處理錯誤：HttpError 用它的狀態碼，其他回 500 */
export function handleError(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof SyntaxError) return NextResponse.json({ error: 'JSON 格式錯誤' }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : '伺服器錯誤' }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '請傳入 JSON 物件');
  return body as Record<string, unknown>;
}
