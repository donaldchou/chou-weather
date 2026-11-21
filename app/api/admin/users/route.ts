import { connection, NextResponse } from 'next/server';
import { HttpError, handleError, readJson } from '@/lib/server/api';
import { assertPassword, hashPassword, requireAdmin, toPublic, type Ll3User } from '@/lib/server/auth';
import { assertCode } from '@/lib/server/codes';
import { ll3 } from '@/lib/server/ll3';

/** GET /api/admin/users 所有使用者（管理者在前） */
export async function GET() {
  // 每次請求都重新執行（會讀登入 cookie，不能在 build 時預先產生）；放在 try 外面，讓 Next.js 自己處理
  await connection();
  try {
    await requireAdmin();
    return NextResponse.json((await ll3<Ll3User[]>('user_list')).map(toPublic));
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/admin/users { email, password, name?, role? } 新增使用者（預設一般使用者），需要驗證碼 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    await assertCode(req.headers, admin.id, 'create');
    const body = await readJson(req);
    assertPassword(body.password);
    const role = body.role ?? 'user';
    if (role !== 'admin' && role !== 'user') throw new HttpError(400, '身分只能是管理者或一般使用者');
    const u = await ll3<Ll3User>('user_create', {
      email: String(body.email ?? '').trim().toLowerCase(),
      name: String(body.name ?? ''),
      role,
      password_hash: await hashPassword(body.password),
    });
    return NextResponse.json(toPublic(u), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
