// 源熔断器（M3）：采集站失效是上游生态常态（docs/01 §13），
// 连续失败 N 次的源短路 M 分钟（跳过出网请求，搜索不再等它超时），
// 窗口过后半开放行一次试探，成功即复位。
// 状态存 isolate 内存（与登录限速同策略）：不跨边缘共享，但足以挡住单实例的重复踩坑。

/** 连续失败多少次触发熔断 */
const FAILURE_THRESHOLD = clampEnvInt('CIRCUIT_FAILURE_THRESHOLD', 3, 1, 20);
/** 熔断持续多久（毫秒） */
const OPEN_MS = clampEnvInt('CIRCUIT_OPEN_MS', 5 * 60_000, 30_000, 60 * 60_000);

function clampEnvInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

interface BreakerState {
  failures: number;
  openedAt: number;
}

const breakers = new Map<string, BreakerState>();
const MAX_TRACKED = 500;

function sweep(now: number): void {
  if (breakers.size <= MAX_TRACKED) return;
  for (const [key, state] of breakers) {
    // 冷静期已过且未再失败的条目可清理
    if (state.failures >= FAILURE_THRESHOLD && now - state.openedAt < OPEN_MS) continue;
    breakers.delete(key);
  }
  if (breakers.size > MAX_TRACKED) breakers.clear();
}

export interface BreakerVerdict {
  /** true = 熔断中，应跳过该源 */
  open: boolean;
  /** 距离自动恢复（半开放行）的毫秒数 */
  retryInMs: number;
}

/** 查询源当前是否被熔断 */
export function checkBreaker(sourceKey: string, now = Date.now()): BreakerVerdict {
  const state = breakers.get(sourceKey);
  if (!state) return { open: false, retryInMs: 0 };
  if (state.failures < FAILURE_THRESHOLD) return { open: false, retryInMs: 0 };
  const elapsed = now - state.openedAt;
  if (elapsed >= OPEN_MS) return { open: false, retryInMs: 0 }; // 半开：放行试探
  return { open: true, retryInMs: OPEN_MS - elapsed };
}

/** 记录一次结果：成功复位，失败累计并在达到阈值时开闸 */
export function recordOutcome(sourceKey: string, ok: boolean, now = Date.now()): void {
  sweep(now);
  if (ok) {
    breakers.delete(sourceKey);
    return;
  }
  const state = breakers.get(sourceKey);
  if (!state) {
    breakers.set(sourceKey, { failures: 1, openedAt: now });
    return;
  }
  state.failures += 1;
  state.openedAt = now;
}
