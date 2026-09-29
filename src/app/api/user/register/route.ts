// 普通用户注册（M1）：按站点配置决定注册开关与审批策略（#9 密码门禁 + 注册需审批）。
// 审批开关开启时新用户 status=pending，登录被拒直至站长审批（M4 后台界面；当前可用
// wrangler d1 execute 调整：UPDATE users SET status='active' WHERE name='...'）。

import { NextResponse } from 'next/server';
import { checkRateLimit, clientIpOf } from '@/lib/auth';
import { getStorage } from '@/lib/d1-storage';
import { hashPassword } from '@/lib/password';

export const runtime = 'nodejs';

const NAME_RE = /^[A-Za-z0-9_-]{2,32}$/;
/** 站长（环境变量 PASSWORD）在会话中的固定身份，注册不可占用 */
const RESERVED_NAMES = new Set(['admin']);

export async function POST(req: Request) {
  if (!checkRateLimit(`reg:${clientIpOf(req)}`)) {
    return NextResponse.json({ error: '尝试次数过多，请 10 分钟后再试' }, { status: 429 });
  }

  let name = '';
  let password = '';
  try {
    const body = (await req.json()) as { name?: unknown; password?: unknown };
    name = typeof body.name === 'string' ? body.name.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: '用户名须为 2-32 位字母/数字/下划线/短横线' }, { status: 400 });
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return NextResponse.json({ error: '该用户名被保留' }, { status: 400 });
  }
  if (password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: '密码长度须为 6-128 位' }, { status: 400 });
  }

  const storage = await getStorage();
  const config = await storage.getSiteConfig();
  if (!config.registrationEnabled) {
    return NextResponse.json({ error: '注册已关闭' }, { status: 403 });
  }
  if (await storage.getUser(name)) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const status = config.registrationApproval ? 'pending' : 'active';
  const hashed = await hashPassword(password);
  const user = await storage.createUser(
    name,
    { passwordHash: hashed.hash, salt: hashed.salt, iterations: hashed.iterations },
    // 注册来源 IP 供后台「最新注册用户」列使用（D4）
    { status, registerIp: clientIpOf(req) || undefined }
  );
  return NextResponse.json({
    success: true,
    status: user.status,
    message: user.status === 'pending' ? '注册成功，等待站长审批后即可登录' : '注册成功，现在可以登录',
  });
}
