// 直播源维护（后台，对齐数据源管理）：D1 live_sources 增删改 + M3U 探活（频道数落 source_catalog）
// + env 预置源（DEFAULT_LIVE_SOURCES）并入展示，删除走 hiddenEnvLiveSources 覆盖层（可恢复）。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { getEnvLiveSources } from '@/lib/env-live-sources';
import { fetchUpstream } from '@/lib/fetch-utils';
import { checkLiveUrlAllowed } from '@/lib/ssrf';
import { parseM3u } from '@/lib/m3u-parser';
import type { SourceCatalogEntry } from '@/lib/storage';

export const runtime = 'nodejs';

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

/** GET：全部直播源（DB 可管理 + env 只读参考 + 已屏蔽列表），带 source_catalog 探活快照 */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  const dbSources = await storage.listLiveSources();
  const envSources = getEnvLiveSources();
  const hidden = new Set((await storage.getSiteConfig().catch(() => undefined))?.hiddenEnvLiveSources ?? []);
  const catalog = new Map<string, SourceCatalogEntry>(
    (await storage.listSourceCatalog().catch(() => []) as SourceCatalogEntry[]).map((c) => [c.url, c])
  );
  const withProbe = (s: { url: string }) => {
    const c = catalog.get(s.url);
    return { probeOk: c?.ok, probeMs: c?.ms, probeChannels: c?.total, probedAt: c?.probedAt };
  };

  return NextResponse.json({
    dbSources: dbSources.map((s) => ({ ...s, ...withProbe(s) })),
    envSources: envSources
      .filter((s) => !hidden.has(s.url))
      .map((s) => ({ name: s.name, url: s.url, epg: s.epg, ...withProbe(s) })),
    hiddenEnvSources: envSources.filter((s) => hidden.has(s.url)).map((s) => ({ name: s.name, url: s.url })),
  });
}

/** 探活一个 M3U 订阅：拉取解析数频道，快照落 source_catalog（total=频道数） */
async function probeLive(url: string) {
  const start = Date.now();
  const verdict = await checkLiveUrlAllowed(url);
  if (!verdict.ok) {
    await rememberProbe(url, false, 0);
    return { ok: false, ms: 0, error: verdict.reason };
  }
  try {
    const res = await fetchUpstream(url, { timeoutMs: 15000, retries: 1, allowPrivate: true });
    const ms = Date.now() - start;
    if (!res.ok) {
      await rememberProbe(url, false, ms);
      return { ok: false, ms, error: `HTTP ${res.status}` };
    }
    const channels = parseM3u(await res.text(), url);
    await rememberProbe(url, true, ms, channels.length);
    return { ok: true, ms, channels: channels.length };
  } catch (err) {
    const ms = Date.now() - start;
    await rememberProbe(url, false, ms);
    return {
      ok: false,
      ms,
      error: err instanceof Error ? (err.name === 'TimeoutError' || err.name === 'AbortError' ? '超时' : err.message) : '请求失败',
    };
  }
}

/** 探活快照落库（best-effort：D1 不可用时静默跳过） */
async function rememberProbe(url: string, ok: boolean, ms: number, channels?: number): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.saveSourceCatalog(url, { ok, ms, total: channels });
  } catch {
    /* 探活结果照常返回 */
  }
}

/** POST：新增直播源 {name, url, epg?}；{action:'probe', url} 探活；{action:'restoreEnv', url} 恢复被删 env 源 */
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

  if (body.action === 'probe') {
    const url = checkUrl(body.url);
    if (!url) return jsonError('无效的订阅地址', 400);
    return NextResponse.json(await probeLive(url));
  }

  if (body.action === 'restoreEnv') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url || !getEnvLiveSources().some((s) => s.url === url)) return jsonError('未找到该环境变量直播源', 404);
    const current = (await storage.getSiteConfig()).hiddenEnvLiveSources ?? [];
    await storage.saveSiteConfig({ hiddenEnvLiveSources: current.filter((u) => u !== url) });
    return NextResponse.json({ success: true });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = checkUrl(body.url);
  if (!name || name.length > 64) return jsonError('无效的源名称', 400);
  if (!url) return jsonError('无效的 M3U 订阅地址（须为公网 http/https）', 400);
  let epg: string | undefined;
  if (typeof body.epg === 'string' && body.epg !== '') {
    const checked = checkUrl(body.epg);
    if (!checked) return jsonError('无效的 EPG 地址', 400);
    epg = checked;
  }

  const record = await storage.createLiveSource({ name, url, epg });
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
    const url = checkUrl(body.url);
    if (!url) return jsonError('无效的 M3U 订阅地址', 400);
    patch.url = url;
  }
  if (body.epg !== undefined) {
    if (body.epg === '') {
      patch.epg = undefined;
    } else {
      const epg = checkUrl(body.epg);
      if (!epg) return jsonError('无效的 EPG 地址', 400);
      patch.epg = epg;
    }
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled === true;

  const storage = await getStorage();
  const updated = await storage.updateLiveSource(key, patch);
  if (!updated) return jsonError('直播源不存在', 404);
  return NextResponse.json({ success: true, source: updated });
}

/** DELETE：?key=（dbl_ 删库记录；envlive:<url> 写入屏蔽覆盖层） */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const key = new URL(req.url).searchParams.get('key') || '';
  if (!key) return jsonError('缺少源标识', 400);

  const storage = await getStorage();

  if (key.startsWith('envlive:')) {
    const url = key.slice('envlive:'.length);
    if (!getEnvLiveSources().some((s) => s.url === url)) return jsonError('未找到该环境变量直播源', 404);
    const current = (await storage.getSiteConfig()).hiddenEnvLiveSources ?? [];
    if (!current.includes(url)) {
      await storage.saveSiteConfig({ hiddenEnvLiveSources: [...current, url] });
    }
    return NextResponse.json({ success: true });
  }

  const removed = await storage.deleteLiveSource(key);
  return NextResponse.json({ success: true, removed });
}
