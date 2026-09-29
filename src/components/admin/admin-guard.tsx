'use client';

// 管理员身份自校验：middleware 已在边缘拦截（未授权 → /admin 登录页），
// 页面侧再校验会话角色作为纵深防御——非管理员同样送回登录页而非渲染 404 壳。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/use-session';

export function useRequireAdmin(): { ready: boolean } {
  const { loading, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== 'admin') router.replace('/admin');
  }, [loading, user, router]);

  return { ready: !loading && user?.role === 'admin' };
}

/** 守卫通过前的加载占位（后台密度风格） */
export function AdminLoading() {
  return <div className="mt-6 h-40 animate-pulse rounded-lg bg-elevated" />;
}
