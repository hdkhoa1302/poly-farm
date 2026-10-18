/* Kiểm hai cá thể Hermes & ZeroBot: nhận trạng thái từ máy chủ,
   nội suy vị trí, hỗ trợ fallback và giữ nguyên nét cũ. */
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

const SRC_BOTS_STATE = slice('let pals = null;', '/* ==================================================================', 'botState');
const SRC_WALKER = slice('class Walker {', 'async function spawnWalker() {', 'Walker');
const SRC_BUILD_PALS = slice('function buildPals() {', 'function ensurePals() {', 'buildPals');
const SRC_POLL = slice('async function pollLive() {', '\n\nif (inTg && initData()) {', 'pollLive');
const SRC_REFRESH = slice('async function refreshWorld() {', '/* ------------------------------------------------------------------ thời gian thực', 'refreshWorld');

const STUBS = `
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
const THREE = {
  Group: class {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { setScalar: () => {} };
      this.userData = {};
      this.visible = true;
    }
    add(...objs) { this.children.push(...objs); }
  },
  Vector3,
  Line: class { constructor() { this.userData = {}; } },
  LineBasicMaterial: class {},
  BufferGeometry: class {
    constructor() { this.attributes = { position: { array: new Float32Array(12), needsUpdate: false } }; }
    setAttribute() {}
    computeBoundingSphere() {}
  },
  BufferAttribute: class {},
  Float32Array
};
const leashGeo = new THREE.BufferGeometry();
const leash = new THREE.Line();
function buildRobot() {
  return {
    position: new THREE.Vector3(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { setScalar: () => {} },
    userData: {
      limbs: { legL: { rotation: { x: 0 } }, legR: { rotation: { x: 0 } }, armL: { rotation: { x: 0 } }, armR: { rotation: { x: 0 } } },
      hand: { getWorldPosition: (v) => v.set(0, 0, 0) }
    }
  };
}
function buildDog() {
  return {
    position: new THREE.Vector3(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { setScalar: () => {} },
    userData: {
      limbs: { legFL: { rotation: { x: 0 } }, legFR: { rotation: { x: 0 } }, legBL: { rotation: { x: 0 } }, legBR: { rotation: { x: 0 } }, tail: { rotation: { x: 0, z: 0 } } },
      collar: { getWorldPosition: (v) => v.set(0, 0, 0) }
    }
  };
}
function buildBench() { return { visible: false, position: new THREE.Vector3(), rotation: { y: 0 } }; }
function labelSprite() { return { position: new THREE.Vector3() }; }
function makeBubble() { return { position: new THREE.Vector3(), visible: false, userData: {} }; }
function drawBubble() {}
function topAt() { return 0; }
function inWorld() { return true; }
let WORLD = null;
const document = { getElementById: () => null };
/* Không còn nút 🐾 trong app nên chỗ dự phòng luôn đi; mã trong buildPals vẫn đọc
   biến này, nên bài kiểm phải khai. */
const autowalk = true;
let perfTime = 1000;
const performance = { now: () => perfTime };
let pass = 0, fail = 0;
function check(name, ok, extra) {
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}
`;

const CHECKS = `
console.log('=== 1. không còn đặt vị trí đầu cạnh nhân vật ===');
check('không còn p.x + 1.4', src.indexOf('p.x + 1.4') < 0);
check('không còn walker.x = p.x', src.indexOf('walker.x = p.x') < 0);

console.log('');
console.log('=== 2. có đọc bots từ /world/live và /world ===');
check('pollLive đọc d.bots', SRC_POLL.indexOf('d.bots') >= 0);
check('refreshWorld đọc w.body.bots', SRC_REFRESH.indexOf('w.body.bots') >= 0);

console.log('');

console.log('=== 4. nội suy theo máy chủ & chế độ nghỉ ===');
const pInst = buildPals();
perfTime = 1000;
pInst.update(16, perfTime, { ready: false });
check('!p.ready thì root.visible = false', pInst.root.visible === false);

pInst.update(16, perfTime, { ready: true });
check('chưa nhận được bots máy chủ thì root.visible = false', pInst.root.visible === false);

updateBots([
  { id: 'hermes', x: 20, z: 20, tx: 26, tz: 20, speed: 3.0, mode: 'walk', yaw: 0 },
  { id: 'zerobot', x: 21, z: 20, tx: 27, tz: 20, speed: 3.0, mode: 'walk', yaw: 0 }
]);
perfTime = 1016;
pInst.update(16, perfTime, { ready: true });
check('có bots thì root.visible = true', pInst.root.visible === true);
const robot = pInst.root.children[0];
check('khởi tạo đúng neo máy chủ ban đầu', Math.abs(robot.position.x - 20) < 0.2);

for (let i = 0; i < 60; i++) {
  perfTime += 16;
  pInst.update(16, perfTime, { ready: true });
}
const movedX = robot.position.x;
check('nội suy tiến tới tx theo speed', movedX > 21.0 && movedX < 24.5, 'x = ' + movedX.toFixed(2));

/* Không còn nút 🐾 nữa: hai cá thể luôn đi tiếp theo máy chủ, không đóng băng tại
   máy mình. Phép kiểm cũ (tắt autowalk thì đứng yên) thay bằng phép kiểm ngược. */
const keepX1 = robot.position.x;
for (let i = 0; i < 60; i++) {
  perfTime += 16;
  pInst.update(16, perfTime, { ready: true });
}
const keepX2 = robot.position.x;
check('không còn nút 🐾: hai cá thể vẫn đi tiếp, không đóng băng',
  keepX2 > keepX1 + 0.1, 'x: ' + keepX1.toFixed(2) + ' -> ' + keepX2.toFixed(2));

updateBots([
  { id: 'hermes', x: 23.0, z: 20, tx: 23.0, tz: 20, speed: 3.0, mode: 'rest', yaw: 0, say: 'Nghỉ chút nhé' }
]);
for (let i = 0; i < 40; i++) {
  perfTime += 16;
  pInst.update(16, perfTime, { ready: true });
}
check('mode rest thì hiện ghế bench', pInst.bench.visible === true);
const atRest1 = robot.position.x;
for (let i = 0; i < 60; i++) {
  perfTime += 16;
  pInst.update(16, perfTime, { ready: true });
}
const atRest2 = robot.position.x;
check('mode rest thì đứng yên', Math.abs(atRest2 - atRest1) < 0.01, 'độ nhích: ' + Math.abs(atRest2 - atRest1).toFixed(4));

console.log('');
console.log('=== 5. kiểm tra chuyển động không bao giờ giật lùi & bám sát máy chủ ===');
const pSmooth = buildPals();
perfTime = 10000;
updateBots([{ id: 'hermes', x: 10, z: 10, tx: 40, tz: 10, speed: 3.0, mode: 'walk', yaw: 0 }]);
pSmooth.update(16, perfTime, { ready: true });

const trackX = [];
const robotSmooth = pSmooth.root.children[0];
trackX.push(robotSmooth.position.x);

for (let i = 0; i < 30; i++) {
  perfTime += 16;
  pSmooth.update(16, perfTime, { ready: true });
  trackX.push(robotSmooth.position.x);
}

// Máy chủ gửi gói mới với vị trí xa hơn về phía trước
updateBots([{ id: 'hermes', x: 12.5, z: 10, tx: 40, tz: 10, speed: 3.0, mode: 'walk', yaw: 0 }]);

for (let i = 0; i < 40; i++) {
  perfTime += 16;
  pSmooth.update(16, perfTime, { ready: true });
  trackX.push(robotSmooth.position.x);
}

let neverBackward = true;
for (let i = 1; i < trackX.length; i++) {
  if (trackX[i] < trackX[i - 1] - 0.001) {
    neverBackward = false;
    break;
  }
}
check('vị trí hiển thị không bao giờ lùi lại khi nhận gói mới', neverBackward);

for (let i = 0; i < 20; i++) {
  perfTime += 16;
  pSmooth.update(16, perfTime, { ready: true });
}
// Sau khi đã mượt, vị trí hiển thị bám sát vị trí máy chủ (sai số <= 0.5)
const expectedServerX = 12.5 + 3.0 * (60 * 0.016);
const diffX = Math.abs(robotSmooth.position.x - expectedServerX);
check('vị trí hiển thị bám sát máy chủ (sai số <= 0.5 đơn vị)', diffX <= 0.5, 'lệch: ' + diffX.toFixed(3));

console.log('');
console.log('=== 6. fallback về Walker cục bộ khi không có bots ===');
botState.clear();
hasServerBots = false;
WORLD = { bots: [] };
const pFallback = buildPals();
pFallback.update(16, 3000, { ready: true });
check('fallback bật khi bots rỗng', pFallback.root.visible === true);
check('fallback kích hoạt walker cục bộ', pFallback.walker.placed === true);
check('toạ độ fallback không dính p.x/p.z', pFallback.walker.x === 24 && pFallback.walker.z === 40);

console.log('');
console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
`;

const file = path.join(os.tmpdir(), 'thegioi_test_bots.js');
fs.writeFileSync(file, [
  'const src = ' + JSON.stringify(src) + ';',
  'const SRC_POLL = ' + JSON.stringify(SRC_POLL) + ';',
  'const SRC_REFRESH = ' + JSON.stringify(SRC_REFRESH) + ';',
  STUBS,
  SRC_BOTS_STATE,
  SRC_WALKER,
  SRC_BUILD_PALS,
  CHECKS
].join('\n'));

try {
  execFileSync(process.execPath, [file], { stdio: 'inherit' });
} catch (e) {
  console.error('\n--- hỏng: giữ lại file chạy tạm để soi: ' + file);
  console.error('--- chạy tay:  node ' + file);
  throw e;
}
if (!process.env.GIU_FILE_TAM) fs.unlinkSync(file);
