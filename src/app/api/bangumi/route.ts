// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明
// Bangumi 每日放送出口：GET /api/bangumi → 按星期分组的放送表（复用 DoubanItem 结构）。

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchBangumiCalendar } from '@/lib/bangumi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  try {
    const days = await fetchBangumiCalendar();
    return NextResponse.json(days, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bangumi 放送表获取失败' },
      { status: 502 }
    );
  }
}
