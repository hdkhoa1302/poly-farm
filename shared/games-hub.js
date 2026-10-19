/* ============================================================
 * Games Hub — Danh tính người chơi + Bảng xếp hạng chung
 * ------------------------------------------------------------
 * Điểm lưu ở Cloudflare Worker (D1), KHÔNG còn Firestore.
 * Không có API key nào trong file này.
 *
 * Gửi điểm cần `tg.initData` (Telegram ký) → Worker xác minh chữ ký
 * rồi mới ghi, nên không ai giả được tên người khác.
 *
 * Cách dùng:
 *   <script src="../shared/games-hub.js"></script>
 *   const lb = GamesHub.leaderboard('2048');   // appId
 *   await lb.submit(1234);                      // lưu điểm
 *   const rows = await lb.top(20);              // top 20
 *   GamesHub.player()                           // {id,name,photo,...}
 *   GamesHub.renderLeaderboard(el, '2048');     // vẽ UI
 * ============================================================ */
(function (global) {
  'use strict';

  var WORKER = 'https://games-hub-api.hdkhoa1302.workers.dev';

  function tg() { return global.Telegram && global.Telegram.WebApp; }

  /** initData gốc do Telegram ký — chỉ có khi mở trong Mini App */
  function initData() {
    var t = tg();
    return (t && t.platform && t.platform !== 'unknown' && t.initData) || '';
  }

  /** Nút back của Telegram: bấm thì nhảy về trang trước (thường là Hub).
      Chỉ bật khi có lịch sử để vàng không thì Telegram tự xử lý đóng app. */
  function _hubBackWired() {
    var t = tg();
    if (!t || !t.platform || t.platform === 'unknown' || !t.BackButton) return;
    try {
      if (!history || history.length <= 1) return;
      t.BackButton.show();
      t.BackButton.onClick(function () {
        try { if (history.length > 1) history.back(); else t.close(); }
        catch (e) { try { t.close(); } catch (e2) {} }
      });
    } catch (e) {}
  }

  // ================= Danh tính người chơi =================
  function player() {
    var t = tg();
    var u = t && t.initDataUnsafe && t.initDataUnsafe.user;
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
    // Khách (mở ngoài Telegram) — không có chữ ký nên chỉ chơi cục bộ
    var gid = null;
    try { gid = localStorage.getItem('gh_guest_id'); } catch (e) {}
    if (!gid) {
      gid = 'guest_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('gh_guest_id', gid); } catch (e) {}
    }
    return { id: gid, tgId: null, name: 'Khách', username: '', photo: '', source: 'guest' };
  }

  // ================= Bối cảnh nhóm chat =================
  function chat() {
    var t = tg();
    var c = t && t.initDataUnsafe && t.initDataUnsafe.chat;
    if (!c) return null;
    return {
      id: 'tgchat_' + c.id,
      tgId: c.id,
      type: c.type || 'private',
      title: c.title || ''
    };
  }

  function guestBest(appId) {
    try { return parseInt(localStorage.getItem('gh_lb_' + appId) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setGuestBest(appId, v) {
    try { localStorage.setItem('gh_lb_' + appId, String(v)); } catch (e) {}
  }

  // ================= Bảng xếp hạng =================
  function leaderboard(appId) {

    /** Lưu điểm. Worker giữ điểm CAO NHẤT. Trả {ok,best,isRecord}. */
    async function submit(score) {
      score = Math.floor(Number(score) || 0);
      if (score < 0) score = 0;

      var id = initData();
      if (!id) {                       // ngoài Telegram → chỉ lưu máy này
        var gb = Math.max(guestBest(appId), score);
        setGuestBest(appId, gb);
        return { ok: false, best: gb, offline: true };
      }
      try {
        var res = await fetch(WORKER + '/lb/' + encodeURIComponent(appId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: id, score: score })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        var b = Math.max(guestBest(appId), score);
        setGuestBest(appId, b);
        return { ok: false, best: b, offline: true, error: String(e) };
      }
    }

    /** Top N người chơi (công khai, không cần chữ ký). */
    async function top(n) {
      var lim = Math.min(Math.max(parseInt(n || 20, 10), 1), 50);
      try {
        var res = await fetch(WORKER + '/lb/' + encodeURIComponent(appId));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var d = await res.json();
        return (d.scores || []).slice(0, lim).map(function (r) {
          return {
            playerId: r.pid || '',
            name: r.name || 'Người chơi',
            username: r.username || '',
            photo: r.photo || '',
            score: r.score || 0
          };
        });
      } catch (e) {
        return [];
      }
    }

    /** Vị trí của người chơi hiện tại. */
    async function myRank() {
      var p = player();
      var rows = await top(50);
      var i = rows.findIndex(function (r) { return r.playerId === p.id; });
      return { rank: i >= 0 ? i + 1 : null, total: rows.length, player: p };
    }

    return { submit: submit, top: top, myRank: myRank, appId: appId };
  }

  // ================= UI =================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderLeaderboard(el, appId, opts) {
    opts = opts || {};
    var lb = leaderboard(appId);
    el.innerHTML = '<div class="gh-msg">Đang tải bảng xếp hạng…</div>';
    lb.top(opts.limit || 20).then(function (rows) {
      var p = player();
      if (!rows.length) {
        el.innerHTML = '<div class="gh-msg">Chưa có ai chơi. Bạn là người đầu tiên!</div>';
        return;
      }
      var medals = ['1', '2', '3'];
      var html = rows.map(function (r, i) {
        var isMe = r.playerId === p.id;
        var av = r.photo
          ? '<img src="' + escapeHtml(r.photo) + '" class="gh-av" alt="">'
          : '<div class="gh-av gh-av-ph">' + escapeHtml((r.name[0] || '?').toUpperCase()) + '</div>';
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

  function injectStyles() {
    if (document.getElementById('gh-styles')) return;
    var s = document.createElement('style');
    s.id = 'gh-styles';
    s.textContent = [
      '.gh-msg{text-align:center;padding:16px;opacity:.65;font-size:14px}',
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
  global.GamesHub = {
    player: player,
    chat: chat,
    initData: initData,
    leaderboard: leaderboard,
    wireBackButton: _hubBackWired,
    renderLeaderboard: function (el, appId, opts) {
      injectStyles();
      renderLeaderboard(el, appId, opts);
    },
    WORKER: WORKER,
    version: '2.0.0'
  };
})(window);
