// 忘记密码第一步：提交重置申请（待站长审批）。
// 与登录同款限流；无论用户名是否存在都返回相同成功文案（不暴露注册面）。

import { NextResponse } from 'next/server';
import { checkRateLimit, clientIpOf } from '@/lib/auth';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

const NAME_PATTERN = /^[\w-]{2,32}$/;

export async function POST(req: Request) {
  const ip = clientIpOf(req);
  if (!checkRateLimit(`forgot:${ip}`)) {
    return NextResponse.json({ error: '尝试次数过多，请 10 分钟后再试' }, { status: 429 });
  }

  let username = '';
  try {
    const body = (await req.json()) as { username?: unknown };
    username = typeof body.username === 'string' ? body.username.trim() : '';
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (!NAME_PATTERN.test(username)) {
    return NextResponse.json({ error: '请输入有效的用户名' }, { status: 400 });
  }

  try {
    const storage = await getStorage();
    // 用户名不存在也照样入库（防枚举）；站长审批时自然能看到并拒绝
    await storage.createPasswordResetRequest(username);
  } catch {
    return NextResponse.json({ error: '提交失败，请稍后重试' }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: '已提交申请，请等待站长审批后使用重置码设置新密码' });
}
