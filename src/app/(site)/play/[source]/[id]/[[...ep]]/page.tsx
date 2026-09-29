'use client';

// 播放页 = 详情落地页（docs/02 §7.1 信息架构：详情与播放合一）。
// 桌面：左 2/3 播放器 + 线路 + 选集，右 1/3 海报/元信息/简介/收藏；
// 手机：播放器 → 标题元信息 → 选集 4 列 → 简介折叠。
// 路由 /play/:source/:id(/:ep)，也接受 ?ep=（首页/搜索/继续观看入口）。
// L8 多线路：线路 pills（设计稿形态：播放器下方横滑，选中红填充），所选线路记忆于本地；
// L7 跳过片头片尾：配置存 D1（按用户），片头自动跳一次 + 悬浮按钮，片尾按钮 → 自动连播下一集。

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addFavorite,
  getDetail,
  getSkipConfig,
  getSources,
  listFavorites,
  listRecords,
  removeFavorite,
  saveRecord,
  saveSkipConfig,
} from '@/lib/client-api';
import type { PlayerApi } from '@/components/player/art-player';
import type { PlayRecord, SkipConfig, VideoDetail } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import { EmptyState } from '@/components/site/empty-state';
import { IconHeart, IconSearch } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const ArtPlayer = dynamic(() => import('@/components/player/art-player'), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />,
});

interface PlayPageProps {
  params: Promise<{ source: string; id: string; ep?: string[] }>;
}

const EMPTY_SKIP: SkipConfig = { introStart: 0, introEnd: 0, outroStart: 0, outroEnd: 0 };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function PlayPageInner({ source: sourceKeyRaw, id, epPath }: { source: string; id: string; epPath?: string[] }) {
  const sourceKey = decodeURIComponent(sourceKeyRaw);
  const vodId = decodeURIComponent(id);

  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<PlayRecord | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [skipConfig, setSkipConfig] = useState<SkipConfig>(EMPTY_SKIP);
  const [episodeIndex, setEpisodeIndex] = useState<number>(() => {
    const n = parseInt(epPath?.[0] ?? '', 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  });
  const [lineIndex, setLineIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [markPanelOpen, setMarkPanelOpen] = useState(false);
  const playerApiRef = useRef<PlayerApi | null>(null);

  // 解析源配置 + 详情 + 既有进度/收藏/跳过配置
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
        const [d, recordsRes, favsRes, skipRes] = await Promise.all([
          getDetail(source, vodId),
          listRecords(),
          listFavorites(),
          getSkipConfig(sourceKey, vodId),
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
        if (skipRes.config) setSkipConfig(skipRes.config);
        // 恢复上次所选线路
        try {
          const saved = parseInt(localStorage.getItem(`mytv_line:${sourceKey}:${vodId}`) || '', 10);
          if (Number.isInteger(saved) && saved >= 0 && saved < (d.lines?.length ?? 1)) setLineIndex(saved);
        } catch {
          /* 隐私模式等场景忽略 */
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, vodId]);

  const lines = useMemo(
    () => (detail?.lines?.length ? detail.lines : detail ? [{ name: '线路1', episodes: detail.episodes }] : []),
    [detail]
  );
  const currentLine = lines[Math.min(lineIndex, lines.length - 1)];
  const episodes = currentLine?.episodes ?? [];
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

  function switchLine(index: number) {
    if (index === lineIndex || !lines[index]) return;
    setLineIndex(index);
    try {
      localStorage.setItem(`mytv_line:${sourceKey}:${vodId}`, String(index));
    } catch {
      /* 忽略 */
    }
    // 同集号尽量保留，超出该线路集数则回落到最后一集
    setEpisodeIndex((prev) => Math.min(prev, lines[index].episodes.length - 1));
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

  /** 标记片头/片尾：取播放器当前进度写入对应字段并保存 */
  async function markSkip(field: 'introStart' | 'introEnd' | 'outroStart') {
    const t = Math.floor(playerApiRef.current?.getTime() ?? 0);
    const next: SkipConfig = { ...skipConfig, [field]: t };
    try {
      const res = await saveSkipConfig(sourceKey, vodId, next);
      setSkipConfig(res.config);
    } catch {
      /* 保存失败静默，面板显示原值 */
    }
  }

  async function clearSkip() {
    try {
      const res = await saveSkipConfig(sourceKey, vodId, EMPTY_SKIP);
      setSkipConfig(res.config);
    } catch {
      /* 忽略 */
    }
  }

  // 恢复进度仅对「续看的那一集」生效，切集从头播放
  const initialTime = record && record.episodeIndex === episodeIndex ? record.playTime : 0;
  const episodeUrl = useMemo(
    () => episodes[Math.min(episodeIndex, episodes.length - 1)],
    [episodes, episodeIndex]
  );

  // 自动连播：当前集播完切下一集（该线路内）
  const handleEnded = useCallback(() => {
    if (episodeIndex < episodes.length - 1) switchEpisode(episodeIndex + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeIndex, episodes.length]);

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

  const metaItems = [info?.typeName, info?.year, info?.area, info?.remarks].filter(Boolean) as string[];
  const skipActive = skipConfig.introEnd > 0 || skipConfig.outroStart > 0;

  return (
    <div className="grid grid-cols-1 gap-8 py-6 lg:grid-cols-3">
      {/* 左：播放器 + 线路 + 选集 */}
      <div className="lg:col-span-2">
        <ArtPlayer
          key={`${lineIndex}-${episodeIndex}-${episodeUrl}`}
          url={episodeUrl}
          title={info?.title}
          poster={info?.cover}
          initialTime={initialTime}
          skip={{ introEnd: skipConfig.introEnd, outroStart: skipConfig.outroStart }}
          onReady={(api) => {
            playerApiRef.current = api;
          }}
          className="aspect-video w-full overflow-hidden rounded-card bg-black"
          onProgress={(time, duration) => saveProgress(episodeIndex, time, duration)}
          onEnded={handleEnded}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-lg font-bold text-t1 md:text-2xl">{info?.title || '未知影片'}</h1>
          {record && record.totalTime > 0 && (
            <span className="text-xs text-t2">
              上次看到 {fmt(record.playTime)}
            </span>
          )}
          {skipActive && (
            <span className="text-[11px] text-t3">
              片头 {fmt(skipConfig.introStart)}–{fmt(skipConfig.introEnd)}
              {skipConfig.outroStart > 0 && ` · 片尾自 ${fmt(skipConfig.outroStart)}`}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-t2">
          {metaItems.map((m) => (
            <span key={m} className="rounded bg-overlay px-2 py-0.5">
              {m}
            </span>
          ))}
          <button
            onClick={() => setMarkPanelOpen((v) => !v)}
            className={cn(
              'ml-auto rounded px-2 py-0.5 transition',
              markPanelOpen ? 'bg-accent/15 text-accent' : 'text-t2 hover:text-t1'
            )}
          >
            片头/片尾
          </button>
          <Link
            href={`/search?wd=${encodeURIComponent(info?.title || '')}`}
            className="text-t2 transition hover:text-t1"
          >
            换源
          </Link>
        </div>

        {/* 片头/片尾标记面板 */}
        {markPanelOpen && (
          <div className="mt-3 rounded-lg border border-overlay/60 bg-elevated p-4">
            <p className="text-xs text-t3">
              在播放器播到对应位置时点击标记；片头段内会自动跳过，片尾出现「跳过片尾」按钮。按用户保存。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void markSkip('introStart')}
                className="rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
              >
                当前位置设为片头开始
              </button>
              <button
                onClick={() => void markSkip('introEnd')}
                className="rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
              >
                当前位置设为片头结束
              </button>
              <button
                onClick={() => void markSkip('outroStart')}
                className="rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
              >
                当前位置设为片尾开始
              </button>
              <button
                onClick={() => void clearSkip()}
                className="rounded-lg border border-overlay px-3 py-1.5 text-xs text-t3 transition hover:text-accent"
              >
                清除
              </button>
            </div>
          </div>
        )}

        {/* 线路（设计稿：播放器下方横滑 pills，选中红填充） */}
        {lines.length > 0 && (
          <div className="mt-5 flex items-center gap-2">
            <span className="shrink-0 text-xs text-t3">线路</span>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {lines.map((line, i) => (
                <button
                  key={`${line.name}-${i}`}
                  onClick={() => switchLine(i)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs transition',
                    i === lineIndex
                      ? 'bg-accent font-medium text-white'
                      : 'bg-overlay text-t2 hover:text-t1'
                  )}
                >
                  {line.name}
                  <span className="ml-1 text-[10px] opacity-70">{line.episodes.length}集</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
