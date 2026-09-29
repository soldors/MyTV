'use client';

// 后台仪表盘（M4）：统计卡（用户/待审批/数据源/订阅）+ 待办入口。
// 深统计（播放趋势/源可用率）为二期（docs/01 §9.1 后台清单「系统·状态」）。

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listAdminSources, listSubscriptions, listUsers } from '@/lib/admin-api';
import type { ApiSourceRecord, StoredUser, SubscriptionRecord } from '@/lib/storage';
import { AdminDenied, useRequireAdmin } from '@/components/admin/admin-guard';

function StatCard({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-lg border border-overlay/60 bg-elevated p-4 transition-colors hover:border-t3/40">
      <p className="text-xs text-t2">{label}</p>
      <p className="mt-2 text-2xl font-bold text-t1">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-t3">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const { ready } = useRequireAdmin();
  const [users, setUsers] = useState<StoredUser[] | null>(null);
  const [sources, setSources] = useState<ApiSourceRecord[] | null>(null);
  const [envCount, setEnvCount] = useState(0);
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    void listUsers().then((r) => setUsers(r.users)).catch(() => setUsers([]));
    void listAdminSources()
      .then((r) => {
        setSources(r.dbSources);
        setEnvCount(r.envSources.length);
      })
      .catch(() => setSources([]));
    void listSubscriptions().then((r) => setSubs(r.subscriptions)).catch(() => setSubs([]));
  }, [ready]);

  if (!ready) return <AdminDenied ready={ready} />;

  const pending = (users ?? []).filter((u) => u.status === 'pending').length;

  return (
    <div>
      <h1 className="text-lg font-bold text-t1">仪表盘</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="注册用户" value={users === null ? '…' : users.length} href="/admin/users" />
        <StatCard
          label="待审批"
          value={users === null ? '…' : pending}
          hint={pending > 0 ? '点击去处理' : '暂无待办'}
          href="/admin/users"
        />
        <StatCard
          label="数据源"
          value={sources === null ? '…' : `${sources.length} + ${envCount}`}
          hint="后台源 + 环境变量预置"
          href="/admin/sources"
        />
        <StatCard label="订阅" value={subs === null ? '…' : subs.length} hint="TVBox / SourceList" href="/admin/sources" />
      </div>

      {pending > 0 && (
        <div className="mt-6 rounded-lg border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm text-t1">
            有 <span className="font-bold text-accent">{pending}</span> 个用户等待审批
          </p>
          <Link href="/admin/users" className="mt-2 inline-block text-xs text-accent underline">
            前往处理 →
          </Link>
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-t3">
        一期后台为最小集（#15）：数据源 / 用户 / 站点设置。缓存管理、播放趋势、备份导出等见 docs/01 §9.1 二期清单。
      </p>
    </div>
  );
}
