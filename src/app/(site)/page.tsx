'use client';

// 首页（M2）：Hero 轮播（5s 自动切换 + 指示点）+ 继续观看 / 我的收藏分区行。
// 推荐位（豆瓣榜/手动置顶）为二期；M2 首页内容来自登录用户的云端数据（docs/03 §6）。

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { listFavorites, listRecords, type SessionUser } from '@/lib/client-api';
import type { FavoriteItem, PlayRecord } from '@/lib/types';
import { useSession } from '@/hooks/use-session';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState, HeroSkeleton, RowSkeleton } from '@/components/site/empty-state';
import { IconPlay, IconSearch } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const HOT_KEYWORDS = ['庆余年', '流浪地球', '狂飙', '繁花', '三体', '漫长的季节'];

function HeroSlide({ record, active }: { record: PlayRecord; active: boolean }) {
  const progress = record.totalTime > 0 ? record.playTime / record.totalTime : 0;
  const resume = progress > 0.02;
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-700',
        active ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      {record.pic ? (
        // eslint-disable-next-line @next/next/no-img-element -- Hero 大图运行时才知道地址
        <img
          src={record.pic}
          alt={record.title}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-overlay to-bg" />
      )}
      {/* 左侧与底部渐变遮罩，保证文字可读 */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 pb-8 md:p-10 md:pb-12">
        <span className="w-fit rounded-full bg-accent/90 px-2.5 py-1 text-[10px] font-medium text-white">
          继续观看
        </span>
        <h2 className="max-w-xl text-2xl font-bold text-t1 md:text-4xl">{record.title}</h2>
        <p className="text-xs text-t2 md:text-sm">
          看到第 {record.episodeIndex + 1} 集 · {Math.round(progress * 100)}%
        </p>
        <div className="flex gap-3">
          <Link
            href={`/play/${encodeURIComponent(record.source)}/${encodeURIComponent(record.vodId)}?ep=${record.episodeIndex}`}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 md:px-7"
          >
            <IconPlay className="h-4 w-4" />
            {resume ? '继续播放' : '立即播放'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function BrandHero() {
  const router = useRouter();
  const [wd, setWd] = useState('');
  return (
    <div className="relative flex h-[300px] flex-col items-center justify-center gap-5 overflow-hidden rounded-card bg-gradient-to-br from-overlay via-bg to-bg px-6 text-center md:h-[440px]">
      <div
        className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(232,17,45,0.14) 0%, transparent 70%)' }}
      />
      <h2 className="text-3xl font-extrabold text-t1 md:text-5xl">
        观影，从<span className="text-accent">搜索</span>开始
      </h2>
      <p className="text-xs text-t2 md:text-sm">聚合多路采集源 · 云端续看 · 多端同步</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = wd.trim();
          if (q) router.push(`/search?wd=${encodeURIComponent(q)}`);
        }}
        className="flex w-full max-w-xl items-center gap-2 rounded-full border border-overlay bg-elevated px-5 py-3"
      >
        <IconSearch className="h-5 w-5 shrink-0 text-t3" />
        <input
          value={wd}
          onChange={(e) => setWd(e.target.value)}
          placeholder="搜索影视名称，回车开始"
          className="w-full bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
        />
      </form>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {HOT_KEYWORDS.map((k) => (
          <Link
            key={k}
            href={`/search?wd=${encodeURIComponent(k)}`}
            className="rounded-full bg-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
          >
            {k}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionRow({
  title,
  more,
  children,
}: {
  title: string;
  more?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-t1 md:text-lg">{title}</h3>
        {more}
      </div>
      {children}
    </section>
  );
}

function HomeContent({ user }: { user: SessionUser }) {
  const [records, setRecords] = useState<PlayRecord[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    void listRecords().then((r) => alive && setRecords(r.list));
    void listFavorites().then((f) => alive && setFavorites(f.list));
    return () => {
      alive = false;
    };
  }, []);

  const heroSlides = useMemo(() => (records ?? []).slice(0, 5), [records]);

  // Hero 轮播 5s 自动切换（多张时）
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => setHeroIndex((i) => (i + 1) % heroSlides.length), 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  if (records === null || favorites === null) {
    return (
      <div className="py-6">
        <HeroSkeleton />
        <div className="mt-10 space-y-4">
          <RowSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {heroSlides.length > 0 ? (
        <div className="relative h-[300px] overflow-hidden rounded-card md:h-[440px]">
          {heroSlides.map((record, i) => (
            <HeroSlide key={`${record.source}-${record.vodId}`} record={record} active={i === heroIndex} />
          ))}
          {heroSlides.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {heroSlides.map((_, i) => (
                <button
                  key={i}
                  aria-label={`第 ${i + 1} 张`}
                  onClick={() => setHeroIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === heroIndex ? 'w-5 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  )}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <BrandHero />
      )}

      {records.length > 0 && (
        <SectionRow
          title="继续观看"
          more={
            <Link href="/my" className="text-xs text-t2 hover:text-t1">
              全部 ({records.length})
            </Link>
          }
        >
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:gap-4 md:px-6">
            {records.slice(0, 12).map((r) => (
              <PosterCard
                key={`${r.source}-${r.vodId}`}
                title={r.title}
                pic={r.pic}
                remarks={`看到第 ${r.episodeIndex + 1} 集`}
                progress={r.totalTime > 0 ? r.playTime / r.totalTime : 0}
                href={`/play/${encodeURIComponent(r.source)}/${encodeURIComponent(r.vodId)}?ep=${r.episodeIndex}`}
                className="w-[120px] shrink-0 md:w-[160px]"
              />
            ))}
          </div>
        </SectionRow>
      )}

      {favorites.length > 0 && (
        <SectionRow
          title="我的收藏"
          more={
            <Link href="/my" className="text-xs text-t2 hover:text-t1">
              全部 ({favorites.length})
            </Link>
          }
        >
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:gap-4 md:px-6">
            {favorites.slice(0, 12).map((f) => (
              <PosterCard
                key={`${f.source}-${f.vodId}`}
                title={f.title}
                pic={f.pic}
                href={`/play/${encodeURIComponent(f.source)}/${encodeURIComponent(f.vodId)}`}
                className="w-[120px] shrink-0 md:w-[160px]"
              />
            ))}
          </div>
        </SectionRow>
      )}

      {records.length === 0 && favorites.length === 0 && (
        <EmptyState
          title={`欢迎，${user.name}`}
          hint="观看和收藏会显示在这里。先去搜索一部想看的影片吧。"
          action={
            <Link
              href="/search"
              className="mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              去搜索
            </Link>
          }
        />
      )}
    </div>
  );
}

export default function HomePage() {
  const { ready } = useRequireUser();
  const { user } = useSession();
  if (!ready || !user) {
    return (
      <div className="py-6">
        <HeroSkeleton />
      </div>
    );
  }
  return <HomeContent user={user} />;
}
