'use client';

// 数据源管理（M6 重写，docs/09 §1.3）：搜索框 + 状态筛选 + 分页 + 编辑弹窗 +
// 状态列常亮（source_catalog 探活快照 join）+ 收录数列 + 「刷新收录量」+
// env 预置源并入同表（「来源」列区分，只读行不给编辑/删除，D8）。
// 订阅导入移至独立页 /admin/subscriptions（A4）。

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSource,
  deleteSource,
  getSourceHealth,
  listAdminSources,
  probeSource,
  refreshCatalog,
  updateSource,
  type SourceHealthEntry,
} from '@/lib/admin-api';
import type { ApiSourceRecord } from '@/lib/storage';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { IconClose, IconEdit, IconPlus, IconRefresh, IconSearch } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
type StatusFilter = 'all' | 'ok' | 'fail' | 'disabled';

interface Row {
  key: string;
  name: string;
  apiUrl: string;
  weight: number | null;
  isAdult: boolean;
  enabled: boolean;
  origin: 'db' | 'env';
  /** health join 结果 */
  probeOk?: boolean;
  probeMs?: number;
  probedAt?: number;
  total?: number;
}

/** 源编辑/添加弹窗 */
function SourceModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ApiSourceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.apiUrl ?? '');
  const [detail, setDetail] = useState(initial?.detailUrl ?? '');
  const [isAdult, setIsAdult] = useState(initial?.isAdult ?? false);
  const [weight, setWeight] = useState(String(initial?.weight ?? 0));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name, url, detail: detail || undefined, isAdult, weight: Number(weight) || 0 };
      if (initial) await updateSource(initial.key, payload);
      else await createSource(payload);
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
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-lg border border-overlay/60 bg-elevated p-5 shadow-card"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-t1">{initial ? '编辑数据源' : '添加数据源'}</h2>
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
              placeholder="如：量子资源"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-t2">
            接口地址
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/api.php/provide/vod"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-t2">
            详情页根地址（可选）
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="部分源需要爬详情页提取 m3u8"
              className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-t2">
              权重（搜索排序用）
              <input
                type="number"
                min={0}
                max={1000}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
              />
            </label>
            <label className="mt-6 flex items-center gap-2 text-xs text-t2">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                className="h-4 w-4 accent-[#E8112D]"
              />
              成人源
            </label>
          </div>
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

export default function AdminSourcesPage() {
  const { ready } = useRequireAdmin();
  const [rows, setRows] = useState<Row[] | null>(null);
  /** 原始 DB 记录（编辑弹窗需要 detailUrl 等完整字段） */
  const [dbRecords, setDbRecords] = useState<ApiSourceRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; source: ApiSourceRecord } | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState('');

  const reload = useCallback(() => {
    void Promise.all([listAdminSources(), getSourceHealth(7)])
      .then(([{ dbSources, envSources }, { byUrl }]) => {
        const toRow = (
          r: { key: string; name: string; url?: string; apiUrl?: string; weight?: number; isAdult?: boolean; enabled?: boolean },
          origin: 'db' | 'env'
        ): Row => {
          const url = r.apiUrl ?? r.url ?? '';
          const h: SourceHealthEntry | undefined = byUrl[url];
          return {
            key: r.key,
            name: r.name,
            apiUrl: url,
            weight: r.weight ?? null,
            isAdult: r.isAdult ?? false,
            enabled: r.enabled ?? true,
            origin,
            probeOk: h?.probe?.ok,
            probeMs: h?.probe?.ms,
            probedAt: h?.probe?.probedAt,
            total: h?.probe?.total,
          };
        };
        setRows([
          ...dbSources.map((s) => toRow(s, 'db')),
          ...envSources.map((s) => toRow({ key: `env:${s.url}`, ...s }, 'env')),
        ]);
        setDbRecords(dbSources);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw && !r.name.toLowerCase().includes(kw) && !r.apiUrl.toLowerCase().includes(kw)) return false;
      switch (statusFilter) {
        case 'ok':
          return r.probeOk === true;
        case 'fail':
          return r.probeOk === false;
        case 'disabled':
          return r.origin === 'db' && !r.enabled;
        default:
          return true;
      }
    });
  }, [rows, keyword, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  async function runProbe(url: string) {
    setProbing(url);
    try {
      await probeSource(url);
      reload();
    } catch {
      reload();
    } finally {
      setProbing(null);
    }
  }

  async function toggleEnabled(r: Row) {
    try {
      await updateSource(r.key, { enabled: !r.enabled });
      reload();
    } catch {
      /* 列表刷新呈现真实状态 */
    }
  }

  async function remove(r: Row) {
    try {
      await deleteSource(r.key);
      reload();
    } finally {
      setConfirmingKey(null);
    }
  }

  async function runRefreshCatalog() {
    setCatalogBusy(true);
    setCatalogMsg('');
    try {
      const res = await refreshCatalog();
      setCatalogMsg(`已刷新 ${res.ok}/${res.sources} 个源（失败 ${res.failed}）`);
      reload();
    } catch (err) {
      setCatalogMsg(err instanceof Error ? err.message : '刷新失败');
    } finally {
      setCatalogBusy(false);
    }
  }

  if (!ready) return <AdminLoading />;

  const fmtProbeTime = (ts?: number) =>
    ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-t1">苹果CMS 数据源</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {catalogMsg && <span className="text-[11px] text-t3">{catalogMsg}</span>}
          <button
            onClick={() => void runRefreshCatalog()}
            disabled={catalogBusy}
            className="flex items-center gap-1.5 rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1 disabled:opacity-40"
          >
            <IconRefresh className={cn('h-3.5 w-3.5', catalogBusy && 'animate-spin')} />
            {catalogBusy ? '刷新中…' : '刷新收录量'}
          </button>
          <Link
            href="/admin/subscriptions"
            className="flex items-center gap-1.5 rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
          >
            TVBox 订阅导入
          </Link>
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <IconPlus className="h-3.5 w-3.5" />
            添加数据源
          </button>
        </div>
      </div>

      {/* 搜索 + 状态筛选 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-overlay bg-elevated px-3 py-2">
          <IconSearch className="h-4 w-4 shrink-0 text-t3" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(0);
            }}
            placeholder="搜索名称 / 接口地址"
            className="w-full bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(0);
          }}
          className="rounded-lg border border-overlay bg-elevated px-3 py-2 text-xs text-t2 outline-none"
        >
          <option value="all">全部状态</option>
          <option value="ok">正常</option>
          <option value="fail">异常</option>
          <option value="disabled">已停用</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
              <th className="px-4 py-2.5 font-normal">名称</th>
              <th className="px-3 py-2.5 font-normal">接口地址</th>
              <th className="px-3 py-2.5 text-center font-normal" title="搜索排序权重：多源同片去重时的选优依据（L16 排序接线待做）">
                权重 ⓘ
              </th>
              <th className="px-3 py-2.5 text-center font-normal" title="成人源：受「内容运营→成人过滤」开关控制（#8）">
                成人源 ⓘ
              </th>
              <th className="px-3 py-2.5 font-normal">状态</th>
              <th className="px-3 py-2.5 text-right font-normal">收录数</th>
              <th className="px-3 py-2.5 text-center font-normal">启用</th>
              <th className="px-3 py-2.5 text-center font-normal">来源</th>
              <th className="px-4 py-2.5 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-xs text-t3">
                  {rows === null ? '加载中…' : '没有符合条件的数据源'}
                </td>
              </tr>
            )}
            {pageRows.map((r) => {
              const status = r.probeOk === undefined ? 'none' : r.probeOk ? 'ok' : 'fail';
              return (
                <tr key={r.key} className={cn('border-b border-overlay/40 last:border-0', r.origin === 'env' && 'opacity-75')}>
                  <td className="px-4 py-2.5 text-sm text-t1">
                    {r.name}
                    {r.isAdult && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">18+</span>}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-t3" title={r.apiUrl}>
                    {r.apiUrl}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-t2">{r.weight ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-t2">{r.isAdult ? '是' : '否'}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs" title={fmtProbeTime(r.probedAt)}>
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          status === 'ok' ? 'bg-[#3FB950]' : status === 'fail' ? 'bg-accent' : 'bg-t3/50'
                        )}
                      />
                      <span className={status === 'ok' ? 'text-t2' : status === 'fail' ? 'text-accent' : 'text-t3'}>
                        {status === 'ok' ? `正常${r.probeMs ? ` ${r.probeMs}ms` : ''}` : status === 'fail' ? '异常' : '未采集'}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-t2">
                    {r.total !== undefined ? r.total.toLocaleString() : '—'}
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
                      onClick={() => void runProbe(r.apiUrl)}
                      disabled={probing === r.apiUrl}
                      className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 transition hover:text-t1 disabled:opacity-40"
                    >
                      {probing === r.apiUrl ? '…' : '探活'}
                    </button>
                    {r.origin === 'db' && (
                      <>
                        <button
                          onClick={() => {
                            const rec = dbRecords.find((x) => x.key === r.key);
                            if (rec) setModal({ mode: 'edit', source: rec });
                          }}
                          className="ml-1.5 rounded-lg border border-overlay px-2 py-1 text-xs text-t2 transition hover:text-t1"
                          aria-label="编辑"
                        >
                          <IconEdit className="inline h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => (confirmingKey === r.key ? void remove(r) : setConfirmingKey(r.key))}
                          className={cn(
                            'ml-1.5 rounded-lg px-2.5 py-1 text-xs transition',
                            confirmingKey === r.key ? 'bg-accent text-white' : 'border border-overlay text-t2 hover:text-accent'
                          )}
                        >
                          {confirmingKey === r.key ? '确认' : '删除'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-3 flex items-center justify-between text-xs text-t3">
        <span>共 {filtered.length} 条</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-overlay px-2.5 py-1 transition hover:text-t1 disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-overlay px-2.5 py-1 transition hover:text-t1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      {modal && (
        <SourceModal
          initial={modal.mode === 'edit' ? modal.source : null}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-t3">
        状态与收录数来自最近一次探活/收录刷新快照（source_catalog）；可用率趋势见仪表盘。环境变量源（DEFAULT_SOURCES）只读，修改需调整环境变量并重新部署。
      </p>
    </div>
  );
}
