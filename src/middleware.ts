import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// /admin/* 与 /api/admin/* 的管理员会话守卫。
// middleware 运行在（模拟）Worker 的 fetch 处理器里，不可依赖 node:crypto，
// 故用 WebCrypto 复刻 lib/auth.ts 的 HMAC-SHA256 会话签名校验（同盐、同格式，互通）。
// 非管理员一律 404（不暴露后台存在性）。

const SESSION_COOKIE = 'mytv_session';
const SESSION_SALT = ':mytv::session-salt';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toHex(digest);
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toHex(sig);
}

function sessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const c of cookieHeader.split(';')) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(c.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function verifySessionToken(env: { PASSWORD?: string; PROXY_SECRET?: string }, token: string): Promise<boolean> {
  const password = env.PASSWORD || '';
  if (!password) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = env.PROXY_SECRET || (await sha256Hex(password + SESSION_SALT));
  const expected = await hmacHex(secret, payload);
  if (sig.length !== expected.length) return false;
  // 固定长度 hex 的常量时间比较（WebCrypto 无 timingSafeEqual）
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  const expiresAt = parseInt(payload, 10);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

export async function middleware(req: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  const token = sessionTokenFromCookieHeader(req.headers.get('cookie'));
  const authorized = token
    ? await verifySessionToken(env as { PASSWORD?: string; PROXY_SECRET?: string }, token)
    : false;

  if (authorized) return NextResponse.next();

  // 页面与 API 都返回 404：不向未授权者暴露后台存在性
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
