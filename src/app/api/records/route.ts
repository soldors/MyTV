// 播放记录（M1）：登录用户的云端续看数据，按（用户, 源, 影片）upsert。
// 站长会话（admin）同样落库，user_name='admin'。

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { checkNonNegativeNumber, checkVodItem } from '@/lib/validate';

export const runtime = 'nodejs';

/** GET：当前用户的播放记录（save_time 倒序） */
export async function GET(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const limitRaw = parseInt(new URL(req.url).searchParams.get('limit') || '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  const storage = await getStorage();
  const list = await storage.listPlayRecords(result.session.name, limit);
  return NextResponse.json({ list });
}

/** POST：写入/更新一条播放记录（进度、集数） */
export async function POST(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const item = checkVodItem(raw);
  if (!item.ok) return NextResponse.json({ error: item.error }, { status: 400 });

  const storage = await getStorage();
  const record = await storage.upsertPlayRecord(result.session.name, {
    ...item.value,
    episodeIndex: Math.trunc(checkNonNegativeNumber(raw.episodeIndex)),
    totalTime: checkNonNegativeNumber(raw.totalTime),
    playTime: checkNonNegativeNumber(raw.playTime),
  });
  return NextResponse.json({ success: true, record });
}

/** DELETE：删除一条（?source=&vodId=）或清空当前用户全部记录 */
export async function DELETE(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const params = new URL(req.url).searchParams;
  const source = params.get('source');
  const vodId = params.get('vodId');
  const storage = await getStorage();

  if (source || vodId) {
    const item = checkVodItem({ source, vodId, title: 'x' });
    if (!item.ok) return NextResponse.json({ error: item.error }, { status: 400 });
    const removed = await storage.deletePlayRecord(result.session.name, item.value.source, item.value.vodId);
    return NextResponse.json({ success: true, removed });
  }
  await storage.clearPlayRecords(result.session.name);
  return NextResponse.json({ success: true });
}
