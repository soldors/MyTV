'use client';

// 后台布局（#14 独立双布局）：侧边栏工作台（桌面）/ 顶部横滑标签（手机基础可用）。
// 与前台不共享导航骨架；设计基调 docs/02 §7.5（同暗色令牌、密度更高、圆角 8px）。

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SessionProvider } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

const ADMIN_NAV = [
  { href: '/admin', label: '仪表盘' },
  { href: '/admin/sources', label: '数据源' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/settings', label: '站点设置' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  return (
    <SessionProvider>
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
        <div className="px-3 pb-6">
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
    </SessionProvider>
  );
}
