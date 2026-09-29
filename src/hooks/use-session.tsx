'use client';

// 前台会话上下文：全站共享当前身份（站长 admin / 普通用户）+ 站点品牌信息（L15），
// loading 区分「检查中」与「未登录」，页面据此渲染骨架屏或跳登录页。

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAuthStatus, type SessionUser, type SiteInfo } from '@/lib/client-api';

interface SessionContextValue {
  loading: boolean;
  user: SessionUser | null;
  /** 站点品牌信息（后台「站点设置」维护；未配置时为空对象） */
  site: SiteInfo;
  /** 登录/登出后刷新会话状态 */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  loading: true,
  user: null,
  site: {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [site, setSite] = useState<SiteInfo>({});

  const refresh = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setUser(status.verified && status.user ? status.user : null);
      setSite(status.site ?? {});
    } catch {
      setUser(null);
      setSite({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ loading, user, site, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
