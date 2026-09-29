// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明
// 改动（M1）：站长会话携带固定身份 admin（role=admin）；GET 返回当前会话用户，
//             登出 DELETE 对站长与普通用户会话同样生效（同一 cookie）。

import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  ADMIN_SESSION_USER,
  applySessionCookie,
  checkPassword,
  checkRateLimit,
  clearRateLimit,
  clientIpOf,
  isPasswordConfigured,
  sessionFromCookieHeader,
  signSession,
} from '@/lib/auth';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { success: false, error: '服务器未设置 PASSWORD 环境变量，请联系管理员配置' },
      { status: 503 }
    );
  }

  const ip = clientIpOf(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: '尝试次数过多，请 10 分钟后再试' },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = (await req.json()) as { password?: string };
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
  }

  clearRateLimit(ip);
  const { token, expiresAt } = await signSession(ADMIN_SESSION_USER);
  const res = NextResponse.json({ success: true, user: ADMIN_SESSION_USER });
  applySessionCookie(res, req, token, expiresAt);
  return res;
}

/** GET：查询当前会话状态（站长或普通用户）+ 站点品牌信息（前台顶栏/公告条，L15） */
export async function GET(req: Request) {
  const session = await sessionFromCookieHeader(req.headers.get('cookie'));

  let site: { siteName?: string; announcement?: string } = {};
  try {
    const config = await (await getStorage()).getSiteConfig();
    site = { siteName: config.siteName, announcement: config.announcement };
  } catch {
    // DB 不可用时不阻断会话查询，站点信息回落默认
  }

  return NextResponse.json({
    success: true,
    verified: session !== null,
    user: session ? { name: session.name, role: session.role } : null,
    site,
  });
}

/** DELETE：登出（清除会话 cookie） */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
