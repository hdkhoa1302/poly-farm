-- games-hub-api — schema D1
-- Chạy: wrangler d1 execute games-hub --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS digests (
  n          INTEGER PRIMARY KEY,
  title      TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL,
  from_ts    INTEGER NOT NULL DEFAULT 0,
  to_ts      INTEGER NOT NULL DEFAULT 0,
  msg_count  INTEGER NOT NULL DEFAULT 0,
  chat_title TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

-- Danh sách thành viên được xem Sổ Tay. Chỉ nhận khi Worker đã xác minh
-- chữ ký initData của Telegram — không phải danh sách do client tự khai.
CREATE TABLE IF NOT EXISTS members (
  user_id  INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  app_id     TEXT    NOT NULL,
  player_id  TEXT    NOT NULL,
  name       TEXT    NOT NULL DEFAULT '',
  username   TEXT    NOT NULL DEFAULT '',
  photo      TEXT    NOT NULL DEFAULT '',
  score      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_app ON scores (app_id, score DESC);

-- chủ sở hữu: luôn có quyền đọc sổ tay
INSERT OR IGNORE INTO members (user_id, name, added_at) VALUES (780469718, 'owner', 0);
