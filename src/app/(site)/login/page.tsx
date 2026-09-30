'use client';

// 用户登录页（2026-09-29 入口拆分；2026-09-30 布局调整）：
// 登录表单为主体，注册改为登录按钮下方入口；忘记密码走弹窗——
// 第一步提交申请（站长后台审批），第二步凭一次性重置码设置新密码。
// 站长入口独立为 /admin（站长只负责后台维护，用户登录即看）。
// 背景为 CSS 渐变拼贴（无外部海报资源依赖），叠加红色径向光晕呼应影院主题。

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  registerUser,
  requestPasswordReset,
  resetPasswordWithCode,
  userLogin,
} from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'register';

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

/** 忘记密码弹窗：申请重置 / 已有重置码 两步 */
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await requestPasswordReset(name.trim());
      setMessage(res.message || '已提交申请，请等待站长审批');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await resetPasswordWithCode(name.trim(), code.trim(), newPassword);
      setMessage(res.message || '密码已重置');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-elevated p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-t1">找回密码</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-t3 hover:text-t1">
            ✕
          </button>
        </div>

        {message ? (
          <div className="mt-4">
            <p className="text-xs leading-relaxed text-rating">{message}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              返回登录
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 border-b border-overlay">
              {(
                [
                  ['request', '申请重置'],
                  ['reset', '输入重置码'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setStep(key);
                    setError('');
                  }}
                  className={cn(
                    'relative pb-2 text-xs transition-colors',
                    step === key ? 'text-t1' : 'text-t2 hover:text-t1'
                  )}
                >
                  {label}
                  {step === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>

            {step === 'request' ? (
              <form onSubmit={submitRequest} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-t2">用户名</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="username"
                    placeholder="注册时的用户名"
                    className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
                  />
                </label>
                {error && <p className="text-xs text-accent">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? '提交中…' : '提交申请'}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-t3">
                  提交后由站长审批；批准后将获得一次性重置码（24 小时内有效）
                </p>
              </form>
            ) : (
              <form onSubmit={submitReset} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-t2">用户名</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="username"
                    placeholder="注册时的用户名"
                    className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-t2">重置码</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="站长提供的 8 位重置码"
                    className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-t2">新密码</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="至少 6 位"
                    className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
                  />
                </label>
                {error && <p className="text-xs text-accent">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !name.trim() || !code.trim() || newPassword.length < 6}
                  className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? '重置中…' : '重置密码'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const next = searchParams.get('next') || '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'login') {
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
        if (res.status === 'active') setMode('login');
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

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="至少 6 位"
            className="rounded-lg border border-overlay bg-bg/60 px-3 py-2.5 text-sm text-t1 outline-none transition focus:border-accent"
          />
        </label>
        {mode === 'register' && (
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
          {busy ? '处理中…' : mode === 'register' ? '注 册' : '登 录'}
        </button>
      </form>

      {/* 登录按钮下方：注册入口（登录态） / 返回登录（注册态） + 忘记密码 */}
      <div className="mt-4 flex items-center justify-between text-xs">
        {mode === 'login' ? (
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
              setMessage('');
            }}
            className="text-t2 underline-offset-2 transition hover:text-t1 hover:underline"
          >
            注册账号
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setMessage('');
            }}
            className="text-t2 underline-offset-2 transition hover:text-t1 hover:underline"
          >
            返回登录
          </button>
        )}
        {mode === 'login' && (
          <button
            type="button"
            onClick={() => {
              setForgotOpen(true);
              setError('');
              setMessage('');
            }}
            className="text-t3 underline-offset-2 transition hover:text-t2 hover:underline"
          >
            忘记密码？
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-t3">
        {mode === 'register' ? '注册默认需站长审批，通过后方可登录' : '本站不存储任何视频内容，均来自第三方数据源'}
        {' · '}
        <Link href="/admin" className="underline hover:text-t2">
          站长入口
        </Link>
      </p>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
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
