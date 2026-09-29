'use client';

import { useEffect, useState } from 'react';

// 豆瓣条目 Hero 轮播页（首页 Hero 与 /explore 大轮播共用）：
// 海报居左 + 封面放大模糊作背景（豆瓣 cover 为竖版海报，直接铺满会糊）。

import Link from 'next/link';
import type { DoubanItem } from '@/lib/types';
import { IconPlay } from '@/components/site/icons';
import { cn } from '@/lib/utils';

export function DoubanHeroSlide({ item, active }: { item: DoubanItem; active: boolean }) {
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
            <Link
              href="/my"
              className="flex items-center rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm text-t1 backdrop-blur transition hover:bg-white/10 md:px-7"
            >
              我的片单
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hero 轮播指示点 + 5s 自动切换逻辑（多张时） */
export function useHeroCarousel(length: number, intervalMs = 5000) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex((i) => (length > 0 ? Math.min(i, length - 1) : 0));
  }, [length]);
  useEffect(() => {
    if (length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => clearInterval(timer);
  }, [length, intervalMs]);
  return { index, setIndex };
}
