'use client';

// 直播页（M5，#7）：M3U 订阅 → 频道分组/搜索/播放 + XMLTV EPG 当前节目。
// 频道搜索归一化与排序复用 lib/live-channel-filter（上游移植）；
// 播放经 /api/proxy 同源代理（与点播一致）；自定义流入口支持临时粘贴 m3u8 播放。

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLiveEpg, getLivePlaylist, getSources, proxied } from '@/lib/client-api';
import type { LiveChannel, LiveEpgResponse, LivePlaylistResponse, LiveSourceConfig } from '@/lib/types';
import { matchesKeyword, normalizeForSearch } from '@/lib/live-channel-filter';
import { useRequireUser } from '@/hooks/use-require-user';
import { EmptyState } from '@/components/site/empty-state';
import { IconSearch, IconTv } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const ArtPlayer = dynamic(() => import('@/components/player/art-player'), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />,
});

/** 列表渲染上限：数千频道全量渲染会卡 DOM，搜索/分组过滤后通常远小于此 */
const RENDER_LIMIT = 300;
const RECENT_KEY = 'mytv_live_recent';

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

function EpgPanel({ epgUrl, channel }: { epgUrl?: string; channel: LiveChannel | null }) {
  const [epg, setEpg] = useState<LiveEpgResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setEpg(null);
    setError('');
    if (!epgUrl || !channel) return;
    const id = channel.tvgId || channel.id;
    let alive = true;
    void getLiveEpg(epgUrl, id)
      .then((res) => alive && setEpg(res))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'EPG 获取失败'));
    return () => {
      alive = false;
    };
  }, [epgUrl, channel]);

  if (!epgUrl || !channel) return null;

  if (error) return <p className="mt-4 text-xs text-t3">节目单：{error}</p>;
  if (!epg) return <div className="mt-4 h-12 animate-pulse rounded-lg bg-elevated" />;

  const { current, next } = epg;
  const progress = current ? Math.min(1, Math.max(0, (Date.now() - current.start) / (current.stop - current.start))) : 0;

  return (
    <div className="mt-4 rounded-lg border border-overlay/60 bg-elevated px-4 py-3">
      <p className="flex items-center gap-2 text-xs text-t3">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">直播中</span>
        节目单（EPG）
      </p>
      {current ? (
        <>
          <p className="mt-2 text-sm font-medium text-t1">{current.title}</p>
          <p className="mt-0.5 text-[11px] text-t3">
            {fmtTime(current.start)} – {fmtTime(current.stop)}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded bg-overlay">
            <div className="h-full bg-accent" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-t3">该频道暂无当前节目信息</p>
      )}
      {next && (
        <p className="mt-2 text-[11px] text-t3">
          下一档：{next.title}（{fmtTime(next.start)}）
        </p>
      )}
    </div>
  );
}

function LiveContent() {
  const [liveSources, setLiveSources] = useState<LiveSourceConfig[] | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<LivePlaylistResponse | null>(null);
  const [playlistError, setPlaylistError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [channel, setChannel] = useState<LiveChannel | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const recentRef = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    void getSources()
      .then(({ liveSources }) => {
        if (!alive) return;
        setLiveSources(liveSources);
        if (liveSources.length > 0) setSourceKey((prev) => prev ?? liveSources[0].key);
      })
      .catch(() => alive && setLiveSources([]));
    try {
      recentRef.current = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
    } catch {
      recentRef.current = [];
    }
    return () => {
      alive = false;
    };
  }, []);

  const source = useMemo(
    () => liveSources?.find((s) => s.key === sourceKey) ?? null,
    [liveSources, sourceKey]
  );

  useEffect(() => {
    setPlaylist(null);
    setPlaylistError('');
    setChannel(null);
    setGroup(null);
    if (!source) return;
    let alive = true;
    void getLivePlaylist(source.url)
      .then((p) => alive && setPlaylist(p))
      .catch((err) => alive && setPlaylistError(err instanceof Error ? err.message : '播放列表获取失败'));
    return () => {
      alive = false;
    };
  }, [source]);

  const filtered = useMemo(() => {
    if (!playlist) return [];
    const kw = normalizeForSearch(keyword.trim());
    return playlist.channels.filter(
      (c) => (group === null || c.group === group) && matchesKeyword(c, kw)
    );
  }, [playlist, keyword, group]);

  const selectChannel = useCallback((c: LiveChannel) => {
    setChannel(c);
    recentRef.current = [c.url, ...recentRef.current.filter((u) => u !== c.url)].slice(0, 20);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentRef.current));
    } catch {
      /* 隐私模式等场景忽略 */
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 播放列表加载后自动选中最近观看或首个频道
  useEffect(() => {
    if (!playlist || playlist.channels.length === 0 || channel) return;
    const recent = recentRef.current
      .map((url) => playlist.channels.find((c) => c.url === url))
      .find(Boolean);
    setChannel(recent ?? playlist.channels[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist]);

  if (liveSources === null) {
    return (
      <div className="py-6">
        <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />
      </div>
    );
  }

  if (liveSources.length === 0) {
    return (
      <div className="py-10">
        <EmptyState
          title="未配置直播源"
          hint="部署者可通过 DEFAULT_LIVE_SOURCES 环境变量预置 M3U 订阅（支持 EPG 节目单地址）"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-[320px_1fr]">
      {/* 播放区（手机在上方：order-first；桌面在右宽列：lg:order-2） */}
      <div className="order-first lg:order-2">
        {channel || customUrl ? (
          <>
            <ArtPlayer
              key={customUrl || channel?.url || ''}
              url={customUrl || channel!.url}
              poster={customUrl ? undefined : channel!.logo}
              className="aspect-video w-full overflow-hidden rounded-card bg-black"
            />
            <div className="mt-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-t1 md:text-xl">
                  {customUrl ? '自定义直播流' : channel!.name}
                </h1>
                {!customUrl && channel!.group && (
                  <p className="mt-1 text-xs text-t3">{channel!.group}</p>
                )}
              </div>
              {customUrl && (
                <button
                  onClick={() => setCustomUrl('')}
                  className="shrink-0 rounded-lg border border-overlay px-3 py-1.5 text-xs text-t2 hover:text-t1"
                >
                  关闭
                </button>
              )}
            </div>
            {!customUrl && <EpgPanel epgUrl={source?.epg} channel={channel} />}
          </>
        ) : (
          <>
            <div className="flex aspect-video w-full items-center justify-center rounded-card bg-elevated">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-overlay text-t3">
                <IconTv className="h-7 w-7" />
              </span>
            </div>
            <p className="mt-4 text-sm text-t2">从右侧频道列表选择一个频道开始观看</p>
          </>
        )}
      </div>

      {/* 频道面板 */}
      <div className="min-w-0">
        {/* 源切换 */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {liveSources.map((s) => (
            <button
              key={s.key}
              onClick={() => setSourceKey(s.key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs transition',
                s.key === sourceKey ? 'bg-accent font-medium text-white' : 'bg-overlay text-t2 hover:text-t1'
              )}
            >
              {s.name}
              {s.epg && <span className="ml-1 text-[10px] opacity-75">EPG</span>}
            </button>
          ))}
        </div>

        {/* 搜索 + 分组 */}
        <div className="mt-3 flex items-center gap-2 rounded-full border border-overlay bg-elevated px-4 py-2">
          <IconSearch className="h-4 w-4 shrink-0 text-t3" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索频道（cctv1 可命中 CCTV-1）"
            className="w-full bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
          />
        </div>
        {playlist && playlist.groups.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setGroup(null)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs',
                group === null ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
              )}
            >
              全部
            </button>
            {playlist.groups.map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs',
                  group === g ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* 频道列表 */}
        {playlistError ? (
          <p className="mt-6 text-sm text-accent">{playlistError}</p>
        ) : playlist === null ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-elevated" />
            ))}
          </div>
        ) : playlist.channels.length === 0 ? (
          <p className="mt-6 text-sm text-t3">该订阅未解析出可用频道（rtp/udp 等非 http 流已自动过滤）</p>
        ) : (
          <>
            <div className="mt-4 max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
              {filtered.slice(0, RENDER_LIMIT).map((c) => (
                <button
                  key={c.url}
                  onClick={() => selectChannel(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                    channel?.url === c.url ? 'bg-accent/15 ring-1 ring-accent/50' : 'bg-elevated hover:bg-overlay'
                  )}
                >
                  {c.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 台标地址运行时不可枚举
                    <img
                      src={c.logo}
                      alt=""
                      loading="lazy"
                      className="h-8 w-12 shrink-0 rounded object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded bg-overlay text-xs text-t3">
                      {c.name.slice(0, 2)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-t1">{c.name}</span>
                    {c.group && <span className="block truncate text-[11px] text-t3">{c.group}</span>}
                  </span>
                </button>
              ))}
            </div>
            {filtered.length > RENDER_LIMIT && (
              <p className="mt-3 text-[11px] text-t3">
                仅显示前 {RENDER_LIMIT} 个频道，共 {filtered.length} 个——用搜索或分组过滤查看更多
              </p>
            )}
            {filtered.length === 0 && (
              <p className="mt-6 text-sm text-t3">没有匹配的频道</p>
            )}
          </>
        )}

        {/* 自定义流（自建 IPTV / 临时源调试） */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^https?:\/\//.test(customUrl.trim())) setCustomUrl(customUrl.trim());
          }}
          className="mt-6 flex gap-2 rounded-lg border border-overlay/60 bg-elevated p-3"
        >
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="直接粘贴 m3u8 直播流地址播放"
            className="flex-1 rounded-lg border border-overlay bg-bg px-3 py-2 text-xs text-t1 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!/^https?:\/\//.test(customUrl.trim())}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            播放
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LivePage() {
  const { ready } = useRequireUser();
  if (!ready) {
    return (
      <div className="py-6">
        <div className="aspect-video w-full animate-pulse rounded-card bg-elevated" />
      </div>
    );
  }
  return <LiveContent />;
}
