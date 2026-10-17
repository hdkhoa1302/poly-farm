/* ============================================================
 * Games Hub — Player identity + Shared Leaderboard
 * ------------------------------------------------------------
 * Tự động lấy thông tin người chơi từ Telegram và lưu điểm
 * lên Firestore (dùng chung giữa mọi người).
 *
 * Cách dùng:
 *   <script src="../shared/games-hub.js"></script>
 *   const lb = GamesHub.leaderboard('2048');   // appId
 *   lb.submit(1234);                            // lưu điểm
 *   const rows = await lb.top(20);              // top 20
 *   GamesHub.player()                           // {id,name,photo,...}
 *   GamesHub.renderLeaderboard(el, '2048');     // vẽ UI
 * ============================================================ */
(function (global) {
  'use strict';

  // ---- Cấu hình Firebase (public web config — an toàn để công khai) ----
  var FIREBASE = {
    projectId: 'taichinhcanhan-9fcf2',
    apiKey: 'AIzaSyATvxstwU8NM81b8osYBDwmtcL9zAQfdhk'
  };
  var REST = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE.projectId +
             '/databases/(default)/documents';

  // ================= Player identity =================
  function player() {
    var tg = global.Telegram && global.Telegram.WebApp;
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u) {
      var full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      return {
        id: 'tg_' + u.id,
        tgId: u.id,
        name: full || u.username || ('User ' + u.id),
        username: u.username || '',
        photo: u.photo_url || '',
        source: 'telegram'
      };
    }
    // Khách (mở ngoài Telegram) — id ổn định theo thiết bị
    var gid = null;
    try { gid = localStorage.getItem('gh_guest_id'); } catch (e) {}
    if (!gid) {
      gid = 'guest_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('gh_guest_id', gid); } catch (e) {}
    }
    return { id: gid, tgId: null, name: 'Khách', username: '', photo: '', source: 'guest' };
  }

  // ================= Chat / group context =================
  function chat() {
    var tg = global.Telegram && global.Telegram.WebApp;
    var c = tg && tg.initDataUnsafe && tg.initDataUnsafe.chat;
    if (!c) return null;
    return {
      id: 'tgchat_' + c.id,
      tgId: c.id,
      type: c.type || 'private',
      title: c.title || ''
    };
  }

  // ================= Firestore value helpers =================
  function enc(s) { return encodeURIComponent(s); }
  function strVal(v) { return { stringValue: String(v == null ? '' : v) }; }
  function intVal(v) { return { integerValue: String(Math.floor(Number(v) || 0)) }; }
  function readStr(f, k) { return f[k] && f[k].stringValue != null ? f[k].stringValue : ''; }
  function readInt(f, k) {
    if (!f[k]) return 0;
    if (f[k].integerValue != null) return parseInt(f[k].integerValue, 10) || 0;
    if (f[k].doubleValue != null) return Math.floor(f[k].doubleValue) || 0;
    return 0;
  }

  // ================= Leaderboard =================
  function leaderboard(appId) {
    var base = REST + '/games/' + enc(appId) + '/scores';

    /** Lưu điểm (chỉ ghi đè nếu cao hơn điểm cũ). Trả về điểm tốt nhất. */
    async function submit(score) {
      score = Math.floor(Number(score) || 0);
      if (score < 0) score = 0;
      var p = player();
      var c = chat();
      var docId = p.id;

      // đọc điểm cũ để giữ điểm cao nhất
      var best = score;
      try {
        var r0 = await fetch(base + '/' + enc(docId) + '?key=' + FIREBASE.apiKey);
        if (r0.ok) {
          var d0 = await r0.json();
          best = Math.max(readInt(d0.fields || {}, 'score'), score);
        }
      } catch (e) { /* offline */ }

      var body = {
        fields: {
          appId: strVal(appId),
          playerId: strVal(p.id),
          name: strVal(p.name),
          username: strVal(p.username),
          photo: strVal(p.photo),
          score: intVal(best),
          last: intVal(score),
          chatId: strVal(c ? c.id : ''),
          chatTitle: strVal(c ? c.title : ''),
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      };
      try {
        var res = await fetch(base + '/' + enc(docId) + '?key=' + FIREBASE.apiKey, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { ok: true, best: best, isRecord: score > 0 && best === score };
      } catch (e) {
        // fallback local
        try {
          var lk = 'gh_lb_' + appId;
          var cur = parseInt(localStorage.getItem(lk) || '0', 10);
          if (best > cur) localStorage.setItem(lk, String(best));
        } catch (e2) {}
        return { ok: false, best: best, error: String(e) };
      }
    }

    /** Lấy top N người chơi. */
    async function top(n) {
      n = Math.min(Math.max(parseInt(n || 20, 10), 1), 100);
      try {
        var url = base + '?key=' + FIREBASE.apiKey + '&pageSize=' + n + '&orderBy=score%20desc';
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var d = await res.json();
        if (!d.documents) return [];
        return d.documents.map(function (doc) {
          var f = doc.fields || {};
          return {
            playerId: readStr(f, 'playerId'),
            name: readStr(f, 'name') || 'Người chơi',
            username: readStr(f, 'username'),
            photo: readStr(f, 'photo'),
            score: readInt(f, 'score'),
            chatTitle: readStr(f, 'chatTitle')
          };
        });
      } catch (e) {
        return [];
      }
    }

    /** Vị trí của người chơi hiện tại (dựa trên điểm tốt nhất của họ). */
    async function myRank() {
      var p = player();
      var rows = await top(100);
      var me = rows.findIndex(function (r) { return r.playerId === p.id; });
      return { rank: me >= 0 ? me + 1 : null, total: rows.length, player: p };
    }

    return { submit: submit, top: top, myRank: myRank, appId: appId };
  }

  // ================= UI: bảng xếp hạng =================
  function renderLeaderboard(el, appId, opts) {
    opts = opts || {};
    var lb = leaderboard(appId);
    el.innerHTML = '<div style="text-align:center;padding:16px;opacity:.7">Đang tải bảng xếp hạng…</div>';
    lb.top(opts.limit || 20).then(function (rows) {
      var p = player();
      if (!rows.length) {
        el.innerHTML = '<div style="text-align:center;padding:16px;opacity:.7">Chưa có ai chơi. Bạn là người đầu tiên! 🏆</div>';
        return;
      }
      var medals = ['🥇', '🥈', '🥉'];
      var html = rows.map(function (r, i) {
        var isMe = r.playerId === p.id;
        var av = r.photo
          ? '<img src="' + r.photo + '" class="gh-av" alt="">'
          : '<div class="gh-av gh-av-ph">' + (r.name[0] || '?').toUpperCase() + '</div>';
        return '<div class="gh-row' + (isMe ? ' gh-me' : '') + '">' +
          '<div class="gh-rank">' + (medals[i] || ('#' + (i + 1))) + '</div>' +
          av +
          '<div class="gh-name">' + escapeHtml(r.name) +
            (r.username ? '<span class="gh-un">@' + escapeHtml(r.username) + '</span>' : '') +
            (isMe ? '<span class="gh-badge">Bạn</span>' : '') +
          '</div>' +
          '<div class="gh-score">' + r.score.toLocaleString('vi-VN') + '</div>' +
        '</div>';
      }).join('');
      el.innerHTML = '<div class="gh-list">' + html + '</div>';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** CSS mặc định cho bảng xếp hạng (chèn 1 lần). */
  function injectStyles() {
    if (document.getElementById('gh-styles')) return;
    var s = document.createElement('style');
    s.id = 'gh-styles';
    s.textContent = [
      '.gh-list{display:flex;flex-direction:column;gap:6px}',
      '.gh-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(128,128,128,.12)}',
      '.gh-row.gh-me{background:rgba(0,136,204,.18);outline:1px solid rgba(0,136,204,.5)}',
      '.gh-rank{width:30px;text-align:center;font-weight:700;font-size:14px;flex:none}',
      '.gh-av{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none}',
      '.gh-av-ph{display:flex;align-items:center;justify-content:center;background:#8f7a66;color:#fff;font-weight:700}',
      '.gh-name{flex:1;min-width:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-un{display:block;font-size:11px;opacity:.6}',
      '.gh-badge{font-size:10px;background:#0088cc;color:#fff;border-radius:6px;padding:1px 5px;margin-left:6px;vertical-align:middle}',
      '.gh-score{font-weight:800;font-size:15px;flex:none}'
    ].join('');
    document.head.appendChild(s);
  }

  // ================= Export =================
  var GamesHub = {
    player: player,
    chat: chat,
    leaderboard: leaderboard,
    renderLeaderboard: function (el, appId, opts) {
      injectStyles();
      renderLeaderboard(el, appId, opts);
    },
    config: FIREBASE,
    version: '1.0.0'
  };

  global.GamesHub = GamesHub;
})(window);
