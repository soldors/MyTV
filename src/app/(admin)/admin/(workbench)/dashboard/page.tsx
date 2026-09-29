'use client';

// 后台仪表盘（M6 重写，docs/09 §1.2）：四统计卡（真实口径）+ 近 7/30 日趋势折线（手写 SVG，D5）
// + 数据源可用率横向柱（无采样显示「未采集」灰条）+ 最新注册用户表。
// 播放量口径：play_records 为 (user,source,vod) 唯一行，「今日播放」= 今日有播放动作的条目数。

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getAdminStats, getSourceHealth, type AdminStats, type SourceHealthEntry } from '@/lib/admin-api';
import { getSources } from '@/lib/client-api';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { cn } from '@/lib/utils';

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 环比副标题：昨日为 0 时只显示今日增量，不编百分比 */
function DeltaNote({ today, yesterday, unit }: { today: number; yesterday: number; unit: string }) {
  if (yesterday === 0) {
    return (
      <p className="mt-1 text-[11px] text-t3">
        今日 +{today} {unit}（昨日 0）
      </p>
    );
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 1000) / 10;
  return (
    <p className="mt-1 text-[11px] text-t3">
      较昨日{' '}
      <span className={pct >= 0 ? 'text-[#3FB950]' : 'text-accent'}>
        {pct >= 0 ? '+' : ''}
        {pct}%
      </span>
    </p>
  );
}

function StatCard({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-overlay/60 bg-elevated p-4">
      <p className="text-xs text-t2">{label}</p>
      <p className="mt-2 text-2xl font-bold text-t1">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-t3">{hint}</p>}
      {children}
    </div>
  );
}

/** 手写 SVG 折线图（D5：零依赖）：播放实线红 + 注册虚线灰，网格与数据点悬浮数值 */
function TrendChart({ days, plays, signups }: { days: string[]; plays: number[]; signups: number[] }) {
  const W = 640;
  const H = 180;
  const PAD = { l: 34, r: 10, t: 12, b: 22 };
  const max = Math.max(1, ...plays, ...signups);
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const n = days.length;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / niceMax) * (H - PAD.t - PAD.b);
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full min-w-[520px]">
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const gy = H - PAD.b - r * (H - PAD.t - PAD.b);
          return (
            <g key={r}>
              <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="#1B2230" strokeWidth="1" />
              <text x={PAD.l - 6} y={gy + 3.5} textAnchor="end" fontSize="9" fill="#5C6675">
                {Math.round(niceMax * r)}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const step = Math.ceil(n / 8);
          if (i % step !== 0 && i !== n - 1) return null;
          return (
            <text key={d + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#5C6675">
              {d}
            </text>
          );
        })}
        <path d={line(signups)} fill="none" stroke="#5C6675" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={line(plays)} fill="none" stroke="#E8112D" strokeWidth="2" strokeLinejoin="round" />
        {plays.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="2.5" fill="#E8112D" />
            <title>{`${days[i]}：播放 ${v} · 注册 ${signups[i] ?? 0}`}</title>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-t3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent" />
          播放（条目数）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-t3" />
          新注册
        </span>
      </div>
    </div>
  );
}

/** 源可用率横向柱：无采样 → 灰条「未采集」（不显示 0%） */
function AvailabilityBars({ entries }: { entries: { name: string; pct: number; samples: number }[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-t3">暂无源（先到「数据源管理」添加）</p>;
  }
  return (
    <div className="space-y-2.5">
      {entries.map(({ name, pct, samples }) => {
        const uncollected = samples === 0;
        return (
          <div key={name} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs text-t2" title={name}>
              {name}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-overlay">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  uncollected ? 'bg-t3/40' : pct >= 90 ? 'bg-[#3FB950]' : pct >= 50 ? 'bg-rating' : 'bg-accent'
                )}
                style={{ width: uncollected ? '100%' : `${Math.max(3, pct)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] text-t3">
              {uncollected ? '未采集' : `${pct}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-rating/15 text-rating',
  active: 'bg-[#3FB950]/15 text-[#3FB950]',
  disabled: 'bg-accent/15 text-accent',
};
const STATUS_TEXT: Record<string, string> = { pending: '待审批', active: '正常', disabled: '已禁用' };

export default function AdminDashboard() {
  const { ready } = useRequireAdmin();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [bars, setBars] = useState<{ name: string; pct: number; samples: number }[] | null>(null);

  const load = useCallback((d: number) => {
    // tz：按站长浏览器时区切「日」（服务端口径见 /api/admin/stats 注释）
    const tz = -new Date().getTimezoneOffset();
    void getAdminStats(d, tz)
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (!ready) return;
    load(days);
    void Promise.all([getSourceHealth(days), getSources()])
      .then(([{ byUrl }, { sources }]) => {
        setBars(
          sources.map((s) => {
            const h: SourceHealthEntry | undefined = byUrl[s.url];
            return { name: s.name, pct: h?.pct ?? 0, samples: h?.samples ?? 0 };
          })
        );
      })
      .catch(() => setBars([]));
  }, [ready, days, load]);

  if (!ready) return <AdminLoading />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-t1">仪表盘</h1>
        <div className="flex rounded-lg border border-overlay p-0.5 text-xs">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-3 py-1 transition',
                days === d ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
              )}
            >
              近 {d} 日
            </button>
          ))}
        </div>
      </div>

      {stats === null ? (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-elevated" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="注册用户"
              value={String(stats.users.total)}
              hint={`正常 ${stats.users.active} · 待审批 ${stats.users.pending} · 禁用 ${stats.users.disabled}`}
            >
              <DeltaNote today={stats.users.todayNew} yesterday={stats.users.yesterdayNew} unit="人" />
            </StatCard>
            <StatCard label="今日播放" value={String(stats.plays.today)} hint="口径：今日有播放动作的影片条目数">
              <DeltaNote today={stats.plays.today} yesterday={stats.plays.yesterday} unit="条" />
            </StatCard>
            <StatCard
              label="收录影片"
              value={stats.catalog.total.toLocaleString()}
              hint={`已探活 ${stats.catalog.probedSources}/${stats.catalog.sources} 源合计${
                stats.catalog.missingSources > 0 ? ` · ${stats.catalog.missingSources} 源未采集` : ''
              }`}
            />
            <StatCard
              label={`源可用率（${stats.availability.windowDays} 日窗口）`}
              value={stats.availability.pct === null ? '未采集' : `${stats.availability.pct}%`}
              hint={
                stats.availability.pct === null
                  ? '窗口内还没有真实搜索/播放采样'
                  : `基于 ${stats.availability.samples} 次真实请求`
              }
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className="rounded-lg border border-overlay/60 bg-elevated p-4 lg:col-span-3">
              <h2 className="text-sm font-semibold text-t1">播放 / 注册趋势</h2>
              <div className="mt-3">
                <TrendChart days={stats.trend.days} plays={stats.trend.plays} signups={stats.trend.signups} />
              </div>
            </section>
            <section className="rounded-lg border border-overlay/60 bg-elevated p-4 lg:col-span-2">
              <h2 className="text-sm font-semibold text-t1">数据源可用率</h2>
              <div className="mt-4">
                {bars === null ? <div className="h-20 animate-pulse rounded bg-overlay/40" /> : <AvailabilityBars entries={bars} />}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-lg border border-overlay/60 bg-elevated">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold text-t1">最新注册用户</h2>
              <Link href="/admin/users" className="text-xs text-t2 hover:text-t1">
                全部管理 →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-t border-overlay/60 text-left text-[11px] text-t3">
                    <th className="px-4 py-2 font-normal">ID</th>
                    <th className="px-3 py-2 font-normal">用户名</th>
                    <th className="px-3 py-2 font-normal">状态</th>
                    <th className="px-3 py-2 font-normal">注册时间</th>
                    <th className="px-3 py-2 font-normal">来源 IP</th>
                    <th className="px-4 py-2 font-normal">角色</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.latestUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-xs text-t3">
                        暂无注册用户
                      </td>
                    </tr>
                  )}
                  {stats.latestUsers.map((u) => (
                    <tr key={u.name} className="border-t border-overlay/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-t3">#{u.id}</td>
                      <td className="px-3 py-2.5 text-sm text-t1">{u.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('rounded px-2 py-0.5 text-[11px]', STATUS_BADGE[u.status])}>
                          {STATUS_TEXT[u.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-t3">{fmtTime(u.createdAt)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-t3">{u.registerIp ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-t2">{u.role === 'admin' ? '管理员' : '用户'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
