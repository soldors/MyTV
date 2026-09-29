'use client';

// 站点设置（M4 一期最小，#15）：注册开关 / 注册审批 / 成人过滤 / 站点名 / 公告。

import { useEffect, useState } from 'react';
import { getSiteConfig, saveSiteConfig } from '@/lib/admin-api';
import type { SiteConfig } from '@/lib/types';
import { AdminDenied, useRequireAdmin } from '@/components/admin/admin-guard';

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

  if (!ready) return <AdminDenied ready={ready} />;
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

      <div className="mt-5 space-y-3">
        <Toggle
          label="开放注册"
          hint="关闭后 /api/user/register 拒绝新注册"
          value={config.registrationEnabled}
          onChange={(v) => void save({ registrationEnabled: v })}
        />
        <Toggle
          label="注册需审批"
          hint="开启时新用户注册后为「待审批」状态，需在此批准后方可登录（#9）"
          value={config.registrationApproval}
          onChange={(v) => void save({ registrationApproval: v })}
        />
        <Toggle
          label="成人内容过滤"
          hint="搜索结果默认过滤成人源与敏感内容（#8）；请求显式指定时以请求为准"
          value={config.adultFilterEnabled}
          onChange={(v) => void save({ adultFilterEnabled: v })}
        />
      </div>

      <section className="mt-6 rounded-lg border border-overlay/60 bg-elevated p-4">
        <h2 className="text-sm font-semibold text-t1">基本信息</h2>
        <label className="mt-3 block text-xs text-t2">
          站点名称（预留，前台品牌位使用）
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="MyTV"
            className="mt-1 w-full rounded-lg border border-overlay bg-bg px-3 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block text-xs text-t2">
          公告（预留，前台公告条使用）
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

      <p className="mt-6 text-[11px] leading-relaxed text-t3">
        密码门禁（PASSWORD）与代理密钥（PROXY_SECRET）属部署密钥，经 wrangler secret 管理，不在此页。
      </p>
    </div>
  );
}
