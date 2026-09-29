'use client';

// 工作台布局（仅包裹 (workbench) 组内页面，无条件分支）：
// 侧边栏工作台（桌面）/ 顶部横滑标签（手机）；设计基调 docs/02 §7.5。

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

const ADMIN_NAV = [
  { href: '/admin/dashboard', label: '仪表盘' },
  { href: '/admin/sources', label: '数据源' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/settings', label: '站点设置' },
];

/** 退出按钮独立成组件：在 SessionProvider 树内消费会话上下文 */
function LogoutButton() {
  const router = useRouter();
  const { refresh } = useSession();
  return (
    <button
      onClick={() =>
        void logout()
          .catch(() => {})
          .then(refresh)
          .then(() => router.replace('/admin'))
      }
      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-t3 transition-colors hover:bg-overlay/60 hover:text-t2"
    >
      退出站长登录
    </button>
  );
}

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      {/* 桌面侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 flex-col border-r border-overlay/60 bg-elevated md:flex">
        <div className="px-5 pb-6 pt-6">
          <p className="text-lg font-extrabold tracking-wide text-accent">MyTV</p>
          <p className="mt-0.5 text-[10px] text-t3">管理后台</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {ADMIN_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                isActive(href) ? 'bg-overlay font-medium text-t1' : 'text-t2 hover:bg-overlay/60 hover:text-t1'
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 px-3 pb-6">
          <LogoutButton />
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-xs text-t3 transition-colors hover:bg-overlay/60 hover:text-t2"
          >
            ← 返回前台
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:pl-52">
        {/* 手机顶部标签 */}
        <div className="no-scrollbar sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b border-overlay/60 bg-bg/90 px-3 py-2 backdrop-blur-md md:hidden">
          <span className="mr-2 shrink-0 text-sm font-extrabold text-accent">MyTV</span>
          {ADMIN_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs',
                isActive(href) ? 'bg-overlay font-medium text-t1' : 'text-t2'
              )}
            >
              {label}
            </Link>
          ))}
          <Link href="/" className="ml-auto shrink-0 px-2 text-xs text-t3">
            前台
          </Link>
        </div>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
