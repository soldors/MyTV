'use client';

// 前台会话上下文：全站共享当前身份（站长 admin / 普通用户），
// loading 区分「检查中」与「未登录」，页面据此渲染骨架屏或跳登录页。

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAuthStatus, type SessionUser } from '@/lib/client-api';

interface SessionContextValue {
  loading: boolean;
  user: SessionUser | null;
  /** 登录/登出后刷新会话状态 */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  loading: true,
  user: null,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setUser(status.verified && status.user ? status.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ loading, user, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
