import { NextResponse } from 'next/server';
import { HttpError, handleError, readJson } from '@/lib/server/api';
import { assertPassword, hashPassword, requireAdmin, toPublic, type Ll3User } from '@/lib/server/auth';
import { assertCode } from '@/lib/server/codes';
import { ll3 } from '@/lib/server/ll3';

/** PATCH /api/admin/users/[id] { name?, role?, active?, password? }，需要驗證碼 */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  try {
    const admin = await requireAdmin();
    await assertCode(req.headers, admin.id, 'update');
    const { id } = await ctx.params;
    const body = await readJson(req);
    const p: Record<string, string> = { id };
    if (typeof body.name === 'string') {
      p.name = body.name.trim();
      if (!p.name) p.clear_name = '1';
    }
    if (body.role !== undefined) {
      if (id === admin.id) throw new HttpError(400, '不能變更自己的身分');
      if (body.role !== 'admin' && body.role !== 'user') throw new HttpError(400, '身分只能是管理者或一般使用者');
      p.role = body.role;
    }
    if (body.active !== undefined) {
      if (id === admin.id) throw new HttpError(400, '不能停用自己的帳號');
      p.active = body.active ? '1' : '0';
    }
    if (body.password !== undefined) {
      assertPassword(body.password);
      p.password_hash = await hashPassword(body.password);
    }
    return NextResponse.json(toPublic(await ll3<Ll3User>('user_update', p)));
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/admin/users/[id]，需要驗證碼；不能刪自己 */
export async function DELETE(req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  try {
    const admin = await requireAdmin();
    await assertCode(req.headers, admin.id, 'delete');
    const { id } = await ctx.params;
    if (id === admin.id) throw new HttpError(400, '不能刪除自己的帳號');
    await ll3('user_delete', { id });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
