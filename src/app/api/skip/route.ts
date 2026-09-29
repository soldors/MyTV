// 跳过片头片尾配置（L7 补 UI）：按（用户, 源, 影片）读写秒级时间点。
// GET ?source=&vodId= 返回配置（无则 null）；POST 保存（四字段齐全，0 表示未设置）。

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import type { SkipConfig } from '@/lib/types';

export const runtime = 'nodejs';

function checkParams(source: string | null, vodId: string | null): string | null {
  if (!source || source.length > 256) return '无效的源标识';
  if (!vodId || !/^[\w-]{1,64}$/.test(vodId)) return '无效的影片ID';
  return null;
}

function checkTime(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n < 86_400 ? Math.floor(n) : 0;
}

/** GET：当前用户对该影片的跳过配置 */
export async function GET(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const params = new URL(req.url).searchParams;
  const invalid = checkParams(params.get('source'), params.get('vodId'));
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const storage = await getStorage();
  const config = await storage.getSkipConfig(result.session.name, params.get('source')!, params.get('vodId')!);
  return NextResponse.json({ config });
}

/** POST：保存（覆盖式；仅站长/用户本人） */
export async function POST(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  const vodId = typeof raw.vodId === 'string' ? raw.vodId.trim() : '';
  const invalid = checkParams(source, vodId);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const config: SkipConfig = {
    introStart: checkTime(raw.introStart),
    introEnd: checkTime(raw.introEnd),
    outroStart: checkTime(raw.outroStart),
    outroEnd: checkTime(raw.outroEnd),
  };
  if (config.introEnd > 0 && config.introEnd <= config.introStart) {
    return NextResponse.json({ error: '片头结束时间须大于开始时间' }, { status: 400 });
  }

  const storage = await getStorage();
  await storage.saveSkipConfig(result.session.name, source, vodId, config);
  return NextResponse.json({ success: true, config });
}
