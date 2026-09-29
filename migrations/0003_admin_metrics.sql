-- MyTV M6 后台二期：真实指标持久化（对照 docs/09-后台二期提案.md §3 D2/D4/D6）
-- 设计要点：
--   1. 健康流水按「每源每小时一行」落库——UNIQUE(url, hour) 让 D1 自己保证去重，
--      跨 isolate 同样成立（内存门控只是省一次写请求的优化，见 lib/source-health.ts）。
--   2. 探活结果与收录量单独一张 source_catalog（按 url 索引），
--      这样 env 预置源（DEFAULT_SOURCES，不在 api_sources 里）也能有状态点与收录合计。
--   3. 全部为可空增列，存量行不受影响；旧行在后台显示「—」而不是 0。

-- 源健康流水：ok=1 成功 / 0 失败；ms 为整源耗时；hour = ts / 3600000（小时桶）
CREATE TABLE IF NOT EXISTS source_health (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  url   TEXT NOT NULL,
  hour  INTEGER NOT NULL,
  ts    INTEGER NOT NULL,
  ok    INTEGER NOT NULL,
  ms    INTEGER NOT NULL,
  UNIQUE (url, hour) ON CONFLICT IGNORE
);
CREATE INDEX IF NOT EXISTS idx_source_health_ts ON source_health (ts);

-- 最近一次探活快照 + 该源收录影片总数（CMS 响应 total 字段）
CREATE TABLE IF NOT EXISTS source_catalog (
  url       TEXT PRIMARY KEY,
  ok        INTEGER,
  ms        INTEGER,
  total     INTEGER,
  probed_at INTEGER
);

-- 注册来源 IP（D4：历史行为 NULL，后台显示「—」）
ALTER TABLE users ADD COLUMN register_ip TEXT;

-- 订阅最近一次导入的源数量（图上「导入源数」列）
ALTER TABLE subscriptions ADD COLUMN imported_count INTEGER;
