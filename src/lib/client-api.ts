// 前台客户端 API 封装：统一错误处理 + 流式搜索解析。
// 服务端接口均为 M0/M1 交付（/api/search /api/detail /api/records /api/favorites …）。

import type {
  DoubanItem,
  FavoriteItem,
  LiveEpgResponse,
  LivePlaylistResponse,
  LiveSourceConfig,
  PlayRecord,
  SearchHistoryItem,
  SearchResponse,
  SearchStreamEvent,
  SearchResultItem,
  SiteConfig,
  SkipConfig,
  SourceConfig,
  VideoDetail,
} from './types';

export interface SessionUser {
  name: string;
  role: 'admin' | 'user';
}

/** 站点品牌信息（/api/auth GET 下发，前台顶栏与公告条使用） */
export interface SiteInfo {
  siteName?: string;
  announcement?: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    throw new Error((data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// —— 会话 ——

export function getAuthStatus(): Promise<{ verified: boolean; user: SessionUser | null; site?: SiteInfo }> {
  return fetchJson('/api/auth');
}

export function adminLogin(password: string): Promise<{ user: SessionUser }> {
  return postJson('/api/auth', { password });
}

export function userLogin(name: string, password: string): Promise<{ user: SessionUser }> {
  return postJson('/api/user/login', { name, password });
}

export function registerUser(
  name: string,
  password: string
): Promise<{ status: string; message: string }> {
  return postJson('/api/user/register', { name, password });
}

export function logout(): Promise<void> {
  return fetchJson('/api/auth', { method: 'DELETE' }).then(() => undefined);
}

// —— 数据源 ——

export function getSources(): Promise<{ sources: SourceConfig[]; liveSources: LiveSourceConfig[] }> {
  return fetchJson('/api/sources');
}

// —— 直播（M5） ——

export function getLivePlaylist(
  url: string,
  options: { force?: boolean } = {}
): Promise<LivePlaylistResponse> {
  const params = new URLSearchParams({ url });
  if (options.force) params.set('force', '1');
  return fetchJson(`/api/live/playlist?${params.toString()}`);
}

export function getLiveEpg(epgUrl: string, channel: string): Promise<LiveEpgResponse> {
  const params = new URLSearchParams({ url: epgUrl, channel });
  return fetchJson(`/api/live/epg?${params.toString()}`);
}

// —— 搜索（流式 NDJSON） ——

export interface StreamProgress {
  sourceKey: string;
  ok: boolean;
  count: number;
  error?: string;
  timedOut?: boolean;
}

/**
 * 聚合搜索：`?stream=1` 逐源推送（完成一个出一个），onSource 用于实时反馈源健康度。
 * 服务端最终 done 事件携带去重排序后的完整列表。
 */
export async function searchStream(options: {
  wd: string;
  sources: SourceConfig[];
  onSource?: (progress: StreamProgress) => void;
  onPartial?: (items: SearchResultItem[]) => void;
  signal?: AbortSignal;
}): Promise<SearchResponse> {
  const { wd, sources, onSource, onPartial, signal } = options;
  const res = await fetch('/api/search?stream=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wd, sources }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || `搜索失败（HTTP ${res.status}）`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: SearchResponse | null = null;
  const items: SearchResultItem[] = [];

  for (;;) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: SearchStreamEvent;
      try {
        event = JSON.parse(line) as SearchStreamEvent;
      } catch {
        continue;
      }
      if (event.type === 'source') {
        onSource?.({
          sourceKey: event.sourceKey,
          ok: event.ok,
          count: event.list.length,
          error: event.error,
          timedOut: event.timedOut,
        });
        if (event.ok) {
          items.push(...event.list);
          onPartial?.(items);
        }
      } else {
        done = { list: event.list, failures: event.failures };
      }
    }
  }
  return done ?? { list: [], failures: [] };
}

// —— 详情 ——

export function getDetail(source: SourceConfig, id: string): Promise<VideoDetail> {
  const params = new URLSearchParams({ id, source: JSON.stringify(source) });
  return fetchJson(`/api/detail?${params.toString()}`);
}

// —— 跳过片头片尾 ——

export function getSkipConfig(source: string, vodId: string): Promise<{ config: SkipConfig | null }> {
  const params = new URLSearchParams({ source, vodId });
  return fetchJson(`/api/skip?${params.toString()}`);
}

export function saveSkipConfig(
  source: string,
  vodId: string,
  config: SkipConfig
): Promise<{ config: SkipConfig }> {
  return postJson('/api/skip', { source, vodId, ...config });
}

// —— 豆瓣推荐 / 热榜（首页内容分区） ——

export function getDoubanRecommend(
  type: 'movie' | 'tv',
  tag: string,
  pageSize = 24,
  pageStart = 0
): Promise<{ items: DoubanItem[] }> {
  const params = new URLSearchParams({
    type,
    tag,
    pageSize: String(pageSize),
    pageStart: String(pageStart),
  });
  return fetchJson(`/api/douban?${params.toString()}`);
}

export function getHotList(id: string): Promise<{ items: DoubanItem[] }> {
  return fetchJson(`/api/hot-list?id=${encodeURIComponent(id)}`);
}

// —— 播放记录 ——

export function listRecords(limit = 100): Promise<{ list: PlayRecord[] }> {
  return fetchJson(`/api/records?limit=${limit}`);
}

export function saveRecord(record: {
  source: string;
  vodId: string;
  title: string;
  pic?: string;
  episodeIndex: number;
  totalTime: number;
  playTime: number;
}): Promise<void> {
  return postJson('/api/records', record).then(() => undefined);
}

export function deleteRecord(source: string, vodId: string): Promise<void> {
  return fetchJson(`/api/records?source=${encodeURIComponent(source)}&vodId=${encodeURIComponent(vodId)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

// —— 收藏 ——

export function listFavorites(limit = 100): Promise<{ list: FavoriteItem[] }> {
  return fetchJson(`/api/favorites?limit=${limit}`);
}

export function addFavorite(item: {
  source: string;
  vodId: string;
  title: string;
  pic?: string;
}): Promise<void> {
  return postJson('/api/favorites', item).then(() => undefined);
}

export function removeFavorite(source: string, vodId: string): Promise<void> {
  return fetchJson(
    `/api/favorites?source=${encodeURIComponent(source)}&vodId=${encodeURIComponent(vodId)}`,
    { method: 'DELETE' }
  ).then(() => undefined);
}

// —— 搜索历史 ——

export function listSearchHistory(): Promise<{ list: SearchHistoryItem[] }> {
  return fetchJson('/api/search-history');
}

export function addSearchHistory(keyword: string): Promise<void> {
  return postJson('/api/search-history', { keyword }).then(() => undefined);
}

export function clearSearchHistory(): Promise<void> {
  return fetchJson('/api/search-history', { method: 'DELETE' }).then(() => undefined);
}

/** 播放地址：经站内代理（m3u8 重写为同源分片路径，规避上游 CORS 与防盗链） */
export function proxied(url: string): string {
  return `/api/proxy/${encodeURIComponent(url)}`;
}

// —— Bangumi 每日放送 ——

/** 按星期分组（1=周一…7=周日）的放送表；条目复用 DoubanItem 结构 */
export function getBangumiCalendar(): Promise<Record<number, DoubanItem[]>> {
  return fetchJson('/api/bangumi');
}
