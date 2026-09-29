-- MyTV M4：数据源订阅表（TVBox / SourceList 订阅 URL 持久化，后台管理与手动刷新）

CREATE TABLE IF NOT EXISTS subscriptions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  url            TEXT NOT NULL UNIQUE,
  name           TEXT,
  last_synced_at INTEGER
);
