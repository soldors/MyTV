// 收藏（M1）：按（用户, 源, 影片）upsert / 删除 / 列表。

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { checkVodItem } from '@/lib/validate';

export const runtime = 'nodejs';

/** GET：当前用户的收藏列表（save_time 倒序） */
export async function GET(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const limitRaw = parseInt(new URL(req.url).searchParams.get('limit') || '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  const storage = await getStorage();
  const list = await storage.listFavorites(result.session.name, limit);
  return NextResponse.json({ list });
}

/** POST：加入/刷新收藏（已存在时更新标题与封面） */
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
  await storage.addFavorite(result.session.name, item.value);
  return NextResponse.json({ success: true });
}

/** DELETE：取消收藏（?source=&vodId=） */
export async function DELETE(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const params = new URL(req.url).searchParams;
  const source = params.get('source');
  const vodId = params.get('vodId');
  if (!source || !vodId) {
    return NextResponse.json({ error: '缺少 source / vodId 参数' }, { status: 400 });
  }
  const item = checkVodItem({ source, vodId, title: 'x' });
  if (!item.ok) return NextResponse.json({ error: item.error }, { status: 400 });

  const storage = await getStorage();
  const removed = await storage.removeFavorite(result.session.name, item.value.source, item.value.vodId);
  return NextResponse.json({ success: true, removed });
}
