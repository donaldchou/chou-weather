import { connection, NextResponse } from 'next/server';
import { handleError } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';

/** GET /api/auth/me 目前登入的使用者（沒登入回 401） */
export async function GET() {
  // 每次請求都重新執行（會讀登入 cookie，不能在 build 時預先產生）；放在 try 外面，讓 Next.js 自己處理
  await connection();
  try {
    return NextResponse.json(await requireUser());
  } catch (err) {
    return handleError(err);
  }
}
