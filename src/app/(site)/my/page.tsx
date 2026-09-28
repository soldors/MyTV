'use client';

// 我的（M2）：用户卡（管理员可见「管理后台」入口，docs/02 §7.1）+
// 继续观看（进度条）/ 我的收藏 / 搜索历史 三个分区 + 退出登录。

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  clearSearchHistory,
  deleteRecord,
  listFavorites,
  listRecords,
  listSearchHistory,
  logout,
  removeFavorite,
} from '@/lib/client-api';
import type { FavoriteItem, PlayRecord, SearchHistoryItem } from '@/lib/types';
import { useSession } from '@/hooks/use-session';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState } from '@/components/site/empty-state';
import { IconClock, IconHeart, IconLogout, IconSearch, IconSettings, IconTrash } from '@/components/site/icons';
import { cn } from '@/lib/utils';

type Tab = 'history' | 'favorites' | 'searches';

const TABS: { key: Tab; label: string; icon: typeof IconClock }[] = [
  { key: 'history', label: '继续观看', icon: IconClock },
  { key: 'favorites', label: '我的收藏', icon: IconHeart },
  { key: 'searches', label: '搜索历史', icon: IconSearch },
];

function MyContent() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [tab, setTab] = useState<Tab>('history');
  const [records, setRecords] = useState<PlayRecord[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const [searches, setSearches] = useState<SearchHistoryItem[] | null>(null);

  const reload = useCallback(() => {
    void listRecords().then((r) => setRecords(r.list)).catch(() => setRecords([]));
    void listFavorites().then((f) => setFavorites(f.list)).catch(() => setFavorites([]));
    void listSearchHistory().then((s) => setSearches(s.list)).catch(() => setSearches([]));
  }, []);

  useEffect(() => reload(), [reload]);

  async function handleLogout() {
    await logout().catch(() => {});
    await refresh();
    router.replace('/login');
  }

  function removeRecord(item: PlayRecord) {
    setRecords((prev) => (prev ?? []).filter((r) => !(r.source === item.source && r.vodId === item.vodId)));
    void deleteRecord(item.source, item.vodId).catch(() => reload());
  }

  function removeFav(item: FavoriteItem) {
    setFavorites((prev) => (prev ?? []).filter((f) => !(f.source === item.source && f.vodId === item.vodId)));
    void removeFavorite(item.source, item.vodId).catch(() => reload());
  }

  return (
    <div className="py-6">
      {/* 用户卡 */}
      <div className="flex items-center gap-4 rounded-card border border-overlay/60 bg-elevated p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-overlay text-xl font-bold text-t1 ring-1 ring-white/10">
          {user?.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-semibold text-t1">{user?.name}</p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                user?.role === 'admin' ? 'bg-accent text-white' : 'bg-overlay text-t2'
              )}
            >
              {user?.role === 'admin' ? '站长' : '用户'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-t3">云端续看与收藏已开启（D1 多端同步）</p>
        </div>
        {user?.role === 'admin' && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-full border border-overlay px-4 py-2 text-xs text-t2 transition hover:border-accent hover:text-accent"
          >
            <IconSettings className="h-4 w-4" />
            管理后台
          </Link>
        )}
        <button
          onClick={() => void handleLogout()}
          className="flex items-center gap-1.5 rounded-full border border-overlay px-4 py-2 text-xs text-t2 transition hover:border-accent hover:text-accent"
        >
          <IconLogout className="h-4 w-4" />
          退出登录
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-6 grid grid-cols-3 border-b border-overlay">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 pb-2.5 text-xs transition-colors sm:text-sm',
              tab === key ? 'text-t1' : 'text-t2 hover:text-t1'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tab === key && <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {/* 继续观看 */}
        {tab === 'history' &&
          (records === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-card bg-elevated" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              title="还没有观看记录"
              hint="看过的影片会记录进度，换设备也能接着看"
              action={
                <Link href="/search" className="mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                  去搜索
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {records.map((r) => {
                const progress = r.totalTime > 0 ? r.playTime / r.totalTime : 0;
                return (
                  <div
                    key={`${r.source}-${r.vodId}`}
                    className="group flex items-center gap-4 rounded-card border border-overlay/60 bg-elevated p-3"
                  >
                    <Link
                      href={`/play/${encodeURIComponent(r.source)}/${encodeURIComponent(r.vodId)}?ep=${r.episodeIndex}`}
                      className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded bg-overlay"
                    >
                      {r.pic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.pic} alt={r.title} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-lg font-bold text-t3">
                          {r.title.charAt(0)}
                        </span>
                      )}
                    </Link>
                    <Link
                      href={`/play/${encodeURIComponent(r.source)}/${encodeURIComponent(r.vodId)}?ep=${r.episodeIndex}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-medium text-t1">{r.title}</p>
                      <p className="mt-1 text-xs text-t3">
                        看到第 {r.episodeIndex + 1} 集
                        {r.totalTime > 0 && ` · ${Math.floor(r.playTime / 60)}:${String(Math.floor(r.playTime % 60)).padStart(2, '0')} / ${Math.floor(r.totalTime / 60)}:${String(Math.floor(r.totalTime % 60)).padStart(2, '0')}`}
                      </p>
                      {r.totalTime > 0 && (
                        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-overlay">
                          <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100).toFixed(0)}%` }} />
                        </div>
                      )}
                    </Link>
                    <button
                      onClick={() => removeRecord(r)}
                      aria-label="删除记录"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-t3 transition hover:bg-overlay hover:text-accent"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

        {/* 我的收藏 */}
        {tab === 'favorites' &&
          (favorites === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-poster bg-elevated" />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <EmptyState title="还没有收藏" hint="在播放页点「加入收藏」，影片会集中显示在这里" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
              {favorites.map((f) => (
                <div key={`${f.source}-${f.vodId}`} className="relative">
                  <PosterCard
                    title={f.title}
                    pic={f.pic}
                    href={`/play/${encodeURIComponent(f.source)}/${encodeURIComponent(f.vodId)}`}
                  />
                  <button
                    onClick={() => removeFav(f)}
                    aria-label="取消收藏"
                    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-t2 opacity-0 transition group-hover:opacity-100 hover:text-accent focus-visible:opacity-100"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {/* 搜索历史 */}
        {tab === 'searches' &&
          (searches === null ? (
            <div className="h-16 animate-pulse rounded-card bg-elevated" />
          ) : searches.length === 0 ? (
            <EmptyState title="暂无搜索历史" hint="搜索过的关键词会保存在这里，方便再次查找" />
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() =>
                    void clearSearchHistory()
                      .then(() => setSearches([]))
                      .catch(() => {})
                  }
                  className="flex items-center gap-1 text-xs text-t3 transition hover:text-t2"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  清空
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searches.map((s) => (
                  <Link
                    key={s.keyword}
                    href={`/search?wd=${encodeURIComponent(s.keyword)}`}
                    className="rounded-full bg-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
                  >
                    {s.keyword}
                  </Link>
                ))}
              </div>
            </>
          ))}
      </div>
    </div>
  );
}

export default function MyPage() {
  const { ready } = useRequireUser();
  if (!ready) {
    return <div className="py-6">{/* 骨架 */}<div className="h-24 animate-pulse rounded-card bg-elevated" /></div>;
  }
  return <MyContent />;
}
