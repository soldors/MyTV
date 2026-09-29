// 可用数据源列表：env 预置（DEFAULT_SOURCES）+ D1 api_sources（M4 后台管理，仅启用项）。
// 同地址去重时 env 优先；DB 源带稳定 key（db_xxxxxxxx），作为 /play/:source 路径段。
// 直播源（DEFAULT_LIVE_SOURCES）随本出口下发（M5）。

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { getEnvLiveSources } from '@/lib/env-live-sources';
import { listVodSources } from '@/lib/source-registry';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  return NextResponse.json({ sources: await listVodSources(), liveSources: getEnvLiveSources() });
}
