'use client';

// 搜索页（M2）：流式聚合搜索（NDJSON 逐源推送，健康源结果先出）+
// 源多选 chips + 搜索历史（D1）+ 热门关键词；?wd= 直达（首页/导航/换源入口）。

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addSearchHistory,
  clearSearchHistory,
  getSources,
  listSearchHistory,
  searchStream,
  type StreamProgress,
} from '@/lib/client-api';
import type { SearchHistoryItem, SearchResultItem, SourceConfig } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState, PosterGridSkeleton } from '@/components/site/empty-state';
import { IconSearch, IconTrash } from '@/components/site/icons';
import { cn } from '@/lib/utils';

const HOT_KEYWORDS = ['庆余年', '流浪地球', '狂飙', '繁花', '三体', '漫长的季节', '琅琊榜', '让子弹飞'];

interface SourceUiState {
  config: SourceConfig;
  selected: boolean;
  progress?: StreamProgress;
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialWd = searchParams.get('wd') || '';

  const [wd, setWd] = useState(initialWd);
  const [sourcesUi, setSourcesUi] = useState<SourceUiState[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const autoSearched = useRef(false);

  const selectedSources = useMemo(
    () => (sourcesUi ?? []).filter((s) => s.selected).map((s) => s.config),
    [sourcesUi]
  );

  useEffect(() => {
    let alive = true;
    void getSources()
      .then(({ sources }) => {
        if (!alive) return;
        setSourcesUi(sources.map((config) => ({ config, selected: true })));
      })
      .catch(() => alive && setSourcesUi([]));
    void listSearchHistory()
      .then(({ list }) => alive && setHistory(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const doSearch = useCallback(
    async (keyword: string, configs: SourceConfig[]) => {
      const q = keyword.trim();
      if (!q || configs.length === 0) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setSearchError('');
      setResults(null);
      setSourcesUi((prev) =>
        (prev ?? []).map((s) => ({
          ...s,
          progress: configs.some((c) => c.key === s.config.key) ? undefined : s.progress,
        }))
      );
      try {
        const final = await searchStream({
          wd: q,
          sources: configs,
          signal: controller.signal,
          onSource: (progress) => {
            setSourcesUi((prev) =>
              (prev ?? []).map((s) =>
                s.config.key === progress.sourceKey ? { ...s, progress } : s
              )
            );
          },
          onPartial: (items) => {
            // 逐源到达即展示（复制一份触发渲染）
            setResults([...items]);
          },
        });
        setResults(final.list);
        void addSearchHistory(q).then(() =>
          listSearchHistory()
            .then(({ list }) => setHistory(list))
            .catch(() => {})
        );
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSearchError(err instanceof Error ? err.message : '搜索失败');
          setResults([]);
        }
      } finally {
        if (abortRef.current === controller) {
          setSearching(false);
          abortRef.current = null;
        }
      }
    },
    []
  );

  // ?wd= 直达搜索（仅首次）
  useEffect(() => {
    if (initialWd && !autoSearched.current && sourcesUi !== null) {
      autoSearched.current = true;
      void doSearch(
        initialWd,
        sourcesUi.filter((s) => s.selected).map((s) => s.config)
      );
    }
  }, [initialWd, sourcesUi, doSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function toggleSource(key: string) {
    setSourcesUi(
      (prev) =>
        prev?.map((s) => (s.config.key === key ? { ...s, selected: !s.selected } : s)) ?? null
    );
  }

  function toggleAll() {
    setSourcesUi((prev) => {
      if (!prev) return prev;
      const allSelected = prev.every((s) => s.selected);
      return prev.map((s) => ({ ...s, selected: !allSelected }));
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?wd=${encodeURIComponent(wd.trim())}`, { scroll: false });
    void doSearch(wd, selectedSources);
  }

  const searched = results !== null;

  return (
    <div className="py-6">
      {/* 搜索框 */}
      <form onSubmit={submit} className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-overlay bg-elevated px-4 py-3">
          <IconSearch className="h-5 w-5 shrink-0 text-t3" />
          <input
            value={wd}
            onChange={(e) => setWd(e.target.value)}
            autoFocus
            placeholder="搜索影视、演员、导演"
            className="w-full bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
          />
        </div>
        <button
          type="submit"
          disabled={searching || selectedSources.length === 0}
          className="rounded-full bg-accent px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? '搜索中' : '搜索'}
        </button>
      </form>

      {/* 源选择 */}
      <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={toggleAll}
          className="shrink-0 rounded-full border border-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
        >
          全选/反选
        </button>
        {(sourcesUi ?? []).map(({ config, selected, progress }) => {
          const state = !selected
            ? 'off'
            : progress === undefined
              ? searching
                ? 'pending'
                : 'idle'
              : progress.ok
                ? 'ok'
                : 'fail';
          return (
            <button
              key={config.key}
              onClick={() => toggleSource(config.key)}
              title={
                state === 'fail'
                  ? progress?.error || '该源搜索失败'
                  : state === 'ok'
                    ? `已返回 ${progress?.count ?? 0} 条`
                    : config.name
              }
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs transition',
                !selected && 'border border-overlay text-t3',
                selected && state !== 'fail' && 'bg-overlay text-t1',
                state === 'fail' && 'border border-overlay text-t3 line-through',
                state === 'pending' && 'animate-pulse'
              )}
            >
              {config.name}
              {state === 'ok' && progress?.count ? ` ${progress.count}` : ''}
              {state === 'pending' ? ' …' : ''}
              {state === 'fail' ? ' ×' : ''}
            </button>
          );
        })}
        {sourcesUi === null && <span className="text-xs text-t3">源加载中…</span>}
        {sourcesUi?.length === 0 && (
          <span className="text-xs text-t3">
            未配置数据源（DEFAULT_SOURCES），请联系站长
          </span>
        )}
      </div>

      {/* 搜索前：历史 + 热搜 */}
      {!searched && !searching && (
        <div className="mt-8 space-y-8">
          {history.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-t1">搜索历史</h3>
                <button
                  onClick={() =>
                    void clearSearchHistory().then(() => setHistory([])).catch(() => {})
                  }
                  className="flex items-center gap-1 text-xs text-t3 transition hover:text-t2"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  清空
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((h) => (
                  <Link
                    key={h.keyword}
                    href={`/search?wd=${encodeURIComponent(h.keyword)}`}
                    className="rounded-full bg-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
                  >
                    {h.keyword}
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-t1">热门搜索</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {HOT_KEYWORDS.map((k, i) => (
                <Link
                  key={k}
                  href={`/search?wd=${encodeURIComponent(k)}`}
                  className="flex items-center gap-2 rounded-full bg-overlay px-3 py-1.5 text-xs text-t2 transition hover:text-t1"
                >
                  <span className="font-mono text-accent">{i + 1}</span>
                  {k}
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 搜索中骨架 */}
      {searching && results === null && (
        <div className="mt-6">
          <PosterGridSkeleton />
        </div>
      )}

      {/* 结果 */}
      {searched && (
        <div className="mt-6">
          {searchError && <p className="mb-4 text-sm text-accent">{searchError}</p>}
          {results.length === 0 && !searchError ? (
            <EmptyState
              title={searching ? '等待各源返回…' : '没有找到相关结果'}
              hint={searching ? undefined : '换个关键词，或检查上方数据源开关'}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((item) => (
                <PosterCard
                  key={`${item.sourceKey}-${item.vodId}`}
                  title={item.name}
                  pic={item.pic}
                  remarks={[item.remarks, item.year].filter(Boolean).join(' · ') || undefined}
                  href={`/play/${encodeURIComponent(item.sourceKey)}/${encodeURIComponent(item.vodId)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const { ready } = useRequireUser();
  if (!ready) {
    return (
      <div className="py-6">
        <PosterGridSkeleton />
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
