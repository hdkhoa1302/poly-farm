/* Kiểm hai cá thể (Hermes + ZeroBot) tự đi: TRÍCH ĐÚNG lớp Walker trong
   the-gioi/index.html rồi ghép vào một file tạm và chạy bằng node.

   Cách này tránh hẳn hai cái bẫy của lối eval:
   - `eval` một đoạn có class/const thì khai báo bị nhốt trong phạm vi lần eval đó;
   - nhét mã nguồn vào chuỗi mẫu thì vỡ vì HTML có dấu huyền.
   Ở đây chỉ ghép chuỗi rồi chạy file — mã và phép kiểm cùng một phạm vi.

   Điều quan trọng nhất phải kiểm: hai cá thể KHÔNG được đụng vào nhân vật. */
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
const SRC_WALKER = slice('class Walker {', 'async function spawnWalker() {', 'Walker');

const STUBS = [
  "const player = { x: 30, z: 26.8, y: 0, yaw: 0, ready: true, moving: false, sprint: false, grounded: true };",
  "const topAt = () => 0;",
  "const inWorld = () => true;",
  "const WALK_POINTS = [() => 'đang đi dạo…'];",
  "const daNoi = [];",
  "const pals = { say: (t) => daNoi.push(['Hermes', t]), sayDog: (t) => daNoi.push(['ZeroBot', t]) };",
  "const document = { getElementById: () => null };",
  "let chanChan = false;",
  "const diemHen = { x: 14, z: 10 };",
  "const randomSpot = async () => (chanChan ? null : diemHen);",
  "function snapshotNguoi() { return JSON.stringify([player.x, player.z, player.yaw, player.moving, player.sprint]); }",
  "function choMicrotask() { return new Promise((r) => setTimeout(r, 0)); }",
  "let pass = 0, fail = 0;",
  "function check(name, ok, extra) { ok ? pass++ : fail++; console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : '')); }",
].join('\n');

const CHECKS = [
  'const WALKER_SACH = ' + JSON.stringify(SRC_WALKER.split('/*').map((x, i) => (i === 0 ? x : x.slice(x.indexOf('*/') + 2))).join(' ')) + ';',
  '(async () => {',
  "console.log('=== 1. hai cá thể tự đi theo lộ trình của mình ===');",
  'const w = new Walker(); w.x = 10; w.z = 10; w.placed = true; w.nextPickAt = 0;',
  'const truocNguoi = snapshotNguoi(); const p0 = { x: w.x, z: w.z };',
  'for (let i = 0; i < 60; i++) w.update(16, 1000 + i * 16);',
  'await choMicrotask();',
  'for (let i = 0; i < 120; i++) w.update(16, 2000 + i * 16);',
  'const daDi = Math.hypot(w.x - p0.x, w.z - p0.z);',
  "console.log('  đi được ' + daDi.toFixed(2) + ' đơn vị | hẹn tới (14,10) | đang ở (' + w.x.toFixed(1) + ',' + w.z.toFixed(1) + ')');",
  "check('có tự đi', daDi > 1);",
  "check('đi về phía chỗ hẹn', w.x > p0.x);",
  "check('quay mặt về phía chỗ hẹn', Math.sin(w.yaw) > 0.8, 'yaw = ' + w.yaw.toFixed(2) + ' -> dx = ' + Math.sin(w.yaw).toFixed(2));",
  "console.log(''); console.log('=== 2. KHÔNG đụng vào nhân vật của người chơi ===');",
  "console.log('  nhân vật trước: ' + truocNguoi);",
  "console.log('  nhân vật sau  : ' + snapshotNguoi());",
  "check('vị trí nhân vật không đổi', snapshotNguoi() === truocNguoi);",
  "check('hai cá thể ở xa nhân vật', Math.hypot(w.x - player.x, w.z - player.z) > 5);",
  "console.log(''); console.log('=== 3. vướng đường thì tìm lối khác, không kẹt cứng ===');",
  'chanChan = true; const truocKet = snapshotNguoi(); const dungLucChan = { x: w.x, z: w.z };',
  'for (let i = 0; i < 120; i++) w.update(16, 4000 + i * 16);',
  'await choMicrotask();',
  'for (let i = 0; i < 60; i++) w.update(16, 5000 + i * 16);',
  'const xaMay = Math.hypot(w.x - dungLucChan.x, w.z - dungLucChan.z);',
  "check('bị chặn thì không đi xuyên tường', xaMay < 1.5, 'nhích thêm ' + xaMay.toFixed(2) + ' đơn vị');",
  "check('nhân vật vẫn không bị đụng', snapshotNguoi() === truocKet);",
  "console.log(''); console.log('=== 4. đủ chặng thì ghé ngồi chơi ===');",
  'chanChan = false;',
  'const w2 = new Walker(); w2.x = 5; w2.z = 5; w2.placed = true; w2.legs = 6; w2.nextPickAt = 8000;',
  'w2.update(16, 9000); await choMicrotask();',
  "check('chuyển sang ngồi nghỉ', w2.mode === 'rest', 'mode = ' + w2.mode);",
  "check('có nói gì đó khi ngồi', daNoi.some((d) => d[1].includes('ngồi chơi')));",
  'w2.update(16, 9000 + 20000); await choMicrotask();',
  "check('hết giờ nghỉ thì đi tiếp', w2.mode === 'walk', 'mode = ' + w2.mode);",
  "console.log(''); console.log('=== 5. tắt nút 🐾 thì đứng yên ===');",
  'const w3 = new Walker(); w3.x = 3; w3.z = 3; w3.placed = true; w3.nextPickAt = 0; w3.auto = false;',
  'for (let i = 0; i < 60; i++) w3.update(16, 1000 + i * 16); await choMicrotask();',
  "check('tắt tự đi thì không nhúc nhích', w3.x === 3 && w3.z === 3);",
  "console.log(''); console.log('=== 6. chưa có chỗ đứng thì chưa đi ===');",
  "check('placed = false thì update không lái', new Walker().update(16, 1000) === false);",
  "console.log(''); console.log('=== 7. đọc mã nguồn: đã cắt hết dây trói vào người chơi ===');",
  "check('lớp Walker không còn đụng vào player (đã bỏ chú thích)', WALKER_SACH.indexOf('player.') < 0, 'số lần nhắc: ' + (WALKER_SACH.split('player.').length - 1));",
  'const TOAN_BO = ' + JSON.stringify(src) + ';',
  "check('khối đi lại trong tick không còn autoDriving', TOAN_BO.indexOf('autoDriving') < 0);",
  "check('nhân vật vẫn đọc phím + joystick', TOAN_BO.indexOf('stickVec.x + kv.x') >= 0);",
  "check('tick vẫn truyền nhân vật cho pals.update', TOAN_BO.indexOf('pals.update(dt, now, player)') >= 0);",
  "check('không còn neo hai cá thể vào p.x/p.z', TOAN_BO.indexOf('const tx = p.x') < 0);",
  "check('lớp Walker có vị trí riêng', TOAN_BO.indexOf('this.x = 0; this.z = 0; this.yaw = 0; this.placed = false;') >= 0);",
  "console.log(''); console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');",
  'process.exit(fail ? 1 : 0);',
  '})();',
].join('\n');

const file = path.join(os.tmpdir(), 'thegioi_test_walker.js');
fs.writeFileSync(file, [STUBS, SRC_WALKER, CHECKS].join('\n'));
try {
  execFileSync(process.execPath, [file], { stdio: 'inherit' });
} finally {
  fs.unlinkSync(file);
}
