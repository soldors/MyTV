// 忘记密码第二步：凭站长批准的一次性重置码设置新密码。
// 校验 approved 且未过期的申请 + 重置码（PBKDF2 恒定时间比较），成功后标记 used。

import { NextResponse } from 'next/server';
import { checkRateLimit, clientIpOf } from '@/lib/auth';
import { getStorage } from '@/lib/d1-storage';
import { hashPassword, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

const NAME_PATTERN = /^[\w-]{2,32}$/;
const CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export async function POST(req: Request) {
  const ip = clientIpOf(req);
  if (!checkRateLimit(`reset:${ip}`)) {
    return NextResponse.json({ error: '尝试次数过多，请 10 分钟后再试' }, { status: 429 });
  }

  let username = '';
  let code = '';
  let newPassword = '';
  try {
    const body = (await req.json()) as { username?: unknown; code?: unknown; newPassword?: unknown };
    username = typeof body.username === 'string' ? body.username.trim() : '';
    code = typeof body.code === 'string' ? body.code.trim() : '';
    newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (!NAME_PATTERN.test(username)) return NextResponse.json({ error: '请输入有效的用户名' }, { status: 400 });
  if (!CODE_PATTERN.test(code)) return NextResponse.json({ error: '重置码格式不正确' }, { status: 400 });
  if (newPassword.length < 6 || newPassword.length > 64) {
    return NextResponse.json({ error: '新密码需 6-64 位' }, { status: 400 });
  }

  const storage = await getStorage();
  // 用户不存在与未批准同文案（防枚举）
  const user = await storage.getUserWithCredentials(username);
  if (!user) {
    return NextResponse.json({ error: '申请未批准或已过期，请联系站长' }, { status: 403 });
  }
  const approved = await storage.findApprovedPasswordReset(username);
  if (!approved) {
    return NextResponse.json({ error: '申请未批准或已过期，请联系站长' }, { status: 403 });
  }

  // 重置码逐字校验（verifyPassword 内部恒定时间比较）
  const codeOk = await verifyPassword(code, {
    hash: approved.codeHash.split(':')[0],
    salt: approved.codeHash.split(':')[1],
    iterations: parseInt(approved.codeHash.split(':')[2], 10),
  });
  if (!codeOk) {
    return NextResponse.json({ error: '重置码不正确' }, { status: 403 });
  }

  const hashed = await hashPassword(newPassword);
  const updated = await storage.updateUserPassword(username, {
    passwordHash: hashed.hash,
    salt: hashed.salt,
    iterations: hashed.iterations,
  });
  if (!updated) {
    return NextResponse.json({ error: '重置失败，请稍后重试' }, { status: 500 });
  }
  await storage.consumePasswordReset(approved.id);
  return NextResponse.json({ success: true, message: '密码已重置，请使用新密码登录' });
}
