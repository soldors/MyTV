'use client';

// 直播源管理（对齐数据源管理的交互）：表格（名称/订阅地址/EPG/探活状态/频道数/启用/来源/操作）+
// 添加与编辑弹窗 + M3U 探活（频道数快照）+ env 预置源并入同表（删除走覆盖层，底部可恢复）。

import { useCallback, useEffect, useState } from 'react';
import {
  createLiveSource,
  deleteLiveSource,
  listAdminLiveSources,
  probeLiveSource,
  restoreEnvLiveSource,
  updateLiveSource,
  type AdminLiveSource,
} from '@/lib/admin-api';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { IconClose, IconEdit, IconPlus, IconRefresh } from '@/components/site/icons';
import { cn } from '@/lib/utils';

interface Row {
  key: string;
  name: string;
  url: string;
  epg?: string;
  enabled: boolean;
  origin: 'db' | 'env';
  probeOk?: boolean;
  probeMs?: number;
  probeChannels?: number;
  probedAt?: number;
}

/** 直播源编辑/添加弹窗 */
function LiveSourceModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminLiveSource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [epg, setEpg] = useState(initial?.epg ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name, url, epg: epg || undefined };
      if (initial?.key) await updateLiveSource(initial.key, payload);
      else await createLiveSource(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md rounded-lg border border-overlay/60 bg-elevated p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-t1">{initial ? '编辑直播源' : '添加直播源'}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-t3 hover:text-t1">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-t2">
            源名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：iptv-org 中国"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-t2">
            M3U 订阅地址
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/list.m3u"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-t2">
            EPG 节目单地址（可选，支持 .gz）
            <input
              value={epg}
              onChange={(e) => setEpg(e.target.value)}
              placeholder="https://…/epg.xml.gz"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
        </div>
        {error && <p className="mt-3 text-xs text-accent">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-overlay px-4 py-2 text-xs text-t2 hover:text-t1">
            取消
          </button>
          <button
            type="submit"
            disabled={busy || !name || !url}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminLiveSourcesPage() {
  const { ready } = useRequireAdmin();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hiddenEnv, setHiddenEnv] = useState<{ name: string; url: string }[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; source: AdminLiveSource } | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listAdminLiveSources()
      .then(({ dbSources, envSources, hiddenEnvSources }) => {
        const toRow = (s: AdminLiveSource, origin: 'db' | 'env'): Row => ({
          key: origin === 'db' ? s.key ?? '' : `envlive:${s.url}`,
          name: s.name,
          url: s.url,
          epg: s.epg,
          enabled: s.enabled ?? true,
          origin,
          probeOk: s.probeOk,
          probeMs: s.probeMs,
          probeChannels: s.probeChannels,
          probedAt: s.probedAt,
        });
        setRows([...dbSources.map((s) => toRow(s, 'db')), ...envSources.map((s) => toRow(s, 'env'))]);
        setHiddenEnv(hiddenEnvSources ?? []);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  async function runProbe(url: string) {
    setProbing(url);
    try {
      await probeLiveSource(url);
      reload();
    } catch {
      reload();
    } finally {
      setProbing(null);
    }
  }

  async function toggleEnabled(r: Row) {
    try {
      await updateLiveSource(r.key, { enabled: !r.enabled });
      reload();
    } catch {
      /* 列表刷新呈现真实状态 */
    }
  }

  async function remove(r: Row) {
    try {
      await deleteLiveSource(r.key);
      reload();
    } finally {
      setConfirmingKey(null);
    }
  }

  async function restoreEnv(url: string) {
    try {
      await restoreEnvLiveSource(url);
      reload();
    } catch {
      /* 列表刷新呈现真实状态 */
    }
  }

  if (!ready) return <AdminLoading />;

  const fmtProbeTime = (ts?: number) =>
    ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-t1">直播源（IPTV / M3U）</h1>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
        >
          <IconPlus className="h-3.5 w-3.5" />
          添加直播源
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
              <th className="px-4 py-2.5 font-normal">名称</th>
              <th className="px-3 py-2.5 font-normal">M3U 订阅地址</th>
              <th className="px-3 py-2.5 font-normal">EPG</th>
              <th className="px-3 py-2.5 font-normal">状态</th>
              <th className="px-3 py-2.5 text-right font-normal">频道数</th>
              <th className="px-3 py-2.5 text-center font-normal">启用</th>
              <th className="px-3 py-2.5 text-center font-normal">来源</th>
              <th className="px-4 py-2.5 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRowsAll(rows).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-t3">
                  {rows === null ? '加载中…' : '暂无直播源，用右上角按钮添加'}
                </td>
              </tr>
            )}
            {pageRowsAll(rows).map((r) => {
              const status = r.probeOk === undefined ? 'none' : r.probeOk ? 'ok' : 'fail';
              return (
                <tr key={r.key} className={cn('border-b border-overlay/40 last:border-0', r.origin === 'env' && 'opacity-75')}>
                  <td className="px-4 py-2.5 text-sm text-t1">{r.name}</td>
                  <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-t3" title={r.url}>
                    {r.url}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-t3" title={r.epg ?? ''}>
                    {r.epg ? '有' : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs" title={fmtProbeTime(r.probedAt)}>
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          status === 'ok' ? 'bg-[#3FB950]' : status === 'fail' ? 'bg-accent' : 'bg-t3/50'
                        )}
                      />
                      <span className={status === 'ok' ? 'text-t2' : status === 'fail' ? 'text-accent' : 'text-t3'}>
                        {status === 'ok' ? `正常${r.probeMs ? ` ${r.probeMs}ms` : ''}` : status === 'fail' ? '异常' : '未探活'}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-t2">
                    {r.probeChannels !== undefined ? r.probeChannels.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.origin === 'db' ? (
                      <button
                        onClick={() => void toggleEnabled(r)}
                        aria-label={r.enabled ? '禁用' : '启用'}
                        className={cn('relative h-5 w-9 rounded-full transition-colors', r.enabled ? 'bg-accent' : 'bg-overlay')}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                            r.enabled ? 'left-[18px]' : 'left-0.5'
                          )}
                        />
                      </button>
                    ) : (
                      <span className="text-[11px] text-t3">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px]',
                        r.origin === 'db' ? 'bg-overlay text-t2' : 'bg-t3/15 text-t3'
                      )}
                    >
                      {r.origin === 'db' ? '数据库' : '环境变量'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => void runProbe(r.url)}
                      disabled={probing === r.url}
                      className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-t1 disabled:opacity-40"
                    >
                      {probing === r.url ? '…' : '探活'}
                    </button>
                    {r.origin === 'db' && (
                      <button
                        onClick={() => setModal({ mode: 'edit', source: { name: r.name, url: r.url, epg: r.epg, key: r.key } })}
                        className="ml-1.5 rounded-lg border border-overlay px-2 py-1 text-xs text-t2 transition hover:text-t1"
                        aria-label="编辑"
                      >
                        <IconEdit className="inline h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => (confirmingKey === r.key ? void remove(r) : setConfirmingKey(r.key))}
                      className={cn(
                        'ml-1.5 rounded-lg px-2.5 py-1 text-xs transition',
                        confirmingKey === r.key ? 'bg-accent text-white' : 'border border-overlay text-t2 hover:text-accent'
                      )}
                    >
                      {confirmingKey === r.key ? '确认' : '删除'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-t3">
        状态与频道数来自最近一次探活快照（source_catalog）。环境变量源（DEFAULT_LIVE_SOURCES）来自部署配置，删除后从前台直播页隐藏（可随时恢复）。
      </p>
      {hiddenEnv.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-overlay/60 bg-elevated px-3 py-2">
          <span className="text-[11px] text-t3">已删除的环境变量直播源：</span>
          {hiddenEnv.map((s) => (
            <span key={s.url} className="flex items-center gap-1.5 rounded-full bg-overlay px-2.5 py-1 text-[11px] text-t2">
              {s.name}
              <button onClick={() => void restoreEnv(s.url)} className="text-accent transition hover:opacity-80">
                恢复
              </button>
            </span>
          ))}
        </div>
      )}

      {modal && (
        <LiveSourceModal
          initial={modal.mode === 'edit' ? modal.source : null}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

/** 直播源数量少，不做分页 */
function pageRowsAll(rows: Row[] | null): Row[] {
  return rows ?? [];
}
