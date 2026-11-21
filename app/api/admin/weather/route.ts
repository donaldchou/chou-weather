import { connection, NextResponse } from 'next/server';
import { HttpError, handleError, readJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/auth';
import { assertCode } from '@/lib/server/codes';
import { ll3 } from '@/lib/server/ll3';

/**
 * 後台「天氣資料」：讀寫 ll3 weather.mdb
 * GET    ?type=stations
 * GET    ?type=hourly&station=&from=YYYY-MM-DD&to=YYYY-MM-DD（最多 31 天）
 * GET    ?type=daily&station=&from=&to=（最多 400 天）
 * PUT    { station, time: 'YYYY-MM-DD HH', values: { t: 12.3, rh: null, ... } }  修改／新增一小時（需要驗證碼）
 * DELETE { station, time }  刪除一小時（需要驗證碼）
 * 修改後 ll3 會自動重算該小時的上巴陵綜合資料與當天的逐日統計。
 */
const DAY = /^\d{4}-\d\d-\d\d$/;

export async function GET(req: Request) {
  // 每次請求都重新執行（會讀登入 cookie，不能在 build 時預先產生）；放在 try 外面，讓 Next.js 自己處理
  await connection();
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams;
    const type = q.get('type');
    if (type === 'stations') return NextResponse.json(await ll3('stations'));
    if (type !== 'hourly' && type !== 'daily') throw new HttpError(400, 'type 要是 stations、hourly 或 daily');
    const from = q.get('from') ?? '', to = q.get('to') ?? '';
    if (!DAY.test(from) || !DAY.test(to)) throw new HttpError(400, '日期格式要是 YYYY-MM-DD');
    return NextResponse.json(await ll3(type, { station: q.get('station') ?? '', from, to }));
  } catch (err) {
    return handleError(err);
  }
}

function target(body: Record<string, unknown>) {
  const station = String(body.station ?? ''), time = String(body.time ?? '');
  if (!/^[A-Za-z0-9-]{3,20}$/.test(station)) throw new HttpError(400, '測站代號不正確');
  if (!/^\d{4}-\d\d-\d\d \d\d$/.test(time)) throw new HttpError(400, '時間格式要是 YYYY-MM-DD HH');
  return { station, time };
}

export async function PUT(req: Request) {
  try {
    const admin = await requireAdmin();
    await assertCode(req.headers, admin.id, 'update');
    const body = await readJson(req);
    const values = body.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'values 要是物件');
    return NextResponse.json(await ll3('hourly_save', { ...target(body), values: JSON.stringify(values), by: admin.email }));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin();
    await assertCode(req.headers, admin.id, 'delete');
    const body = await readJson(req);
    return NextResponse.json(await ll3('hourly_delete', { ...target(body), by: admin.email }));
  } catch (err) {
    return handleError(err);
  }
}
