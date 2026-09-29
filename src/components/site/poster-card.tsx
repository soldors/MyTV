'use client';

// 海报卡片：2:3 海报 + 下缘渐变标题 + 备注/评分角标 + 可选继续观看进度条。
// hover 放大 + 红光晕（电脑），图片懒加载渐显，失败回落到渐变占位。

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconPlay } from './icons';

interface PosterCardProps {
  title: string;
  pic?: string;
  remarks?: string;
  rating?: string;
  /** 左上角角标（如「12 源」），与右上角评分错开 */
  badge?: string;
  /** 继续观看进度（0-1），显示底部红条 */
  progress?: number;
  href: string;
  className?: string;
}

export default function PosterCard({ title, pic, remarks, rating, badge, progress, href, className }: PosterCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href={href}
      className={cn(
        'group relative block aspect-[2/3] overflow-hidden rounded-poster bg-elevated outline-none transition-transform duration-200 hover:scale-[1.04] hover:shadow-glow focus-visible:shadow-glow',
        className
      )}
    >
      {/* 图片 / 占位 / 失败回落 */}
      {failed || !pic ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-overlay to-bg">
          <span className="text-2xl font-bold text-t3">{title.charAt(0)}</span>
        </div>
      ) : (
        <>
          {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}
          {/* eslint-disable-next-line @next/next/no-img-element -- 采集站地址运行时不可枚举，images.unoptimized */}
          <img
            src={pic}
            alt={title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'absolute inset-0 h-full w-full object-cover poster-img',
              loaded && 'loaded'
            )}
          />
        </>
      )}

      {/* hover 播放提示（桌面） */}
      <div className="absolute inset-0 hidden items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 md:flex">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/90 text-white shadow-glow">
          <IconPlay className="ml-0.5 h-5 w-5" />
        </span>
      </div>

      {/* 下缘渐变 + 标题 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-8">
        <p className="truncate text-xs font-medium text-t1 md:text-sm">{title}</p>
        {remarks && <p className="truncate text-[10px] text-t2 md:text-xs">{remarks}</p>}
      </div>

      {/* 多源角标（左上） */}
      {badge && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-t2">
          {badge}
        </span>
      )}

      {/* 评分角标 */}
      {rating && (
        <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-rating">
          {rating}
        </span>
      )}

      {/* 继续观看进度条 */}
      {progress !== undefined && progress > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(3, progress * 100)).toFixed(0)}%` }}
          />
        </div>
      )}
    </Link>
  );
}
