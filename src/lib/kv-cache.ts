// KV 缓存层（M3）：搜索/详情热数据的 L2 缓存（L1 为 fetch-utils 的内存缓存）。
// 免费额度 KV 写 1000 次/天 —— 写侧必须节制：
//   - 搜索只缓存高频词（同一 key 在窗口内出现 ≥2 次才写，见 SEARCH_KV 门控）
//   - 详情 6h TTL，每影片每窗口最多写一次
// KV 最终一致（跨边缘传播 ~60s），对缓存场景可接受。

import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface KvCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/**
 * 取 KV 缓存；绑定缺失（如 next dev 未接绑定）或读写失败时返回 null，
 * 调用方回落内存缓存/上游请求——缓存层永不阻断主流程。
 */
let cached: KvCache | null | undefined;

export async function getKvCache(): Promise<KvCache | null> {
  if (cached !== undefined) return cached;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const kv = (env as { KV?: KVNamespace }).KV;
    if (!kv) {
      console.warn('[kv-cache] KV 绑定不可用（env.KV 缺失）');
      return null;
    }
    cached = {
      async get<T>(key: string): Promise<T | null> {
        try {
          return (await kv.get(key, 'json')) as T | null;
        } catch (err) {
          console.warn('[kv-cache] 读取失败:', err);
          return null;
        }
      },
      async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        // KV expirationTtl 下限 60s
        try {
          await kv.put(key, JSON.stringify(value), {
            expirationTtl: Math.max(60, Math.trunc(ttlSeconds)),
          });
        } catch (err) {
          // 写失败（额度/大小）静默：缓存写从不是主流程的一部分
          console.warn('[kv-cache] 写入失败:', err);
        }
      },
    };
  } catch (err) {
    console.warn('[kv-cache] 上下文获取失败:', err);
    return null;
  }
  return cached;
}

// —— 搜索高频词门控（仅缓存重复搜索，防写额度被打爆） ——

/** 同一搜索 key 的窗口（与搜索 KV TTL 对齐） */
const QUERY_WINDOW_MS = 30 * 60 * 1000;
/** 窗口内出现次数达到该值后才允许写 KV */
const WRITE_THRESHOLD = 2;

const queryCounts = new Map<string, { count: number; expiresAt: number }>();

/**
 * 记录一次搜索并判断是否值得写 KV（isolate 内存级判定；
 * 多 isolate 各自计数，总体上仍显著收敛写频）。
 */
export function shouldCacheSearch(cacheKey: string): boolean {
  const now = Date.now();
  if (queryCounts.size > 500) {
    for (const [k, v] of queryCounts) {
      if (now > v.expiresAt) queryCounts.delete(k);
    }
    if (queryCounts.size > 500) queryCounts.clear();
  }
  const entry = queryCounts.get(cacheKey);
  if (!entry || now > entry.expiresAt) {
    queryCounts.set(cacheKey, { count: 1, expiresAt: now + QUERY_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count >= WRITE_THRESHOLD;
}
