// 客户端 SWR 缓存（module 级，随页面生命周期存活）：
// SPA 内路由切换（首页→搜索→回首页）时组件重挂载，用它避免重复请求——
// 有值立即渲染（哪怕过期），过期数据后台刷新后替换（stale-while-revalidate）。
// 浏览器整页刷新会清空（module 重新执行），此时正常走网络。

interface Entry {
  value: unknown;
  at: number;
}

const store = new Map<string, Entry>();

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  return e ? (e.value as T) : undefined;
}

export function setCached(key: string, value: unknown): void {
  store.set(key, { value, at: Date.now() });
}

/** 缓存值是否仍在 TTL 内（新鲜） */
export function isFresh(key: string, ttlMs: number): boolean {
  const e = store.get(key);
  return e !== undefined && Date.now() - e.at < ttlMs;
}
