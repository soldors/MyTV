import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sessionFromCookieHeader } from '@/lib/session';

// /admin/* 与 /api/admin/* 的管理员会话守卫（自研，上游无中间件）。
// 会话校验复用 lib/session.ts 的 WebCrypto 单实现（与 Node 路由互通）；
// M1 起会话携带角色，仅 admin 角色放行——普通用户会话也一律 404，
// 不向任何未授权者暴露后台存在性。

export async function middleware(req: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  const session = await sessionFromCookieHeader(
    req.headers.get('cookie'),
    env as { PASSWORD?: string; PROXY_SECRET?: string }
  );
  if (session?.role === 'admin') return NextResponse.next();

  // 页面与 API 都返回 404：不向未授权者暴露后台存在性
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
