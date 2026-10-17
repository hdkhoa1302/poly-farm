/**
 * games-hub-api — Cloudflare Worker
 * ---------------------------------------------------------------
 * Thay cho việc gọi thẳng Firestore từ trình duyệt, để:
 *   1) KHÔNG còn API key nào trong repo công khai (đóng cảnh báo GitHub)
 *   2) Sổ Tay Nhóm đọc được dữ liệu riêng tư mà vẫn thật sự riêng tư:
 *      Worker tự xác minh chữ ký initData của Telegram (HMAC-SHA256),
 *      rồi mới trả dữ liệu — Firestore rules không làm được việc này.
 *
 * Storage: D1 (SQLite) — xem schema.sql
 * Secrets: TELEGRAM_BOT_TOKEN, INGEST_SECRET
 * Vars:    GROUP_ID
 *
 * Endpoint:
 *   GET  /health
 *   POST /ingest                 (header X-Ingest-Secret) — writer đẩy 1 kỳ
 *   POST /resolve                (header X-Ingest-Secret) — chốt yêu cầu chủ động
 *   GET  /digests?initData=…&limit=10&offset=0 -> {digests,total,hasMore}
 *   GET  /digest/:n?initData=…   -> {n,title,body,from,to,msgs,manual}
 *   POST /request                (body JSON có initData) — xin lấy ngay 1 kỳ
 *   GET  /request?initData=…     -> trạng thái + có được xin hay không
 *   GET  /lb/:appId              -> [{name,username,photo,score,pid}]
 *   POST /lb/:appId              (body JSON có initData) -> upsert điểm
 *   GET  /apps                   -> {deleted:[appId…]}  (công khai: hub đọc trước khi đăng nhập)
 *   POST /apps/delete            (body initData + id)   -> chỉ OWNER_ID
 *   POST /apps/restore           (body initData + id)   -> chỉ OWNER_ID
 *   GET  /world                  -> cả thế giới (công khai: ai cũng xem được)
 *   POST /world/join             (body initData, x?, z?) -> ghi danh + nhịp sống + vị trí
 *   POST /world/block            (body initData + x,y,z + t|null) -> xây/xoá 1 khối
 *   POST /world/blocks           (body initData + blocks[] + obj?) -> xây 1 VẬT THỂ
 *   POST /world/move             (body initData + take[] + put[])  -> DI DỜI vật thể
 *   POST /world/look             (body initData + look)           -> lưu ngoại hình
 *   GET  /world/chat             (initData, since?)  -> tin nhắn trong game
 *   POST /world/chat             (body initData + text) -> gửi tin
 *   GET  /world/live             -> BẢN NHẸ: vị trí mọi người + số hiệu khối,
 *                                   để app hỏi mỗi ~1 giây (realtime)
 *
 * "Lấy ngay" không thể chạy ngay tại Worker: nguồn log nằm ở máy (state.db),
 * nên Worker chỉ GHI YÊU CẦU vào hàng đợi; cron ở máy nhặt rồi chạy.
 * Vì vậy phải có trần: cooldown, số kỳ/ngày, và không nhận chồng yêu cầu —
 * nếu không, bấm liên tục sẽ đẻ ra hàng loạt kỳ rác trong sổ.
 */

const CORS_METHODS = 'GET,POST,OPTIONS';
const CORS_HEADERS = 'Content-Type,X-Ingest-Secret';

/* Trần cho "lấy ngay" — chỉnh ở đây, app tự đọc qua GET /request */
const COOLDOWN_SEC = 600;        // cách nhau tối thiểu 10 phút
const MAX_MANUAL_PER_DAY = 6;    // tối đa 6 kỳ chủ động mỗi ngày (UTC)
const MIN_MANUAL_MSGS = 3;       // dưới mức này coi như chưa có gì để ghi

/* --- Thế Giới Của Ae: hình học phải KHỚP với app (the-gioi/index.html) --- */
const PLOT = 8;                  // lô đất mỗi cạnh bao nhiêu ô
const PLOT_COLS = 6;             // mấy lô trên một hàng
const MAX_Y = 12;                // xây cao tối đa
const MAX_BLOCKS = 1000;          // trần số khối mỗi người
const SLEEP_SEC = 120;           // quá 2 phút không thấy nhịp sống = đang ngủ
const BLOCK_TYPES = ['grass', 'dirt', 'stone', 'wood', 'brick', 'sand', 'leaf', 'glass', 'plaster', 'iron'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': CORS_METHODS,
      'Access-Control-Allow-Headers': CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      const res = await route(request, url, env);
      return addCors(res, cors);
    } catch (e) {
      return addCors(json({ error: String((e && e.message) || e) }, 500), cors);
    }
  },
};

function addCors(res, cors) {
  const h = new Headers(res.headers);
  for (const k in cors) h.set(k, cors[k]);
  return new Response(res.body, { status: res.status, headers: h });
}
/* Mọi response đều cấm cache. /world/live được hỏi ~1 giây/lần; nếu thiếu
   Cache-Control thì trình duyệt tự suy ra được phép cache và app cứ nhận dữ
   liệu cũ dù hỏi liên tục — đúng triệu chứng "không cập nhật realtime". */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
}

async function route(request, url, env) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/health') return json({ ok: true, ts: Date.now() });

  if (p === '/ingest' && request.method === 'POST') return ingest(request, env);

  if (p === '/resolve' && request.method === 'POST') return resolveRequest(request, env);

  if (p === '/request') {
    return request.method === 'POST' ? askForDigest(request, env) : requestState(request, url, env);
  }

  if (p === '/apps') return listDeleted(env);
  if (p === '/apps/delete' && request.method === 'POST') return deleteApp(request, env);
  if (p === '/apps/restore' && request.method === 'POST') return restoreApp(request, env);

  if (p === '/world' && request.method === 'GET') return worldState(env);
  if (p === '/world/live' && request.method === 'GET') return worldLive(env);
  if (p === '/world/chat' && request.method === 'GET') return worldChatList(request, url, env);
  if (p === '/world/chat' && request.method === 'POST') return worldChatSend(request, env);
  if (p === '/world/join' && request.method === 'POST') return worldJoin(request, env);
  if (p === '/world/block' && request.method === 'POST') return worldBlock(request, env);
  if (p === '/world/blocks' && request.method === 'POST') return worldBlocks(request, env);
  if (p === '/world/move' && request.method === 'POST') return worldMove(request, env);
  if (p === '/world/look' && request.method === 'POST') return worldLook(request, env);

  if (p === '/digests') return listDigests(request, url, env);

  const mDigest = p.match(/^\/digest\/(\d+)$/);
  if (mDigest) return oneDigest(request, url, env, +mDigest[1]);

  const mLb = p.match(/^\/lb\/([A-Za-z0-9_-]{1,40})$/);
  if (mLb) {
    return request.method === 'POST'
      ? submitScore(request, env, mLb[1])
      : topScores(env, mLb[1]);
  }

  return json({ error: 'not found' }, 404);
}

/* ------------------------------------------------------------------ auth */
async function hmac(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, msgBytes);
}
const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Xác minh initData do Telegram ký. Trả về {user, chat} hoặc null.
 * Telegram: secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *           hash   = HMAC_SHA256(key=secret, msg=data_check_string)
 */
async function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dcs = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const enc = new TextEncoder();
  const secret = await hmac(enc.encode('WebAppData'), enc.encode(botToken));
  const sig = await hmac(secret, enc.encode(dcs));
  if (toHex(sig) !== hash) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return { expired: true };

  const parse = (k) => {
    try { return JSON.parse(params.get(k) || 'null'); } catch { return null; }
  };
  return { user: parse('user'), chat: parse('chat') };
}

/** Danh tính người gọi + quyền xem sổ tay. */
async function authorize(request, url, env) {
  const initData = url.searchParams.get('initData')
    || request.headers.get('X-Init-Data') || '';
  const v = await verifyInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!v) return { ok: false, why: 'bad-signature' };
  if (v.expired) return { ok: false, why: 'expired' };

  const uid = v.user && v.user.id;
  const inGroup = v.chat && String(v.chat.id) === String(env.GROUP_ID);
  if (inGroup) return { ok: true, user: v.user, chat: v.chat, via: 'chat' };

  if (uid) {
    const row = await env.DB
      .prepare('SELECT user_id FROM members WHERE user_id = ?').bind(uid).first();
    if (row) return { ok: true, user: v.user, chat: v.chat, via: 'member' };
  }
  return { ok: false, why: 'not-member', user: v.user };
}

/* --------------------------------------------------------------- ingest */
async function ingest(request, env) {
  if (!env.INGEST_SECRET) return json({ error: 'ingest disabled' }, 503);
  if (request.headers.get('X-Ingest-Secret') !== env.INGEST_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  const b = await request.json();
  const n = Number(b.n);
  if (!Number.isInteger(n) || n < 1) return json({ error: 'bad n' }, 400);
  const title = String(b.title || '').slice(0, 200);
  const body = String(b.body || '');
  if (!body) return json({ error: 'empty body' }, 400);

  const nowSec = Math.floor(Date.now() / 1000);

  // Kỳ này có phải do thành viên bấm "Lấy ngay" không? Nếu có thì đánh dấu
  // manual và chốt luôn yêu cầu đang chờ (để app biết đã xong).
  const pend = await env.DB.prepare(
    `SELECT id FROM requests WHERE status='pending' ORDER BY created_at LIMIT 1`
  ).first();
  const manual = pend ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO digests (n,title,body,from_ts,to_ts,msg_count,chat_title,created_at,manual)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(n) DO UPDATE SET
       title=excluded.title, body=excluded.body, from_ts=excluded.from_ts,
       to_ts=excluded.to_ts, msg_count=excluded.msg_count,
       chat_title=excluded.chat_title, manual=excluded.manual`
  ).bind(
    n, title, body,
    Math.floor(Number(b.from) || 0), Math.floor(Number(b.to) || 0),
    Math.floor(Number(b.msgs) || 0), String(b.chatTitle || '').slice(0, 200),
    nowSec, manual
  ).run();

  if (pend) {
    await env.DB.prepare(
      `UPDATE requests SET status='done', digest_n=?, resolved_at=? WHERE id=?`
    ).bind(n, nowSec, pend.id).run();
  }

  return json({ ok: true, n, manual });
}

/* --------------------------------------------------------------- digest */
async function listDigests(request, url, env) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);

  // Phân trang: app đọc từng đợt để mở nhanh, cuộn tới đâu tải tới đó
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 50);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const { results } = await env.DB.prepare(
    `SELECT n,title,from_ts AS "from",to_ts AS "to",msg_count AS msgs,manual
       FROM digests ORDER BY n DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM digests').first();
  const total = cnt ? cnt.c : (results || []).length;

  return json({
    ok: true, who: publicUser(a.user), digests: results || [],
    total, limit, offset, hasMore: offset + (results || []).length < total,
  });
}

async function oneDigest(request, url, env, n) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);

  const row = await env.DB.prepare(
    `SELECT n,title,body,from_ts AS "from",to_ts AS "to",msg_count AS msgs,manual
       FROM digests WHERE n = ?`
  ).bind(n).first();
  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, digest: row });
}

/* ------------------------------------------------------- lấy ngay 1 kỳ */
/** Trạng thái hàng đợi + có được xin hay không (app đọc để bật/tắt nút). */
async function requestSummary(env) {
  const nowSec = Math.floor(Date.now() / 1000);
  const pend = await env.DB.prepare(
    `SELECT id,created_at,user_id FROM requests WHERE status='pending'
      ORDER BY created_at LIMIT 1`
  ).first();
  const lastDone = await env.DB.prepare(
    `SELECT resolved_at,digest_n FROM requests WHERE status='done'
      ORDER BY resolved_at DESC LIMIT 1`
  ).first();

  const dayStart = nowSec - (nowSec % 86400);          // đầu ngày UTC
  const cnt = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM requests WHERE status='done' AND resolved_at >= ?`
  ).bind(dayStart).first();
  const usedToday = cnt ? cnt.c : 0;

  let canRequest = true, why = '', retryIn = 0;
  if (pend) {
    canRequest = false;
    why = 'pending';
    retryIn = Math.max(0, COOLDOWN_SEC - (nowSec - pend.created_at));
  } else if (lastDone && nowSec - lastDone.resolved_at < COOLDOWN_SEC) {
    canRequest = false;
    why = 'cooldown';
    retryIn = COOLDOWN_SEC - (nowSec - lastDone.resolved_at);
  } else if (usedToday >= MAX_MANUAL_PER_DAY) {
    canRequest = false;
    why = 'daily-limit';
  }

  return {
    pending: !!pend,
    pendingSince: pend ? pend.created_at : null,
    canRequest, why, retryIn,
    cooldownSec: COOLDOWN_SEC,
    maxPerDay: MAX_MANUAL_PER_DAY,
    usedToday,
    minMsgs: MIN_MANUAL_MSGS,
    lastManualN: lastDone ? lastDone.digest_n : null,
  };
}

async function requestState(request, url, env) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);
  return json({ ok: true, state: await requestSummary(env) });
}

async function askForDigest(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v) return json({ error: 'bad-signature' }, 403);
  if (v.expired) return json({ error: 'expired' }, 403);

  const uid = v.user && v.user.id;
  const inGroup = v.chat && String(v.chat.id) === String(env.GROUP_ID);
  let allowed = inGroup;
  if (!allowed && uid) {
    const row = await env.DB
      .prepare('SELECT user_id FROM members WHERE user_id = ?').bind(uid).first();
    allowed = !!row;
  }
  if (!allowed) return json({ error: 'not-member' }, 403);

  const st = await requestSummary(env);
  if (!st.canRequest) {
    // 429 để app phân biệt "chưa được" với lỗi thật
    return json({ error: st.why, state: st }, 429);
  }

  const name = publicUser(v.user).name.slice(0, 64);
  const id = await env.DB.prepare(
    `INSERT INTO requests (user_id,name,created_at,status) VALUES (?,?,?,'pending')`
  ).bind(uid || 0, name, Math.floor(Date.now() / 1000)).run();

  return json({ ok: true, id: id.meta ? id.meta.last_row_id : null,
                state: await requestSummary(env) }, 202);
}

/** Cron ở máy gọi khi KHÔNG tạo được kỳ (quá ít tin…) để gỡ yêu cầu khỏi hàng đợi. */
async function resolveRequest(request, env) {
  if (!env.INGEST_SECRET) return json({ error: 'disabled' }, 503);
  if (request.headers.get('X-Ingest-Secret') !== env.INGEST_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  let b = {};
  try { b = await request.json(); } catch {}
  const status = b.status === 'done' ? 'done' : 'rejected';
  const reason = String(b.reason || '').slice(0, 120);
  const r = await env.DB.prepare(
    `UPDATE requests SET status=?, reason=?, resolved_at=?
      WHERE status='pending'`
  ).bind(status, reason, Math.floor(Date.now() / 1000)).run();
  return json({ ok: true, resolved: r.meta ? r.meta.changes : 0, status, reason });
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || '',
    username: u.username || '',
    photo: u.photo_url || '',
  };
}

/* ---------------------------------------------------------- leaderboard */
async function topScores(env, appId) {
  const { results } = await env.DB.prepare(
    `SELECT player_id AS pid,name,username,photo,score FROM scores
      WHERE app_id = ? ORDER BY score DESC LIMIT 50`
  ).bind(appId).all();
  return json({ ok: true, scores: results || [] });
}

async function submitScore(request, env, appId) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);

  const score = Math.floor(Number(b.score) || 0);
  if (score < 0 || score > 100000000) return json({ error: 'bad score' }, 400);

  const u = v.user;
  const name = ([u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    || u.username || 'Người chơi').slice(0, 64);

  // điểm danh bạ: chỉ ghi đè khi cao hơn
  await env.DB.prepare(
    `INSERT INTO scores (app_id,player_id,name,username,photo,score,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(app_id,player_id) DO UPDATE SET
       name=excluded.name, username=excluded.username, photo=excluded.photo,
       score=MAX(scores.score, excluded.score), updated_at=excluded.updated_at`
  ).bind(
    appId, 'tg_' + u.id, name, u.username || '', u.photo_url || '',
    score, Math.floor(Date.now() / 1000)
  ).run();

  const row = await env.DB.prepare(
    'SELECT score FROM scores WHERE app_id = ? AND player_id = ?'
  ).bind(appId, 'tg_' + u.id).first();

  return json({ ok: true, best: row ? row.score : score, isRecord: row && row.score === score });
}

/* --------------------------------------------------------- quản lý app */
/**
 * Xoá app khỏi Hub cho MỌI người (chỉ chủ sở hữu). Xoá MỀM: chỉ ghi vào
 * deleted_apps để Hub tự lọc và còn khôi phục được. File của app vẫn nằm
 * trong repo — muốn xoá hẳn thì xoá thư mục rồi push.
 */
async function listDeleted(env) {
  const { results } = await env.DB.prepare('SELECT app_id FROM deleted_apps').all();
  return json({ ok: true, deleted: (results || []).map((r) => r.app_id) });
}

/** Xác minh chữ ký + đúng là chủ sở hữu, rồi trả về app id đã kiểm. */
async function adminBody(request, env) {
  let b;
  try { b = await request.json(); } catch { return { err: json({ error: 'bad json' }, 400) }; }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v) return { err: json({ error: 'bad-signature' }, 403) };
  if (v.expired) return { err: json({ error: 'expired' }, 403) };

  const uid = v.user && v.user.id;
  if (!uid || String(uid) !== String(env.OWNER_ID)) {
    return { err: json({ error: 'not-admin' }, 403) };
  }
  const id = String(b.id || '').trim().slice(0, 40);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return { err: json({ error: 'bad app id' }, 400) };
  return { id, uid };
}

async function deleteApp(request, env) {
  const r = await adminBody(request, env);
  if (r.err) return r.err;
  await env.DB.prepare(
    `INSERT INTO deleted_apps (app_id,deleted_at,deleted_by) VALUES (?,?,?)
     ON CONFLICT(app_id) DO UPDATE SET
       deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`
  ).bind(r.id, Math.floor(Date.now() / 1000), r.uid).run();
  return json({ ok: true, deleted: r.id });
}

async function restoreApp(request, env) {
  const r = await adminBody(request, env);
  if (r.err) return r.err;
  await env.DB.prepare('DELETE FROM deleted_apps WHERE app_id = ?').bind(r.id).run();
  return json({ ok: true, restored: r.id });
}

/* ------------------------------------------------- Thế Giới Của Ae */
/** Gốc lô đất thứ `plot` trong lưới. PHẢI khớp với app. */
/**
 * Biên cả thế giới. Xây tự do nên KHÔNG còn giới hạn theo lô của mình — chỉ
 * cần nằm trong thế giới, đúng số tầng, và mỗi ô chỉ chứa MỘT khối của MỘT người
 * (khoá chính là user+x+y+z nên nếu không chặn thì 2 người cùng ô sẽ đè nhau).
 */
async function worldBounds(env) {
  const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM world_members').first();
  const rows = Math.max(3, Math.ceil(((c ? c.c : 1) || 1) / PLOT_COLS));   // khớp app: tối thiểu 3 hàng
  return { wx: PLOT_COLS * PLOT, wz: rows * PLOT };
}

function checkCell(cell, b) {
  const { x, y, z } = cell;
  if (![x, y, z].every(Number.isFinite)) return 'bad-coords';
  if (x < 0 || x >= b.wx || z < 0 || z >= b.wz) return 'outside-world';
  if (y < 0 || y > MAX_Y) return 'too-high';
  return null;
}

async function whoOwns(env, x, y, z) {
  const r = await env.DB.prepare(
    'SELECT user_id FROM world_blocks WHERE x = ? AND y = ? AND z = ?').bind(x, y, z).first();
  return r ? r.user_id : null;
}

async function myBlockCount(env, uid) {
  const c = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM world_blocks WHERE user_id = ?').bind(uid).first();
  return c ? c.c : 0;
}

function plotOrigin(plot) {
  const col = ((plot % PLOT_COLS) + PLOT_COLS) % PLOT_COLS;
  const row = Math.floor(plot / PLOT_COLS);
  return { ox: col * PLOT, oz: row * PLOT };
}

/** Cả thế giới: thành viên + khối họ đã xây. Công khai — ai cũng xem được. */
async function worldState(env) {
  const now = Math.floor(Date.now() / 1000);
  const mem = await env.DB.prepare(
    `SELECT user_id,name,username,photo,hue,plot,first_seen,last_seen,visits,pos_x,pos_z,look
       FROM world_members ORDER BY plot`
  ).all();
  const blk = await env.DB.prepare(
    `SELECT user_id,x,y,z,t,obj FROM world_blocks ORDER BY user_id, y, z, x LIMIT 16000`
  ).all();

  const byUser = {};
  for (const b of blk.results || []) {
    (byUser[b.user_id] = byUser[b.user_id] || []).push({ x: b.x, y: b.y, z: b.z, t: b.t, obj: b.obj || 0 });
  }
  return json({
    ok: true,
    now,
    plot: PLOT, cols: PLOT_COLS, maxY: MAX_Y, maxBlocks: MAX_BLOCKS, sleepSec: SLEEP_SEC,
    members: (mem.results || []).map((m) => ({
      id: m.user_id, name: m.name, username: m.username, photo: m.photo,
      hue: m.hue, plot: m.plot,
      look: m.look || '',                            // "áo,quần,da,tóc,kiểu tóc,mũ"
      firstSeen: m.first_seen, lastSeen: m.last_seen, visits: m.visits,
      posX: m.pos_x == null ? null : m.pos_x, posZ: m.pos_z == null ? null : m.pos_z,
      asleep: (now - m.last_seen) > SLEEP_SEC,
      blocks: byUser[m.user_id] || [],
    })),
  });
}

/**
 * Bản NHẸ để hỏi liên tục: chỉ vị trí + trạng thái ngủ của mọi người, và một
 * "số hiệu khối" (rev). App so rev — chỉ khi rev đổi mới tải lại toàn bộ khối,
 * nên phần hỏi mỗi giây rất rẻ.
 */
async function worldLive(env) {
  const now = Math.floor(Date.now() / 1000);
  const mem = await env.DB.prepare(
    `SELECT user_id,pos_x,pos_z,last_seen FROM world_members`
  ).all();
  const rev = await env.DB.prepare(
    `SELECT COALESCE(MAX(at),0) AS m, COUNT(*) AS c FROM world_blocks`
  ).first();

  return json({
    ok: true, now,
    // mã thay đổi của khối: thời điểm sửa mới nhất + số lượng
    rev: (rev ? rev.m : 0) * 100000 + ((rev ? rev.c : 0) % 100000),
    members: (mem.results || []).map((m) => ({
      id: m.user_id,
      x: m.pos_x, z: m.pos_z,
      seen: m.last_seen,
      asleep: (now - m.last_seen) > SLEEP_SEC,
    })),
  });
}

/**
 * Ghi danh / cập nhật nhịp sống.
 *   {initData}              -> ghi danh đầy đủ, tăng số lần ghé, cấp lô nếu mới
 *   {initData, beat:true}   -> chỉ gia hạn nhịp sống (app gọi mỗi ~45 giây)
 * Lô đất cấp theo thứ tự ghé đầu tiên, không đổi về sau.
 */
async function worldJoin(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);

  const u = v.user;
  const uid = u.id;
  const now = Math.floor(Date.now() / 1000);
  const beat = b.beat === true;

  // vị trí gửi kèm (khi đang đi lại) — chỉ nhận nếu hợp lệ và nằm trong thế giới
  const hasPos = Number.isFinite(Number(b.x)) && Number.isFinite(Number(b.z));
  const px = hasPos ? Math.round(Number(b.x) * 100) / 100 : null;
  const pz = hasPos ? Math.round(Number(b.z) * 100) / 100 : null;

  const ex = await env.DB.prepare('SELECT plot FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!ex) {
    if (beat) return json({ ok: true, joined: false });
    const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM world_members').first();
    const plot = c ? c.c : 0;
    const hue = Math.abs(Number(uid) * 47) % 360;      // màu ổn định theo user id
    const name = ([u.first_name, u.last_name].filter(Boolean).join(' ').trim()
                  || u.username || 'Ai đó').slice(0, 64);
    await env.DB.prepare(
      `INSERT INTO world_members (user_id,name,username,photo,hue,plot,first_seen,last_seen,visits)
       VALUES (?,?,?,?,?,?,?,?,1)`
    ).bind(uid, name, u.username || '', u.photo_url || '', hue, plot, now, now).run();
    return json({ ok: true, joined: true, plot, isNew: true });
  }

  if (beat) {
    if (px == null) {
      await env.DB.prepare('UPDATE world_members SET last_seen = ? WHERE user_id = ?').bind(now, uid).run();
    } else {
      await env.DB.prepare(
        'UPDATE world_members SET last_seen = ?, pos_x = ?, pos_z = ? WHERE user_id = ?'
      ).bind(now, px, pz, uid).run();
    }
    return json({ ok: true, joined: true, beat: true, plot: ex.plot });
  }

  await env.DB.prepare(
    `UPDATE world_members SET name=?, username=?, photo=?, last_seen=?, visits=visits+1,
       pos_x = COALESCE(?, pos_x), pos_z = COALESCE(?, pos_z)
      WHERE user_id = ?`
  ).bind(
    ([u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || 'Ai đó').slice(0, 64),
    u.username || '', u.photo_url || '', now, px, pz, uid
  ).run();
  return json({ ok: true, joined: true, plot: ex.plot });
}

/* ------------------------------------------------------- chat trong thế giới */
const CHAT_MAX_LEN = 200;      // dài tối đa mỗi tin
const CHAT_KEEP = 300;         // chỉ giữ 300 tin gần nhất
const CHAT_GAP_SEC = 1;        // cách nhau tối thiểu 1 giây
const CHAT_PER_MIN = 20;       // trần mỗi phút

/**
 * Đọc tin nhắn mới hơn `since`. Chỉ CƯ DÂN đọc được (đã ghi danh trong
 * world_members) — người ngoài thế giới không thấy chuyện trong này.
 */
async function worldChatList(request, url, env) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);
  const uid = a.user && a.user.id;
  if (!uid) return json({ error: 'bad-signature' }, 403);

  const me = await env.DB.prepare('SELECT user_id FROM world_members WHERE user_id = ?')
    .bind(uid).first();
  if (!me) return json({ error: 'not-resident' }, 403);

  const since = Math.max(0, Number(url.searchParams.get('since') || 0) || 0);
  const rows = await env.DB.prepare(
    `SELECT id,user_id,name,hue,text,at FROM world_chat WHERE id > ? ORDER BY id LIMIT 100`
  ).bind(since).all();
  const top = await env.DB.prepare('SELECT COALESCE(MAX(id),0) AS m FROM world_chat').first();

  return json({
    ok: true,
    last: top ? top.m : 0,
    messages: (rows.results || []).map((r) => ({
      id: r.id, uid: r.user_id, name: r.name, hue: r.hue, text: r.text, at: r.at,
    })),
  });
}

/** Gửi một tin. Kiểm cả chữ ký lẫn tư cách cư dân, rồi chặn spam. */
async function worldChatSend(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);
  const uid = v.user.id;

  const res = await env.DB.prepare(
    'SELECT name,hue FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!res) return json({ error: 'not-resident' }, 403);

  const now = Math.floor(Date.now() / 1000);
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
  if (!text) return json({ error: 'empty' }, 400);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(at),0) AS last FROM world_chat
      WHERE user_id = ? AND at > ?`
  ).bind(uid, now - 60).first();
  if (recent && now - recent.last < CHAT_GAP_SEC) {
    return json({ error: 'too-fast', retry: CHAT_GAP_SEC }, 429);
  }
  if (recent && recent.n >= CHAT_PER_MIN) {
    return json({ error: 'too-many', limit: CHAT_PER_MIN }, 429);
  }

  const ins = await env.DB.prepare(
    `INSERT INTO world_chat (user_id,name,hue,text,at) VALUES (?,?,?,?,?)`
  ).bind(uid, res.name || 'Ai đó', res.hue == null ? 0 : res.hue, text, now).run();

  // dọn bớt: giữ 300 tin gần nhất để bảng không phình mãi
  await env.DB.prepare(
    `DELETE FROM world_chat WHERE id <= (SELECT COALESCE(MAX(id),0) - ? FROM world_chat)`
  ).bind(CHAT_KEEP).run();

  return json({
    ok: true,
    message: {
      id: (ins.meta && ins.meta.last_row_id) || 0,
      uid, name: res.name || 'Ai đó', hue: res.hue == null ? 0 : res.hue,
      text, at: now,
    },
  });
}

/**
 * Lưu ngoại hình nhân vật: "màu áo, màu quần, tông da, màu tóc, kiểu tóc, mũ".
 * Chuỗi rỗng = chưa chọn → app sẽ mở màn tạo nhân vật.
 */
async function worldLook(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);
  const uid = v.user.id;

  const nm = await env.DB.prepare('SELECT user_id FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!nm) return json({ error: 'not-joined' }, 403);

  const parts = String(b.look || '').split(',').map(Number);
  if (parts.length !== 6 || parts.some((x) => !Number.isFinite(x) || x < 0)) {
    return json({ error: 'bad-look' }, 400);
  }
  const look = parts.map((x) => Math.min(999, Math.floor(x))).join(',');
  await env.DB.prepare('UPDATE world_members SET look = ? WHERE user_id = ?').bind(look, uid).run();
  return json({ ok: true, look });
}

/**
 * Xây cả một VẬT THỂ trong một lần gọi (một prompt có thể ra cả trăm khối; gọi
 * từng khối thì vừa chậm vừa dễ hỏng giữa chừng). Toàn bộ cùng một `obj`.
 */
async function worldBlocks(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);
  const uid = v.user.id;

  const m = await env.DB.prepare('SELECT user_id FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!m) return json({ error: 'not-joined' }, 403);

  const list = Array.isArray(b.blocks) ? b.blocks : [];
  if (!list.length) return json({ error: 'empty' }, 400);
  if (list.length > MAX_BLOCKS) return json({ error: 'too-many', limit: MAX_BLOCKS }, 400);

  const bd = await worldBounds(env);
  const cells = [];
  const seen = new Set();
  for (const raw of list) {
    const cell = {
      x: Math.floor(Number(raw.x)), y: Math.floor(Number(raw.y)), z: Math.floor(Number(raw.z)),
      t: String(raw.t || 'grass').slice(0, 16),
    };
    if (!BLOCK_TYPES.includes(cell.t)) return json({ error: 'bad-type', t: cell.t }, 400);
    const bad = checkCell(cell, bd);
    if (bad) return json({ error: bad }, 403);
    const k = cell.x + ',' + cell.y + ',' + cell.z;
    if (seen.has(k)) continue;                        // bỏ ô trùng trong cùng lời gọi
    seen.add(k);
    cells.push(cell);
  }

  // ô nào đã có khối của NGƯỜI KHÁC thì bỏ qua (không ghi đè, không phá)
  const mine = await env.DB.prepare(
    'SELECT x,y,z FROM world_blocks WHERE user_id = ?').bind(uid).all();
  const mineKeys = new Set((mine.results || []).map((r) => r.x + ',' + r.y + ',' + r.z));

  let added = 0;
  const keep = [];
  for (const c of cells) {
    const k = c.x + ',' + c.y + ',' + c.z;
    if (mineKeys.has(k)) { keep.push(c); continue; }
    const owner = await whoOwns(env, c.x, c.y, c.z);
    if (owner != null) continue;                      // của người khác → bỏ ô đó
    keep.push(c);
    added++;
  }
  if (!keep.length) return json({ error: 'no-room' }, 409);

  const have = await myBlockCount(env, uid);
  if (have + added > MAX_BLOCKS) {
    return json({ error: 'block-limit', limit: MAX_BLOCKS, have, need: added }, 429);
  }

  const obj = Math.floor(Math.random() * 2000000000) + 1;
  const now = Math.floor(Date.now() / 1000);
  const stmt = env.DB.prepare(
    `INSERT INTO world_blocks (user_id,x,y,z,t,at,obj) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (user_id,x,y,z) DO UPDATE SET t = excluded.t, at = excluded.at, obj = excluded.obj`
  );
  await env.DB.batch(keep.map((c) => stmt.bind(uid, c.x, c.y, c.z, c.t, now, obj)));

  return json({ ok: true, obj, added, skipped: cells.length - added, have: have + added,
                blocks: keep.map((c) => ({ x: c.x, y: c.y, z: c.z, t: c.t })) });
}

/**
 * DI DỜI: bỏ các khối trong `take` (phải là của mình) rồi đặt các khối trong
 * `put` xuống chỗ mới — một lần gọi, nên không có cảnh nửa nọ nửa kia.
 */
async function worldMove(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);
  const uid = v.user.id;

  const nm = await env.DB.prepare('SELECT user_id FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!nm) return json({ error: 'not-joined' }, 403);

  const take = Array.isArray(b.take) ? b.take : [];
  const put = Array.isArray(b.put) ? b.put : [];
  if (!take.length) return json({ error: 'empty' }, 400);

  const bd = await worldBounds(env);

  // 1. tất cả khối bị nhấc phải là CỦA MÌNH
  for (const raw of take) {
    const x = Math.floor(Number(raw.x)), y = Math.floor(Number(raw.y)), z = Math.floor(Number(raw.z));
    if (![x, y, z].every(Number.isFinite)) return json({ error: 'bad-coords' }, 400);
    const owner = await whoOwns(env, x, y, z);
    if (owner !== uid) return json({ error: 'not-yours' }, 403);
  }

  // 2. chỗ mới phải hợp lệ và không đè lên khối người khác
  const takenKeys = new Set(take.map((c) => Math.floor(Number(c.x)) + ',' + Math.floor(Number(c.y)) + ',' + Math.floor(Number(c.z))));
  const cells = [];
  for (const raw of put) {
    const cell = {
      x: Math.floor(Number(raw.x)), y: Math.floor(Number(raw.y)), z: Math.floor(Number(raw.z)),
      t: String(raw.t || 'grass').slice(0, 16),
      obj: Math.floor(Number(raw.obj || 0)) || 0,
    };
    if (!BLOCK_TYPES.includes(cell.t)) return json({ error: 'bad-type' }, 400);
    const bad = checkCell(cell, bd);
    if (bad) return json({ error: bad }, 403);
    const k = cell.x + ',' + cell.y + ',' + cell.z;
    if (takenKeys.has(k)) continue;                   // chỗ cũ của chính nó thì bỏ qua
    const owner = await whoOwns(env, cell.x, cell.y, cell.z);
    if (owner != null && owner !== uid) return json({ error: 'occupied', at: k }, 409);
    cells.push(cell);
  }

  const now = Math.floor(Date.now() / 1000);
  const stmtDel = env.DB.prepare(
    'DELETE FROM world_blocks WHERE user_id = ? AND x = ? AND y = ? AND z = ?');
  const stmtIns = env.DB.prepare(
    `INSERT INTO world_blocks (user_id,x,y,z,t,at,obj) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (user_id,x,y,z) DO UPDATE SET t = excluded.t, at = excluded.at, obj = excluded.obj`);

  const batch = take.map((c) => stmtDel.bind(
    uid, Math.floor(Number(c.x)), Math.floor(Number(c.y)), Math.floor(Number(c.z))));
  for (const c of cells) batch.push(stmtIns.bind(uid, c.x, c.y, c.z, c.t, now, c.obj));
  await env.DB.batch(batch);

  return json({ ok: true, moved: take.length, placed: cells.length,
                blocks: cells.map((c) => ({ x: c.x, y: c.y, z: c.z, t: c.t, obj: c.obj })) });
}

/**
 * Xây / xoá một khối. CHỈ trong lô của mình — kiểm ở server, không tin app.
 * t = null  → xoá khối;  t = loại khối → đặt.
 */
async function worldBlock(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const v = await verifyInitData(String(b.initData || ''), env.TELEGRAM_BOT_TOKEN);
  if (!v || v.expired || !v.user) return json({ error: 'bad-signature' }, 403);
  const uid = v.user.id;

  const m = await env.DB.prepare('SELECT plot FROM world_members WHERE user_id = ?').bind(uid).first();
  if (!m) return json({ error: 'not-joined' }, 403);

  const x = Math.floor(Number(b.x)), y = Math.floor(Number(b.y)), z = Math.floor(Number(b.z));
  if (![x, y, z].every(Number.isFinite)) return json({ error: 'bad coords' }, 400);

  const bd = await worldBounds(env);
  const bad = checkCell({ x, y, z }, bd);
  if (bad) return json({ error: bad }, 403);

  const now = Math.floor(Date.now() / 1000);

  if (b.t == null) {                                   // xoá
    await env.DB.prepare(
      'DELETE FROM world_blocks WHERE user_id = ? AND x = ? AND y = ? AND z = ?'
    ).bind(uid, x, y, z).run();
    return json({ ok: true, removed: true });
  }

  const t = String(b.t).slice(0, 16);
  if (!BLOCK_TYPES.includes(t)) return json({ error: 'bad type' }, 400);

  const owner = await whoOwns(env, x, y, z);
  if (owner != null && owner !== uid) return json({ error: 'occupied' }, 409);

  const have = await myBlockCount(env, uid);
  const replacing = owner === uid;                 // ô này vốn đã là khối của mình
  if (!replacing && have >= MAX_BLOCKS) {
    return json({ error: 'block-limit', limit: MAX_BLOCKS, have }, 429);
  }

  await env.DB.prepare(
    `INSERT INTO world_blocks (user_id,x,y,z,t,at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id,x,y,z) DO UPDATE SET t = excluded.t, at = excluded.at`
  ).bind(uid, x, y, z, t, now).run();

  return json({ ok: true, placed: true, blocks: replacing ? have : have + 1, obj: 0 });
}
