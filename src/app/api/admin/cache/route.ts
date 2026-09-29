// 缓存管理（M6 后台二期，docs/01 §9.1 二期项）：KV 键空间概览 + 按前缀清除。
// 只碰本站自己的两个前缀（search:/detail:），不做任意前缀的删除。

import { NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/api-guard';
import { getKvRaw } from '@/lib/kv-cache';

export const runtime = 'nodejs';

/** 允许管理的前缀 → 展示名与 TTL 现值（秒） */
const MANAGED_PREFIXES = [
  {
    prefix: 'search:',
    label: '搜索缓存',
    ttlSeconds: process.env.SEARCH_CACHE_TTL_SECONDS || '1800',
  },
  {
    prefix: 'detail:',
    label: '详情缓存',
    ttlSeconds: process.env.DETAIL_CACHE_TTL_SECONDS || '21600',
  },
] as const;

interface KvKeyInfo {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

async function countPrefix(kv: KVNamespace, prefix: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor, limit: 100 });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

/** GET：键空间概览（各前缀键数 + TTL 现值） */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const kv = await getKvRaw();
  if (!kv) return jsonError('KV 绑定不可用', 503);

  const entries = await Promise.all(
    MANAGED_PREFIXES.map(async ({ prefix, label, ttlSeconds }) => ({
      prefix,
      label,
      ttlSeconds: parseInt(ttlSeconds, 10),
      keys: await countPrefix(kv, prefix).catch(() => 0),
    }))
  );
  return NextResponse.json({ entries });
}

/** DELETE：?prefix=search:|detail: 清除对应键空间 */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const prefix = new URL(req.url).searchParams.get('prefix') || '';
  if (!MANAGED_PREFIXES.some((p) => p.prefix === prefix)) {
    return jsonError('仅支持 search: / detail: 前缀', 400);
  }

  const kv = await getKvRaw();
  if (!kv) return jsonError('KV 绑定不可用', 503);

  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list<KvKeyInfo>({ prefix, cursor, limit: 100 });
    await Promise.all(page.keys.map((k) => kv.delete(k.name)));
    deleted += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return NextResponse.json({ success: true, deleted });
}
