'use client';

// /admin/* 的会话上下文（仅提供 SessionProvider，不含工作台壳）。
// 壳在 (workbench)/layout.tsx（侧边栏工作台）；/admin 登录页自成全屏布局。

import { SessionProvider } from '@/hooks/use-session';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
