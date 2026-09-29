'use client';

// 缓存管理（M6，docs/09 §1.5）：KV 键空间概览（搜索/详情前缀键数 + TTL 现值）+ 按前缀手动清除。
// 只管理本站两个前缀；TTL 调整属部署环境变量（SEARCH/DETAIL_CACHE_TTL_SECONDS），页面只展示现值。

import { useCallback, useEffect, useState } from 'react';
import { getCacheOverview, purgeCache, type CacheEntryInfo } from '@/lib/admin-api';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { IconRefresh } from '@/components/site/icons';
import { cn } from '@/lib/utils';

function fmtTtl(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

export default function AdminCachePage() {
  const { ready } = useRequireAdmin();
  const [entries, setEntries] = useState<CacheEntryInfo[] | null>(null);
  const [msg, setMsg] = useState('');
  const [purging, setPurging] = useState<string | null>(null);

  const reload = useCallback(() => {
    void getCacheOverview()
      .then(({ entries }) => setEntries(entries))
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  async function purge(prefix: string, label: string) {
    setPurging(prefix);
    setMsg('');
    try {
      const { deleted } = await purgeCache(prefix);
      setMsg(`已清除 ${label} ${deleted} 个键`);
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '清除失败');
    } finally {
      setPurging(null);
    }
  }

  if (!ready) return <AdminLoading />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-t1">缓存管理</h1>
        <button
          onClick={reload}
          className="flex items-center gap-1.5 rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
        >
          <IconRefresh className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-[#3FB950]">{msg}</p>}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {entries === null
          ? Array.from({ length: 2 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-lg bg-elevated" />)
          : entries.map((e) => (
              <div key={e.prefix} className="rounded-lg border border-overlay/60 bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-t1">{e.label}</h2>
                  <span className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-t3">{e.prefix}*</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-t3">键数量</p>
                    <p className="mt-1 text-xl font-bold text-t1">{e.keys}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-t3">TTL 现值</p>
                    <p className="mt-1 text-xl font-bold text-t1">{fmtTtl(e.ttlSeconds)}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => void purge(e.prefix, e.label)}
                    disabled={purging === e.prefix || e.keys === 0}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      e.keys === 0
                        ? 'border border-overlay text-t3'
                        : 'border border-accent/60 text-accent hover:bg-accent hover:text-white',
                      purging === e.prefix && 'animate-pulse'
                    )}
                  >
                    {purging === e.prefix ? '清除中…' : e.keys === 0 ? '无缓存键' : '清除缓存'}
                  </button>
                </div>
              </div>
            ))}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-t3">
        搜索缓存为高频词写入（30 分钟 TTL，未重复搜索的词不占 KV 写额度）；详情缓存 6 小时。
        TTL 数值经部署环境变量调整（SEARCH_CACHE_TTL_SECONDS / DETAIL_CACHE_TTL_SECONDS），改后重新部署生效。
      </p>
    </div>
  );
}
