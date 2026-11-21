import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { HttpError } from './api';
import { ll3 } from './ll3';
import { SESSION_COOKIE, verifySession, type Role } from './session';

/** ll3 weather.mdb users 表的一列（不含密碼雜湊） */
type Ll3User = {
  id: string; email: string; name: string | null; role: Role; active: boolean;
  last_login: string | null; created_at: string | null; updated_at: string | null;
};

export type PublicUser = {
  id: string; email: string; name: string; role: Role; active: boolean; lastLoginAt: string | null; createdAt: string | null;
};

export const toPublic = (u: Ll3User): PublicUser => ({
  id: u.id, email: u.email, name: u.name ?? '', role: u.role === 'admin' ? 'admin' : 'user', active: !!u.active,
  lastLoginAt: u.last_login, createdAt: u.created_at,
});

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, '密碼至少要 8 個字元');
}

export async function findUserByEmail(email: string) {
  return ll3<(Ll3User & { password_hash: string }) | null>('user_by_email', { email });
}

/**
 * 從 cookie 取出目前登入的使用者，並回 ll3 確認帳號還在、沒被停用。
 * 身分以資料庫為準，所以後台改了身分或停用帳號會立刻生效。
 */
export async function currentUser(): Promise<PublicUser | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const u = await ll3<Ll3User | null>('user_get', { id: session.userId });
  if (!u || !u.active) return null;
  return toPublic(u);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, '請先登入');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, '只有管理者可以使用後台');
  return user;
}

export type { Ll3User };
