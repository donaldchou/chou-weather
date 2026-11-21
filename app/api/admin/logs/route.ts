import { NextResponse } from 'next/server';
import { handleError } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/auth';
import { ll3 } from '@/lib/server/ll3';

/** GET /api/admin/logs?kind=realtime|daily|admin&ok=1|0&page=1&size=50 更新紀錄（weather.mdb update_log） */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await ll3('logs', {
      kind: q.get('kind') ?? '', ok: q.get('ok') ?? '', page: q.get('page') ?? '1', size: q.get('size') ?? '50',
    }));
  } catch (err) {
    return handleError(err);
  }
}
