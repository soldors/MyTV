-- MyTV M1：初始建表（对照 docs/01-总体设计方案.md §5 的 DDL 草案）
-- 两处对草案的细化：
--   1. users 增加 status（pending/active/disabled，注册需审批 #9）与 iterations（PBKDF2 参数可升级）
--   2. play_records 的 index 列改名 episode_index（INDEX 为 SQLite 保留字）

CREATE TABLE IF NOT EXISTS users (
  name           TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL,
  salt           TEXT NOT NULL,
  iterations     INTEGER NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',      -- user | admin
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | active | disabled
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS play_records (
  user_name   TEXT NOT NULL,
  source      TEXT NOT NULL,
  vod_id      TEXT NOT NULL,
  title       TEXT NOT NULL,
  pic         TEXT,
  episode_index INTEGER NOT NULL DEFAULT 0,
  total_time  REAL NOT NULL DEFAULT 0,
  play_time   REAL NOT NULL DEFAULT 0,
  save_time   INTEGER NOT NULL,
  PRIMARY KEY (user_name, source, vod_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_name  TEXT NOT NULL,
  source     TEXT NOT NULL,
  vod_id     TEXT NOT NULL,
  title      TEXT NOT NULL,
  pic        TEXT,
  save_time  INTEGER NOT NULL,
  PRIMARY KEY (user_name, source, vod_id)
);

CREATE TABLE IF NOT EXISTS search_histories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name   TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_histories_user ON search_histories (user_name, id);

CREATE TABLE IF NOT EXISTS skip_configs (
  user_name   TEXT NOT NULL,
  source      TEXT NOT NULL,
  vod_id      TEXT NOT NULL,
  intro_start REAL NOT NULL DEFAULT 0,
  intro_end   REAL NOT NULL DEFAULT 0,
  outro_start REAL NOT NULL DEFAULT 0,
  outro_end   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_name, source, vod_id)
);

-- M4 后台「数据源管理」使用的源表（M1 先建好，避免后续重复迁移）
CREATE TABLE IF NOT EXISTS api_sources (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  api_url    TEXT NOT NULL,
  detail_url TEXT,
  is_adult   INTEGER NOT NULL DEFAULT 0,
  weight     INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1
);

-- 站点级配置单行表；config_json 里的键由 src/lib/storage.ts 的 SiteConfig 定义
CREATE TABLE IF NOT EXISTS admin_configs (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
INSERT OR IGNORE INTO admin_configs (id, config_json, updated_at)
VALUES (1, '{}', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
