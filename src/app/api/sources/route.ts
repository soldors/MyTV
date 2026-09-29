// 可用数据源列表：env 预置（DEFAULT_SOURCES）+ D1 api_sources（M4 后台管理，仅启用项）。
// 同地址去重时 env 优先；DB 源带稳定 key（db_xxxxxxxx），作为 /play/:source 路径段。

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { getEnvSources } from '@/lib/env-sources';
import type { SourceConfig } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  const envSources = getEnvSources();
  let dbSources: SourceConfig[] = [];
  try {
    const storage = await getStorage();
    const records = await storage.listApiSources();
    dbSources = records
      .filter((r) => r.enabled)
      .map((r) => ({
        key: r.key,
        name: r.name,
        url: r.apiUrl,
        detail: r.detailUrl,
        isAdult: r.isAdult,
      }));
  } catch {
    // DB 不可用时仍返回 env 源，前台不致完全不可用
  }

  const seenUrls = new Set(envSources.map((s) => s.url));
  const sources = [...envSources, ...dbSources.filter((s) => !seenUrls.has(s.url))];
  return NextResponse.json({ sources });
}
