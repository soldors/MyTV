// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明

import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';
import type { VerifiedSession } from './session';

/** API Route 共享守卫：未配置密码返回 503，未登录返回 401 */
export async function guardRequest(req: Request): Promise<NextResponse | null> {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: '服务器未设置 PASSWORD 环境变量' },
      { status: 503 }
    );
  }
  if (!(await sessionFromCookieHeader(req.headers.get('cookie')))) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  return null;
}

/**
 * 需要绑定具体用户身份的接口守卫（播放记录/收藏/搜索历史等）：
 * 成功返回会话（用户名 + 角色），失败返回 503/401 响应。
 */
export async function requireSessionUser(
  req: Request
): Promise<{ session: VerifiedSession } | { error: NextResponse }> {
  if (!isPasswordConfigured()) {
    return {
      error: NextResponse.json(
        { error: '服务器未设置 PASSWORD 环境变量' },
        { status: 503 }
      ),
    };
  }
  const session = await sessionFromCookieHeader(req.headers.get('cookie'));
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }
  return { session };
}

/**
 * /api/admin/* 路由的自校验守卫（纵深防御；middleware 已按路径强制）：
 * 非管理员与 middleware 同样返回 404，不暴露后台存在性。
 */
export async function requireAdmin(req: Request): Promise<{ session: VerifiedSession } | { error: NextResponse }> {
  if (!isPasswordConfigured()) {
    return {
      error: NextResponse.json(
        { error: '服务器未设置 PASSWORD 环境变量' },
        { status: 503 }
      ),
    };
  }
  const session = await sessionFromCookieHeader(req.headers.get('cookie'));
  if (!session || session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Not Found' }, { status: 404 }) };
  }
  return { session };
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
