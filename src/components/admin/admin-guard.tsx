'use client';

// 管理员身份自校验：middleware 已在边缘拦截非管理员（404），
// 页面侧再校验会话角色，避免缓存页面壳的误导渲染。

import Link from 'next/link';
import { useSession } from '@/hooks/use-session';

export function useRequireAdmin(): { ready: boolean } {
  const { loading, user } = useSession();
  return { ready: !loading && user !== null && user.role === 'admin' };
}

export function AdminDenied({ ready }: { ready: boolean }) {
  if (ready) return null;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-overlay">404</p>
      <p className="text-sm text-t3">页面不存在</p>
      <Link href="/" className="text-xs text-t2 underline hover:text-t1">
        返回首页
      </Link>
    </div>
  );
}
