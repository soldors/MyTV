// 搜索历史（M1）：同关键词重搜移到最新，每用户保留上限 20 条（见 lib/storage.ts）。

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';

export const runtime = 'nodejs';

/** GET：当前用户的搜索历史（最新在前） */
export async function GET(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const storage = await getStorage();
  const list = await storage.listSearchHistory(result.session.name);
  return NextResponse.json({ list });
}

/** POST：记录一条搜索关键词 */
export async function POST(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  let keyword = '';
  try {
    const body = (await req.json()) as { keyword?: unknown };
    keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (!keyword || keyword.length > 100) {
    return NextResponse.json({ error: '无效的搜索关键词' }, { status: 400 });
  }

  const storage = await getStorage();
  await storage.addSearchHistory(result.session.name, keyword);
  return NextResponse.json({ success: true });
}

/** DELETE：删除单条（?keyword=）或清空当前用户历史 */
export async function DELETE(req: Request) {
  const result = await requireSessionUser(req);
  if ('error' in result) return result.error;

  const keyword = new URL(req.url).searchParams.get('keyword');
  const storage = await getStorage();

  if (keyword) {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length > 100) {
      return NextResponse.json({ error: '无效的搜索关键词' }, { status: 400 });
    }
    const removed = await storage.removeSearchHistory(result.session.name, trimmed);
    return NextResponse.json({ success: true, removed });
  }
  await storage.clearSearchHistory(result.session.name);
  return NextResponse.json({ success: true });
}
