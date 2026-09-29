// 源健康采样（M6）：把「这次真实请求成没成、耗时多少」按每源每小时一条落 D1，
// 供后台仪表盘算可用率（circuit-breaker 只判当前该不该跳过，重启即清零，撑不起历史窗口）。
//
// 两层去重：
//   1. 本 isolate 的内存小时桶——同小时内直接省掉 D1 往返；
//   2. source_health 的 UNIQUE(url, hour) ON CONFLICT IGNORE——跨 isolate/跨实例兜底。
// 采样写失败绝不影响搜索本身，故内部吞掉异常（仅清掉内存桶让下个请求重试）。

import { recordOutcome } from './circuit-breaker';
import { getStorage } from './d1-storage';

const HOUR_MS = 60 * 60 * 1000;
/** 内存桶表大小上限：源量级远小于此，超限直接清空重来（避免无界增长） */
const MAX_TRACKED = 500;

const writtenBuckets = new Map<string, number>();

/**
 * 记录一次源结果：先走熔断器（内存，决定后续请求是否跳过），再落一条小时级采样。
 * 返回 Promise 以便调用方在响应前完成写入（Workers 在响应后不保证继续执行后台任务）。
 */
export async function reportSourceOutcome(url: string, ok: boolean, ms: number): Promise<void> {
  recordOutcome(url, ok);

  const bucket = Math.floor(Date.now() / HOUR_MS);
  if (writtenBuckets.get(url) === bucket) return;
  if (writtenBuckets.size >= MAX_TRACKED) writtenBuckets.clear();
  writtenBuckets.set(url, bucket);

  try {
    const storage = await getStorage();
    await storage.recordSourceOutcome(url, ok, ms);
  } catch {
    writtenBuckets.delete(url);
  }
}
