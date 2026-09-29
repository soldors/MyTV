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
}> {
  return fetchJson('/api/admin/sources');
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
