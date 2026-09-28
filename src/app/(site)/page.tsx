'use client';

import { useCallback, useEffect, useState } from 'react';

interface ProbeResult {
  ok: boolean;
  ms: number;
  count?: number;
  error?: string;
}

interface SessionUser {
  name: string;
  role: string;
}

export default function HomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState('');
  const [sourceUrl, setSourceUrl] = useState('https://cj.lziapi.com/api.php/provide/vod');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [userMsg, setUserMsg] = useState('');
  const [recordsMsg, setRecordsMsg] = useState('');

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      const data = (await res.json()) as { verified?: boolean; user?: SessionUser | null };
      setUser(data.verified && data.user ? data.user : null);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
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

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    setUser(null);
    setRecordsMsg('');
    await refreshAuth();
  }

  async function register() {
    setUserMsg('');
    const res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: regName, password: regPassword }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    setUserMsg(data.message || data.error || '注册失败');
  }

  async function userLogin() {
    setUserMsg('');
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: regName, password: regPassword }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (data.success) {
      setUserMsg('登录成功');
      setRegPassword('');
      await refreshAuth();
    } else {
      setUserMsg(data.error || '登录失败');
    }
  }

  async function writeDemoRecord() {
    setRecordsMsg('');
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'lzi',
        vodId: 'demo-001',
        title: 'M1 演示记录',
        episodeIndex: 1,
        totalTime: 2700,
        playTime: Math.floor(Math.random() * 2700),
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    setRecordsMsg(data.success ? '已写入（upsert demo-001）' : data.error || '写入失败');
  }

  async function readRecords() {
    setRecordsMsg('');
    const res = await fetch('/api/records');
    if (!res.ok) {
      setRecordsMsg('读取失败（未登录？）');
      return;
    }
    const data = (await res.json()) as { list?: { title: string; playTime: number }[] };
    const list = data.list ?? [];
    setRecordsMsg(
      list.length === 0
        ? '云端暂无记录'
        : `云端 ${list.length} 条：${list.map((r) => `${r.title}(${Math.floor(r.playTime)}s)`).join('、')}`
    );
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-wide text-[#E8112D]">MyTV</h1>
        <p className="mt-2 text-sm text-[#9AA3B2]">
          M0 骨架 · M1 数据层验证页（M2 替换为正式首页）
        </p>
      </div>

      <section className="rounded-xl border border-[#1B2230] bg-[#131822] p-5">
        <h2 className="text-sm font-semibold text-[#F2F4F8]">1. 会话（站长 / 用户）</h2>
        {!authChecked ? (
          <p className="mt-2 text-sm text-[#9AA3B2]">检查中…</p>
        ) : user ? (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-[#3FB950]">
              当前身份：{user.name}（{user.role}）
            </p>
            <button
              onClick={() => void logout()}
              className="rounded-lg border border-[#1B2230] px-3 py-1.5 text-xs text-[#9AA3B2] hover:text-[#F2F4F8]"
            >
              登出
            </button>
          </div>
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
              站长登录
            </button>
          </div>
        )}
        {loginMsg && <p className="mt-2 text-xs text-[#9AA3B2]">{loginMsg}</p>}
      </section>

      <section className="rounded-xl border border-[#1B2230] bg-[#131822] p-5">
        <h2 className="text-sm font-semibold text-[#F2F4F8]">2. 多用户与云端记录（M1 · D1）</h2>
        {!user ? (
          <>
            <div className="mt-3 flex gap-2">
              <input
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="用户名（2-32 位字母数字）"
                className="w-40 rounded-lg border border-[#1B2230] bg-[#0B0E14] px-3 py-2 text-sm outline-none focus:border-[#E8112D]"
              />
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="密码（≥6 位）"
                className="flex-1 rounded-lg border border-[#1B2230] bg-[#0B0E14] px-3 py-2 text-sm outline-none focus:border-[#E8112D]"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void register()}
                className="rounded-lg border border-[#E8112D] px-4 py-2 text-sm text-[#E8112D] hover:bg-[#E8112D]/10"
              >
                注册（默认需审批）
              </button>
              <button
                onClick={() => void userLogin()}
                className="rounded-lg bg-[#E8112D] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                用户登录
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void writeDemoRecord()}
              className="rounded-lg bg-[#E8112D] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              写入演示播放记录
            </button>
            <button
              onClick={() => void readRecords()}
              className="rounded-lg border border-[#1B2230] px-4 py-2 text-sm text-[#9AA3B2] hover:text-[#F2F4F8]"
            >
              读取云端记录
            </button>
          </div>
        )}
        {userMsg && <p className="mt-2 text-xs text-[#9AA3B2]">{userMsg}</p>}
        {recordsMsg && <p className="mt-2 text-xs text-[#3FB950]">{recordsMsg}</p>}
      </section>

      <section className="rounded-xl border border-[#1B2230] bg-[#131822] p-5">
        <h2 className="text-sm font-semibold text-[#F2F4F8]">3. 采集源探活（端到端）</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://.../api.php/provide/vod"
            className="flex-1 rounded-lg border border-[#1B2230] bg-[#0B0E14] px-3 py-2 text-sm outline-none focus:border-[#E8112D]"
          />
          <button
            onClick={() => void runProbe()}
            disabled={!user || probing}
            className="rounded-lg bg-[#E8112D] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {probing ? '探测中…' : '探活'}
          </button>
        </div>
        {!user && <p className="mt-2 text-xs text-[#5C6675]">登录后可探测</p>}
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
