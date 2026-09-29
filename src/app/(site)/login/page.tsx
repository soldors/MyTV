'use client';

// 用户登录页（2026-09-29 入口拆分）：仅承担普通用户的登录与注册；
// 站长入口独立为 /admin（站长只负责后台维护，用户登录即看）。
// 背景为 CSS 渐变拼贴（无外部海报资源依赖），叠加红色径向光晕呼应影院主题。

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { registerUser, userLogin } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

type Tab = 'user' | 'register';

const TABS: { key: Tab; label: string }[] = [
  { key: 'user', label: '用户登录' },
  { key: 'register', label: '注册账号' },
];

/** CSS 海报拼贴：一组深色系渐变色块铺满背景（模拟海报墙，避免外部资源依赖） */
const COLLAGE_COLORS = [
  ['#1a2332', '#0d1220'],
  ['#2a1a22', '#140a10'],
  ['#14241d', '#0a1512'],
  ['#241a2e', '#100a16'],
  ['#1e2a32', '#0c141a'],
  ['#2e1a1e', '#160a0c'],
];

function PosterCollage() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 flex scale-110 flex-wrap content-start gap-2 opacity-45 blur-[2px]">
        {Array.from({ length: 36 }, (_, i) => {
          const [from, to] = COLLAGE_COLORS[i % COLLAGE_COLORS.length];
          return (
            <div
              key={i}
              className="aspect-[2/3] w-[18%]"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            />
          );
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-bg/85 via-bg/70 to-bg" />
      <div
        className="absolute left-1/4 top-1/3 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(232,17,45,0.18) 0%, transparent 70%)' }}
      />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [tab, setTab] = useState<Tab>('user');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = searchParams.get('next') || '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (tab === 'user') {
        await userLogin(name.trim(), password);
        await refresh();
        router.replace(next);
      } else {
        if (password !== confirm) {
          setError('两次输入的密码不一致');
          return;
        }
        const res = await registerUser(name.trim(), password);
        setMessage(res.message || '注册成功');
        if (res.status === 'active') setTab('user');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-white/10 bg-elevated/60 p-6 shadow-card backdrop-blur-xl sm:p-10">
      <h1 className="text-center text-3xl font-extrabold tracking-wide text-accent">MyTV</h1>
      <p className="mt-1 text-center text-xs text-t2">在线影视聚合平台</p>

      <div className="mt-6 grid grid-cols-2 border-b border-overlay">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setError('');
              setMessage('');
            }}
            className={cn(
              'relative pb-2 text-xs transition-colors sm:text-sm',
              tab === key ? 'text-t1' : 'text-t2 hover:text-t1'
            )}
          >
            {label}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-t2">用户名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            placeholder="2-32 位字母 / 数字 / 下划线 / 短横线"
            className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-t2">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            placeholder="至少 6 位"
            className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
          />
        </label>
        {tab === 'register' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-t2">确认密码</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="再次输入密码"
              className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
            />
          </label>
        )}

        {error && <p className="text-xs text-accent">{error}</p>}
        {message && <p className="text-xs text-rating">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '处理中…' : tab === 'register' ? '注 册' : '登 录'}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-t3">
        {tab === 'register'
          ? '注册默认需站长审批，通过后方可登录'
          : '忘记密码请联系站长重置'}
        {' · '}
        <Link href="/admin" className="underline hover:text-t2">
          站长入口
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <PosterCollage />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
