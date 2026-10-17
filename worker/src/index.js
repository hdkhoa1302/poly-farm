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
 *   GET  /digests?initData=…     -> [{n,title,from,to,msgs}]
 *   GET  /digest/:n?initData=…   -> {n,title,body,from,to,msgs}
 *   GET  /lb/:appId              -> [{name,username,photo,score}]
 *   POST /lb/:appId              (body JSON có initData) -> upsert điểm
 */

const CORS_METHODS = 'GET,POST,OPTIONS';
const CORS_HEADERS = 'Content-Type,X-Ingest-Secret';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': CORS_METHODS,
      'Access-Control-Allow-Headers': CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
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
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function route(request, url, env) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/health') return json({ ok: true, ts: Date.now() });

  if (p === '/ingest' && request.method === 'POST') return ingest(request, env);

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

  await env.DB.prepare(
    `INSERT INTO digests (n,title,body,from_ts,to_ts,msg_count,chat_title,created_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(n) DO UPDATE SET
       title=excluded.title, body=excluded.body, from_ts=excluded.from_ts,
       to_ts=excluded.to_ts, msg_count=excluded.msg_count,
       chat_title=excluded.chat_title`
  ).bind(
    n, title, body,
    Math.floor(Number(b.from) || 0), Math.floor(Number(b.to) || 0),
    Math.floor(Number(b.msgs) || 0), String(b.chatTitle || '').slice(0, 200),
    Math.floor(Date.now() / 1000)
  ).run();

  return json({ ok: true, n });
}

/* --------------------------------------------------------------- digest */
async function listDigests(request, url, env) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);

  const { results } = await env.DB.prepare(
    `SELECT n,title,from_ts AS "from",to_ts AS "to",msg_count AS msgs
       FROM digests ORDER BY n DESC LIMIT 200`
  ).all();
  return json({ ok: true, who: publicUser(a.user), digests: results || [] });
}

async function oneDigest(request, url, env, n) {
  const a = await authorize(request, url, env);
  if (!a.ok) return json({ error: a.why }, 403);

  const row = await env.DB.prepare(
    `SELECT n,title,body,from_ts AS "from",to_ts AS "to",msg_count AS msgs
       FROM digests WHERE n = ?`
  ).bind(n).first();
  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, digest: row });
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
    `SELECT name,username,photo,score FROM scores
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
