// 系统状态（M6 后台二期）：版本、绑定自检、D1 各表行数、各源最近探活、环境变量键名清单。
// 绝不回显任何环境变量的值——只有键名（docs/09 §1.5）。

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';
import { getKvRaw } from '@/lib/kv-cache';
import { getStorage } from '@/lib/d1-storage';
import { listVodSources } from '@/lib/source-registry';

export const runtime = 'nodejs';

/** 展示行数的表（顺序即界面顺序） */
const D1_TABLES = [
  'users', 'play_records', 'favorites', 'search_histories', 'skip_configs',
  'api_sources', 'admin_configs', 'subscriptions', 'source_health', 'source_catalog',
] as const;

const ENV_KEYS_SHOWN = [
  'PASSWORD', 'PROXY_SECRET', 'DEFAULT_SOURCES', 'DEFAULT_LIVE_SOURCES',
  'SEARCH_CACHE_TTL_SECONDS', 'DETAIL_CACHE_TTL_SECONDS', 'CIRCUIT_FAILURE_THRESHOLD',
  'CIRCUIT_OPEN_MS', 'SEARCH_MAX_PAGES', 'LIVE_ALLOW_PRIVATE', 'FALLBACK_CORS_PROXY', 'COOKIE_SECURE',
] as const;

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  // D1 自检 + 行数
  const tables: { name: string; rows: number | null }[] = [];
  let dbOk = true;
  try {
    const storage = await getStorage();
    const counts = await Promise.all(
      D1_TABLES.map((t) =>
        storage.db
          .prepare(`SELECT COUNT(*) AS n FROM ${t}`)
          .first<{ n: number }>()
          .then((r) => r?.n ?? 0)
          .catch(() => null)
      )
    );
    for (let i = 0; i < D1_TABLES.length; i++) {
      tables.push({ name: D1_TABLES[i], rows: counts[i] });
    }
  } catch {
    dbOk = false;
  }

  // KV 自检（list 一页即可证明绑定可用）
  let kvOk = false;
  try {
    const kv = await getKvRaw();
    if (kv) {
      await kv.list({ limit: 1 });
      kvOk = true;
    }
  } catch {
    kvOk = false;
  }

  // 各源最近探活（source_catalog 按 url join 源清单取名称）
  let sourceProbes: { name: string; url: string; ok?: boolean; ms?: number; probedAt?: number }[] = [];
  try {
    const storage = await getStorage();
    const [sources, catalog] = await Promise.all([listVodSources(), storage.listSourceCatalog()]);
    const catalogByUrl = new Map(catalog.map((c) => [c.url, c]));
    sourceProbes = sources.map((s) => {
      const c = catalogByUrl.get(s.url);
      return { name: s.name, url: s.url, ok: c?.ok, ms: c?.ms, probedAt: c?.probedAt };
    });
  } catch {
    // 留空，界面显示未采集
  }

  const envKeys = ENV_KEYS_SHOWN.filter((k) => {
    // 已配置的键才列出（判断存在即可，不回显值）
    const v = process.env[k];
    return v !== undefined && v !== '';
  });

  return NextResponse.json({
    dbOk,
    kvOk,
    tables,
    sourceProbes,
    envKeys,
    timestamp: Date.now(),
  });
}
