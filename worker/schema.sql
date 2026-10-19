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

-- ============ Thế Giới Của Ae (app three.js voxel) ============
-- Mỗi thành viên một lô đất; khối xây lưu theo từng ô.
CREATE TABLE IF NOT EXISTS world_members (
  user_id    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  username   TEXT    NOT NULL DEFAULT '',
  photo      TEXT    NOT NULL DEFAULT '',
  hue        INTEGER NOT NULL DEFAULT 0,     -- màu riêng, tính từ user id
  plot       INTEGER NOT NULL DEFAULT -1,    -- thứ tự lô đất trong lưới
  first_seen INTEGER NOT NULL DEFAULT 0,
  last_seen  INTEGER NOT NULL DEFAULT 0,
  visits     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS world_blocks (
  user_id INTEGER NOT NULL,
  x       INTEGER NOT NULL,
  y       INTEGER NOT NULL,
  z       INTEGER NOT NULL,
  t       TEXT    NOT NULL DEFAULT 'grass',
  at      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, x, y, z)
);

CREATE INDEX IF NOT EXISTS idx_world_blocks_user ON world_blocks (user_id);

-- khối nào thuộc cùng một vật thể (do một prompt tạo ra) thì cùng số obj
-- (đã thêm bằng ALTER TABLE; ghi ở đây cho ai dựng lại từ đầu)
-- obj INTEGER NOT NULL DEFAULT 0

CREATE TABLE IF NOT EXISTS world_chat (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name    TEXT    NOT NULL DEFAULT '',
  hue     INTEGER NOT NULL DEFAULT 0,
  text    TEXT    NOT NULL,
  at      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_world_chat_at ON world_chat (at);

-- Hai cá thể của thế giới: vị trí THẬT, dùng chung cho cả nhóm.
CREATE TABLE IF NOT EXISTS world_bots (
  bot_id     TEXT PRIMARY KEY,                 -- 'hermes' | 'zerobot'
  name       TEXT    NOT NULL DEFAULT '',
  x          REAL    NOT NULL DEFAULT 24,      -- điểm neo của chặng đang đi
  z          REAL    NOT NULL DEFAULT 40,
  yaw        REAL    NOT NULL DEFAULT 0,       -- radian, atan2(dx, dz)
  tx         REAL    NOT NULL DEFAULT 24,      -- đích của chặng
  tz         REAL    NOT NULL DEFAULT 40,
  mode       TEXT    NOT NULL DEFAULT 'walk',  -- 'walk' | 'rest'
  legs       INTEGER NOT NULL DEFAULT 0,       -- số chặng đã đi trong vòng này (0..6)
  leg_at     INTEGER NOT NULL DEFAULT 0,       -- mốc thời gian thực (ms) bắt đầu chặng
  rest_until INTEGER NOT NULL DEFAULT 0,       -- ms, nghỉ xong lúc nào
  say        TEXT    NOT NULL DEFAULT '',      -- câu đang nói, rỗng = không nói
  say_until  INTEGER NOT NULL DEFAULT 0,       -- ms, quá hạn thì xoá `say`
  ticked_at  INTEGER NOT NULL DEFAULT 0,       -- ms lần cuối máy chủ nhích trạng thái
  working    INTEGER NOT NULL DEFAULT 0,       -- 1 = đang làm việc (ngồi gõ máy tính)
  working_at INTEGER NOT NULL DEFAULT 0,       -- ms mốc cập nhật cờ làm việc
  agy_working INTEGER NOT NULL DEFAULT 0       -- 1 = agy đang làm việc (lưu ở bản ghi hermes)
);

-- ============ Ao Cá Của Ae (nuôi cá chung, kiểu Insaniquarium free-play) ============
-- Một ao chung cho cả nhóm: ai cũng cho ăn được cá của người khác.
-- Kích thước cá suy ra từ `fed` (số lần ăn), coin đẻ ra suy ra từ `last_pay` —
-- KHÔNG ghi DB theo nhịp, chỉ ghi khi có người cho ăn / thu tiền / mua cá.
CREATE TABLE IF NOT EXISTS fish (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  owner    TEXT    NOT NULL DEFAULT '',       -- tên chủ, để hiện trên nhãn
  kind     TEXT    NOT NULL DEFAULT 'guppy',  -- guppy | gold | angel
  name     TEXT    NOT NULL DEFAULT '',       -- tên riêng của cá
  fed      INTEGER NOT NULL DEFAULT 0,        -- số lần đã ăn (q: ai cho ăn không lưu)
  born_at  INTEGER NOT NULL DEFAULT 0,        -- ms
  fed_at   INTEGER NOT NULL DEFAULT 0,        -- ms lần ăn gần nhất (chặn cho ăn liên tục)
  last_pay INTEGER NOT NULL DEFAULT 0,        -- ms mốc thu tiền gần nhất
  alive    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_fish_owner ON fish (owner_id);
CREATE INDEX IF NOT EXISTS idx_fish_alive ON fish (alive, id);

-- Ví + thành tích của từng thành viên trong ao.
CREATE TABLE IF NOT EXISTS keepers (
  user_id INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL DEFAULT '',
  coins   INTEGER NOT NULL DEFAULT 0,         -- coin đang giữ
  earned  INTEGER NOT NULL DEFAULT 0,         -- tổng coin đã thu (điểm xếp hạng)
  fed     INTEGER NOT NULL DEFAULT 0,         -- số lần cho ăn (kể cả cá người khác)
  fishes  INTEGER NOT NULL DEFAULT 0,         -- số cá đang sở hữu
  granted INTEGER NOT NULL DEFAULT 0,         -- 1 = đã nhận cá tặng đầu tiên
  seen    INTEGER NOT NULL DEFAULT 0          -- ms lần cuối mở app
);
