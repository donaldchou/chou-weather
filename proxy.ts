import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/server/session';

/** 不用登入就能進的路徑（/api/relay 給 cron-job.org 呼叫，用自己的 key 驗證） */
const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout', '/api/relay'];

/**
 * 整個網站都要登入，包含 /data/*.json 天氣資料檔。這裡只驗證 JWT 簽章（不查資料庫），
 * 帳號停用、管理者權限由各 API 的 requireUser / requireAdmin 再回 ll3 確認。
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC.includes(pathname)) {
    if (session && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith('/api/') || pathname.startsWith('/data/')) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    const login = new URL('/login', req.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(login);
    if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (session.role !== 'admin') {
    if (pathname.startsWith('/api/admin/')) return NextResponse.json({ error: '只有管理者可以使用後台' }, { status: 403 });
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
