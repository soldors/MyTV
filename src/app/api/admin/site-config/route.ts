// 站点设置（M4）：注册开关 / 注册审批 / 成人过滤 / 站点名 / 公告。
// 键集对照 docs/01 §9.1 一期范围（#15 最小后台）。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

/** GET：当前站点配置 */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  return NextResponse.json({ config: await storage.getSiteConfig() });
}

/** PATCH：部分更新（布尔开关 + 可选文本字段） */
export async function PATCH(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const patch: Record<string, unknown> = {};
  for (const key of ['registrationEnabled', 'registrationApproval', 'adultFilterEnabled'] as const) {
    if (body[key] !== undefined) patch[key] = body[key] === true;
  }
  if (body.searchMaxPages !== undefined) {
    const n = Math.trunc(Number(body.searchMaxPages));
    if (!Number.isFinite(n) || n < 1 || n > 50) return jsonError('搜索页数须为 1-50', 400);
    patch.searchMaxPages = n;
  }
  if (body.adultFilterWords !== undefined) {
    const raw = Array.isArray(body.adultFilterWords) ? body.adultFilterWords : [];
    const words = [
      ...new Set(
        raw
          .filter((w): w is string => typeof w === 'string')
          .map((w) => w.trim())
          .filter((w) => w.length > 0 && w.length <= 32)
      ),
    ].slice(0, 100);
    patch.adultFilterWords = words;
  }
  if (body.siteName !== undefined) {
    const siteName = typeof body.siteName === 'string' ? body.siteName.trim() : '';
    patch.siteName = siteName || undefined;
  }
  if (body.announcement !== undefined) {
    const announcement = typeof body.announcement === 'string' ? body.announcement.trim() : '';
    patch.announcement = announcement || undefined;
  }
  if (Object.keys(patch).length === 0) return jsonError('无有效配置字段', 400);

  const storage = await getStorage();
  const config = await storage.saveSiteConfig(patch);
  return NextResponse.json({ success: true, config });
}
