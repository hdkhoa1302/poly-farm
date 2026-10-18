/* Kiểm nhịp hỏi máy chủ (thời gian thực) — TRÍCH hàm liveDelay trong
   the-gioi/index.html rồi chạy. Hàm thuần nên kiểm được, không dính đồng hồ. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const src = fs.readFileSync(path.join(__dirname, '..', 'the-gioi', 'index.html'), 'utf8');
function slice(from, to, name) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('thiếu mốc đầu: ' + name);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error('thiếu mốc cuối: ' + name);
  return src.slice(a, b);
}
const SRC_DELAY = slice('const LIVE_FAST', 'async function pollLive()', 'nhịp hỏi');
const SRC_POLL = slice('async function pollLive() {', '\n\nif (inTg && initData()) {', 'pollLive');

const STUBS = [
  'let pass = 0, fail = 0;',
  "function check(name, ok, extra) { ok ? pass++ : fail++; console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : '')); }",
].join('\n');

const CHECKS = [
  SRC_DELAY,
  'const SRC_POLL = ' + JSON.stringify(SRC_POLL) + ';',
  "console.log('=== nhịp chờ kế tiếp ===');",
  "console.log('  hằng số: FAST=' + LIVE_FAST + ' SLOW=' + LIVE_SLOW + ' ALONE=' + LIVE_ALONE + ' HIDDEN=' + LIVE_HIDDEN);",
  "check('tab ẩn -> gần như ngừng', liveDelay(true, 3, 0) === LIVE_HIDDEN);",
  "check('một mình -> thưa', liveDelay(false, 0, 0) === LIVE_ALONE);",
  "check('có người, vừa cử động -> dày', liveDelay(false, 1, 900) === LIVE_FAST, liveDelay(false, 1, 900) + 'ms');",
  "check('có người, đứng yên lâu -> vừa', liveDelay(false, 2, 9000) === LIVE_SLOW, liveDelay(false, 2, 9000) + 'ms');",
  "check('đúng mốc 5 giây thì đã chậm lại', liveDelay(false, 1, 5000) === LIVE_SLOW);",
  "check('4,9 giây vẫn còn dày', liveDelay(false, 1, 4900) === LIVE_FAST);",
  "check('nhịp dày nhanh hơn nhịp cũ 1,2 giây', LIVE_FAST < 1200, LIVE_FAST + 'ms so với 1200ms');",
  "check('ẩn tab tiết kiệm hơn nhịp cũ', LIVE_HIDDEN > 1200);",
  "console.log('');",
  "console.log('=== nối dây trong pollLive ===');",
  "check('pollLive có so số hiệu chat', SRC_POLL.indexOf('d.chat') >= 0 && SRC_POLL.indexOf('lastChatId') >= 0);",
  "check('có tin chat thì hỏi chat ngay', SRC_POLL.indexOf('pollChat()') >= 0);",
  "check('phát hiện người khác vừa cử động', SRC_POLL.indexOf('liveMovedAt = Date.now()') >= 0);",
  "check('đếm số người khác đang thức', SRC_POLL.indexOf('liveOthers') >= 0);",
  "console.log('');",
  "console.log('=== đọc mã nguồn ===');",
  "const TOAN_BO = " + JSON.stringify(src) + ";",
  "check('bỏ setInterval cứng 1,2 giây', TOAN_BO.indexOf('setInterval(pollLive, 1200)') < 0);",
  "check('có vòng tự hẹn nhịp', TOAN_BO.indexOf('liveLoop') >= 0 && TOAN_BO.indexOf('liveTimer = setTimeout') >= 0);",
  "check('quay lại tab thì hỏi ngay', TOAN_BO.indexOf('pollLive(); pollChat();') >= 0);",
  "check('nội suy theo thời gian, không theo khung hình', TOAN_BO.indexOf('1 - Math.exp(-dt / 110)') >= 0);",
  "console.log('');",
  "console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');",
  "process.exit(fail ? 1 : 0);",
].join('\n');

const file = path.join(os.tmpdir(), 'thegioi_test_realtime.js');
fs.writeFileSync(file, [STUBS, CHECKS].join('\n'));
try { execFileSync(process.execPath, [file], { stdio: 'inherit' }); }
finally { fs.unlinkSync(file); }
