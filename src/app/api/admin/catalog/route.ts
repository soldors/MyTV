// 收录量刷新（M6）：逐个源请求 `?ac=videolist&pg=1`（不带关键词、不带分类），
// 读苹果CMS 响应里的 total 作为该源收录影片数，连同耗时落 source_catalog。
// 注意不能带 t=：t 是分类 ID，会把 total 变成该分类的条目数（实测 cj 源 t=1 → 1，全站 → 156231）。
// 这是「一次点击换一批出网请求」的后台动作，故限并发、限单源超时，且只在站长按下时跑。

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';
import { buildCmsApi, cmsRequestHeaders } from '@/lib/cms-parser';
import { parseCmsPagePayload } from '@/lib/cms-xml';
import { getStorage } from '@/lib/d1-storage';
import { fetchUpstream } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import { listVodSources } from '@/lib/source-registry';

export const runtime = 'nodejs';

/** 同时在途的源数：个人站源量级下够快，也不至于一口气打爆上游 */
const CONCURRENCY = 6;
const SOURCE_TIMEOUT_MS = 8000;

function readTotal(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const raw = (payload as { total?: unknown }).total;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const storage = await getStorage();
  const sources = await listVodSources();
  let ok = 0;
  let failed = 0;
  let missingTotal = 0;

  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (source) => {
        const start = Date.now();
        const verdict = await checkUpstreamAllowed(source.url);
        if (!verdict.ok) return { ok: false, ms: 0, total: undefined as number | undefined };
        try {
          const res = await fetchUpstream(buildCmsApi(source.url, 'ac=videolist&pg=1'), {
            timeoutMs: SOURCE_TIMEOUT_MS,
            headers: cmsRequestHeaders(),
          });
          const ms = Date.now() - start;
          if (!res.ok) return { ok: false, ms, total: undefined };
          const total = readTotal(parseCmsPagePayload(await res.text()));
          return { ok: true, ms, total };
        } catch {
          return { ok: false, ms: Date.now() - start, total: undefined };
        }
      })
    );

    for (const r of results) {
      if (r.ok) ok += 1;
      else failed += 1;
      if (r.ok && r.total === undefined) missingTotal += 1;
    }
    // 快照落库失败不应中断整轮刷新（源状态照常返回）
    await Promise.all(
      batch.map((source, idx) =>
        storage.saveSourceCatalog(source.url, { ok: results[idx].ok, ms: results[idx].ms, total: results[idx].total })
      )
    ).catch(() => undefined);
  }

  const catalog = await storage.listSourceCatalog();
  const total = catalog.reduce((sum, c) => sum + (c.total ?? 0), 0);
  return NextResponse.json({ success: true, ok, failed, missingTotal, total, sources: sources.length });
}
