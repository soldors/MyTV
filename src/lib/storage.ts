// 存储抽象层（M1）：接口语义对照 LunaTV 的 IStorage（用户/播放记录/收藏/搜索历史/
// 跳过片头片尾/管理员配置），仅借鉴语义不复制代码（其协议 CC BY-NC-SA，见 docs/01 §10）。
// 实现见 lib/d1-storage.ts（Cloudflare D1）；设计基线 docs/01 §5 的 7 张表。
// 领域实体类型（PlayRecord/FavoriteItem/…）定义在 lib/types.ts，供前后台共用。

import type {
  FavoriteItem,
  PlayRecord,
  SearchHistoryItem,
  SiteConfig,
  SkipConfig,
} from './types';

export type { FavoriteItem, PlayRecord, SearchHistoryItem, SiteConfig, SkipConfig };

export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'disabled';

export interface StoredUser {
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
}

/** 建用户所需的凭证材料（哈希由 lib/password.ts 生成，与验证参数一同随行存储） */
export interface UserCredentials {
  passwordHash: string;
  salt: string;
  iterations: number;
}

// —— 后台管理（M4）——

/** D1 api_sources 表的数据源记录（前台合并出口见 /api/sources） */
export interface ApiSourceRecord {
  key: string;
  name: string;
  apiUrl: string;
  detailUrl?: string;
  isAdult: boolean;
  weight: number;
  enabled: boolean;
}

/** 数据源订阅（TVBox / SourceList URL，导入动作由 admin API 驱动） */
export interface SubscriptionRecord {
  id: number;
  url: string;
  name?: string;
  lastSyncedAt?: number;
}

export interface ApiSourceInput {
  name: string;
  apiUrl: string;
  detailUrl?: string;
  isAdult?: boolean;
  weight?: number;
}

export type ApiSourcePatch = Partial<Pick<ApiSourceRecord, 'name' | 'apiUrl' | 'detailUrl' | 'isAdult' | 'weight' | 'enabled'>>;

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  registrationEnabled: true,
  registrationApproval: true,
  adultFilterEnabled: true,
};

/** 每用户搜索历史保留条数上限 */
export const SEARCH_HISTORY_LIMIT = 20;

/** 数据库中不存在的可选字段的统一空值形态（SQLite 无 NULL 与 undefined 之分） */
export type Maybe<T> = T | undefined;

export interface IStorage {
  // —— 用户 ——
  getUser(name: string): Promise<StoredUser | null>;
  /** 登录校验用：用户 + 凭证材料 */
  getUserWithCredentials(name: string): Promise<(StoredUser & UserCredentials) | null>;
  createUser(
    name: string,
    credentials: UserCredentials,
    options?: { role?: UserRole; status?: UserStatus }
  ): Promise<StoredUser>;
  updateUserStatus(name: string, status: UserStatus): Promise<boolean>;
  /** 管理员重置用户密码 */
  updateUserPassword(name: string, credentials: UserCredentials): Promise<boolean>;
  deleteUser(name: string): Promise<boolean>;
  listUsers(): Promise<StoredUser[]>;

  // —— 播放记录 ——
  upsertPlayRecord(userName: string, record: Omit<PlayRecord, 'saveTime'>): Promise<PlayRecord>;
  listPlayRecords(userName: string, limit?: number): Promise<PlayRecord[]>;
  deletePlayRecord(userName: string, source: string, vodId: string): Promise<boolean>;
  clearPlayRecords(userName: string): Promise<void>;

  // —— 收藏 ——
  addFavorite(userName: string, item: Omit<FavoriteItem, 'saveTime'>): Promise<void>;
  removeFavorite(userName: string, source: string, vodId: string): Promise<boolean>;
  listFavorites(userName: string, limit?: number): Promise<FavoriteItem[]>;

  // —— 搜索历史 ——
  addSearchHistory(userName: string, keyword: string): Promise<void>;
  listSearchHistory(userName: string, limit?: number): Promise<SearchHistoryItem[]>;
  removeSearchHistory(userName: string, keyword: string): Promise<boolean>;
  clearSearchHistory(userName: string): Promise<void>;

  // —— 跳过片头片尾 ——
  getSkipConfig(userName: string, source: string, vodId: string): Promise<SkipConfig | null>;
  saveSkipConfig(userName: string, source: string, vodId: string, config: SkipConfig): Promise<void>;

  // —— 站点配置 ——
  getSiteConfig(): Promise<SiteConfig>;
  saveSiteConfig(patch: Partial<SiteConfig>): Promise<SiteConfig>;

  // —— 数据源管理（M4 后台） ——
  listApiSources(): Promise<ApiSourceRecord[]>;
  createApiSource(input: ApiSourceInput): Promise<ApiSourceRecord>;
  updateApiSource(key: string, patch: ApiSourcePatch): Promise<ApiSourceRecord | null>;
  deleteApiSource(key: string): Promise<boolean>;

  // —— 数据源订阅（M4 后台） ——
  listSubscriptions(): Promise<SubscriptionRecord[]>;
  addSubscription(url: string, name?: string): Promise<SubscriptionRecord>;
  deleteSubscription(id: number): Promise<boolean>;
  /** 记录一次成功同步时间 */
  touchSubscription(id: number): Promise<void>;
}
