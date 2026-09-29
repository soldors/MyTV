'use client';

// 首页（M2 骨架 → 推荐位完整版，2026-09-29）：
// Hero 轮播（优先「继续观看」，无记录时豆瓣热门电影）+ 分区行：
// 继续观看 / 我的收藏（个人，D1）+ 热门电影 / 高分电影 / 热门剧集（豆瓣，10min 服务端缓存）。
// 豆瓣条目无采集站 vodId，点击进入「按片名搜索」；采集站结果直达播放页。

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  getDoubanRecommend,
  listFavorites,
  listRecords,
  type SessionUser,
} from '@/lib/client-api';
import type { DoubanItem, FavoriteItem, PlayRecord } from '@/lib/types';
import { useSession } from '@/hooks/use-session';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState, HeroSkeleton, RowSkeleton } from '@/components/site/empty-state';
import { IconPlay, IconSearch } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const HOT_KEYWORDS = ['庆余年', '流浪地球', '狂飙', '繁花', '三体', '漫长的季节'];

/** 豆瓣条目行配置：tag 与豆瓣 search_subjects 的分类标签对齐 */
const DOUBAN_ROWS = [
  { key: 'hot-movie', title: '热门电影', type: 'movie' as const, tag: '热门' },
  { key: 'top-movie', title: '高分电影', type: 'movie' as const, tag: '豆瓣高分' },
  { key: 'hot-tv', title: '热门剧集', type: 'tv' as const, tag: '热门' },
];

/** 推荐位 Hero：海报居左 + 封面放大模糊作背景（豆瓣 cover 为竖版海报，直接铺满会糊） */
function DoubanHeroSlide({ item, active }: { item: DoubanItem; active: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-700',
        active ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      {item.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- 豆瓣封面经 /api/proxy 白名单加载
        <img
          src={`/api/proxy/${encodeURIComponent(item.cover)}`}
          alt={item.title}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-overlay to-bg" />
      )}
      {/* 压暗与融入页面底色 */}
      <div className="absolute inset-0 bg-bg/70" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg to-transparent" />

      <div className="absolute inset-y-0 left-0 flex w-full items-center gap-6 p-6 md:gap-10 md:p-12">
        {item.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/proxy/${encodeURIComponent(item.cover)}`}
            alt={item.title}
            className="hidden h-[70%] max-h-[320px] rounded-poster object-cover shadow-card sm:block"
          />
        )}
        <div className="flex min-w-0 max-w-xl flex-col gap-3">
          <span className="w-fit rounded-full bg-accent/90 px-2.5 py-1 text-[10px] font-medium text-white">
            {item.isTv ? '热门剧集' : '热门电影'}
          </span>
          <h2 className="truncate text-2xl font-bold text-t1 md:text-4xl">{item.title}</h2>
          {item.rating && (
            <p className="flex items-center gap-1.5 text-sm">
              <span className="text-rating">★</span>
              <span className="font-semibold text-rating">{item.rating}</span>
            </p>
          )}
          <p className="hidden text-xs text-t2 md:block">
            点击「立即观看」在采集源中搜索本片，多路线路即点即播
          </p>
          <div className="mt-1 flex gap-3">
            <Link
              href={`/search?wd=${encodeURIComponent(item.title)}`}
              className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 md:px-7"
            >
              <IconPlay className="h-4 w-4" />
              立即观看
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 续看 Hero（个人记录） */
function HeroSlide({ record, active }: { record: PlayRecord; active: boolean }) {
  const progress = record.totalTime > 0 ? record.playTime / record.totalTime : 0;
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
            {progress > 0.02 ? '继续播放' : '立即播放'}
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

/** 横滑海报行（豆瓣条目：评分角标 + 点击搜索） */
function DoubanRow({ items }: { items: DoubanItem[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:gap-4 md:px-6">
      {items.slice(0, 18).map((item) => (
        <PosterCard
          key={`${item.id}-${item.title}`}
          title={item.title}
          pic={item.cover ? `/api/proxy/${encodeURIComponent(item.cover)}` : undefined}
          rating={item.rating}
          remarks={item.isTv ? '剧集' : '电影'}
          href={`/search?wd=${encodeURIComponent(item.title)}`}
          className="w-[120px] shrink-0 md:w-[160px]"
        />
      ))}
    </div>
  );
}

function HomeContent({ user }: { user: SessionUser }) {
  const [records, setRecords] = useState<PlayRecord[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const [doubanRows, setDoubanRows] = useState<Record<string, DoubanItem[] | null>>({});
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    void listRecords().then((r) => alive && setRecords(r.list));
    void listFavorites().then((f) => alive && setFavorites(f.list));
    for (const row of DOUBAN_ROWS) {
      void getDoubanRecommend(row.type, row.tag)
        .then(({ items }) => alive && setDoubanRows((prev) => ({ ...prev, [row.key]: items })))
        .catch(() => alive && setDoubanRows((prev) => ({ ...prev, [row.key]: [] })));
    }
    return () => {
      alive = false;
    };
  }, []);

  // Hero：个人续看优先，否则豆瓣热门电影，再否则品牌搜索 Hero
  const heroSlides = useMemo(() => {
    const recordSlides = (records ?? []).slice(0, 5).map((record) => ({ kind: 'record' as const, record }));
    if (recordSlides.length > 0) return recordSlides;
    const doubanSlides = (doubanRows['hot-movie'] ?? [])
      .filter((item) => item.cover)
      .slice(0, 5)
      .map((item) => ({ kind: 'douban' as const, item }));
    return doubanSlides;
  }, [records, doubanRows]);

  // Hero 轮播 5s 自动切换（多张时）
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => setHeroIndex((i) => (i + 1) % heroSlides.length), 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const personalLoading = records === null || favorites === null;
  const anyDoubanRow = DOUBAN_ROWS.some((row) => (doubanRows[row.key] ?? []).length > 0);

  return (
    <div className="py-6">
      {/* Hero */}
      {heroSlides.length > 0 ? (
        <div className="relative h-[300px] overflow-hidden rounded-card md:h-[440px]">
          {heroSlides.map((slide, i) =>
            slide.kind === 'record' ? (
              <HeroSlide key={`${slide.record.source}-${slide.record.vodId}`} record={slide.record} active={i === heroIndex} />
            ) : (
              <DoubanHeroSlide key={`${slide.item.id}-${slide.item.title}`} item={slide.item} active={i === heroIndex} />
            )
          )}
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
      ) : personalLoading || doubanRows['hot-movie'] === undefined ? (
        <HeroSkeleton />
      ) : (
        <BrandHero />
      )}

      {/* 继续观看（个人） */}
      {records !== null && records.length > 0 && (
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

      {/* 我的收藏（个人） */}
      {favorites !== null && favorites.length > 0 && (
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

      {/* 豆瓣推荐分区 */}
      {DOUBAN_ROWS.map((row) => {
        const items = doubanRows[row.key];
        if (items === undefined) {
          return (
            <SectionRow key={row.key} title={row.title}>
              <RowSkeleton />
            </SectionRow>
          );
        }
        if (items === null || items.length === 0) return null;
        return (
          <SectionRow key={row.key} title={row.title}>
            <DoubanRow items={items} />
          </SectionRow>
        );
      })}

      {/* 全空引导 */}
      {!personalLoading && !anyDoubanRow && records?.length === 0 && favorites?.length === 0 && (
        <EmptyState
          title={`欢迎，${user.name}`}
          hint="推荐内容暂不可用（豆瓣接口可能被源站限制）。先去搜索一部想看的影片吧。"
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
