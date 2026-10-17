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
  created_at INTEGER NOT NULL DEFAULT 0,
  -- 1 = kỳ do thành viên bấm "Lấy ngay" (không chờ đủ ngưỡng)
  manual     INTEGER NOT NULL DEFAULT 0
);

-- Danh sách thành viên được xem Sổ Tay. Chỉ nhận khi Worker đã xác minh
-- chữ ký initData của Telegram — không phải danh sách do client tự khai.
CREATE TABLE IF NOT EXISTS members (
  user_id  INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL DEFAULT 0
);

-- Hàng đợi yêu cầu "lấy ngay" từ app.
--   • pending  : app vừa xin, cron ở máy sẽ nhặt và chạy
--   • done     : đã tạo kỳ thành công (digest_n = số kỳ)
--   • rejected : không tạo (quá ít tin mới, hoặc lỗi)
-- Dùng để CHẶN lạm dụng: cooldown + trần số kỳ chủ động mỗi ngày.
CREATE TABLE IF NOT EXISTS requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',
  reason      TEXT    NOT NULL DEFAULT '',
  digest_n    INTEGER,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status, created_at DESC);

-- App bị CHỦ SỞ HỮU xoá khỏi Hub (xoá mềm: Hub tự lọc, còn khôi phục được).
CREATE TABLE IF NOT EXISTS deleted_apps (
  app_id     TEXT    PRIMARY KEY,
  deleted_at INTEGER NOT NULL DEFAULT 0,
  deleted_by INTEGER NOT NULL DEFAULT 0
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
