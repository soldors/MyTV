'use client';

// 内容运营（M6，docs/01 §9.1 二期 → docs/09 §1.5）：成人过滤 + 自定义词库 + 注册开关/审批
// （从站点设置迁移）+ 搜索每源最大页数。全部实时写 SiteConfig，搜索即时生效。

import { useEffect, useState } from 'react';
import { getSiteConfig, saveSiteConfig } from '@/lib/admin-api';
import type { SiteConfig } from '@/lib/types';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-overlay/60 bg-elevated px-4 py-3">
      <div>
        <p className="text-sm text-t1">{label}</p>
        <p className="mt-0.5 text-[11px] text-t3">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        aria-label={label}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-overlay'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${value ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

export default function AdminContentPage() {
  const { ready } = useRequireAdmin();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [wordsText, setWordsText] = useState('');
  const [maxPages, setMaxPages] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void getSiteConfig()
      .then(({ config }) => {
        setConfig(config);
        setWordsText((config.adultFilterWords ?? []).join('\n'));
        setMaxPages(config.searchMaxPages ? String(config.searchMaxPages) : '');
      })
      .catch(() => setConfig(null));
  }, [ready]);

  if (!ready) return <AdminLoading />;
  if (!config) return <div className="mt-5 h-40 animate-pulse rounded-lg bg-elevated" />;

  async function save(patch: Partial<SiteConfig>) {
    setMsg('');
    setBusy(true);
    try {
      const { config: next } = await saveSiteConfig(patch);
      setConfig(next);
      setMsg('已保存，即时生效');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-t1">内容运营</h1>

      <div className="mt-5 space-y-3">
        <Toggle
          label="成人内容过滤"
          hint="过滤成人源分类与敏感内容（#8）；关闭后搜索返回全部结果"
          value={config.adultFilterEnabled}
          onChange={(v) => void save({ adultFilterEnabled: v })}
        />
        <Toggle
          label="开放注册"
          hint="关闭后 /api/user/register 拒绝新注册"
          value={config.registrationEnabled}
          onChange={(v) => void save({ registrationEnabled: v })}
        />
        <Toggle
          label="注册需审批"
          hint="新用户注册后为「待审批」，在用户管理页批准后方可登录（#9）"
          value={config.registrationApproval}
          onChange={(v) => void save({ registrationApproval: v })}
        />
      </div>

      <section className="mt-6 rounded-lg border border-overlay/60 bg-elevated p-4">
        <h2 className="text-sm font-semibold text-t1">自定义过滤词库</h2>
        <p className="mt-1 text-[11px] text-t3">
          每行一个词（≤32 字符，最多 100 个）：搜索结果的名称或分类命中即被过滤，与内置关键词叠加生效。
        </p>
        <textarea
          value={wordsText}
          onChange={(e) => setWordsText(e.target.value)}
          rows={6}
          placeholder={'示例：\n某影片名\n某分类名'}
          className="mt-3 w-full resize-y rounded-lg border border-overlay bg-bg px-3 py-2 font-mono text-xs text-t1 outline-none focus:border-accent"
        />
        <div className="mt-3 flex items-center justify-end gap-3">
          {msg && <span className="text-xs text-t3">{msg}</span>}
          <button
            onClick={() => void save({ adultFilterWords: wordsText.split('\n').map((w) => w.trim()).filter(Boolean) })}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '保存中…' : '保存词库'}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-overlay/60 bg-elevated p-4">
        <h2 className="text-sm font-semibold text-t1">搜索行为</h2>
        <p className="mt-1 text-[11px] text-t3">
          每源最大抓取页数（1-50）：页数越大结果越全但搜索越慢；留空使用部署环境变量 SEARCH_MAX_PAGES（当前默认 5）。
        </p>
        <div className="mt-3 flex items-center justify-end gap-3">
          {msg && <span className="text-xs text-t3" />}
          <input
            type="number"
            min={1}
            max={50}
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            placeholder="默认（环境变量）"
            className="w-40 rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
          <button
            onClick={() =>
              void save({ searchMaxPages: maxPages === '' ? undefined : Number(maxPages) })
            }
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </section>
    </div>
  );
}
