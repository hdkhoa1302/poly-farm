/* ============================================================
 * shared/icons.js — Bo icon dung chung cho toan bo Games Hub
 * ------------------------------------------------------------
 * Nguon: Lucide (https://lucide.dev) — giay phep MIT.
 * Ly do chon: bo icon stroke mo, dong bo tuyet doi (cung 24px grid,
 * stroke-width 2, linecap round) — dung nhat quan o hub va moi app.
 * KHONG dung emoji lam icon o bat ky dau trong project.
 *
 * Dung:
 *   <i data-icon="wheat" data-size="22"></i>   tu dong thay bang SVG
 *   Icons.get("trophy", 18)                    tra ve chuoi SVG
 *   Icons.hydrate(el)                          ve lai icon trong 1 node
 *
 * Icon ve bang currentColor -> doi mau chi can set CSS `color`.
 * ============================================================ */
(function (g) {
  "use strict";

  var PATHS = {
    'wheat'         : "<path d=\"M2 22 16 8\" /><path d=\"M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z\" /><path d=\"M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z\" /><path d=\"M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z\" /><path d=\"M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z\" /><path d=\"M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z\" /><path d=\"M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z\" /><path d=\"M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z\" />",
    'grid-2x2'      : "<path d=\"M12 3v18\" /><path d=\"M3 12h18\" /><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" />",
    'castle'        : "<path d=\"M10 5V3\" /><path d=\"M14 5V3\" /><path d=\"M15 21v-3a3 3 0 0 0-6 0v3\" /><path d=\"M18 3v8\" /><path d=\"M18 5H6\" /><path d=\"M22 11H2\" /><path d=\"M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9\" /><path d=\"M6 3v8\" />",
    'gamepad-2'     : "<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" /><line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" /><line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" /><line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" /><path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />",
    'trophy'        : "<path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\" /><path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\" /><path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\" /><path d=\"M4 22h16\" /><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\" /><path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\" />",
    'chevron-right' : "<path d=\"m9 18 6-6-6-6\" />",
    'crown'         : "<path d=\"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z\" /><path d=\"M5 21h14\" />",
    'sparkles'      : "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
    'play'          : "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\" />",
    'x'             : "<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />",
    'user'          : "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /><circle cx=\"12\" cy=\"7\" r=\"4\" />",
    'sprout'        : "<path d=\"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3\" /><path d=\"M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4\" /><path d=\"M5 21h14\" />",
    'tractor'       : "<path d=\"m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20\" /><path d=\"M16 18h-5\" /><path d=\"M18 5a1 1 0 0 0-1 1v5.573\" /><path d=\"M3 4h8.129a1 1 0 0 1 .99.863L13 11.246\" /><path d=\"M4 11V4\" /><path d=\"M7 15h.01\" /><path d=\"M8 10.1V4\" /><circle cx=\"18\" cy=\"18\" r=\"2\" /><circle cx=\"7\" cy=\"15\" r=\"5\" />",
    'dice-5'        : "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><path d=\"M16 8h.01\" /><path d=\"M8 8h.01\" /><path d=\"M8 16h.01\" /><path d=\"M16 16h.01\" /><path d=\"M12 12h.01\" />",
    'flame'         : "<path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\" />",
    'star'          : "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />",
    'book-open'     : "<path d=\"M12 5v16\" /><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />",
    'lock'          : "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /><path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
    'clock'         : "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 6v6l4 2\" />",
    'wifi-off'      : "<path d=\"M12 20h.01\" /><path d=\"M8.5 16.429a5 5 0 0 1 7 0\" /><path d=\"M5 12.859a10 10 0 0 1 5.17-2.69\" /><path d=\"M19 12.859a10 10 0 0 0-2.007-1.523\" /><path d=\"M2 8.82a15 15 0 0 1 4.177-2.643\" /><path d=\"M22 8.82a15 15 0 0 0-11.288-3.764\" /><path d=\"m2 2 20 20\" />",
    'hourglass'     : "<path d=\"M5 22h14\" /><path d=\"M5 2h14\" /><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\" /><path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\" />",
    'arrow-left'    : "<path d=\"m12 19-7-7 7-7\" /><path d=\"M19 12H5\" />",
    'house'         : "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />",
    'refresh-cw'    : "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /><path d=\"M21 3v5h-5\" /><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /><path d=\"M8 16H3v5\" />",
    'loader'        : "<path d=\"M12 2v4\" /><path d=\"m16.2 7.8 2.9-2.9\" /><path d=\"M18 12h4\" /><path d=\"m16.2 16.2 2.9 2.9\" /><path d=\"M12 18v4\" /><path d=\"m4.9 19.1 2.9-2.9\" /><path d=\"M2 12h4\" /><path d=\"m4.9 4.9 2.9 2.9\" />"
  };

  var ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
              'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  /** Tra ve chuoi <svg> cho mot icon. */
  function get(name, size, cls) {
    var p = PATHS[name];
    if (!p) return "";
    size = size || 24;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" ' +
           ATTRS + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true" focusable="false">' +
           p + '</svg>';
  }

  function has(name) { return Object.prototype.hasOwnProperty.call(PATHS, name); }
  function names() { return Object.keys(PATHS); }

  /** Thay moi <i data-icon="..."> trong `root` bang SVG tuong ung. */
  function hydrate(root) {
    root = root || document;
    var nodes = root.querySelectorAll('i[data-icon]:not([data-icon-done])');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-icon');
      var size = parseInt(el.getAttribute('data-size'), 10) || 24;
      if (!has(name)) { el.setAttribute('data-icon-done', 'missing'); continue; }
      el.innerHTML = get(name, size);
      el.setAttribute('data-icon-done', '1');
      el.classList.add('icon');
    }
  }

  g.Icons = { get: get, has: has, names: names, hydrate: hydrate };

  function boot() { hydrate(document); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
