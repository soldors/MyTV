'use client';

// 空态与骨架占位（docs/02 §7.2：空态与错误态均有设计）

import { cn } from '@/lib/utils';
import { IconFilm } from './icons';

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-t3">
        <IconFilm className="h-7 w-7" />
      </span>
      <p className="text-sm font-medium text-t1">{title}</p>
      {hint && <p className="max-w-sm text-xs text-t3">{hint}</p>}
      {action}
    </div>
  );
}

export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-[2/3] rounded-poster skeleton-shimmer" />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return <div className="h-[300px] rounded-card skeleton-shimmer md:h-[460px]" />;
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden md:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[120px] shrink-0 md:w-[160px]">
          <div className="aspect-[2/3] rounded-poster skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}
