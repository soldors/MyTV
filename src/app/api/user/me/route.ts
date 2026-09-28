// 当前会话身份查询（M1）：站长（/api/auth 登录）与普通用户（/api/user/login 登录）通用。

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/api-guard';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;
  const { name, role, expiresAt } = result.session;
  return NextResponse.json({ user: { name, role, expiresAt } });
}
