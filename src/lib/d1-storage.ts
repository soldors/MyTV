// D1Storage：IStorage 的 Cloudflare D1 实现（M1）。
// 表结构见 migrations/0001_init.sql；绑定经 wrangler 注册、getCloudflareContext().env 访问。

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  DEFAULT_SITE_CONFIG,
  SEARCH_HISTORY_LIMIT,
  type FavoriteItem,
  type IStorage,
  type PlayRecord,
  type SearchHistoryItem,
  type SiteConfig,
  type SkipConfig,
  type StoredUser,
  type UserCredentials,
  type UserRole,
  type UserStatus,
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
    options: { role?: UserRole; status?: UserStatus } = {}
  ): Promise<StoredUser> {
    const role = options.role ?? 'user';
    const status = options.status ?? 'pending';
    const createdAt = Date.now();
    await this.db
      .prepare(
        'INSERT INTO users (name, password_hash, salt, iterations, role, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      )
      .bind(name, credentials.passwordHash, credentials.salt, credentials.iterations, role, status, createdAt)
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
}

/** 路由层统一入口：从 Cloudflare 绑定取 DB 构造存储实例 */
export async function getStorage(): Promise<D1Storage> {
  const { env } = await getCloudflareContext({ async: true });
  return new D1Storage(env.DB);
}
