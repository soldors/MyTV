// 可用数据源列表（M2）：当前来自 DEFAULT_SOURCES 环境变量预置；
// M4 后台交付后将合并 D1 api_sources 表（本路由是唯一出口，前端不感知来源差异）。

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { getEnvSources } from '@/lib/env-sources';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  return NextResponse.json({ sources: getEnvSources() });
}
