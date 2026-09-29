'use client';

// 站点设置（M6 瘦身）：仅基本信息（站点名/公告）——注册与内容过滤开关迁至「内容运营」。

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSiteConfig, saveSiteConfig } from '@/lib/admin-api';
import type { SiteConfig } from '@/lib/types';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';

export default function AdminSettingsPage() {
  const { ready } = useRequireAdmin();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [siteName, setSiteName] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void getSiteConfig()
      .then(({ config }) => {
        setConfig(config);
        setSiteName(config.siteName ?? '');
        setAnnouncement(config.announcement ?? '');
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
      setMsg('已保存');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-t1">站点设置</h1>

      <section className="mt-5 rounded-lg border border-overlay/60 bg-elevated p-4">
        <h2 className="text-sm font-semibold text-t1">基本信息</h2>
        <label className="mt-3 block text-xs text-t2">
          站点名称（前台顶栏品牌位；留空显示 MyTV）
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="MyTV"
            className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block text-xs text-t2">
          公告（前台公告条，可关闭；内容更新后对所有用户重新显示）
          <textarea
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            rows={3}
            placeholder="展示在前台顶部的公告文本"
            className="mt-1 w-full resize-none rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 flex items-center justify-end gap-3">
          {msg && <span className="text-xs text-t3">{msg}</span>}
          <button
            onClick={() => void save({ siteName, announcement })}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </section>

      <p className="mt-5 text-[11px] leading-relaxed text-t3">
        注册开关 / 注册审批 / 成人过滤 / 过滤词库 / 搜索页数已迁至
        <Link href="/admin/content" className="mx-1 underline hover:text-t2">
          内容运营
        </Link>
        ；密码门禁（PASSWORD）与代理密钥（PROXY_SECRET）属部署密钥，经 wrangler secret 管理。
      </p>
    </div>
  );
}
