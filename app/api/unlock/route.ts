import { connection, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { HttpError, handleError, readJson } from '@/lib/server/api';
import { requireAdmin, requireUser } from '@/lib/server/auth';
import { assertCodeValue } from '@/lib/server/codes';
import { UNLOCK_COOKIE, UNLOCK_HOURS, signUnlock, unlockCookie, verifyUnlock } from '@/lib/server/session';

/** GET /api/unlock → { expiresAt }：解鎖中回傳到期時間（毫秒），否則 null */
export async function GET() {
  // 每次請求都重新執行（會讀登入 cookie，不能在 build 時預先產生）；放在 try 外面，讓 Next.js 自己處理
  await connection();
  try {
    const user = await requireUser();
    return NextResponse.json({ expiresAt: await verifyUnlock((await cookies()).get(UNLOCK_COOKIE)?.value, user.id) });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/unlock { code, hours? } 驗證碼正確就解鎖 hours 小時（1–12，預設 1） */
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await readJson(req);
    const hours = Number(body.hours ?? UNLOCK_HOURS.default);
    if (!Number.isInteger(hours) || hours < UNLOCK_HOURS.min || hours > UNLOCK_HOURS.max) {
      throw new HttpError(400, `解鎖時數需為 ${UNLOCK_HOURS.min}–${UNLOCK_HOURS.max} 小時`);
    }
    assertCodeValue(String(body.code ?? ''), 'unlock');
    const { token, expiresAt } = await signUnlock(user.id, hours);
    const res = NextResponse.json({ expiresAt });
    res.cookies.set(unlockCookie(token, hours));
    return res;
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/unlock 提前鎖定 */
export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(UNLOCK_COOKIE);
  return res;
}
