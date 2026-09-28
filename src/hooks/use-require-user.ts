'use client';

// 密码门禁（#9）：需登录页面统一守卫——会话检查期间渲染骨架，未登录跳转 /login（带回跳地址）。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/use-session';

export function useRequireUser(): { ready: boolean } {
  const { loading, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  return { ready: !loading && user !== null };
}
