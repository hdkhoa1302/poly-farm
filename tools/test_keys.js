/* Kiểm điều khiển bàn phím bằng cách TRÍCH ĐÚNG những dòng mã trong
   the-gioi/index.html rồi chạy chúng trong một phạm vi chung với đồ giả tối thiểu.
   Không cần trình duyệt. */
const fs = require('fs');
const FILE = __dirname + '/../the-gioi/index.html';
const src = fs.readFileSync(FILE, 'utf8');

function slice(from, to, name) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('thiếu mốc đầu: ' + name);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error('thiếu mốc cuối: ' + name);
  return src.slice(a, b);
}

const KEYS = slice('const held = new Set();', "addEventListener('keydown'", 'khối bàn phím');
const MOVE = slice('/* ---- đi lại ---- */', '/* ---- trọng lực ---- */', 'khối đi lại');
const CAM  = slice('if (held.has(\'KeyQ\') || held.has(\'KeyE\')) {', '\n  }\n  controls.update();', 'khối Q/E');

const harness = `
const SRC_MOVE = ${JSON.stringify(MOVE)};
const SRC_CAM  = ${JSON.stringify(CAM)};
${KEYS}
let pass = 0, fail = 0;
function check(name, ok, extra) {
  (ok ? pass++ : fail++);
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}
function dist(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }

/* ---------- 1. hàm keyVec thật ---------- */

console.log('=== 1. phím -> véc-tơ (hàm keyVec trong file) ===');
const cases = [['KeyW','W'],['ArrowUp','mũi tên ↑'],['KeyS','S'],['ArrowDown','mũi tên ↓'],
               ['KeyA','A'],['ArrowLeft','mũi tên ←'],['KeyD','D'],['ArrowRight','mũi tên →']];
const vec = {};
for (const [code, nhan] of cases) {
  held.clear(); held.add(code);
  const v = keyVec();
  vec[code] = v;
  console.log('  ' + nhan.padEnd(11) + ' -> x=' + v.x + '  y=' + v.y);
}
check('W đi tới (y âm)', vec.KeyW.y === -1 && vec.KeyW.x === 0);
check('S đi lùi (y dương)', vec.KeyS.y === 1);
check('A sang trái (x âm)', vec.KeyA.x === -1);
check('D sang phải (x dương)', vec.KeyD.x === 1);
check('mũi tên cho cùng kết quả như WASD',
      vec.ArrowUp.y === vec.KeyW.y && vec.ArrowDown.y === vec.KeyS.y &&
      vec.ArrowLeft.x === vec.KeyA.x && vec.ArrowRight.x === vec.KeyD.x);
held.clear(); held.add('KeyW'); held.add('KeyD');
let v = keyVec();
check('W+D không nhanh hơn đi thẳng', Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9,
      'độ dài = ' + Math.hypot(v.x, v.y).toFixed(4));

/* ---------- 2. đang gõ chữ thì không đi ---------- */
console.log('\\n=== 2. đang gõ chữ thì không đi ===');
check('ô nhập bị chặn', typingIn({ tagName: 'INPUT' }) === true);
check('vùng soạn thảo bị chặn', typingIn({ tagName: 'TEXTAREA' }) === true);
check('vùng contenteditable bị chặn', typingIn({ isContentEditable: true }) === true);
check('thân trang thì cho qua', typingIn({ tagName: 'DIV' }) === false);
check('cửa sổ (không có tagName) thì cho qua', typingIn(global) === false);

/* ---------- 3. đi thật bằng khối mã trong tick ---------- */
console.log('\\n=== 3. đi thật (20 khung × 16ms, đúng khối mã trong tick) ===');
function walk(frames) {
  for (let i = 0; i < frames; i++) eval(SRC_MOVE);
}
function scen(name, setup, frames, stick) {
  held.clear(); keySprint = false;
  player.x = 30; player.z = 26.8; player.y = 0; player.moving = false; player.sprint = false;
  stickVec.x = 0; stickVec.y = 0;
  if (stick) { stickVec.x = stick[0]; stickVec.y = stick[1]; }
  if (setup) setup();
  const p0 = { x: player.x, z: player.z };
  walk(frames || 20);
  const d = dist(p0, { x: player.x, z: player.z });
  console.log('  ' + name.padEnd(24) + ' đi ' + d.toFixed(3) + ' đơn vị | moving=' + player.moving + ' sprint=' + player.sprint);
  return d;
}
const dW      = scen('W (đi thường)',  () => held.add('KeyW'));
const dUp     = scen('mũi tên ↑',       () => held.add('ArrowUp'));
const dShift  = scen('Shift + W (chạy)', () => { held.add('KeyW'); keySprint = true; });
const dDiag   = scen('W + D (đi chéo)', () => { held.add('KeyW'); held.add('KeyD'); });
const dStickF = scen('joystick đẩy hết', null, 20, [0, -1]);
const dStickH = scen('joystick đẩy nửa', null, 20, [0, -0.5]);
const dNone   = scen('không bấm gì', null, 20, [0, 0]);
const dAuto   = scen('tự dạo bật + giữ W', () => { global.pals = { walker: { auto: true } }; held.add('KeyW'); });
global.pals = null;

/* ---------- 4. Q/E xoay camera ---------- */
console.log('\\n=== 4. Q/E xoay camera (khoảng cách phải giữ nguyên) ===');
{
  const controls = { target: new V3(0, 1, 0) };
  const camera = { position: new V3(11, 12, 13) };
  const camOff = new V3();
  const dt = 16;
  const rad = (c) => Math.hypot(camera.position.x - c.x, camera.position.y - c.y, camera.position.z - c.z);
  const d0 = rad(controls.target);
  const a0 = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  held.clear(); held.add('KeyQ');
  eval(SRC_CAM);
  const d1 = rad(controls.target);
  const a1 = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  console.log('  khoảng cách: ' + d0.toFixed(4) + ' -> ' + d1.toFixed(4) + ' | góc: ' + a0.toFixed(4) + ' -> ' + a1.toFixed(4));
  check('khoảng cách không đổi', Math.abs(d1 - d0) < 1e-9);
  check('có xoay', Math.abs(a1 - a0) > 1e-4);
  // xoay 60 khung phải vẫn giữ khoảng cách (không phình ra)
  for (let i = 0; i < 60; i++) eval(SRC_CAM);
  const d2 = rad(controls.target);
  console.log('  sau 60 khung: khoảng cách = ' + d2.toFixed(4));
  check('xoay lâu vẫn không phình', Math.abs(d2 - d0) < 1e-6);
}

/* ---------- 5. kết luận ---------- */
console.log('\\n=== 5. kết luận ===');
check('W có đi', dW > 1, dW.toFixed(2) + ' đơn vị');
check('mũi tên ↑ đi y hệt W', Math.abs(dUp - dW) < 1e-9);
check('Shift chạy nhanh hơn (~1,7 lần)', dShift / dW > 1.6 && dShift / dW < 1.8, 'tỉ lệ ' + (dShift / dW).toFixed(2));
check('đi chéo không nhanh hơn đi thẳng', Math.abs(dDiag - dW) < 1e-9);
check('joystick đẩy hết cỡ vẫn = chạy (không bị phá)', Math.abs(dStickF - dShift) < 1e-9);
check('joystick đẩy nửa vẫn = đi thường', Math.abs(dStickH - dW) < 1e-9);
check('không bấm gì thì đứng yên', dNone === 0);
check('lúc hai cá thể tự đi, ae VẪN lái được nhân vật mình', Math.abs(dAuto - dW) < 1e-9, 'đi ' + dAuto.toFixed(3) + ' so với ' + dW.toFixed(3));
console.log('\\nTỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
`;

// Đồ giả dùng chung cho cả phạm vi
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  setLength(l) { return this.normalize().multiplyScalar(l); }
}
global.V3 = V3;
global.SPEED = 4.4; global.COLS = 6; global.PLOT = 8; global.ROWS = 6;
global.player = { x: 30, z: 26.8, y: 0, grounded: true, ready: true, moving: false, sprint: false, yaw: 0, vy: 0 };
global.stickVec = { x: 0, y: 0 };
global.camDir = new V3(-0.6, 0, -0.8).normalize();
global.camera = { getWorldDirection: (v) => v.copy(camDir) };
global.camF = new V3(); global.camR = new V3(); global.stepV = new V3();
global.dt = 16;
global.topAt = () => 0;
global.moveBy = (dx, dz) => { player.x += dx; player.z += dz; return true; };
global.$ = () => ({ classList: { add() {} } });
global.keyHintDim = false;
global.tryJump = () => {};
global.savePosSoon = () => {};
global.pals = null;                 // chế độ tự dạo của phiên khác; null = ae đang cầm lái
global.haptic = () => {};

eval(harness);
