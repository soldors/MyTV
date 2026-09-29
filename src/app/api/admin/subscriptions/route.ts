// 数据源订阅管理（M4）：TVBox / SourceList 订阅 URL 的增删 + 导入。
// 解析复用 M0 移植的 tvbox-parser；导入结果去重后入 api_sources 表。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { getEnvSources } from '@/lib/env-sources';
import { fetchUpstream } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import { parseSubscriptionJson, parseSubscriptionPayload } from '@/lib/tvbox-parser';

export const runtime = 'nodejs';

interface ImportResult {
  imported: number;
  skippedExisting: number;
  errors: string[];
}

/** 拉取并解析订阅，去重后导入 api_sources */
async function importSubscription(url: string): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skippedExisting: 0, errors: [] };
  const verdict = await checkUpstreamAllowed(url);
  if (!verdict.ok) {
    result.errors.push(verdict.reason);
    return result;
  }
  // 读文本而非 json()：部分 TVBox 配置带注释/尾随逗号，需要宽容解析
  const res = await fetchUpstream(url, { timeoutMs: 8000, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    result.errors.push(`订阅地址返回 HTTP ${res.status}`);
    return result;
  }
  const text = await res.text();

  const parsed = parseSubscriptionPayload(parseSubscriptionJson(text));
  const storage = await getStorage();
  const existingUrls = new Set<string>([
    ...(await storage.listApiSources()).map((s) => s.apiUrl),
    ...getEnvSources().map((s) => s.url),
  ]);

  for (const source of parsed.sources) {
    if (existingUrls.has(source.url)) {
      result.skippedExisting += 1;
      continue;
    }
    await storage.createApiSource({
      name: source.name,
      apiUrl: source.url,
      detailUrl: source.detail,
      isAdult: source.isAdult,
    });
    existingUrls.add(source.url);
    result.imported += 1;
  }
  return result;
}

/** GET：订阅列表 */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  return NextResponse.json({ subscriptions: await storage.listSubscriptions() });
}

/** POST：{url, name?} 添加并立即导入；{id, action:'resync'} 重新同步 */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('请求格式错误', 400);
  }

  const storage = await getStorage();

  if (body.action === 'resync') {
    const id = Math.trunc(Number(body.id) || 0);
    const subs = await storage.listSubscriptions();
    const target = subs.find((s) => s.id === id);
    if (!target) return jsonError('订阅不存在', 404);
    try {
      const result = await importSubscription(target.url);
      await storage.touchSubscription(id, result.imported);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : '同步失败', 502);
    }
  }

  const url = typeof body.url === 'string' ? body.url.trim().replace(/\/+$/, '') : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
  if (!/^https?:\/\//.test(url)) return jsonError('无效的订阅地址', 400);

  try {
    const importResult = await importSubscription(url);
    if (importResult.errors.length > 0 && importResult.imported === 0) {
      return jsonError(importResult.errors[0], 502);
    }
    const subscription = await storage.addSubscription(url, name, importResult.imported);
    return NextResponse.json({ success: true, subscription, ...importResult });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '导入失败', 502);
  }
}

/** DELETE：?id= */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const id = Math.trunc(Number(new URL(req.url).searchParams.get('id')) || 0);
  if (!id) return jsonError('缺少订阅 ID', 400);

  const storage = await getStorage();
  // 只删订阅记录，不回滚已导入的源（源在数据源页可单独管理）
  const removed = await storage.deleteSubscription(id);
  return NextResponse.json({ success: true, removed });
}
