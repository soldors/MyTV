// D1Storage：IStorage 的 Cloudflare D1 实现（M1）。
// 表结构见 migrations/0001_init.sql；绑定经 wrangler 注册、getCloudflareContext().env 访问。

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  DEFAULT_SITE_CONFIG,
  SEARCH_HISTORY_LIMIT,
  type AdminUserRow,
  type ApiSourceInput,
  type ApiSourcePatch,
  type ApiSourceRecord,
  type DailyCount,
  type FavoriteItem,
  type IStorage,
  type PlayRecord,
  type SearchHistoryItem,
  type SiteConfig,
  type SkipConfig,
  type SourceCatalogEntry,
  type SourceHealthSummary,
  type StoredUser,
  type SubscriptionRecord,
  type UserCredentials,
  type UserRole,
  type UserStatus,
  type UserStatusCounts,
} from './storage';

interface UserRow {
  name: string;
  password_hash: string;
  salt: string;
  iterations: number;
  role: string;
  status: string;
  created_at: number;
}

interface PlayRecordRow {
  source: string;
  vod_id: string;
  title: string;
  pic: string | null;
  episode_index: number;
  total_time: number;
  play_time: number;
  save_time: number;
}

interface FavoriteRow {
  source: string;
  vod_id: string;
  title: string;
  pic: string | null;
  save_time: number;
}

interface SearchHistoryRow {
  keyword: string;
  created_at: number;
}

interface SkipConfigRow {
  intro_start: number;
  intro_end: number;
  outro_start: number;
  outro_end: number;
}

interface ApiSourceRow {
  key: string;
  name: string;
  api_url: string;
  detail_url: string | null;
  is_adult: number;
  weight: number;
  enabled: number;
}

interface SubscriptionRow {
  id: number;
  url: string;
  name: string | null;
  last_synced_at: number | null;
  imported_count: number | null;
}

function mapApiSource(row: ApiSourceRow): ApiSourceRecord {
  return {
    key: row.key,
    name: row.name,
    apiUrl: row.api_url,
    detailUrl: row.detail_url ?? undefined,
    isAdult: row.is_adult === 1,
    weight: row.weight,
    enabled: row.enabled === 1,
  };
}

function mapSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    url: row.url,
    name: row.name ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    importedCount: row.imported_count ?? undefined,
  };
}

/** 生成 DB 源的稳定 key（URL 安全，用作 /play/:source 路径段） */
function generateSourceKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return 'db_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function mapUser(row: UserRow): StoredUser {
  return {
    name: row.name,
    role: (row.role === 'admin' ? 'admin' : 'user') as UserRole,
    status: (['pending', 'active', 'disabled'].includes(row.status) ? row.status : 'pending') as UserStatus,
    createdAt: row.created_at,
  };
}

function mapPlayRecord(row: PlayRecordRow): PlayRecord {
  return {
    source: row.source,
    vodId: row.vod_id,
    title: row.title,
    pic: row.pic ?? undefined,
    episodeIndex: row.episode_index,
    totalTime: row.total_time,
    playTime: row.play_time,
    saveTime: row.save_time,
  };
}

function mapFavorite(row: FavoriteRow): FavoriteItem {
  return {
    source: row.source,
    vodId: row.vod_id,
    title: row.title,
    pic: row.pic ?? undefined,
    saveTime: row.save_time,
  };
}

export class D1Storage implements IStorage {
  constructor(private readonly db: D1Database) {}

  // —— 用户 ——

  async getUser(name: string): Promise<StoredUser | null> {
    const row = await this.db
      .prepare('SELECT name, password_hash, salt, iterations, role, status, created_at FROM users WHERE name = ?1')
      .bind(name)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async getUserWithCredentials(name: string): Promise<(StoredUser & UserCredentials) | null> {
    const row = await this.db
      .prepare('SELECT name, password_hash, salt, iterations, role, status, created_at FROM users WHERE name = ?1')
      .bind(name)
      .first<UserRow>();
    if (!row) return null;
    return {
      ...mapUser(row),
      passwordHash: row.password_hash,
      salt: row.salt,
      iterations: row.iterations,
    };
  }

  async createUser(
    name: string,
    credentials: UserCredentials,
    options: { role?: UserRole; status?: UserStatus; registerIp?: string } = {}
  ): Promise<StoredUser> {
    const role = options.role ?? 'user';
    const status = options.status ?? 'pending';
    const createdAt = Date.now();
    await this.db
      .prepare(
        'INSERT INTO users (name, password_hash, salt, iterations, role, status, created_at, register_ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
      )
      .bind(
        name,
        credentials.passwordHash,
        credentials.salt,
        credentials.iterations,
        role,
        status,
        createdAt,
        options.registerIp ?? null
      )
      .run();
    return { name, role, status, createdAt };
  }

  async updateUserStatus(name: string, status: UserStatus): Promise<boolean> {
    const res = await this.db
      .prepare('UPDATE users SET status = ?2 WHERE name = ?1')
      .bind(name, status)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async updateUserPassword(name: string, credentials: UserCredentials): Promise<boolean> {
    const res = await this.db
      .prepare('UPDATE users SET password_hash = ?2, salt = ?3, iterations = ?4 WHERE name = ?1')
      .bind(name, credentials.passwordHash, credentials.salt, credentials.iterations)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async deleteUser(name: string): Promise<boolean> {
    // 关联数据一并清理（播放记录/收藏/搜索历史/跳过配置），批处理内同事务
    await this.db.batch([
      this.db.prepare('DELETE FROM play_records WHERE user_name = ?1').bind(name),
      this.db.prepare('DELETE FROM favorites WHERE user_name = ?1').bind(name),
      this.db.prepare('DELETE FROM search_histories WHERE user_name = ?1').bind(name),
      this.db.prepare('DELETE FROM skip_configs WHERE user_name = ?1').bind(name),
      this.db.prepare('DELETE FROM users WHERE name = ?1').bind(name),
    ]);
    return true;
  }

  async listUsers(): Promise<StoredUser[]> {
    const res = await this.db
      .prepare('SELECT name, password_hash, salt, iterations, role, status, created_at FROM users ORDER BY created_at')
      .all<UserRow>();
    return (res.results ?? []).map(mapUser);
  }

  // —— 播放记录 ——

  async upsertPlayRecord(userName: string, record: Omit<PlayRecord, 'saveTime'>): Promise<PlayRecord> {
    const saveTime = Date.now();
    await this.db
      .prepare(
        `INSERT INTO play_records (user_name, source, vod_id, title, pic, episode_index, total_time, play_time, save_time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT (user_name, source, vod_id) DO UPDATE SET
           title = excluded.title, pic = excluded.pic, episode_index = excluded.episode_index,
           total_time = excluded.total_time, play_time = excluded.play_time, save_time = excluded.save_time`
      )
      .bind(
        userName,
        record.source,
        record.vodId,
        record.title,
        record.pic ?? null,
        record.episodeIndex,
        record.totalTime,
        record.playTime,
        saveTime
      )
      .run();
    return { ...record, saveTime };
  }

  async listPlayRecords(userName: string, limit = 100): Promise<PlayRecord[]> {
    const res = await this.db
      .prepare(
        'SELECT source, vod_id, title, pic, episode_index, total_time, play_time, save_time FROM play_records WHERE user_name = ?1 ORDER BY save_time DESC LIMIT ?2'
      )
      .bind(userName, limit)
      .all<PlayRecordRow>();
    return (res.results ?? []).map(mapPlayRecord);
  }

  async deletePlayRecord(userName: string, source: string, vodId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM play_records WHERE user_name = ?1 AND source = ?2 AND vod_id = ?3')
      .bind(userName, source, vodId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async clearPlayRecords(userName: string): Promise<void> {
    await this.db.prepare('DELETE FROM play_records WHERE user_name = ?1').bind(userName).run();
  }

  // —— 收藏 ——

  async addFavorite(userName: string, item: Omit<FavoriteItem, 'saveTime'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO favorites (user_name, source, vod_id, title, pic, save_time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (user_name, source, vod_id) DO UPDATE SET
           title = excluded.title, pic = excluded.pic, save_time = excluded.save_time`
      )
      .bind(userName, item.source, item.vodId, item.title, item.pic ?? null, Date.now())
      .run();
  }

  async removeFavorite(userName: string, source: string, vodId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM favorites WHERE user_name = ?1 AND source = ?2 AND vod_id = ?3')
      .bind(userName, source, vodId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async listFavorites(userName: string, limit = 100): Promise<FavoriteItem[]> {
    const res = await this.db
      .prepare(
        'SELECT source, vod_id, title, pic, save_time FROM favorites WHERE user_name = ?1 ORDER BY save_time DESC LIMIT ?2'
      )
      .bind(userName, limit)
      .all<FavoriteRow>();
    return (res.results ?? []).map(mapFavorite);
  }

  // —— 搜索历史 ——

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const now = Date.now();
    // 同关键词去重（重搜移到最新）+ 每用户条数上限，批处理内同事务执行
    await this.db.batch([
      this.db
        .prepare('DELETE FROM search_histories WHERE user_name = ?1 AND keyword = ?2')
        .bind(userName, keyword),
      this.db
        .prepare('INSERT INTO search_histories (user_name, keyword, created_at) VALUES (?1, ?2, ?3)')
        .bind(userName, keyword, now),
      this.db
        .prepare(
          `DELETE FROM search_histories WHERE user_name = ?1 AND id NOT IN (
             SELECT id FROM search_histories WHERE user_name = ?1 ORDER BY id DESC LIMIT ?2
           )`
        )
        .bind(userName, SEARCH_HISTORY_LIMIT),
    ]);
  }

  async listSearchHistory(userName: string, limit = SEARCH_HISTORY_LIMIT): Promise<SearchHistoryItem[]> {
    const res = await this.db
      .prepare('SELECT keyword, created_at FROM search_histories WHERE user_name = ?1 ORDER BY id DESC LIMIT ?2')
      .bind(userName, limit)
      .all<SearchHistoryRow>();
    return (res.results ?? []).map((row) => ({ keyword: row.keyword, createdAt: row.created_at }));
  }

  async removeSearchHistory(userName: string, keyword: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM search_histories WHERE user_name = ?1 AND keyword = ?2')
      .bind(userName, keyword)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async clearSearchHistory(userName: string): Promise<void> {
    await this.db.prepare('DELETE FROM search_histories WHERE user_name = ?1').bind(userName).run();
  }

  // —— 跳过片头片尾 ——

  async getSkipConfig(userName: string, source: string, vodId: string): Promise<SkipConfig | null> {
    const row = await this.db
      .prepare(
        'SELECT intro_start, intro_end, outro_start, outro_end FROM skip_configs WHERE user_name = ?1 AND source = ?2 AND vod_id = ?3'
      )
      .bind(userName, source, vodId)
      .first<SkipConfigRow>();
    if (!row) return null;
    return {
      introStart: row.intro_start,
      introEnd: row.intro_end,
      outroStart: row.outro_start,
      outroEnd: row.outro_end,
    };
  }

  async saveSkipConfig(userName: string, source: string, vodId: string, config: SkipConfig): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO skip_configs (user_name, source, vod_id, intro_start, intro_end, outro_start, outro_end)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (user_name, source, vod_id) DO UPDATE SET
           intro_start = excluded.intro_start, intro_end = excluded.intro_end,
           outro_start = excluded.outro_start, outro_end = excluded.outro_end`
      )
      .bind(userName, source, vodId, config.introStart, config.introEnd, config.outroStart, config.outroEnd)
      .run();
  }

  // —— 站点配置 ——

  async getSiteConfig(): Promise<SiteConfig> {
    const row = await this.db
      .prepare('SELECT config_json FROM admin_configs WHERE id = 1')
      .first<{ config_json: string }>();
    if (!row) return { ...DEFAULT_SITE_CONFIG };
    try {
      const parsed = JSON.parse(row.config_json) as Partial<SiteConfig>;
      // 浅合并默认值：新增配置键对存量行自动生效
      return { ...DEFAULT_SITE_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_SITE_CONFIG };
    }
  }

  async saveSiteConfig(patch: Partial<SiteConfig>): Promise<SiteConfig> {
    // json_patch 在库内完成读改写合并，避免并发丢失更新
    await this.db
      .prepare('UPDATE admin_configs SET config_json = json_patch(config_json, ?1), updated_at = ?2 WHERE id = 1')
      .bind(JSON.stringify(patch), Date.now())
      .run();
    return this.getSiteConfig();
  }

  // —— 数据源管理（M4 后台） ——

  async listApiSources(): Promise<ApiSourceRecord[]> {
    const res = await this.db
      .prepare('SELECT key, name, api_url, detail_url, is_adult, weight, enabled FROM api_sources ORDER BY weight DESC, key')
      .all<ApiSourceRow>();
    return (res.results ?? []).map(mapApiSource);
  }

  async createApiSource(input: ApiSourceInput): Promise<ApiSourceRecord> {
    const record: ApiSourceRecord = {
      key: generateSourceKey(),
      name: input.name,
      apiUrl: input.apiUrl,
      detailUrl: input.detailUrl,
      isAdult: input.isAdult === true,
      weight: input.weight ?? 0,
      enabled: true,
    };
    await this.db
      .prepare('INSERT INTO api_sources (key, name, api_url, detail_url, is_adult, weight, enabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(record.key, record.name, record.apiUrl, record.detailUrl ?? null, record.isAdult ? 1 : 0, record.weight, 1)
      .run();
    return record;
  }

  async updateApiSource(key: string, patch: ApiSourcePatch): Promise<ApiSourceRecord | null> {
    const current = (await this.db
      .prepare('SELECT key, name, api_url, detail_url, is_adult, weight, enabled FROM api_sources WHERE key = ?1')
      .bind(key)
      .first<ApiSourceRow>());
    if (!current) return null;
    const next = mapApiSource(current);
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.apiUrl !== undefined) next.apiUrl = patch.apiUrl;
    if (patch.detailUrl !== undefined) next.detailUrl = patch.detailUrl;
    if (patch.isAdult !== undefined) next.isAdult = patch.isAdult;
    if (patch.weight !== undefined) next.weight = patch.weight;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    await this.db
      .prepare('UPDATE api_sources SET name = ?2, api_url = ?3, detail_url = ?4, is_adult = ?5, weight = ?6, enabled = ?7 WHERE key = ?1')
      .bind(key, next.name, next.apiUrl, next.detailUrl ?? null, next.isAdult ? 1 : 0, next.weight, next.enabled ? 1 : 0)
      .run();
    return next;
  }

  async deleteApiSource(key: string): Promise<boolean> {
    const res = await this.db.prepare('DELETE FROM api_sources WHERE key = ?1').bind(key).run();
    return (res.meta.changes ?? 0) > 0;
  }

  // —— 数据源订阅（M4 后台） ——

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const res = await this.db
      .prepare('SELECT id, url, name, last_synced_at, imported_count FROM subscriptions ORDER BY id DESC')
      .all<SubscriptionRow>();
    return (res.results ?? []).map(mapSubscription);
  }

  async addSubscription(url: string, name?: string, importedCount?: number): Promise<SubscriptionRecord> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO subscriptions (url, name, last_synced_at, imported_count)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (url) DO UPDATE SET name = excluded.name, imported_count = excluded.imported_count`
      )
      .bind(url, name ?? null, now, importedCount ?? null)
      .run();
    const row = await this.db
      .prepare('SELECT id, url, name, last_synced_at, imported_count FROM subscriptions WHERE url = ?1')
      .bind(url)
      .first<SubscriptionRow>();
    return mapSubscription(row as SubscriptionRow);
  }

  async deleteSubscription(id: number): Promise<boolean> {
    const res = await this.db.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async touchSubscription(id: number, importedCount?: number): Promise<void> {
    await this.db
      .prepare('UPDATE subscriptions SET last_synced_at = ?2, imported_count = COALESCE(?3, imported_count) WHERE id = ?1')
      .bind(id, Date.now(), importedCount ?? null)
      .run();
  }

  // —— 后台指标（M6） ——

  async recordSourceOutcome(url: string, ok: boolean, ms: number): Promise<void> {
    const ts = Date.now();
    // hour 桶 + UNIQUE(url, hour)：同小时内后来的采样被 IGNORE，写入量 = 源数 × 24
    await this.db
      .prepare('INSERT INTO source_health (url, hour, ts, ok, ms) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(url, Math.floor(ts / HOUR_MS), ts, ok ? 1 : 0, Math.max(0, Math.round(ms)))
      .run();
  }

  async getSourceHealthSince(sinceTs: number): Promise<SourceHealthSummary[]> {
    const res = await this.db
      .prepare(
        `SELECT url, COUNT(*) AS samples, SUM(ok) AS ok_count, AVG(ms) AS avg_ms
         FROM source_health WHERE ts >= ?1 GROUP BY url`
      )
      .bind(sinceTs)
      .all<{ url: string; samples: number; ok_count: number; avg_ms: number }>();
    return (res.results ?? []).map((row) => ({
      url: row.url,
      samples: row.samples,
      okCount: row.ok_count ?? 0,
      avgMs: Math.round(row.avg_ms ?? 0),
    }));
  }

  async pruneSourceHealth(beforeTs: number): Promise<number> {
    const res = await this.db.prepare('DELETE FROM source_health WHERE ts < ?1').bind(beforeTs).run();
    return res.meta.changes ?? 0;
  }

  async saveSourceCatalog(url: string, entry: { ok: boolean; ms: number; total?: number }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO source_catalog (url, ok, ms, total, probed_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (url) DO UPDATE SET
           ok = excluded.ok, ms = excluded.ms,
           total = COALESCE(excluded.total, source_catalog.total), probed_at = excluded.probed_at`
      )
      .bind(url, entry.ok ? 1 : 0, Math.max(0, Math.round(entry.ms)), entry.total ?? null, Date.now())
      .run();
  }

  async listSourceCatalog(): Promise<SourceCatalogEntry[]> {
    const res = await this.db
      .prepare('SELECT url, ok, ms, total, probed_at FROM source_catalog')
      .all<{ url: string; ok: number | null; ms: number | null; total: number | null; probed_at: number | null }>();
    return (res.results ?? []).map((row) => ({
      url: row.url,
      ok: row.ok === null || row.ok === undefined ? undefined : row.ok === 1,
      ms: row.ms ?? undefined,
      total: row.total ?? undefined,
      probedAt: row.probed_at ?? undefined,
    }));
  }

  async countUsersByStatus(): Promise<UserStatusCounts> {
    const res = await this.db
      .prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status')
      .all<{ status: string; n: number }>();
    const counts: UserStatusCounts = { total: 0, pending: 0, active: 0, disabled: 0 };
    for (const row of res.results ?? []) {
      counts.total += row.n;
      if (row.status === 'pending' || row.status === 'active' || row.status === 'disabled') {
        counts[row.status] += row.n;
      }
    }
    return counts;
  }

  async countUsersCreatedBetween(fromTs: number, toTs: number): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1 AND created_at < ?2')
      .bind(fromTs, toTs)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async countPlaysBetween(fromTs: number, toTs: number): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM play_records WHERE save_time >= ?1 AND save_time < ?2')
      .bind(fromTs, toTs)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async getDailyPlayCounts(sinceTs: number, tzOffsetMs: number): Promise<DailyCount[]> {
    return this.dailyCounts('play_records', 'save_time', sinceTs, tzOffsetMs);
  }

  async getDailySignupCounts(sinceTs: number, tzOffsetMs: number): Promise<DailyCount[]> {
    return this.dailyCounts('users', 'created_at', sinceTs, tzOffsetMs);
  }

  /**
   * 按本地日聚合计数。表名/列名来自本文件内部常量（不接受外部输入），
   * 拼接进 SQL 不构成注入面；?1/?2 仍走 bind。
   */
  private async dailyCounts(
    table: 'play_records' | 'users',
    column: 'save_time' | 'created_at',
    sinceTs: number,
    tzOffsetMs: number
  ): Promise<DailyCount[]> {
    const res = await this.db
      .prepare(
        // D1 把 JS number 绑定成 REAL，'/' 会变浮点除 → 显式截回整数日序号（值恒正，截断即向下取整）
        `SELECT CAST((${column} + ?1) / ?3 AS INTEGER) AS day, COUNT(*) AS n
         FROM ${table} WHERE ${column} >= ?2 GROUP BY day ORDER BY day`
      )
      .bind(tzOffsetMs, sinceTs, DAY_MS)
      .all<{ day: number; n: number }>();
    return (res.results ?? []).map((row) => ({ day: row.day, count: row.n }));
  }

  async listLatestUsers(limit: number): Promise<AdminUserRow[]> {
    const res = await this.db
      .prepare(
        `SELECT rowid AS id, name, role, status, created_at, register_ip
         FROM users ORDER BY created_at DESC LIMIT ?1`
      )
      .bind(limit)
      .all<{ id: number; name: string; role: string; status: string; created_at: number; register_ip: string | null }>();
    return (res.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      role: (row.role === 'admin' ? 'admin' : 'user') as UserRole,
      status: (['pending', 'active', 'disabled'].includes(row.status) ? row.status : 'pending') as UserStatus,
      createdAt: row.created_at,
      registerIp: row.register_ip ?? undefined,
    }));
  }
}

/** 路由层统一入口：从 Cloudflare 绑定取 DB 构造存储实例 */
export async function getStorage(): Promise<D1Storage> {
  const { env } = await getCloudflareContext({ async: true });
  return new D1Storage(env.DB);
}
