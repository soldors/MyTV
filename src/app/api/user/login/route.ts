// 普通用户登录（M1）：D1 users 表校验（PBKDF2），通过后签发携带用户身份的会话 cookie。
// 站长登录走 /api/auth（PASSWORD 环境变量），两者共用同一 cookie 与校验实现。

import { NextResponse } from 'next/server';
import { applySessionCookie, checkRateLimit, clearRateLimit, clientIpOf, signSession } from '@/lib/auth';
import { getStorage } from '@/lib/d1-storage';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = clientIpOf(req);
  if (!checkRateLimit(`login:${ip}`)) {
    return NextResponse.json(
      { success: false, error: '尝试次数过多，请 10 分钟后再试' },
      { status: 429 }
    );
  }

  let name = '';
  let password = '';
  try {
    const body = (await req.json()) as { name?: unknown; password?: unknown };
    name = typeof body.name === 'string' ? body.name.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  if (!name || !password) {
    return NextResponse.json({ success: false, error: '请输入用户名和密码' }, { status: 400 });
  }

  const storage = await getStorage();
  const user = await storage.getUserWithCredentials(name);
  // 用户不存在与密码错误同文案同状态码，不泄露注册面
  if (!user || !(await verifyPassword(password, { hash: user.passwordHash, salt: user.salt, iterations: user.iterations }))) {
    return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 });
  }
  if (user.status === 'pending') {
    return NextResponse.json({ success: false, error: '账号待审批，请联系站长' }, { status: 403 });
  }
  if (user.status === 'disabled') {
    return NextResponse.json({ success: false, error: '账号已被禁用' }, { status: 403 });
  }

  clearRateLimit(`login:${ip}`);
  const { token, expiresAt } = await signSession({ name: user.name, role: user.role });
  const res = NextResponse.json({ success: true, user: { name: user.name, role: user.role } });
  applySessionCookie(res, req, token, expiresAt);
  return res;
}
