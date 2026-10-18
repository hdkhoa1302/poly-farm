/* Kiểm tra hai cá thể Hermes & agy: đổi tư thế theo việc đang chạy
   - Cờ working/agy_working từ máy chủ (D1 + Worker endpoint)
   - Robot Hermes ngồi gõ máy tính, bàn + ghế + laptop + ánh sáng màn hình
   - ZeroBot nằm cạnh bàn, dây dắt ẩn
   - Con bot nhỏ (60-70% cỡ Hermes) xuất hiện khi agy working, thu nhỏ rồi ẩn khi ngừng
   - Khi Hermes working thì Walker đứng yên, không di chuyển
   - Chuyển trạng thái mượt mà, không hỏng nét đi dạo */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'the-gioi', 'index.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'schema.sql'), 'utf8');

function slice(src, from, to, name) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('thiếu mốc đầu: ' + name);
  if (!to) return src.slice(a);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error('thiếu mốc cuối: ' + name);
  return src.slice(a, b);
}

const SRC_BOTS_STATE = slice(htmlSrc, 'let pals = null;', '/* ==================================================================', 'botState');
const SRC_WALKER = slice(htmlSrc, 'class Walker {', 'async function spawnWalker() {', 'Walker');
const SRC_WORKSTATION = slice(htmlSrc, 'function buildWorkstation() {', '/* ---------------------------------------------------------------- ghế đá + bong bóng nói', 'buildWorkstation');
const SRC_BUILD_PALS = slice(htmlSrc, 'function buildPals() {', 'function ensurePals() {', 'buildPals');
const SRC_WORKER_BOTS = slice(workerSrc, '/* ------------------------------------------------- Hermes & ZeroBot */', '', 'workerBots');

const STUBS = `
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}
const THREE = {
  Vector3,
  Group: class {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { x: 1, y: 1, z: 1, setScalar(s) { this.x = s; this.y = s; this.z = s; } };
      this.userData = {};
      this.visible = true;
    }
    add(...objs) { this.children.push(...objs); }
  },
  Mesh: class {
    constructor(geom, mat) {
      this.geometry = geom;
      this.material = mat;
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { x: 1, y: 1, z: 1, setScalar(s) { this.x = s; this.y = s; this.z = s; } };
      this.visible = true;
    }
  },
  BoxGeometry: class { constructor(w, h, d) { this.w = w; this.h = h; this.d = d; } },
  MeshLambertMaterial: class { constructor(p) { this.color = p && p.color; } },
  MeshBasicMaterial: class { constructor(p) { this.color = p && p.color; } },
  PointLight: class {
    constructor(color, intensity, dist) {
      this.color = color;
      this.intensity = intensity;
      this.distance = dist;
      this.position = new Vector3();
    }
  },
  Line: class { constructor() { this.userData = {}; this.visible = true; } },
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
    scale: { setScalar(s) { this.s = s; } },
    userData: {
      limbs: {
        legL: { rotation: { x: 0 } }, legR: { rotation: { x: 0 } },
        armL: { rotation: { x: 0 } }, armR: { rotation: { x: 0 } }
      },
      hand: { getWorldPosition: (v) => v.set(0, 0, 0) }
    }
  };
}
function buildDog() {
  return {
    position: new THREE.Vector3(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { setScalar(s) { this.s = s; } },
    userData: {
      limbs: {
        legFL: { rotation: { x: 0 } }, legFR: { rotation: { x: 0 } },
        legBL: { rotation: { x: 0 } }, legBR: { rotation: { x: 0 } },
        tail: { rotation: { x: 0, z: 0 } }
      },
      collar: { getWorldPosition: (v) => v.set(0, 0, 0) }
    }
  };
}
function buildBench() { return { visible: false, position: new THREE.Vector3(), rotation: { y: 0 } }; }
function labelSprite(txt) { return { text: txt, position: new THREE.Vector3(), visible: true }; }
function makeBubble() { return { position: new THREE.Vector3(), visible: false, userData: {} }; }
function drawBubble() {}
function topAt() { return 0; }
function inWorld() { return true; }
const PLOT = 8, COLS = 6;
const origin = (plot) => ({ ox: (plot % COLS) * PLOT, oz: Math.floor(plot / COLS) * PLOT });
let WORLD = null;
const autowalk = true;
const document = { getElementById: () => null };
let perfTime = 1000;
const performance = { now: () => perfTime };

function json(data, status = 200) { return { status, body: data }; }
async function worldBounds() { return { wx: 48, wz: 64 }; }

function createMockD1() {
  const store = new Map();
  return {
    store,
    prepare(sql) {
      return {
        _sql: sql,
        bind(...args) {
          return {
            _sql: sql,
            _binds: args,
            async all() {
              if (sql.includes('SELECT bot_id')) {
                return { results: Array.from(store.values()).map(r => ({ ...r })) };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('UPDATE world_bots') && sql.includes('working = ?')) {
                const [w, aw, at] = args;
                const h = store.get('hermes') || { bot_id: 'hermes', x: 26, z: 30, yaw: 0, tx: 26, tz: 30, mode: 'walk' };
                h.working = w;
                h.agy_working = aw;
                h.working_at = at;
                store.set('hermes', h);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            }
          };
        },
        async all() {
          if (sql.includes('SELECT bot_id')) {
            return { results: Array.from(store.values()).map(r => ({ ...r })) };
          }
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; }
      };
    },
    async batch(stmts) {
      for (const s of stmts) {
        if (s._sql.includes('INSERT OR IGNORE')) {
          const isHermes = s._sql.includes("'hermes'");
          const bot_id = isHermes ? 'hermes' : 'zerobot';
          if (!store.has(bot_id)) {
            store.set(bot_id, {
              bot_id, name: isHermes ? 'Hermes · robot' : 'ZeroBot 🐾',
              x: 26, z: 30, yaw: 0, tx: 26, tz: 30, mode: 'walk', legs: 0,
              leg_at: s._binds ? s._binds[0] : 0, rest_until: 0, say: '', say_until: 0,
              ticked_at: 0, working: 0, working_at: 0, agy_working: 0
            });
          }
        }
      }
    }
  };
}
`;

const TESTS = `
let pass = 0, fail = 0;
function check(name, ok, extra) {
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}

(async () => {
  console.log('=== 1. Máy chủ: cờ dữ liệu và endpoint POST /bots/state ===');
  check('Schema có cột working trong world_bots', schemaSrc.includes('working    INTEGER NOT NULL DEFAULT 0'));
  check('Schema có cột agy_working trong world_bots', schemaSrc.includes('agy_working INTEGER NOT NULL DEFAULT 0'));
  check('Worker có định tuyến POST /bots/state', workerSrc.includes("p === '/bots/state' && request.method === 'POST'"));

  const mockDB = createMockD1();
  const env = { DB: mockDB, INGEST_SECRET: 'test-secret' };

  // Kiểm tra xác thực secret
  const reqNoSec = { headers: new Map(), method: 'POST', async json() { return { hermes: 1, agy: 0 }; } };
  reqNoSec.headers.get = (k) => null;
  const resNoSec = await updateBotsState(reqNoSec, env);
  check('Sai/thiếu secret thì trả về 403', resNoSec.status === 403);

  // Đẩy trạng thái working
  const reqOk = {
    headers: { get: (k) => k === 'X-Ingest-Secret' ? 'test-secret' : null },
    method: 'POST',
    async json() { return { hermes: 1, agy: 1 }; }
  };
  const resOk = await updateBotsState(reqOk, env);
  check('Đẩy trạng thái thành công trả về 200', resOk.status === 200);
  check('Phản hồi có hermes=1 và agy=1', resOk.body.hermes === 1 && resOk.body.agy === 1);
  check('D1 đã lưu cờ working=1 và agy_working=1', mockDB.store.get('hermes').working === 1 && mockDB.store.get('hermes').agy_working === 1);

  // advanceBots trả về cờ cho app
  const serverBots = await advanceBots(env, 12000);
  const hermesServer = serverBots.find(b => b.id === 'hermes');
  check('advanceBots trả về cờ working=1 cho Hermes', hermesServer && hermesServer.working === 1);
  check('advanceBots trả về cờ agy_working=1 cho Hermes', hermesServer && hermesServer.agy_working === 1);
  check('Khi Hermes working thì advanceBots giữ nguyên vị trí (không đi tiếp chặng)', hermesServer.tx === hermesServer.x && hermesServer.tz === hermesServer.z);

  console.log('');
  console.log('=== 2. Phía app: nhận cờ working từ dữ liệu máy chủ ===');
  botState.clear();
  updateBots([
    { id: 'hermes', x: 20, z: 20, tx: 20, tz: 20, working: 1, agy_working: 1, working_at: 12000 },
    { id: 'zerobot', x: 21, z: 20, tx: 21, tz: 20, working: 0 }
  ]);
  const stH = botState.get('hermes');
  check('botState lưu cờ working=1', stH && stH.working === 1);
  check('botState lưu cờ agyWorking=1', stH && stH.agyWorking === 1);

  console.log('');
  console.log('=== 3. Tư thế ngồi gõ máy tính của Hermes & ZeroBot nằm cạnh ===');
  botState.clear();
  updateBots([
    { id: 'hermes', x: 20, z: 20, tx: 25, tz: 20, working: 0, agy_working: 0 },
    { id: 'zerobot', x: 21, z: 20, tx: 26, tz: 20, working: 0 }
  ]);
  const pals = buildPals();
  perfTime = 1000;
  pals.update(16, perfTime, { ready: true });

  // Ban đầu chưa làm việc
  check('Khi chưa làm việc: bàn làm việc ẩn', pals.deskHermes.visible === false);

  // Cập nhật Hermes working
  updateBots([{ id: 'hermes', x: 20, z: 20, tx: 20, tz: 20, working: 1, agy_working: 0 }]);
  for (let i = 0; i < 30; i++) {
    perfTime += 16;
    pals.update(16, perfTime, { ready: true });
  }

  check('Khi Hermes working: bàn làm việc hiện ra', pals.deskHermes.visible === true);
  check('Tiến trình làm việc đạt mức cao (> 0.8)', pals.workProgress > 0.8);

  const robotLimbs = pals.root.children[0].userData.limbs;
  const dogLimbs = pals.root.children[1].userData.limbs;
  check('Robot Hermes ngồi xuống (chân gập)', robotLimbs.legL.rotation.x < -1.0 && robotLimbs.legR.rotation.x < -1.0);
  check('Hai tay Hermes đưa lên bàn phím gõ (< -0.9)', robotLimbs.armL.rotation.x < -0.9 && robotLimbs.armR.rotation.x < -0.9);
  check('ZeroBot nằm cạnh bàn (chân gập nghỉ)', dogLimbs.legFL.rotation.x > 1.0 && dogLimbs.legBL.rotation.x < -0.3);
  check('Dây dắt ẩn đi khi ngồi làm việc', leash.visible === false);

  // Kiểm tra dao động gõ phím nhẹ nhàng
  const armL1 = robotLimbs.armL.rotation.x;
  perfTime += 80;
  pals.update(16, perfTime, { ready: true });
  const armL2 = robotLimbs.armL.rotation.x;
  check('Hai tay gõ phím dao động nhẹ nhàng (không đứng yên cứng đơ)', armL1 !== armL2 && Math.abs(armL1 - armL2) < 0.2);

  console.log('');
  console.log('=== 4. Con bot nhỏ (agy) xuất hiện khi agy working ===');
  check('Agy chưa working thì bot nhỏ ẩn', pals.agyGroup.visible === false);

  // Bật agy working
  updateBots([{ id: 'hermes', x: 20, z: 20, tx: 20, tz: 20, working: 1, agy_working: 1 }]);
  for (let i = 0; i < 30; i++) {
    perfTime += 16;
    pals.update(16, perfTime, { ready: true });
  }

  check('Agy working thì bot nhỏ hiện ra', pals.agyGroup.visible === true);
  const scaleX = pals.agyGroup.scale.x;
  check('Cỡ bot nhỏ khoảng 60-70% cỡ Hermes', scaleX >= 0.55 && scaleX <= 0.70, 'scale = ' + scaleX.toFixed(2));
  check('Bot nhỏ cũng ngồi gõ máy tính', pals.agyBot.userData.limbs.legL.rotation.x < -1.0 && pals.agyBot.userData.limbs.armL.rotation.x < -0.9);

  // Tắt agy working -> bot nhỏ thu nhỏ dần rồi ẩn hoàn toàn
  updateBots([{ id: 'hermes', x: 20, z: 20, tx: 20, tz: 20, working: 1, agy_working: 0 }]);
  for (let i = 0; i < 30; i++) {
    perfTime += 16;
    pals.update(16, perfTime, { ready: true });
  }
  check('Khi agy ngừng: bot nhỏ thu nhỏ và ẩn hoàn toàn (không đứng trơ)', pals.agyGroup.visible === false && pals.agyProgress === 0);

  console.log('');
  console.log('=== 5. Khi Hermes working thì Walker đứng yên không di chuyển ===');
  const w = new Walker();
  w.x = 10; w.z = 10; w.placed = true; w.nextPickAt = 0; w.working = true;
  for (let i = 0; i < 60; i++) w.update(16, 1000 + i * 16);
  check('Walker.working=true thì Walker update không dịch chuyển', w.x === 10 && w.z === 10);
  check('Khi Hermes working thì pals.walker cũng được đồng bộ working=true', pals.walker.working === true);

  // Kiểm tra vị trí của robot trong pals không dịch chuyển khi Hermes working
  const robotPos1 = pals.root.children[0].position.clone();
  for (let i = 0; i < 40; i++) {
    perfTime += 16;
    pals.update(16, perfTime, { ready: true });
  }
  const robotPos2 = pals.root.children[0].position.clone();
  check('Robot Hermes giữ nguyên vị trí khi đang làm việc', Math.hypot(robotPos2.x - robotPos1.x, robotPos2.z - robotPos1.z) < 0.01);

  console.log('');
  console.log('=== 6. Khi không ai làm việc: trở về trạng thái dắt chó đi dạo mượt mà ===');
  updateBots([{ id: 'hermes', x: 20, z: 20, tx: 25, tz: 20, working: 0, agy_working: 0 }]);
  for (let i = 0; i < 30; i++) {
    perfTime += 16;
    pals.update(16, perfTime, { ready: true });
  }
  check('Hết làm việc: bàn làm việc ẩn đi', pals.deskHermes.visible === false);
  check('Dây dắt hiện lại', leash.visible === true);
  check('Robot trở lại trạng thái đứng/đi', robotLimbs.legL.rotation.x > -0.5);

  console.log('');
  console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
  process.exit(fail ? 1 : 0);
})();
`;

const file = path.join(os.tmpdir(), 'thegioi_test_bots_working.js');
fs.writeFileSync(file, [
  'const schemaSrc = ' + JSON.stringify(schemaSrc) + ';',
  'const workerSrc = ' + JSON.stringify(workerSrc) + ';',
  STUBS,
  SRC_WORKER_BOTS,
  SRC_BOTS_STATE,
  SRC_WALKER,
  SRC_WORKSTATION,
  SRC_BUILD_PALS,
  TESTS
].join('\n'));

try {
  execFileSync(process.execPath, [file], { stdio: 'inherit' });
} catch (e) {
  console.error('\n--- hỏng: giữ lại file chạy tạm để soi: ' + file);
  console.error('--- chạy tay:  node ' + file);
  throw e;
}
if (!process.env.GIU_FILE_TAM) fs.unlinkSync(file);
