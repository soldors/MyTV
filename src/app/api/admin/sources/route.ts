// 后台数据源管理（M4）：苹果CMS 源增删改（api_sources 表）。
// 环境变量预置源（DEFAULT_SOURCES）只读展示——改源请加到库里。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { getEnvSources } from '@/lib/env-sources';

export const runtime = 'nodejs';

/** GET：全部源（DB 可管理 + env 只读参考） */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  const dbSources = await storage.listApiSources();
  const envSources = getEnvSources();
  return NextResponse.json({
    dbSources,
    envSources: envSources.map((s) => ({ name: s.name, url: s.url, isAdult: s.isAdult === true })),
  });
}

function checkUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(trimmed) || trimmed.length > 2048) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

/** POST：新增数据源 {name, url, detail?, isAdult?, weight?} */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const apiUrl = checkUrl(body.url);
  if (!name || name.length > 64) return jsonError('无效的源名称', 400);
  if (!apiUrl) return jsonError('无效的接口地址（须为公网 http/https）', 400);

  let detailUrl: string | undefined;
  if (typeof body.detail === 'string' && body.detail !== '') {
    const checked = checkUrl(body.detail);
    if (!checked) return jsonError('无效的详情页地址', 400);
    detailUrl = checked;
  }

  const weight = Math.min(Math.max(Math.trunc(Number(body.weight) || 0), 0), 1000);

  const storage = await getStorage();
  const record = await storage.createApiSource({
    name,
    apiUrl,
    detailUrl,
    isAdult: body.isAdult === true,
    weight,
  });
  return NextResponse.json({ success: true, source: record });
}

/** PATCH：修改 {key, ...patch} */
export async function PATCH(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return jsonError('缺少源标识', 400);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 64) return jsonError('无效的源名称', 400);
    patch.name = name;
  }
  if (body.url !== undefined) {
    const apiUrl = checkUrl(body.url);
    if (!apiUrl) return jsonError('无效的接口地址', 400);
    patch.apiUrl = apiUrl;
  }
  if (body.detail !== undefined) {
    if (body.detail === '') {
      patch.detailUrl = undefined;
    } else {
      const detailUrl = checkUrl(body.detail);
      if (!detailUrl) return jsonError('无效的详情页地址', 400);
      patch.detailUrl = detailUrl;
    }
  }
  if (body.isAdult !== undefined) patch.isAdult = body.isAdult === true;
  if (body.weight !== undefined) patch.weight = Math.min(Math.max(Math.trunc(Number(body.weight) || 0), 0), 1000);
  if (body.enabled !== undefined) patch.enabled = body.enabled === true;

  const storage = await getStorage();
  const updated = await storage.updateApiSource(key, patch);
  if (!updated) return jsonError('源不存在', 404);
  return NextResponse.json({ success: true, source: updated });
}

/** DELETE：?key= */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const key = new URL(req.url).searchParams.get('key') || '';
  if (!key) return jsonError('缺少源标识', 400);

  const storage = await getStorage();
  const removed = await storage.deleteApiSource(key);
  return NextResponse.json({ success: true, removed });
}
