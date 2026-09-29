// 后台管理 API 封装（M4）：全部经 middleware 的 admin 守卫，未授权返回 404。

import type { ApiSourceRecord, SubscriptionRecord, StoredUser } from './storage';
import type { SiteConfig } from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    throw new Error((data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// —— 数据源 ——

export function listAdminSources(): Promise<{
  dbSources: ApiSourceRecord[];
  envSources: { name: string; url: string; isAdult: boolean }[];
  hiddenEnvSources: { name: string; url: string }[];
}> {
  return fetchJson('/api/admin/sources');
}

/** 恢复被删除的环境变量预置源 */
export function restoreEnvSource(url: string): Promise<void> {
  return fetchJson('/api/admin/sources', jsonInit('POST', { action: 'restoreEnvSource', url })).then(() => undefined);
}

export function createSource(input: {
  name: string;
  url: string;
  detail?: string;
  isAdult?: boolean;
  weight?: number;
}): Promise<{ source: ApiSourceRecord }> {
  return fetchJson('/api/admin/sources', jsonInit('POST', input));
}

export function updateSource(key: string, patch: Record<string, unknown>): Promise<{ source: ApiSourceRecord }> {
  return fetchJson('/api/admin/sources', jsonInit('PATCH', { key, ...patch }));
}

export function deleteSource(key: string): Promise<void> {
  return fetchJson(`/api/admin/sources?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).then(() => undefined);
}

export function probeSource(url: string): Promise<{ ok: boolean; ms: number; count?: number; error?: string }> {
  return fetchJson('/api/source/test', jsonInit('POST', { url }));
}

// —— 订阅 ——

export function listSubscriptions(): Promise<{ subscriptions: SubscriptionRecord[] }> {
  return fetchJson('/api/admin/subscriptions');
}

export function addSubscription(url: string, name?: string): Promise<{
  subscription: SubscriptionRecord;
  imported: number;
  skippedExisting: number;
}> {
  return fetchJson('/api/admin/subscriptions', jsonInit('POST', { url, name }));
}

export function resyncSubscription(id: number): Promise<{ imported: number; skippedExisting: number }> {
  return fetchJson('/api/admin/subscriptions', jsonInit('POST', { id, action: 'resync' }));
}

export function renameSubscription(id: number, name: string): Promise<void> {
  return fetchJson('/api/admin/subscriptions', jsonInit('PATCH', { id, name })).then(() => undefined);
}

export function deleteSubscription(id: number): Promise<void> {
  return fetchJson(`/api/admin/subscriptions?id=${id}`, { method: 'DELETE' }).then(() => undefined);
}

// —— 用户 ——

export function listUsers(): Promise<{ users: StoredUser[] }> {
  return fetchJson('/api/admin/users');
}

export function updateUserStatus(name: string, status: 'pending' | 'active' | 'disabled'): Promise<void> {
  return fetchJson('/api/admin/users', jsonInit('PATCH', { name, status })).then(() => undefined);
}

export function resetUserPassword(name: string, newPassword: string): Promise<void> {
  return fetchJson('/api/admin/users', jsonInit('PATCH', { name, newPassword })).then(() => undefined);
}

export function deleteUser(name: string): Promise<void> {
  return fetchJson(`/api/admin/users?name=${encodeURIComponent(name)}`, { method: 'DELETE' }).then(() => undefined);
}

// —— 站点配置 ——

export function getSiteConfig(): Promise<{ config: SiteConfig }> {
  return fetchJson('/api/admin/site-config');
}

export function saveSiteConfig(patch: Partial<SiteConfig>): Promise<{ config: SiteConfig }> {
  return fetchJson('/api/admin/site-config', jsonInit('PATCH', patch));
}

// —— 仪表盘统计（M6） ——

export interface AdminStats {
  users: { total: number; pending: number; active: number; disabled: number; todayNew: number; yesterdayNew: number };
  plays: { today: number; yesterday: number };
  catalog: { total: number; probedSources: number; sources: number; missingSources: number };
  /** pct 为 null 表示窗口内没有任何真实请求采样——界面显示「未采集」而不是 0% */
  availability: { pct: number | null; samples: number; sources: number; windowDays: number };
  trend: { days: string[]; plays: number[]; signups: number[] };
  latestUsers: Array<{
    id: number;
    name: string;
    role: 'user' | 'admin';
    status: 'pending' | 'active' | 'disabled';
    createdAt: number;
    registerIp?: string;
  }>;
}

export interface SourceHealthEntry {
  pct: number;
  samples: number;
  avgMs: number;
  probe: { ok: boolean; ms?: number; total?: number; probedAt?: number } | null;
}

/** tz 传浏览器东偏移分钟数（-getTimezoneOffset()），日界按站长时区算 */
export function getAdminStats(days: number, tzMinutes: number): Promise<AdminStats> {
  const params = new URLSearchParams({ days: String(days), tz: String(tzMinutes) });
  return fetchJson(`/api/admin/stats?${params.toString()}`);
}

export function getSourceHealth(days: number): Promise<{ windowDays: number; byUrl: Record<string, SourceHealthEntry> }> {
  return fetchJson(`/api/admin/source-health?days=${days}`);
}

/** 逐源抓 CMS total 刷新收录量（出网请求，只在站长按下时跑） */
export function refreshCatalog(): Promise<{ ok: number; failed: number; missingTotal: number; total: number; sources: number }> {
  return fetchJson('/api/admin/catalog', jsonInit('POST', {}));
}

// —— 缓存管理 / 系统状态（M6 后台二期）——

export interface CacheEntryInfo {
  prefix: string;
  label: string;
  ttlSeconds: number;
  keys: number;
}

export function getCacheOverview(): Promise<{ entries: CacheEntryInfo[] }> {
  return fetchJson('/api/admin/cache');
}

export function purgeCache(prefix: string): Promise<{ deleted: number }> {
  return fetchJson(`/api/admin/cache?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' });
}

export interface SystemStatus {
  dbOk: boolean;
  kvOk: boolean;
  tables: { name: string; rows: number | null }[];
  sourceProbes: { name: string; url: string; ok?: boolean; ms?: number; probedAt?: number }[];
  envKeys: string[];
  timestamp: number;
}

export function getSystemStatus(): Promise<SystemStatus> {
  return fetchJson('/api/admin/system');
}
