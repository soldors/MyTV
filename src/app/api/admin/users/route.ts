// 用户管理（M4）：审批（pending→active）、禁用/启用、删除（级联清理云端数据）、重置密码。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { hashPassword } from '@/lib/password';
import type { UserStatus } from '@/lib/storage';

export const runtime = 'nodejs';

const STATUSES: UserStatus[] = ['pending', 'active', 'disabled'];

/** GET：用户列表 */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  return NextResponse.json({ users: await storage.listUsers() });
}

/** PATCH：{name, status?} 或 {name, newPassword?} */
export async function PATCH(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonError('缺少用户名', 400);
  if (name === 'admin') return jsonError('站长账号由环境变量管理，不可在此操作', 400);

  const storage = await getStorage();
  const user = await storage.getUser(name);
  if (!user) return jsonError('用户不存在', 404);

  if (body.status !== undefined) {
    const status = body.status as UserStatus;
    if (!STATUSES.includes(status)) return jsonError('无效的状态', 400);
    const updated = await storage.updateUserStatus(name, status);
    return NextResponse.json({ success: true, updated });
  }

  if (body.newPassword !== undefined) {
    const password = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (password.length < 6 || password.length > 128) return jsonError('密码长度须为 6-128 位', 400);
    const hashed = await hashPassword(password);
    const updated = await storage.updateUserPassword(name, {
      passwordHash: hashed.hash,
      salt: hashed.salt,
      iterations: hashed.iterations,
    });
    return NextResponse.json({ success: true, updated });
  }

  return jsonError('无有效操作字段', 400);
}

/** DELETE：?name=（级联删除播放记录/收藏/历史/跳过配置） */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const name = new URL(req.url).searchParams.get('name') || '';
  if (!name) return jsonError('缺少用户名', 400);
  if (name === 'admin') return jsonError('站长账号不可删除', 400);

  const storage = await getStorage();
  const removed = await storage.deleteUser(name);
  return NextResponse.json({ success: true, removed });
}
