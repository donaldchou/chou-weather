import { HttpError } from './api';

/**
 * 呼叫 ll3 的 /platform/chou-weather/admin_api.asp（帳號、天氣資料、更新紀錄都存在 ll3 的 weather.mdb）。
 * 金鑰用 LL3_API_KEY（和 ingest.asp 同一組）。ASP 一律回 HTTP 200，錯誤碼放在 JSON 的 status。
 */
const ADMIN_URL = process.env.LL3_ADMIN_URL || 'https://www.ll3.com.tw/platform/chou-weather/admin_api.asp';

export async function ll3<T = unknown>(action: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<T> {
  const key = process.env.LL3_API_KEY;
  if (!key) throw new HttpError(500, '伺服器尚未設定 LL3_API_KEY');
  const body = new URLSearchParams({ key, action });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(ADMIN_URL, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new HttpError(502, `連不上 ll3 主機：${(e as Error).message}`);
  }
  const text = await res.text();
  let j: { ok: boolean; data?: T; status?: number; error?: string };
  try {
    j = JSON.parse(text);
  } catch {
    throw new HttpError(502, `ll3 主機回應格式錯誤（HTTP ${res.status}）`);
  }
  if (!j.ok) throw new HttpError(j.status && j.status < 600 ? j.status : 502, j.error ?? 'll3 主機錯誤');
  return j.data as T;
}
