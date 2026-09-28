'use client';

import { useCallback, useEffect, useState } from 'react';

interface ProbeResult {
  ok: boolean;
  ms: number;
  count?: number;
  error?: string;
}

export default function HomePage() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState('');
  const [sourceUrl, setSourceUrl] = useState('https://cj.lziapi.com/api.php/provide/vod');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      const data = (await res.json()) as { verified?: boolean };
      setVerified(Boolean(data.verified));
    } catch {
      setVerified(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  async function login() {
    setLoginMsg('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (data.success) {
      setLoginMsg('登录成功');
      setPassword('');
      await refreshAuth();
    } else {
      setLoginMsg(data.error || '登录失败');
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbe(null);
    try {
      const res = await fetch('/api/source/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      });
      setProbe((await res.json()) as ProbeResult);
    } catch {
      setProbe({ ok: false, ms: 0, error: '请求失败' });
    } finally {
      setProbing(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-wide text-[#E8112D]">MyTV</h1>
        <p className="mt-2 text-sm text-[#9AA3B2]">
          M0 骨架 · 端到端验证页（M2 替换为正式首页）
        </p>
      </div>

      <section className="rounded-xl border border-[#1B2230] bg-[#131822] p-5">
        <h2 className="text-sm font-semibold text-[#F2F4F8]">1. 会话</h2>
        {verified === null ? (
          <p className="mt-2 text-sm text-[#9AA3B2]">检查中…</p>
        ) : verified ? (
          <p className="mt-2 text-sm text-[#3FB950]">已登录（签名 cookie 有效）</p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void login()}
              placeholder="站长密码（PASSWORD）"
              className="flex-1 rounded-lg border border-[#1B2230] bg-[#0B0E14] px-3 py-2 text-sm outline-none focus:border-[#E8112D]"
            />
            <button
              onClick={() => void login()}
              className="rounded-lg bg-[#E8112D] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              登录
            </button>
          </div>
        )}
        {loginMsg && <p className="mt-2 text-xs text-[#9AA3B2]">{loginMsg}</p>}
      </section>

      <section className="rounded-xl border border-[#1B2230] bg-[#131822] p-5">
        <h2 className="text-sm font-semibold text-[#F2F4F8]">2. 采集源探活（端到端）</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://.../api.php/provide/vod"
            className="flex-1 rounded-lg border border-[#1B2230] bg-[#0B0E14] px-3 py-2 text-sm outline-none focus:border-[#E8112D]"
          />
          <button
            onClick={() => void runProbe()}
            disabled={!verified || probing}
            className="rounded-lg bg-[#E8112D] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probing ? '探测中…' : '探活'}
          </button>
        </div>
        {!verified && <p className="mt-2 text-xs text-[#5C6675]">登录后可探测</p>}
        {probe && (
          <p className="mt-3 text-sm">
            {probe.ok ? (
              <span className="text-[#3FB950]">
                可用 · 耗时 {probe.ms}ms · 结果 {probe.count} 条
              </span>
            ) : (
              <span className="text-[#E8112D]">
                不可用 · {probe.error}（{probe.ms}ms）
              </span>
            )}
          </p>
        )}
      </section>
    </main>
  );
}
