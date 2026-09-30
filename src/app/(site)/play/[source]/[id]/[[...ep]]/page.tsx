'use client';

// 播放页 = 详情落地页（docs/02 §7.1 信息架构：详情与播放合一）。
// 桌面：左 2/3 播放器 + 线路 + 选集，右 1/3 海报/元信息/简介/收藏；
// 手机：播放器 → 标题元信息 → 选集 4 列 → 简介折叠。
// 路由 /play/:source/:id(/:ep)，也接受 ?ep=（首页/搜索/继续观看入口）。
// L8 多线路：线路 pills（设计稿形态：播放器下方横滑，选中红填充），所选线路记忆于本地；
// L7 跳过片头片尾：配置存 D1（按用户），片头自动跳一次 + 悬浮按钮，片尾按钮 → 自动连播下一集。

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addFavorite,
  getDetail,
  getDoubanRecommend,
  getSkipConfig,
  getSources,
  listFavorites,
  listRecords,
  removeFavorite,
  saveRecord,
  saveSkipConfig,
  searchStream,
} from '@/lib/client-api';
import type { PlayerApi } from '@/components/player/art-player';
import type { DoubanItem, PlayRecord, SearchResultItem, SkipConfig, VideoDetail } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState } from '@/components/site/empty-state';
import { IconClose, IconHeart, IconSearch } from '@/components/site/icons';
import { normalizeTitle } from '@/lib/cms-parser';
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

/** 采集站分类名 → 豆瓣推荐 tag（地区/剧类优先于题材；均未命中回落「热门」） */
const GENRE_TAG_MAP: [RegExp, string][] = [
  [/国产剧|国产/, '国产'], [/欧美|美剧/, '欧美'], [/日剧|日漫/, '日剧'], [/韩剧/, '韩剧'], [/港台|港剧|台剧/, '港台'],
  [/剧情/, '剧情'], [/喜剧/, '喜剧'], [/动作/, '动作'], [/爱情/, '爱情'],
  [/科幻/, '科幻'], [/悬疑/, '悬疑'], [/恐怖|惊悚/, '恐怖'], [/犯罪/, '犯罪'],
  [/动画|动漫/, '动画'], [/战争/, '战争'], [/奇幻/, '奇幻'], [/冒险/, '冒险'],
  [/古装|武侠/, '古装'], [/家庭|伦理/, '家庭'], [/纪录/, '纪录片'], [/音乐|歌舞/, '音乐'],
];

function genreTagOf(typeName?: string): string {
  if (!typeName) return '';
  for (const [re, tag] of GENRE_TAG_MAP) if (re.test(typeName)) return tag;
  return '热门';
}

/** 剧集判定：分类含剧/电视视为 tv，否则按电影推荐 */
function isTvType(typeName?: string): boolean {
  return /剧|电视/.test(typeName ?? '');
}

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
  const [related, setRelated] = useState<DoubanItem[]>([]);
  // 换源面板：打开时用当前标题现搜同名资源（服务端搜索缓存命中则毫秒级）
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [sourceCandidates, setSourceCandidates] = useState<SearchResultItem[] | null>(null);
  const [sourceSearching, setSourceSearching] = useState(false);
  const playerApiRef = useRef<PlayerApi | null>(null);
  const router = useRouter();

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

  /** 换源候选：以当前标题聚合搜索同名影片，并逐源验证详情可出剧集——
   *  不通的源（搜索失败/详情拿不到播放地址）不展示。服务端搜索与详情均有缓存，
   *  从搜索页跳转来的请求近零开销；验证失败顺带进入熔断统计。 */
  async function loadSourceCandidates() {
    if (!info?.title) return;
    setSourceSearching(true);
    try {
      const { sources } = await getSources();
      const configOf = new Map(sources.map((s) => [s.key, s]));
      const res = await searchStream({ wd: info.title, sources });
      const current = normalizeTitle(info.title);
      const sameTitle = res.list.filter((i) => normalizeTitle(i.name || '') === current);

      // 当前源必然可用；其余候选并行验证详情，拿不到剧集的丢弃
      const checked = await Promise.all(
        sameTitle.map(async (item) => {
          if (item.sourceKey === sourceKey && item.vodId === vodId) return item;
          const config = configOf.get(item.sourceKey);
          if (!config) return null;
          try {
            const d = await getDetail(config, item.vodId);
            return d.episodes.length > 0 ? item : null;
          } catch {
            return null;
          }
        })
      );
      setSourceCandidates(checked.filter((item): item is SearchResultItem => item !== null));
    } catch {
      setSourceCandidates([]);
    } finally {
      setSourceSearching(false);
    }
  }

  function openSourcePanel() {
    setSourcePanelOpen((v) => {
      if (!v && sourceCandidates === null) void loadSourceCandidates();
      return !v;
    });
  }

  function switchSource(item: SearchResultItem) {
    if (item.sourceKey === sourceKey && item.vodId === vodId) return;
    // 集号尽量带走：目标源集数不足时播放页的 episodeUrl clamp 会回落最后一集
    router.push(
      `/play/${encodeURIComponent(item.sourceKey)}/${encodeURIComponent(item.vodId)}/${episodeIndex}`
    );
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

  // 相关推荐：按分类映射豆瓣同类热门（设计稿手机播放页「相关推荐横滑」）。
  // 豆瓣 search_subjects 的题材 tag 仅对 movie 生效（tv 只认「热门」等聚合 tag），
  // 空结果时回落同类型热门，保证区块稳定出现。
  useEffect(() => {
    setRelated([]);
    const tag = genreTagOf(info?.typeName);
    const currentTitle = (info?.title ?? '').replace(/\s+/g, '');
    if (!tag || !currentTitle) return;
    let alive = true;
    const type = isTvType(info?.typeName) ? 'tv' : 'movie';
    (async () => {
      let items: DoubanItem[] = [];
      try {
        items = (await getDoubanRecommend(type, tag, 24)).items;
      } catch {
        /* 直连+降级都失败时下面再试一次热门 */
      }
      if (items.length === 0 && tag !== '热门') {
        try {
          items = (await getDoubanRecommend(type, '热门', 24)).items;
        } catch {
          return;
        }
      }
      if (!alive) return;
      setRelated(
        items.filter((item) => item.title.replace(/\s+/g, '') !== currentTitle).slice(0, 12)
      );
    })();
    return () => {
      alive = false;
    };
  }, [info?.typeName, info?.title]);

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
          <button
            onClick={openSourcePanel}
            className={cn(
              'transition',
              sourcePanelOpen ? 'text-accent' : 'text-t2 hover:text-t1'
            )}
          >
            换源
          </button>
        </div>

        {/* 换源面板：同名影片的各源候选，点击直接切换（保留集号） */}
        {sourcePanelOpen && (
          <div className="mt-3 rounded-lg border border-overlay/60 bg-elevated p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-t2">换源 · 同名影片的其他源</p>
              <button onClick={() => setSourcePanelOpen(false)} aria-label="关闭换源" className="text-t3 hover:text-t1">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
            {sourceSearching ? (
              <p className="mt-3 text-xs text-t3">正在检查各源可用性…</p>
            ) : (sourceCandidates ?? []).length <= 1 ? (
              <p className="mt-3 text-xs text-t3">
                {(sourceCandidates ?? []).length === 1 ? '当前已是唯一可用的源' : '暂无其他可用源，稍后可重试'}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceCandidates!.map((c) => {
                  const isCurrent = c.sourceKey === sourceKey && c.vodId === vodId;
                  return (
                    <button
                      key={`${c.sourceKey}-${c.vodId}`}
                      onClick={() => switchSource(c)}
                      disabled={isCurrent}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs transition',
                        isCurrent
                          ? 'cursor-default bg-accent/15 font-medium text-accent'
                          : 'border border-overlay text-t2 hover:border-accent/50 hover:text-t1'
                      )}
                    >
                      {c.sourceName}
                      {c.remarks && <span className="ml-1 text-t3">{c.remarks}</span>}
                      {isCurrent && <span className="ml-1">（当前）</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

      {/* 相关推荐（同类豆瓣热门，点击按片名搜索） */}
      {related.length > 0 && (
        <section className="lg:col-span-3">
          <h3 className="mb-4 text-base font-semibold text-t1 md:text-lg">相关推荐</h3>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:gap-4 md:px-6">
            {related.map((item) => (
              <PosterCard
                key={`${item.id}-${item.title}`}
                title={item.title}
                pic={item.cover ? `/api/proxy/${encodeURIComponent(item.cover)}` : undefined}
                rating={item.rating}
                href={`/search?wd=${encodeURIComponent(item.title)}&go=1`}
                className="w-[120px] shrink-0 md:w-[160px]"
              />
            ))}
          </div>
        </section>
      )}
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
