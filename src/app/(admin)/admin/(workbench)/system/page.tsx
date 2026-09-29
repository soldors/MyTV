'use client';

// 系统状态（M6，docs/09 §1.5）：绑定自检（D1/KV）、各表行数、各源最近探活、已配置环境变量键名。
// 只展示键名不回显值；部署版本与运行日志在 Cloudflare 控制台。

import { useCallback, useEffect, useState } from 'react';
import { getSystemStatus, type SystemStatus } from '@/lib/admin-api';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { cn } from '@/lib/utils';

const fmtTime = (ts?: number) =>
  ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AdminSystemPage() {
  const { ready } = useRequireAdmin();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  const reload = useCallback(() => {
    void getSystemStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  if (!ready) return <AdminLoading />;
  if (!status) {
    return (
      <div>
        <h1 className="text-lg font-bold text-t1">系统状态</h1>
        <p className="mt-5 text-xs text-accent">自检接口不可用</p>
      </div>
    );
  }

  const checks = [
    { label: 'D1 数据库（mytv-db）', ok: status.dbOk },
    { label: 'KV 缓存命名空间', ok: status.kvOk },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-t1">系统状态</h1>
        <span className="text-[11px] text-t3">检查时间 {fmtTime(status.timestamp)}</span>
      </div>

      {/* 绑定自检 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-lg border border-overlay/60 bg-elevated px-4 py-3">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', c.ok ? 'bg-[#3FB950]' : 'bg-accent')} />
            <span className="text-sm text-t1">{c.label}</span>
            <span className={cn('ml-auto text-xs', c.ok ? 'text-[#3FB950]' : 'text-accent')}>{c.ok ? '正常' : '异常'}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 表行数 */}
        <section className="rounded-lg border border-overlay/60 bg-elevated p-4">
          <h2 className="text-sm font-semibold text-t1">数据表行数</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {status.tables.map((t) => (
              <div key={t.name} className="flex items-baseline justify-between border-b border-overlay/30 pb-1">
                <span className="font-mono text-xs text-t2">{t.name}</span>
                <span className="text-xs text-t1">{t.rows === null ? '—' : t.rows.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 源最近探活 */}
        <section className="rounded-lg border border-overlay/60 bg-elevated p-4">
          <h2 className="text-sm font-semibold text-t1">各源最近探活</h2>
          <div className="mt-3 space-y-1.5">
            {status.sourceProbes.length === 0 && <p className="text-xs text-t3">暂无源</p>}
            {status.sourceProbes.map((p) => (
              <div key={p.url} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    p.ok === undefined ? 'bg-t3/50' : p.ok ? 'bg-[#3FB950]' : 'bg-accent'
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-t1" title={p.url}>
                  {p.name}
                </span>
                <span className="shrink-0 text-t3">{p.probedAt ? fmtTime(p.probedAt) : '未采集'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 环境变量键名 */}
      <section className="mt-4 rounded-lg border border-overlay/60 bg-elevated p-4">
        <h2 className="text-sm font-semibold text-t1">已配置的环境变量（仅键名）</h2>
        <p className="mt-1 text-[11px] text-t3">出于安全只列出键名，值请经 wrangler secret / vars 管理。</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {status.envKeys.length === 0 && <span className="text-xs text-t3">无</span>}
          {status.envKeys.map((k) => (
            <span key={k} className="rounded bg-overlay px-2 py-1 font-mono text-[11px] text-t2">
              {k}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
