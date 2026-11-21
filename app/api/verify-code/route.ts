import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { HttpError, handleError, readJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/auth';
import { assertCodeValue, type CodeAction } from '@/lib/server/codes';
import { UNLOCK_COOKIE, verifyUnlock } from '@/lib/server/session';

/**
 * POST /api/verify-code { action, code } 只檢查驗證碼、不做任何修改，
 * 讓畫面在打開新增／重設密碼表單前先確認。真正送出時後端還會再檢查一次。
 */
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await readJson(req);
    const action = body.action as CodeAction;
    if (!['create', 'update', 'delete'].includes(action)) throw new HttpError(400, 'action 必須是 create、update 或 delete');
    if ((await verifyUnlock((await cookies()).get(UNLOCK_COOKIE)?.value, user.id)) === null) {
      assertCodeValue(String(body.code ?? ''), action);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
