-- MyTV：直播源维护（后台增删改，对齐数据源管理模式）
-- env 预置（DEFAULT_LIVE_SOURCES）只读，删除走 SiteConfig.hiddenEnvLiveSources 覆盖层。

CREATE TABLE IF NOT EXISTS live_sources (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL UNIQUE,
  epg        TEXT,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
