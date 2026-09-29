'use client';

// 前台导航（三端形态，docs/02 §7.1）：
// - 电脑/平板：顶部导航（Logo + 链接 + 搜索框 + 身份入口）
// - 手机：紧凑顶栏（Logo + 搜索图标）+ 底部标签栏（首页/搜索/我的，触控目标 ≥44px）
// 登录页不渲染导航（自带全屏布局）。

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { IconHome, IconSearch, IconTv, IconUser } from './icons';

const NAV_LINKS = [
  { href: '/', label: '首页', icon: IconHome },
  { href: '/live', label: '直播', icon: IconTv },
  { href: '/search', label: '搜索', icon: IconSearch },
  { href: '/my', label: '我的', icon: IconUser },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'relative py-1 text-sm transition-colors',
        active ? 'text-t1' : 'text-t2 hover:text-t1'
      )}
    >
      {label}
      {active && <span className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-accent" />}
    </Link>
  );
}

function TopSearchBox() {
  const router = useRouter();
  const [wd, setWd] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = wd.trim();
        if (q) router.push(`/search?wd=${encodeURIComponent(q)}`);
      }}
      className="hidden w-56 items-center gap-2 rounded-full bg-elevated px-4 py-2 lg:flex xl:w-72"
    >
      <IconSearch className="h-4 w-4 shrink-0 text-t3" />
      <input
        value={wd}
        onChange={(e) => setWd(e.target.value)}
        placeholder="搜索影视、演员、导演"
        className="w-full bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
      />
    </form>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  const { user, site } = useSession();
  if (pathname === '/login') return null;

  const brand = site.siteName?.trim() || 'MyTV';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      {/* 顶部导航（电脑/平板 + 手机紧凑版） */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-overlay/60 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 md:h-16 md:gap-8 md:px-6">
          <Link href="/" className="text-xl font-extrabold tracking-wide text-accent md:text-2xl">
            {brand}
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} active={isActive(l.href)} />
            ))}
          </nav>
          <div className="flex-1" />
          <TopSearchBox />
          <Link
            href="/search"
            aria-label="搜索"
            className="flex h-11 w-11 items-center justify-center rounded-full text-t2 hover:bg-overlay hover:text-t1 md:hidden"
          >
            <IconSearch />
          </Link>
          {user && (
            <Link
              href="/my"
              aria-label="我的"
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-overlay text-sm font-semibold text-t1 ring-1 ring-white/10 transition hover:ring-accent md:flex"
            >
              {user.name.charAt(0).toUpperCase()}
            </Link>
          )}
        </div>
      </header>

      {/* 手机底部标签栏 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-overlay/60 bg-bg/95 backdrop-blur-md md:hidden">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px]',
                active ? 'text-accent' : 'text-t2'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
