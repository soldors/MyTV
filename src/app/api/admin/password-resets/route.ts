// 密码重置审批（后台）：站长查看申请列表，批准（生成一次性重置码，明文仅此一次
// 返回给站长线下告知用户，24h 有效）/ 拒绝。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { hashPassword } from '@/lib/password';

export const runtime = 'nodejs';

/** 重置码有效期：24 小时 */
const CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** 生成 8 位字母数字重置码（去易混淆字符） */
function generateResetCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/** GET：申请列表 */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  return NextResponse.json({ requests: await storage.listPasswordResetRequests() });
}

/** POST：{id, action:'approve'|'reject'}；approve 返回一次性重置码明文 */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const id = Math.trunc(Number(body.id) || 0);
  const action = body.action;
  if (!id) return jsonError('缺少申请 ID', 400);

  const storage = await getStorage();

  if (action === 'approve') {
    // 重置码哈希按 `hash:salt:iterations` 组合存单列（hex 与数字均不含冒号，可安全 split）
    const code = generateResetCode();
    const hashed = await hashPassword(code);
    const approved = await storage.approvePasswordReset(
      id,
      `${hashed.hash}:${hashed.salt}:${hashed.iterations}`,
      Date.now() + CODE_TTL_MS
    );
    if (!approved) return jsonError('申请不存在或已处理', 404);
    // 明文重置码只此一次返回；站长复制给用户，过期/已用即失效
    return NextResponse.json({ success: true, code, expiresAt: approved.expiresAt, request: approved });
  }

  if (action === 'reject') {
    const rejected = await storage.rejectPasswordReset(id);
    if (!rejected) return jsonError('申请不存在或已处理', 404);
    return NextResponse.json({ success: true, request: rejected });
  }

  return jsonError('未知操作', 400);
}
