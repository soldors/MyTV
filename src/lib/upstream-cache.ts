// 上游元数据的天级 KV 缓存层：豆瓣推荐/热榜、Bangumi 放送表等「低频变化」数据
// 全局每天只真拉一次上游。
//
// 背景：这些数据原本只有 isolate 内存缓存（fetch-utils getCache）——Cloudflare
// 每个边缘节点各自独立、冷启动即清空，实际命中率低，冷了就真打上游。
// 换成 KV（全局共享、跨节点、跨重启）后：
//   - 读：L1 内存 → L2 KV → 上游
//   - 写：上游成功后异步落 KV（TTL 天级）；并发冷启动可能多 isolate 重复写同一
//     key，覆盖写无害，写入总量 ~40 次/天，远低于 KV 免费写额度（1000/天）
// KV 读写失败一律静默回落内存/上游——缓存层永不阻断主流程。

import { getCache, setCache } from './fetch-utils';
import { getKvCache } from './kv-cache';

/** KV 键前缀：与搜索/详情缓存键空间区分（缓存管理页可按前缀识别） */
const KV_PREFIX = 'meta:';

/**
 * 带 KV 天级缓存的取数：fetcher 只在 L1/L2 全 miss 时执行。
 * memTtlMs 保持短（同 isolate 去重），扛「全局每天一次」的是 kvTtlSeconds。
 */
export async function withDailyKvCache<T>(
  key: string,
  kvTtlSeconds: number,
  memTtlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const mem = getCache<T>(key);
  if (mem !== undefined) return mem;

  const kv = await getKvCache();
  if (kv) {
    const hit = await kv.get<T>(`${KV_PREFIX}${key}`);
    if (hit !== null && hit !== undefined) {
      setCache(key, hit, memTtlMs);
      return hit;
    }
  }

  const fresh = await fetcher();
  setCache(key, fresh, memTtlMs);
  if (kv) await kv.put(`${KV_PREFIX}${key}`, fresh, kvTtlSeconds);
  return fresh;
}
