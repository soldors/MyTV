// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明
// 改动（M6）：探活结果落 source_catalog（后台数据源页的「状态」点要跨请求存活，
//             不再只在手点一次的那次响应里出现）。落库失败不影响探活本身。

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import { fetchUpstream } from '@/lib/fetch-utils';
import { parseSearchList } from '@/lib/cms-parser';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

/** 探活快照落库（best-effort：D1 不可用时静默跳过） */
async function rememberProbe(url: string, ok: boolean, ms: number): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.saveSourceCatalog(url, { ok, ms });
  } catch {
    /* 探活结果照常返回 */
  }
}

/** 点播源探活：以搜索 "test" 的响应耗时与结果量衡量可用性 */
export async function POST(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  let url = '';
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url || '').trim().replace(/\/+$/, '');
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: '无效的源地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(url);
  if (!verdict.ok) {
    await rememberProbe(url, false, 0);
    return NextResponse.json({ ok: false, ms: 0, error: verdict.reason });
  }

  const start = Date.now();
  try {
    const res = await fetchUpstream(`${url}?ac=videolist&wd=test`, {
      timeoutMs: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', Accept: 'application/json' },
    });
    const ms = Date.now() - start;
    if (!res.ok) {
      await rememberProbe(url, false, ms);
      return NextResponse.json({ ok: false, ms, error: `HTTP ${res.status}` });
    }
    const data = await res.json();
    const list = parseSearchList(data, { key: 'test', name: 'test', url });
    await rememberProbe(url, true, ms);
    return NextResponse.json({ ok: true, ms, count: list.length });
  } catch (err) {
    const ms = Date.now() - start;
    await rememberProbe(url, false, ms);
    return NextResponse.json({
      ok: false,
      ms,
      error: err instanceof Error ? (err.name === 'TimeoutError' || err.name === 'AbortError' ? '超时' : err.message) : '请求失败',
    });
  }
}
