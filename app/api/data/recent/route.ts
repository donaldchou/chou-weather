import { connection, NextResponse } from 'next/server';
import { HttpError, handleError } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { ll3 } from '@/lib/server/ll3';

/**
 * 圖表用的最新資料：直接讀 ll3 weather.mdb（cron-job 每 10 分鐘寫進去的資料）
 * GET ?since=YYYY-MM-DD HH（台灣時間）→ { now, stations: { id: { time: [...], t: [...], ... } } }
 * 舊的歷年資料放在 /data/*.json（固定檔，讀起來快），這裡補上之後的部分，網頁再把兩邊合起來。
 */
export async function GET(req: Request) {
  await connection();
  try {
    const since = new URL(req.url).searchParams.get('since') ?? '';
    if (!/^\d{4}-\d\d-\d\d \d\d$/.test(since)) throw new HttpError(400, 'since 格式要是 YYYY-MM-DD HH');
    const [, data] = await Promise.all([requireUser(), ll3('recent', { since })]);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return handleError(err);
  }
}
