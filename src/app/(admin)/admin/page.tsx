'use client';

// 站长登录页（2026-09-29 入口拆分）：/admin 独立承担站长登录，
// 与用户登录（/login）彻底分离——站长只负责后台维护，用户登录即看。
// 已登录管理员自动进入工作台；支持 ?next= 回跳（middleware 送入）。

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminLogin } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user, refresh } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = searchParams.get('next') || '/admin/dashboard';

  // 已是管理员：直接进工作台
  useEffect(() => {
    if (!loading && user?.role === 'admin') router.replace(next);
  }, [loading, user, router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await adminLogin(password);
      if (res.user.role !== 'admin') {
        setError('该密码不是站长密码（用户登录请从前台「登录」进入）');
        return;
      }
      await refresh();
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      {/* 背景基调：暗色 + 红色径向光晕（与前台登录同语言，装饰收敛） */}
      <div
        className="absolute left-1/2 top-1/3 h-[55vmin] w-[55vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(232,17,45,0.12) 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-[380px] rounded-lg border border-overlay/60 bg-elevated p-8 shadow-card">
        <p className="text-center text-2xl font-extrabold tracking-wide text-accent">MyTV</p>
        <p className="mt-1 text-center text-xs text-t2">管理后台 · 站长入口</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-t2">站长密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="部署时配置的 PASSWORD"
              className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
            />
          </label>
          {error && <p className="text-xs text-accent">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-1 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '登录中…' : '进入后台'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-t3">
          普通用户请从{' '}
          <Link href="/login" className="underline hover:text-t2">
            前台登录
          </Link>{' '}
          进入 ·{' '}
          <Link href="/" className="underline hover:text-t2">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
