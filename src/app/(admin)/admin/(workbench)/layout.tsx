'use client';

// 后台工作台布局（M6 后台二期重写，docs/09 §1.1）：
// - 桌面：可折叠侧栏（208px ↔ 图标态，localStorage 记忆）+ 顶栏（通知铃角标/头像下拉）
// - 手机：顶部横滑标签保留 + 抽屉（汉堡键）承载全部导航（D9）
// - 侧栏底部品牌区 + 版本号（取 package.json，部署版本见系统状态页）

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '@/lib/client-api';
import { listUsers } from '@/lib/admin-api';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';
import {
  IconBell,
  IconChevronDown,
  IconDatabase,
  IconEdit,
  IconFilter,
  IconFilm,
  IconGrid,
  IconInfo,
  IconMenu,
  IconPlay,
  IconSettings,
  IconTv,
  IconUser,
} from '@/components/site/icons';
import packageInfo from '../../../../../package.json';

const ADMIN_NAV = [
  { href: '/admin/dashboard', label: '仪表盘', icon: IconGrid },
  { href: '/admin/sources', label: '数据源管理', icon: IconFilm },
  { href: '/admin/live-sources', label: '直播源管理', icon: IconPlay },
  { href: '/admin/subscriptions', label: 'TVBox 订阅', icon: IconTv },
  { href: '/admin/users', label: '用户管理', icon: IconUser },
  { href: '/admin/settings', label: '站点设置', icon: IconSettings },
  { href: '/admin/content', label: '内容运营', icon: IconFilter },
  { href: '/admin/cache', label: '缓存管理', icon: IconDatabase },
  { href: '/admin/system', label: '系统状态', icon: IconInfo },
] as const;

const COLLAPSE_KEY = 'mytv_admin_sidebar_collapsed';

/** 退出按钮（在 SessionProvider 树内） */
function AvatarMenu() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-t2 transition hover:bg-overlay hover:text-t1"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-overlay text-xs font-semibold text-t1 ring-1 ring-white/10">
          {(user?.name ?? 'A').charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-xs md:inline">{user?.name ?? 'admin'}</span>
        <IconChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-overlay/60 bg-elevated py-1 shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() =>
              void logout()
                .catch(() => {})
                .then(refresh)
                .then(() => router.replace('/admin'))
            }
            className="block w-full px-4 py-2 text-left text-xs text-t2 transition hover:bg-overlay hover:text-accent"
          >
            退出站长登录
          </button>
          <Link
            href="/"
            className="block px-4 py-2 text-xs text-t2 transition hover:bg-overlay hover:text-t1"
          >
            返回前台
          </Link>
        </div>
      )}
    </div>
  );
}

/** 通知铃：角标 = 待审批用户数（真实数据，点击去用户页） */
function NotificationBell({ pending }: { pending: number }) {
  return (
    <Link
      href="/admin/users"
      aria-label={pending > 0 ? `${pending} 个待审批` : '通知'}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-t2 transition hover:bg-overlay hover:text-t1"
    >
      <IconBell className="h-5 w-5" />
      {pending > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
          {pending > 9 ? '9+' : pending}
        </span>
      )}
    </Link>
  );
}

/** 侧栏主体（桌面侧栏与手机抽屉共用） */
function SidebarNav({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = (href: string) => pathname.startsWith(href);
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-extrabold text-white">
          M
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold tracking-wide text-t1">MyTV</span>
            <span className="block text-[10px] text-t3">管理后台</span>
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              collapsed && 'justify-center px-0',
              isActive(href)
                ? 'bg-overlay font-medium text-t1'
                : 'text-t2 hover:bg-overlay/60 hover:text-t1'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>
      <div className="px-4 pb-4 pt-3">
        {!collapsed && (
          <p className="text-[10px] text-t3">
            v{packageInfo.version} · AGPL-3.0
          </p>
        )}
      </div>
    </>
  );
}

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  // 待审批角标：进后台时取一次（审批动作后用户页自己刷新）
  useEffect(() => {
    void listUsers()
      .then(({ users }) => setPending(users.filter((u) => u.status === 'pending').length))
      .catch(() => {});
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* 桌面侧栏 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-overlay/60 bg-elevated transition-all md:flex',
          collapsed ? 'w-16' : 'w-52'
        )}
      >
        <SidebarNav collapsed={collapsed} pathname={pathname} />
      </aside>

      {/* 手机抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col border-r border-overlay/60 bg-elevated">
            <SidebarNav collapsed={false} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn('flex min-w-0 flex-1 flex-col transition-all', collapsed ? 'md:pl-16' : 'md:pl-52')}>
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-overlay/60 bg-bg/90 px-3 backdrop-blur-md md:h-14 md:px-5">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="打开菜单"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-t2 transition hover:bg-overlay hover:text-t1 md:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          {/* 折叠按钮（桌面） */}
          <button
            onClick={() => {
              setCollapsed((v) => {
                localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
                return !v;
              });
            }}
            aria-label="折叠侧栏"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-t3 transition hover:bg-overlay hover:text-t1 md:flex"
          >
            <IconMenu className="h-4 w-4" />
          </button>

          {/* 手机横滑标签（D9：保留） */}
          <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto md:hidden">
            {ADMIN_NAV.slice(0, 4).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px]',
                  pathname.startsWith(href) ? 'bg-overlay font-medium text-t1' : 'text-t2'
                )}
              >
                {label.replace('管理', '')}
              </Link>
            ))}
          </div>

          <div className="flex-1" />
          <NotificationBell pending={pending} />
          <AvatarMenu />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
