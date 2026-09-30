-- MyTV：用户密码重置申请（忘记密码 → 站长审批 → 重置码重置）
-- 一次审批对应一个一次性重置码（仅存 PBKDF2 哈希，明文只在批准响应里出现一次）。

CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL,
  -- pending：待站长审批 | approved：已批准（code 已生成）| rejected：已拒绝 | used：已完成重置
  status      TEXT NOT NULL DEFAULT 'pending',
  code_hash   TEXT,
  expires_at  INTEGER,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  used_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_password_resets_username ON password_resets (username, status);
