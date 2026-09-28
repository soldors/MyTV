'use client';

// 播放页 = 详情落地页（docs/02 §7.1 信息架构：详情与播放合一）。
// 桌面：左 2/3 播放器 + 线路 + 选集，右 1/3 海报/元信息/简介/收藏；
// 手机：播放器 → 标题元信息 → 选集 4 列 → 简介折叠。
// 路由 /play/:source/:id(/:ep)，也接受 ?ep=（首页/搜索/继续观看入口）。

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  addFavorite,
  getDetail,
  getSources,
  listFavorites,
  listRecords,
  removeFavorite,
  saveRecord,
} from '@/lib/client-api';
import type { PlayRecord, VideoDetail } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import { EmptyState } from '@/components/site/empty-state';
import { IconHeart, IconPlay, IconSearch } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const ArtPlayer = dynamic(() => import('@/components/player/art-player'), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />,
});

interface PlayPageProps {
  params: Promise<{ source: string; id: string; ep?: string[] }>;
}

function PlayPageInner({ source: sourceKeyRaw, id, epPath }: { source: string; id: string; epPath?: string[] }) {
  const sourceKey = decodeURIComponent(sourceKeyRaw);
  const vodId = decodeURIComponent(id);

  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<PlayRecord | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [episodeIndex, setEpisodeIndex] = useState<number>(() => {
    const n = parseInt(epPath?.[0] ?? '', 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  });
  const [descExpanded, setDescExpanded] = useState(false);

  // 解析源配置 + 详情 + 既有进度/收藏
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { sources } = await getSources();
        const source = sources.find((s) => s.key === sourceKey);
        if (!source) {
          if (alive) setError('未找到该数据源，可能已下线');
          return;
        }
        const [d, recordsRes, favsRes] = await Promise.all([
          getDetail(source, vodId),
          listRecords(),
          listFavorites(),
        ]);
        if (!alive) return;
        setDetail(d);
        const existing = recordsRes.list.find((r) => r.source === sourceKey && r.vodId === vodId);
        setRecord(existing ?? null);
        if (existing) {
          const urlEp = parseInt(epPath?.[0] ?? '', 10);
          setEpisodeIndex(Number.isInteger(urlEp) && urlEp >= 0 ? urlEp : existing.episodeIndex);
        }
        setIsFavorite(favsRes.list.some((f) => f.source === sourceKey && f.vodId === vodId));
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, vodId]);

  const episodes = detail?.episodes ?? [];
  const info = detail?.videoInfo;

  const saveProgress = useCallback(
    (episode: number, playTime: number, totalTime: number) => {
      if (!info?.title) return;
      void saveRecord({
        source: sourceKey,
        vodId,
        title: info.title,
        pic: info.cover,
        episodeIndex: episode,
        totalTime,
        playTime,
      }).catch(() => {});
    },
    [info, sourceKey, vodId]
  );

  function switchEpisode(index: number) {
    if (index === episodeIndex) return;
    setEpisodeIndex(index);
    // 切集立即落一条记录（进度清零，后续 timeupdate 更新）
    saveProgress(index, 0, 0);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleFavorite() {
    if (!info?.title) return;
    try {
      if (isFavorite) {
        await removeFavorite(sourceKey, vodId);
        setIsFavorite(false);
      } else {
        await addFavorite({ source: sourceKey, vodId, title: info.title, pic: info.cover });
        setIsFavorite(true);
      }
    } catch {
      /* 收藏失败不打断播放 */
    }
  }

  // 恢复进度仅对「续看的那一集」生效，切集从头播放
  const initialTime = record && record.episodeIndex === episodeIndex ? record.playTime : 0;
  const episodeUrl = useMemo(() => episodes[episodeIndex], [episodes, episodeIndex]);

  useEffect(() => {
    if (info?.title) document.title = `${info.title} - MyTV`;
    return () => {
      document.title = 'MyTV';
    };
  }, [info?.title]);

  if (error) {
    return (
      <div className="py-16">
        <EmptyState
          title="无法播放"
          hint={error}
          action={
            <Link
              href="/search"
              className="mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              去搜索其他资源
            </Link>
          }
        />
      </div>
    );
  }

  if (!detail || !episodeUrl) {
    return (
      <div className="py-6">
        <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />
        <div className="mt-4 h-7 w-1/3 animate-pulse rounded bg-elevated" />
        <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-elevated" />
          ))}
        </div>
      </div>
    );
  }

  const metaItems = [
    info?.typeName,
    info?.year,
    info?.area,
    info?.remarks,
  ].filter(Boolean) as string[];

  return (
    <div className="grid grid-cols-1 gap-8 py-6 lg:grid-cols-3">
      {/* 左：播放器 + 选集 */}
      <div className="lg:col-span-2">
        <ArtPlayer
          key={`${episodeIndex}-${episodeUrl}`}
          url={episodeUrl}
          title={info?.title}
          poster={info?.cover}
          initialTime={initialTime}
          className="aspect-video w-full overflow-hidden rounded-card bg-black"
          onProgress={(time, duration) => saveProgress(episodeIndex, time, duration)}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-lg font-bold text-t1 md:text-2xl">{info?.title || '未知影片'}</h1>
          {record && record.totalTime > 0 && (
            <span className="text-xs text-t2">
              上次看到 {Math.floor(record.playTime / 60)} 分 {Math.floor(record.playTime % 60)} 秒
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-t2">
          {metaItems.map((m) => (
            <span key={m} className="rounded bg-overlay px-2 py-0.5">
              {m}
            </span>
          ))}
          <Link
            href={`/search?wd=${encodeURIComponent(info?.title || '')}`}
            className="ml-auto flex items-center gap-1 text-t2 transition hover:text-t1"
          >
            <IconSearch className="h-3.5 w-3.5" />
            换源
          </Link>
        </div>

        {/* 线路（采集站线路名；多线路解析为二期） */}
        <div className="mt-5 flex items-center gap-2">
          <span className="text-xs text-t3">线路</span>
          <button className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent">
            {info?.sourceName || '线路一'}
          </button>
        </div>

        {/* 选集 */}
        <div className="mt-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-t1">
              选集{episodes.length > 1 ? `（共 ${episodes.length} 集）` : ''}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {episodes.map((_, i) => (
              <button
                key={i}
                onClick={() => switchEpisode(i)}
                className={cn(
                  'flex h-9 items-center justify-center rounded text-xs transition',
                  i === episodeIndex
                    ? 'bg-accent font-semibold text-white'
                    : 'bg-overlay text-t2 hover:bg-overlay/70 hover:text-t1'
                )}
              >
                {episodes.length === 1 ? '正片' : episodes.length > 99 ? i + 1 : `第${i + 1}集`}
              </button>
            ))}
          </div>
        </div>

        {/* 手机端简介（折叠） */}
        <div className="mt-6 lg:hidden">
          <p
            className={cn(
              'text-xs leading-relaxed text-t2',
              !descExpanded && 'line-clamp-3'
            )}
            onClick={() => setDescExpanded((v) => !v)}
          >
            {info?.desc || '暂无简介'}
          </p>
          <button
            onClick={() => setDescExpanded((v) => !v)}
            className="mt-1 text-[11px] text-t3"
          >
            {descExpanded ? '收起' : '展开'}
          </button>
        </div>
      </div>

      {/* 右：信息栏（桌面） */}
      <aside className="hidden lg:block">
        <div className="overflow-hidden rounded-card border border-overlay/60 bg-elevated p-5">
          <div className="flex gap-4">
            {info?.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- 采集站图片运行时地址
              <img
                src={info.cover}
                alt={info.title}
                className="aspect-[2/3] w-32 shrink-0 rounded-poster object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <div className="aspect-[2/3] w-32 shrink-0 rounded-poster bg-overlay" />
            )}
            <div className="min-w-0 flex-1 space-y-1.5 text-xs text-t2">
              <p className="truncate text-sm font-semibold text-t1">{info?.title}</p>
              {info?.typeName && <p>类型：{info.typeName}</p>}
              {info?.year && <p>年份：{info.year}</p>}
              {info?.area && <p>地区：{info.area}</p>}
              {info?.director && <p className="line-clamp-2">导演：{info.director}</p>}
              {info?.actor && <p className="line-clamp-3">主演：{info.actor}</p>}
            </div>
          </div>

          <p className={cn('mt-4 text-xs leading-relaxed text-t2', !descExpanded && 'line-clamp-5')}>
            {info?.desc || '暂无简介'}
          </p>
          <button
            onClick={() => setDescExpanded((v) => !v)}
            className="mt-1 text-[11px] text-t3"
          >
            {descExpanded ? '收起' : '展开全部'}
          </button>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void toggleFavorite()}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition',
                isFavorite
                  ? 'bg-accent text-white hover:opacity-90'
                  : 'border border-overlay text-t2 hover:border-accent hover:text-accent'
              )}
            >
              <IconHeart className="h-4 w-4" filled={isFavorite} />
              {isFavorite ? '已收藏' : '加入收藏'}
            </button>
          </div>
        </div>
      </aside>

      {/* 手机端收藏按钮（跟随简介） */}
      <div className="lg:hidden">
        <button
          onClick={() => void toggleFavorite()}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition',
            isFavorite
              ? 'bg-accent text-white hover:opacity-90'
              : 'border border-overlay text-t2 hover:border-accent hover:text-accent'
          )}
        >
          <IconHeart className="h-4 w-4" filled={isFavorite} />
          {isFavorite ? '已收藏' : '加入收藏'}
        </button>
      </div>
    </div>
  );
}

export default function PlayPage({ params }: PlayPageProps) {
  const { ready } = useRequireUser();
  const { source, id, ep } = use(params);
  if (!ready) {
    return (
      <div className="py-6">
        <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />
      </div>
    );
  }
  return <PlayPageInner source={source} id={id} epPath={ep} />;
}
