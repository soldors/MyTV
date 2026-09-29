// 分源健康与探活快照（M6）：仪表盘「数据源可用率」柱条与数据源页「状态」点共用的数据出口。
// 按 url 聚合返回（而不是按源列表返回）：前台源含 env 预置与 DB 启用源，后台表格里还有停用的 DB 源，
// 两边各自用手上那份清单 join url 即可，避免这里再决定「该显示哪些源」。

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 30;

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const rawDays = Math.trunc(Number(new URL(req.url).searchParams.get('days')));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, MAX_WINDOW_DAYS) : 7;
  const now = Date.now();

  const storage = await getStorage();
  const [health, catalog] = await Promise.all([
    storage.getSourceHealthSince(now - days * DAY_MS),
    storage.listSourceCatalog(),
  ]);

  const byUrl: Record<
    string,
    {
      pct: number;
      samples: number;
      avgMs: number;
      probe: { ok: boolean; ms?: number; total?: number; probedAt?: number } | null;
    }
  > = {};
  for (const h of health) {
    byUrl[h.url] = {
      ...(byUrl[h.url] ?? { probe: null }),
      pct: h.samples > 0 ? Math.round((h.okCount / h.samples) * 1000) / 10 : 0,
      samples: h.samples,
      avgMs: h.avgMs,
    };
  }
  for (const c of catalog) {
    const probe = { ok: c.ok === true, ms: c.ms, total: c.total, probedAt: c.probedAt };
    if (byUrl[c.url]) byUrl[c.url].probe = probe;
    else byUrl[c.url] = { pct: 0, samples: 0, avgMs: 0, probe };
  }

  return NextResponse.json({ windowDays: days, byUrl });
}
