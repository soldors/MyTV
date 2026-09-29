'use client';

// 数据源管理（M4）：DB 源增删改/启用开关/探活 + TVBox / SourceList 订阅导入。
// 验收锚点：此处增删源 → 前台 /api/sources 即刻生效。

import { useCallback, useEffect, useState } from 'react';
import {
  createSource,
  deleteSource,
  deleteSubscription,
  listAdminSources,
  listSubscriptions,
  probeSource,
  resyncSubscription,
  addSubscription,
  updateSource,
} from '@/lib/admin-api';
import type { ApiSourceRecord, SubscriptionRecord } from '@/lib/storage';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { cn } from '@/lib/utils';

type Probe = { ok: boolean; ms: number; count?: number; error?: string };

function SourceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [detail, setDetail] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createSource({ name, url, detail: detail || undefined, isAdult });
      setName('');
      setUrl('');
      setDetail('');
      setIsAdult(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-overlay/60 bg-elevated p-4">
      <h2 className="text-sm font-semibold text-t1">添加数据源</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="源名称（如：量子资源）"
          className="rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="接口地址 https://…/api.php/provide/vod"
          className="rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="详情页根地址（可选）"
          className="rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent md:col-span-2"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-t2">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={(e) => setIsAdult(e.target.checked)}
            className="h-4 w-4 accent-[#E8112D]"
          />
          成人源
        </label>
        {error && <p className="text-xs text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name || !url}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? '添加中…' : '添加'}
        </button>
      </div>
    </form>
  );
}

function SourceRow({ source, onChanged }: { source: ApiSourceRecord; onChanged: () => void }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function runProbe() {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await probeSource(source.apiUrl));
    } catch (err) {
      setProbe({ ok: false, ms: 0, error: err instanceof Error ? err.message : '失败' });
    } finally {
      setProbing(false);
    }
  }

  async function toggleEnabled() {
    try {
      await updateSource(source.key, { enabled: !source.enabled });
      onChanged();
    } catch {
      /* 保留原状，下次列表刷新自然回滚 */
    }
  }

  async function remove() {
    try {
      await deleteSource(source.key);
      onChanged();
    } catch {
      /* 同上 */
    } finally {
      setConfirming(false);
    }
  }

  return (
    <tr className="border-b border-overlay/40 last:border-0">
      <td className="py-2.5 pr-3 text-sm text-t1">
        {source.name}
        {source.isAdult && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">18+</span>}
      </td>
      <td className="max-w-[220px] truncate py-2.5 pr-3 text-xs text-t3" title={source.apiUrl}>
        {source.apiUrl}
      </td>
      <td className="py-2.5 pr-3 text-center text-xs text-t2">{source.weight}</td>
      <td className="py-2.5 pr-3 text-center">
        <button
          onClick={() => void toggleEnabled()}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors',
            source.enabled ? 'bg-accent' : 'bg-overlay'
          )}
          aria-label={source.enabled ? '禁用' : '启用'}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
              source.enabled ? 'left-[18px]' : 'left-0.5'
            )}
          />
        </button>
      </td>
      <td className="py-2.5 pr-3 text-xs">
        {probe && (
          <span className={probe.ok ? 'text-[#3FB950]' : 'text-accent'}>
            {probe.ok ? `可用 ${probe.ms}ms · ${probe.count} 条` : `失败：${probe.error}`}
          </span>
        )}
      </td>
      <td className="py-2.5 text-right whitespace-nowrap">
        <button
          onClick={() => void runProbe()}
          disabled={probing}
          className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-t1 disabled:opacity-40"
        >
          {probing ? '…' : '探活'}
        </button>
        <button
          onClick={() => (confirming ? void remove() : setConfirming(true))}
          className={cn(
            'ml-2 rounded-lg px-2.5 py-1 text-xs transition',
            confirming ? 'bg-accent text-white' : 'border border-overlay text-t2 hover:text-accent'
          )}
        >
          {confirming ? '确认删除' : '删除'}
        </button>
      </td>
    </tr>
  );
}

function SubscriptionSection({ onChanged }: { onChanged: () => void }) {
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void listSubscriptions().then((r) => setSubs(r.subscriptions)).catch(() => setSubs([]));
  }, []);

  useEffect(() => reload(), [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      const result = await addSubscription(url);
      setMsg(`导入完成：新增 ${result.imported} 个源${result.skippedExisting ? `，跳过已存在 ${result.skippedExisting} 个` : ''}`);
      setUrl('');
      reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-overlay/60 bg-elevated p-4">
      <h2 className="text-sm font-semibold text-t1">TVBox / SourceList 订阅</h2>
      <p className="mt-1 text-[11px] text-t3">
        粘贴订阅 URL 立即导入：type:1 的苹果CMS 点播源入库，Spider / XML 等自动跳过；重复地址去重。
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/config.json"
          className="flex-1 rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !url}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? '导入中…' : '导入'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      {msg && <p className="mt-2 text-xs text-[#3FB950]">{msg}</p>}

      {subs !== null && subs.length > 0 && (
        <div className="mt-4 space-y-2">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-overlay/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-t1">{s.name || s.url}</p>
                <p className="text-[10px] text-t3">
                  {s.lastSyncedAt ? `上次同步：${new Date(s.lastSyncedAt).toLocaleString()}` : '未同步'}
                </p>
              </div>
              <button
                onClick={() =>
                  void resyncSubscription(s.id)
                    .then((r) => setMsg(`重新同步完成：新增 ${r.imported}，跳过 ${r.skippedExisting}`))
                    .then(onChanged)
                    .catch((err) => setError(err instanceof Error ? err.message : '同步失败'))
                }
                className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-t1"
              >
                重新同步
              </button>
              <button
                onClick={() => void deleteSubscription(s.id).then(reload)}
                className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-accent"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminSourcesPage() {
  const { ready } = useRequireAdmin();
  const [dbSources, setDbSources] = useState<ApiSourceRecord[] | null>(null);
  const [envSources, setEnvSources] = useState<{ name: string; url: string; isAdult: boolean }[]>([]);

  const reload = useCallback(() => {
    void listAdminSources()
      .then((r) => {
        setDbSources(r.dbSources);
        setEnvSources(r.envSources);
      })
      .catch(() => setDbSources([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  if (!ready) return <AdminLoading />;

  return (
    <div>
      <h1 className="text-lg font-bold text-t1">数据源</h1>

      <div className="mt-5">
        <SourceForm onCreated={reload} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-t1">后台源（{dbSources?.length ?? 0}）</h2>
        {dbSources === null ? (
          <div className="mt-3 h-20 animate-pulse rounded-lg bg-elevated" />
        ) : dbSources.length === 0 ? (
          <p className="mt-3 text-xs text-t3">暂无，用上方表单或订阅导入添加</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
            <table className="w-full min-w-[640px] px-3">
              <thead>
                <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
                  <th className="px-4 py-2 font-normal">名称</th>
                  <th className="px-3 py-2 font-normal">接口地址</th>
                  <th className="px-3 py-2 text-center font-normal">权重</th>
                  <th className="px-3 py-2 text-center font-normal">启用</th>
                  <th className="px-3 py-2 font-normal">探活结果</th>
                  <th className="px-4 py-2 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {dbSources.map((s) => (
                  <SourceRow key={s.key} source={s} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SubscriptionSection onChanged={reload} />

      {envSources.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-t1">
            环境变量预置（只读，{envSources.length}）
          </h2>
          <div className="mt-3 space-y-1.5">
            {envSources.map((s) => (
              <div key={s.url} className="flex items-center gap-2 rounded-lg border border-overlay/40 px-3 py-2 text-xs">
                <span className="text-t1">{s.name}</span>
                {s.isAdult && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">18+</span>}
                <span className="ml-auto max-w-[300px] truncate text-t3" title={s.url}>
                  {s.url}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-t3">修改预置源需调整 DEFAULT_SOURCES 环境变量并重新部署。</p>
        </section>
      )}
    </div>
  );
}
