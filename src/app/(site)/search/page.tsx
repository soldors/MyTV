'use client';

// 搜索页（M2，筛选栏补全 2026-09-29）：流式聚合搜索（NDJSON 逐源推送，
// 健康源结果先出）默认查询全部启用源（源的选择性管理在后台完成）+
// 搜索历史（D1）+ 热门关键词 + 同名影片去重展示 + 结果筛选（类型/地区/年份）。

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addSearchHistory,
  clearSearchHistory,
  getDoubanRecommend,
  getHotList,
  getSources,
  listSearchHistory,
  searchStream,
} from '@/lib/client-api';
import type { SearchHistoryItem, SearchResultItem, SourceConfig } from '@/lib/types';
import { useRequireUser } from '@/hooks/use-require-user';
import PosterCard from '@/components/site/poster-card';
import { EmptyState, PosterGridSkeleton } from '@/components/site/empty-state';
import { IconSearch, IconTrash } from '@/components/site/icons';
import { normalizeTitle } from '@/lib/cms-parser';
import { cn } from '@/lib/utils';

const HOT_KEYWORDS = ['庆余年', '流浪地球', '狂飙', '繁花', '三体', '漫长的季节', '琅琊榜', '让子弹飞'];

/**
 * 实时热门词：60s 百度热播剧榜（自部署实例，1h 缓存）→ 豆瓣热门电影/剧集交错 → 静态兜底。
 * 数据源失败静默降级，界面永不空白。
 */
async function loadHotKeywords(): Promise<string[]> {
  try {
    const baidu = (await getHotList('baidu_teleplay')).items.map((i) => i.title).filter(Boolean).slice(0, 8);
    if (baidu.length >= 4) return baidu;
  } catch {
    /* 走豆瓣回退 */
  }
  try {
    const [tv, movie] = await Promise.all([
      getDoubanRecommend('tv', '热门', 12),
      getDoubanRecommend('movie', '热门', 12),
    ]);
    const interleaved: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 12 && interleaved.length < 8; i++) {
      for (const list of [tv.items, movie.items]) {
        const t = list[i]?.title;
        if (t && !seen.has(t)) {
          seen.add(t);
          interleaved.push(t);
        }
      }
    }
    if (interleaved.length >= 4) return interleaved;
  } catch {
    /* 走静态兜底 */
  }
  return HOT_KEYWORDS;
}

/** 从结果聚合某维度的选项（值 → 数量），按数量降序取前 N *//** 从结果聚合某维度的选项（值 → 数量），按数量降序取前 N */
function buildFacets(
  results: SearchResultItem[],
  key: 'typeName' | 'area' | 'year',
  limit = 8
): { value: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const item of results) {
    const v = item[key];
    if (!v) continue;
    counter.set(v, (counter.get(v) ?? 0) + 1);
  }
  return [...counter.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialWd = searchParams.get('wd') || '';

  const [wd, setWd] = useState(initialWd);
  /** 全部启用源（后台管理启停），搜索时全量查询 */
  const [allSources, setAllSources] = useState<SourceConfig[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  /** 热门词：先渲染静态兜底，实时热榜到达后替换 */
  const [hotKeywords, setHotKeywords] = useState<string[]>(HOT_KEYWORDS);
  const abortRef = useRef<AbortController | null>(null);
  const autoSearched = useRef(false);

  // 结果筛选（类型/地区/年份）
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterArea, setFilterArea] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSources()
      .then(({ sources }) => alive && setAllSources(sources))
      .catch(() => alive && setAllSources([]));
    void listSearchHistory()
      .then(({ list }) => alive && setHistory(list))
      .catch(() => {});
    void loadHotKeywords().then((words) => alive && setHotKeywords(words));
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
      setFilterType(null);
      setFilterArea(null);
      setFilterYear(null);
      try {
        const final = await searchStream({
          wd: q,
          sources: configs,
          signal: controller.signal,
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
    if (initialWd && !autoSearched.current && allSources !== null) {
      autoSearched.current = true;
      void doSearch(initialWd, allSources);
    }
  }, [initialWd, allSources, doSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?wd=${encodeURIComponent(wd.trim())}`, { scroll: false });
    void doSearch(wd, allSources ?? []);
  }

  const searched = results !== null;

  // 筛选后的结果
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter(
      (item) =>
        (filterType === null || item.typeName === filterType) &&
        (filterArea === null || item.area === filterArea) &&
        (filterYear === null || item.year === filterYear)
    );
  }, [results, filterType, filterArea, filterYear]);

  // 同名影片去重展示：归一化标题分组，每组取排序后的首位（精确命中/权重最优）作代表，
  // 次要源在播放页「换源」面板切换（面板现搜命中服务端搜索缓存，通常毫秒级）
  const groupedResults = useMemo(() => {
    const groups: { item: SearchResultItem; sourceCount: number }[] = [];
    const byTitle = new Map<string, { item: SearchResultItem; sourceCount: number }>();
    for (const item of filteredResults) {
      const key = normalizeTitle(item.name || '');
      const existing = byTitle.get(key);
      if (existing) {
        existing.sourceCount += 1;
      } else {
        const group = { item, sourceCount: 1 };
        byTitle.set(key, group);
        groups.push(group);
      }
    }
    return groups;
  }, [filteredResults]);

  const typeFacets = useMemo(() => (searched ? buildFacets(results!, 'typeName') : []), [results, searched]);
  const areaFacets = useMemo(() => (searched ? buildFacets(results!, 'area') : []), [results, searched]);
  const yearFacets = useMemo(() => (searched ? buildFacets(results!, 'year', 10) : []), [results, searched]);
  const activeFilterCount = [filterType, filterArea, filterYear].filter(Boolean).length;
  const hasAnyFacet = typeFacets.length + areaFacets.length + yearFacets.length > 0;

  function clearFilters() {
    setFilterType(null);
    setFilterArea(null);
    setFilterYear(null);
  }

  /** 筛选组：桌面侧栏竖排 / 手机面板内横排 pills */
  function renderFilterGroup(
    label: string,
    options: { value: string; count: number }[],
    selected: string | null,
    onSelect: (v: string | null) => void,
    orientation: 'col' | 'row'
  ) {
    if (options.length === 0) return null;
    return (
      <div>
        <p className={cn('text-xs font-medium text-t2', orientation === 'col' ? 'mb-2' : 'mb-1.5')}>{label}</p>
        <div className={cn(orientation === 'col' ? 'space-y-1' : 'flex flex-wrap gap-1.5')}>
          <button
            onClick={() => onSelect(null)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs transition',
              selected === null ? 'bg-overlay font-medium text-t1' : 'text-t3 hover:text-t2'
            )}
          >
            全部
          </button>
          {options.map(({ value, count }) => (
            <button
              key={value}
              onClick={() => onSelect(selected === value ? null : value)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition',
                selected === value
                  ? 'bg-accent font-medium text-white'
                  : 'text-t2 hover:bg-overlay hover:text-t1'
              )}
            >
              {value}
              <span className={cn('text-[10px]', selected === value ? 'text-white/70' : 'text-t3')}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

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
          disabled={searching || (allSources ?? []).length === 0}
          className="rounded-full bg-accent px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? '搜索中' : '搜索'}
        </button>
      </form>

      {allSources !== null && allSources.length === 0 && (
        <p className="mt-3 text-xs text-t3">未配置可用数据源，请联系站长在后台添加</p>
      )}

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
              {hotKeywords.map((k, i) => (
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

      {/* 结果 + 筛选 */}
      {searched && (
        <div className="mt-6 lg:grid lg:grid-cols-[176px_1fr] lg:gap-6">
          {/* 桌面左侧筛选栏 */}
          {hasAnyFacet && (
            <aside className="hidden lg:block">
              <div className="sticky top-20 space-y-5 rounded-card border border-overlay/60 bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-t1">筛选</p>
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters} className="text-[11px] text-t3 transition hover:text-accent">
                      清除
                    </button>
                  )}
                </div>
                {renderFilterGroup('类型', typeFacets, filterType, setFilterType, 'col')}
                {renderFilterGroup('地区', areaFacets, filterArea, setFilterArea, 'col')}
                {renderFilterGroup('年份', yearFacets, filterYear, setFilterYear, 'col')}
              </div>
            </aside>
          )}

          <div className="min-w-0">
            {/* 手机筛选折叠面板 */}
            {hasAnyFacet && (
              <div className="mb-4 lg:hidden">
                <button
                  onClick={() => setMobileFilterOpen((v) => !v)}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-xs transition',
                    activeFilterCount > 0 || mobileFilterOpen
                      ? 'border-accent text-accent'
                      : 'border-overlay text-t2'
                  )}
                >
                  筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''} ▾
                </button>
                {mobileFilterOpen && (
                  <div className="mt-3 space-y-4 rounded-card border border-overlay/60 bg-elevated p-4">
                    {activeFilterCount > 0 && (
                      <button onClick={clearFilters} className="text-[11px] text-t3 transition hover:text-accent">
                        清除全部筛选
                      </button>
                    )}
                    {renderFilterGroup('类型', typeFacets, filterType, setFilterType, 'row')}
                    {renderFilterGroup('地区', areaFacets, filterArea, setFilterArea, 'row')}
                    {renderFilterGroup('年份', yearFacets, filterYear, setFilterYear, 'row')}
                  </div>
                )}
              </div>
            )}

            {searchError && <p className="mb-4 text-sm text-accent">{searchError}</p>}
            {filteredResults.length === 0 && !searchError ? (
              <EmptyState
                title={searching ? '等待各源返回…' : '没有匹配的结果'}
                hint={
                  searching
                    ? undefined
                    : activeFilterCount > 0
                      ? '当前筛选条件下无结果，试试放宽筛选或清除'
                      : '换个关键词再试试'
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {groupedResults.map(({ item, sourceCount }) => (
                  <PosterCard
                    key={`${item.sourceKey}-${item.vodId}`}
                    title={item.name}
                    pic={item.pic}
                    remarks={[item.remarks, item.year].filter(Boolean).join(' · ') || undefined}
                    badge={sourceCount > 1 ? `${sourceCount} 源` : undefined}
                    href={`/play/${encodeURIComponent(item.sourceKey)}/${encodeURIComponent(item.vodId)}`}
                  />
                ))}
              </div>
            )}
          </div>
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
