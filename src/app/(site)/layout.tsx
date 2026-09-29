'use client';

// 前台布局：会话上下文 + 三端导航 + 页脚（AGPL 源码链接与免责声明，docs/01 §10）。
// 登录页自带全屏布局（导航与页脚隐藏），主内容为固定导航留出上下间距。

import { usePathname } from 'next/navigation';
import { SessionProvider } from '@/hooks/use-session';
import SiteNav from '@/components/site/site-nav';
import AnnouncementBar from '@/components/site/announcement-bar';
import { cn } from '@/lib/utils';

function SiteFooter() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <footer className="mt-16 border-t border-overlay/60 px-4 py-8 pb-24 text-center text-xs leading-relaxed text-t3 md:pb-8">
      <p>MyTV · 在线影视聚合平台</p>
      <p className="mt-1">
        本站不存储、不制作任何视频内容，内容均来自第三方数据源，如有侵权请联系对应源站删除。
      </p>
      <p className="mt-1">
        服务端代码移植自{' '}
        <a
          href="https://github.com/LibreSpark/LibreTV"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-t2"
        >
          LibreTV
        </a>
        （AGPL-3.0）·{' '}
        <a
          href="https://github.com/soldors/MyTV"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-t2"
        >
          本站源码
        </a>
      </p>
    </footer>
  );
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <SessionProvider>
      <div className="flex min-h-screen flex-col">
        <SiteNav />
        <main className={cn('mx-auto w-full max-w-[1600px] flex-1 px-4 md:px-6', !isLogin && 'pt-14 md:pt-16')}>
          {!isLogin && <AnnouncementBar />}
          {children}
        </main>
        <SiteFooter />
      </div>
    </SessionProvider>
  );
}
