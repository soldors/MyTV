'use client';

// 发现页（/explore）：首页各推荐分区「更多」的落地页。
// 结构参考首页设计稿：大轮播 Hero（当前筛选下前 5 部）+ 类型筛选 pills +
// 海报网格（豆瓣分页「加载更多」）。
// ?type=movie|tv|bangumi & tag=豆瓣tag（bangumi 时 tag 为星期 1-7，默认今天）。

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBangumiCalendar, getDoubanRecommend } from '@/lib/client-api';
import type { DoubanItem } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState, HeroSkeleton } from '@/components/site/empty-state';
import { DoubanHeroSlide, useHeroCarousel } from '@/components/site/douban-hero';
import { cn } from '@/lib/utils';

type ExploreType = 'movie' | 'tv' | 'bangumi';

const TYPE_TABS: { key: ExploreType; label: string }[] = [
  { key: 'movie', label: '电影' },
  { key: 'tv', label: '剧集' },
  { key: 'bangumi', label: '新番' },
];

/** 豆瓣 tag（2026-09 逐个实测有数据；返回空的组合已在文档记录） */
const TAGS: Record<'movie' | 'tv', string[]> = {
  movie: ['热门', '最新', '豆瓣高分', '经典', '冷门佳片', '华语', '欧美', '日本', '韩国'],
  tv: ['热门', '豆瓣高分', '日剧', '韩剧', '综艺'],
};

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PAGE_SIZE = 24;

function ExploreInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const typeParam = searchParams.get('type') as ExploreType | null;
  const type: ExploreType = typeParam === 'tv' || typeParam === 'bangumi' ? typeParam : 'movie';
  const tagParam = searchParams.get('tag') || '';
  const today = new Date().getDay();
  const todayWeekday = today === 0 ? 7 : today;

  const [items, setItems] = useState<DoubanItem[] | null>(null);
  const [pageStart, setPageStart] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [error, setError] = useState('');

  const tag = useMemo(() => {
    if (type === 'bangumi') return tagParam || String(todayWeekday);
    const valid = TAGS[type].includes(tagParam);
    return valid ? tagParam : TAGS[type][0];
  }, [type, tagParam, todayWeekday]);

  const load = useCallback(
    (start: number, append: boolean) => {
      if (type === 'bangumi') {
        setItems(null);
        setError('');
        void getBangumiCalendar()
          .then((days) => {
            const wd = parseInt(tag, 10) || todayWeekday;
            setItems(days[wd] ?? []);
            setNoMore(true);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : '放送表获取失败');
            setItems([]);
          });
        return;
      }
      if (!append) {
        setItems(null);
        setError('');
        setNoMore(false);
      }
      setLoadingMore(true);
      void getDoubanRecommend(type, tag, PAGE_SIZE, start)
        .then(({ items: page }) => {
          setItems((prev) => (append ? [...(prev ?? []), ...page] : page));
          if (page.length < PAGE_SIZE) setNoMore(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : '获取失败');
          if (!append) setItems([]);
        })
        .finally(() => setLoadingMore(false));
    },
    [type, tag, todayWeekday]
  );

  useEffect(() => {
    setPageStart(0);
    load(0, false);
  }, [load]);

  const { index: heroIndex, setIndex: setHeroIndex } = useHeroCarousel(items?.length ?? 0);
  const heroSlides = useMemo(() => (items ?? []).filter((i) => i.cover).slice(0, 5), [items]);

  function navigate(nextType: ExploreType, nextTag: string) {
    const params = new URLSearchParams({ type: nextType });
    if (nextType === 'bangumi' ? nextTag !== String(todayWeekday) : nextTag !== TAGS[nextType][0]) {
      params.set('tag', nextTag);
    }
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="py-6">
      {/* 类型 tabs + 筛选 pills */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-overlay/40 bg-bg/90 px-4 py-3 backdrop-blur-md md:top-16 md:-mx-6 md:px-6">
        <div className="flex items-center gap-2">
          {TYPE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => navigate(key, key === 'bangumi' ? String(todayWeekday) : TAGS[key][0])}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition',
                type === key ? 'bg-accent font-semibold text-white' : 'bg-overlay text-t2 hover:text-t1'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
          {type === 'bangumi'
            ? WEEKDAYS.map((label, i) => {
                const wd = String(i + 1);
                return (
                  <button
                    key={wd}
                    onClick={() => navigate('bangumi', wd)}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs transition',
                      tag === wd ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
                    )}
                  >
                    {label}
                    {i + 1 === todayWeekday && <span className="ml-1 text-[10px] text-accent">今</span>}
                  </button>
                );
              })
            : TAGS[type].map((t) => (
                <button
                  key={t}
                  onClick={() => navigate(type, t)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs transition',
                    tag === t ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
                  )}
                >
                  {t}
                </button>
              ))}
        </div>
      </div>

      {/* 大轮播 Hero（当前筛选前 5） */}
      {items === null && !error ? (
        <HeroSkeleton />
      ) : heroSlides.length > 0 ? (
        <div className="relative mt-4 h-[300px] overflow-hidden rounded-card md:h-[420px]">
          {heroSlides.map((item, i) => (
            <DoubanHeroSlide key={`${item.id}-${item.title}`} item={item} active={i === heroIndex} />
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
      ) : null}

      {/* 海报网格 */}
      {items === null && !error ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-[2/3] rounded-poster skeleton-shimmer" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="内容获取失败" hint={error} />
      ) : (items ?? []).length === 0 ? (
        <EmptyState
          title="该分类暂无内容"
          hint="豆瓣对部分「类型×分类」组合不返回数据，换个筛选试试"
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
            {(items ?? []).map((item) => (
              <PosterCard
                key={`${item.id}-${item.title}`}
                title={item.title}
                pic={item.cover ? `/api/proxy/${encodeURIComponent(item.cover)}` : undefined}
                rating={item.rating}
                remarks={type === 'bangumi' ? '新番' : item.isTv ? '剧集' : '电影'}
                href={`/search?wd=${encodeURIComponent(item.title)}`}
              />
            ))}
          </div>

          {/* 加载更多（豆瓣分页；新番是一次性全量） */}
          {type !== 'bangumi' && !noMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => {
                  const next = pageStart + PAGE_SIZE;
                  setPageStart(next);
                  load(next, true);
                }}
                disabled={loadingMore}
                className="rounded-full border border-overlay px-6 py-2.5 text-sm text-t2 transition hover:text-t1 disabled:opacity-40"
              >
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            </div>
          )}
          {type !== 'bangumi' && noMore && (
            <p className="mt-8 text-center text-xs text-t3">没有更多了</p>
          )}
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const { ready } = useRequireUser();
  if (!ready) {
    return (
      <div className="py-6">
        <HeroSkeleton />
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <ExploreInner />
    </Suspense>
  );
}
