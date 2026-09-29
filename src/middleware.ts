import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sessionFromCookieHeader } from '@/lib/session';

// /admin/* 与 /api/admin/* 的管理员会话守卫（自研，上游无中间件）。
// 会话校验复用 lib/session.ts 的 WebCrypto 单实现（与 Node 路由互通）；
// M1 起会话携带角色，仅 admin 角色放行。
//
// 入口拆分（2026-09-29 拍板）：/admin 本身是站长登录页，放行未登录访问；
// 其余 /admin/* 页面未授权重定向到 /admin 登录；/api/admin/* 维持 404（API 不暴露）。

export async function middleware(req: NextRequest) {
  // 登录页自身放行（页面内自校验：已登录管理员直接跳工作台）
  if (req.nextUrl.pathname === '/admin') return NextResponse.next();

  const { env } = await getCloudflareContext({ async: true });
  const session = await sessionFromCookieHeader(
    req.headers.get('cookie'),
    env as { PASSWORD?: string; PROXY_SECRET?: string }
  );
  if (session?.role === 'admin') return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  // 后台子页面：送回站长登录页（带回跳）
  const loginUrl = new URL('/admin', req.url);
  if (req.nextUrl.pathname !== '/admin/dashboard') {
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
