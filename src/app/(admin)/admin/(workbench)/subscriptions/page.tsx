'use client';

// TVBox / SourceList 订阅管理（M6 独立成页，docs/09 §1.4）：
// 表格化（名称/URL/上次同步/导入源数/操作）+ 添加即导入（名称必填）+
// 重新同步 + 改名（对齐数据源管理的维护方式）+ 删除。

import { useCallback, useEffect, useState } from 'react';
import {
  addSubscription,
  deleteSubscription,
  listSubscriptions,
  renameSubscription,
  resyncSubscription,
} from '@/lib/admin-api';
import type { SubscriptionRecord } from '@/lib/storage';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { IconClose, IconEdit, IconPlus, IconRefresh } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const fmtTime = (ts?: number) =>
  ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未同步';

/** 订阅改名弹窗（对齐数据源管理的编辑交互） */
function RenameModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: SubscriptionRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await renameSubscription(initial.id, name.trim());
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
      <form onSubmit={submit} className="relative z-10 w-full max-w-sm rounded-lg border border-overlay/60 bg-elevated p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-t1">修改订阅名称</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-t3 hover:text-t1">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-4 block text-xs text-t2">
          订阅名称
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="如：高天流云 No.1"
            className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
        </label>
        <p className="mt-2 truncate text-[11px] text-t3" title={initial.url}>{initial.url}</p>
        {error && <p className="mt-3 text-xs text-accent">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-overlay px-4 py-2 text-xs text-t2 hover:text-t1">
            取消
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  const { ready } = useRequireAdmin();
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SubscriptionRecord | null>(null);

  const reload = useCallback(() => {
    void listSubscriptions()
      .then(({ subscriptions }) => setSubs(subscriptions))
      .catch(() => setSubs([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setAdding(true);
    try {
      const res = await addSubscription(url, name.trim());
      setMsg(
        `导入完成：新增 ${res.imported} 个源${res.skippedExisting ? `，跳过已存在 ${res.skippedExisting} 个` : ''}`
      );
      setUrl('');
      setName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setAdding(false);
    }
  }

  async function resync(id: number) {
    setBusyId(id);
    setError('');
    setMsg('');
    try {
      const res = await resyncSubscription(id);
      setMsg(`重新同步完成：新增 ${res.imported} 个，跳过已存在 ${res.skippedExisting} 个`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    try {
      await deleteSubscription(id);
      reload();
    } catch {
      /* 刷新呈现真实状态 */
    }
  }

  if (!ready) return <AdminLoading />;

  return (
    <div>
      <h1 className="text-lg font-bold text-t1">TVBox / SourceList 订阅</h1>
      <p className="mt-1 text-[11px] text-t3">
        粘贴订阅地址立即导入：.json 配置与 TVBox 接口地址（饭太硬式 /tv，图片/base64 伪装自动解码）都支持；
        苹果CMS 点播源（JSON/XML）入库（去重），Spider 等自动跳过；已导入的源在「数据源管理」维护。
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/config.json 或 http://…/tv 接口地址"
          className="min-w-52 flex-1 rounded-lg border border-overlay bg-elevated px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="订阅名称"
          className="w-40 rounded-lg border border-overlay bg-elevated px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={adding || !url || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <IconPlus className="h-3.5 w-3.5" />
          {adding ? '导入中…' : '添加并导入'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      {msg && <p className="mt-2 text-xs text-[#3FB950]">{msg}</p>}

      <div className="mt-5 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
              <th className="px-4 py-2.5 font-normal">名称</th>
              <th className="px-3 py-2.5 font-normal">订阅地址</th>
              <th className="px-3 py-2.5 font-normal">上次同步</th>
              <th className="px-3 py-2.5 text-right font-normal">导入源数</th>
              <th className="px-4 py-2.5 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {subs === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-t3">
                  加载中…
                </td>
              </tr>
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-t3">
                  暂无订阅，用上方表单添加
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="border-b border-overlay/40 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-t1">
                    <span className="mr-1.5">{s.name ?? '—'}</span>
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded-lg border border-overlay px-1.5 py-0.5 text-t2 transition hover:text-t1"
                      aria-label="修改名称"
                    >
                      <IconEdit className="inline h-3 w-3" />
                    </button>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-xs text-t3" title={s.url}>
                    {s.url}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-t2">{fmtTime(s.lastSyncedAt)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-t2">{s.importedCount ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => void resync(s.id)}
                      disabled={busyId === s.id}
                      className="flex-row items-center gap-1 rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-t1 disabled:opacity-40"
                    >
                      <IconRefresh className={cn('mr-1 inline h-3.5 w-3.5', busyId === s.id && 'animate-spin')} />
                      {busyId === s.id ? '同步中' : '重新同步'}
                    </button>
                    <button
                      onClick={() => void remove(s.id)}
                      className="ml-1.5 rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-accent"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-t3">删除订阅只移除记录，不回滚已导入的源（在数据源管理页单独处理）。</p>

      {editing && (
        <RenameModal initial={editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  );
}
