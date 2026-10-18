/* Kiểm tra hai cá thể Hermes & ZeroBot:
   - Lưu vị trí trong D1 và giữ vững qua restart / redeploy
   - App không lấy player.x / player.z làm gốc
   - Vào game lại thì ở đúng chỗ cũ máy chủ trả về
   - Dự phòng không dính người chơi
   - Đi tiếp từ vị trí đã lưu, không nhảy về gốc 0,0 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'the-gioi', 'index.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');

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
const SRC_BUILD_PALS = slice(htmlSrc, 'function buildPals() {', 'function ensurePals() {', 'buildPals');
const SRC_WORKER_BOTS = slice(workerSrc, '/* ------------------------------------------------- Hermes & ZeroBot */', '', 'workerBots');

const STUBS_CLIENT = `
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
const PLOT = 8, COLS = 6;
const origin = (plot) => ({ ox: (plot % COLS) * PLOT, oz: Math.floor(plot / COLS) * PLOT });
let WORLD = null;
let autowalk = true;
const document = { getElementById: () => null };
let perfTime = 1000;
const performance = { now: () => perfTime };
`;

const STUBS_WORKER = `
function json(data, status = 200) { return { status, body: data }; }
async function worldBounds(env) { return { wx: 48, wz: 64 }; }

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
              if (sql.includes('INSERT OR IGNORE INTO world_bots')) {
                const isHermes = sql.includes("'hermes'");
                const bot_id = isHermes ? 'hermes' : 'zerobot';
                if (!store.has(bot_id)) {
                  store.set(bot_id, {
                    bot_id,
                    name: isHermes ? 'Hermes · robot' : 'ZeroBot 🐾',
                    x: 26, z: 30, yaw: 0, tx: 26, tz: 30,
                    mode: 'walk', legs: 0, leg_at: args[0] || 0,
                    rest_until: 0, say: '', say_until: 0, ticked_at: 0
                  });
                }
              }
              return { success: true };
            }
          };
        },
        async all() {
          if (sql.includes('SELECT bot_id')) {
            return { results: Array.from(store.values()).map(r => ({ ...r })) };
          }
          return { results: [] };
        }
      };
    },
    async batch(stmts) {
      for (const s of stmts) {
        if (s._sql.includes('INSERT OR IGNORE')) {
          await s.run();
        } else if (s._sql.includes('UPDATE world_bots')) {
          const [x, z, yaw, tx, tz, mode, legs, leg_at, rest_until, say, say_until, ticked_at, bot_id, old_ticked_at] = s._binds;
          const cur = store.get(bot_id);
          if (cur && cur.ticked_at === old_ticked_at) {
            store.set(bot_id, {
              ...cur,
              x, z, yaw, tx, tz, mode, legs, leg_at, rest_until, say, say_until, ticked_at
            });
          }
        }
      }
    }
  };
}
`;

const TEST_SCRIPT = `
let pass = 0, fail = 0;
function check(name, ok, extra) {
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}

(async () => {
  console.log('=== 1. Phía app không lấy player.x / player.z làm gốc cho hai cá thể ===');
  check('buildPals không lấy p.x / p.z làm gốc', SRC_BUILD_PALS_TEXT.indexOf('p.x') < 0 && SRC_BUILD_PALS_TEXT.indexOf('p.z') < 0);
  const walkerCodeClean = SRC_WALKER_TEXT.split('/*').map((x, i) => (i === 0 ? x : x.slice(x.indexOf('*/') + 2))).join(' ');
  check('Walker không lấy player làm gốc', walkerCodeClean.indexOf('player.x') < 0 && walkerCodeClean.indexOf('player.z') < 0);
  check('randomSpot không ưu tiên myOrigin', htmlSrc.indexOf('const o = myOrigin()') < 0);
  check('spawnWalker không đổi vị trí người chơi', htmlSrc.indexOf('player.x = p.x') < 0);

  console.log('');
  console.log('=== 2. Vào game lại thì vị trí bằng đúng vị trí máy chủ trả về ===');
  const player = { x: 8.5, z: 12.5, ready: true };
  const pInst = buildPals();
  perfTime = 5000;
  updateBots([
    { id: 'hermes', x: 35.5, z: 42.8, tx: 40.0, tz: 48.0, speed: 3.0, mode: 'walk', yaw: 0.8 },
    { id: 'zerobot', x: 36.5, z: 43.5, tx: 41.0, tz: 49.0, speed: 3.0, mode: 'walk', yaw: 0.8 }
  ]);
  pInst.update(16, perfTime, player);
  const robot = pInst.root.children[0];
  const dog = pInst.root.children[1];
  check('Hermes đặt đúng vị trí máy chủ trả về (x=35.5, z=42.8)', Math.abs(robot.position.x - 35.5) < 0.1 && Math.abs(robot.position.z - 42.8) < 0.1, 'x=' + robot.position.x.toFixed(2) + ' z=' + robot.position.z.toFixed(2));
  check('ZeroBot đặt đúng vị trí máy chủ trả về (x=36.5, z=43.5)', Math.abs(dog.position.x - 36.5) < 0.1 && Math.abs(dog.position.z - 43.5) < 0.1, 'x=' + dog.position.x.toFixed(2) + ' z=' + dog.position.z.toFixed(2));
  const distPlayer = Math.hypot(robot.position.x - player.x, robot.position.z - player.z);
  check('Vị trí bot ở xa người chơi (> 25 đơn vị), không xuất hiện cạnh người chơi', distPlayer > 25, 'cách: ' + distPlayer.toFixed(2));

  console.log('');
  console.log('=== 3. Đi dạo tiếp từ vị trí đã lưu, không nhảy về gốc 0,0 ===');
  const startX = robot.position.x;
  const startZ = robot.position.z;
  for (let i = 0; i < 60; i++) {
    perfTime += 16;
    pInst.update(16, perfTime, player);
  }
  check('Robot không nhảy về gốc (x > 35, z > 42)', robot.position.x > 35 && robot.position.z > 42, 'x=' + robot.position.x.toFixed(2) + ' z=' + robot.position.z.toFixed(2));
  check('Robot di chuyển tiếp về phía đích tx, tz', robot.position.x > startX && robot.position.z > startZ, 'dx=' + (robot.position.x - startX).toFixed(2));

  console.log('');
  console.log('=== 4. Máy chủ không có dữ liệu thì chỗ dự phòng vẫn KHÔNG dính người chơi ===');
  botState.clear();
  hasServerBots = false;
  WORLD = { bots: [] };
  const pFb = buildPals();
  const playerNear = { x: 2.0, z: 2.0, ready: true };
  pFb.update(16, 6000, playerNear);
  check('Fallback kích hoạt khi không có server bots', pFb.walker.placed === true);
  check('Toạ độ dự phòng độc lập với người chơi', pFb.walker.x === 24 && pFb.walker.z === 40, 'x=' + pFb.walker.x + ' z=' + pFb.walker.z);
  const distFbPlayer = Math.hypot(pFb.walker.x - playerNear.x, pFb.walker.z - playerNear.z);
  check('Chỗ dự phòng cách xa người chơi (> 20 đơn vị)', distFbPlayer > 20, 'cách: ' + distFbPlayer.toFixed(2));

  console.log('');
  console.log('=== 5. Worker advanceBots: vị trí suy ra từ mốc thời gian, sống qua redeploy ===');
  const mockDB = createMockD1();
  const env = { DB: mockDB };
  let bots1 = await advanceBots(env, 10000);
  check('Khởi tạo ban đầu trả về 2 bot', bots1.length === 2);
  const hInit = bots1.find(b => b.id === 'hermes');
  check('Bot khởi tạo ở vị trí cố định', hInit && hInit.x === 26 && hInit.z === 30);

  await advanceBots(env, 11000);                       // chọn chặng đầu
  const neo = (await advanceBots(env, 11000)).find(b => b.id === 'hermes');
  const hMoved = (await advanceBots(env, 14000)).find(b => b.id === 'hermes');   // +3 giây
  const diDuoc = Math.hypot(hMoved.x - neo.x, hMoved.z - neo.z);
  check('3 giây giữa chặng đi được ~9 đơn vị (3,0 đv/giây)', diDuoc > 8.5 && diDuoc <= 9.05,
    'đi được ' + diDuoc.toFixed(2));

  /* Vị trí là HÀM CỦA THỜI GIAN: hỏi lại cùng mốc giờ phải ra đúng chỗ đó, dù đã hỏi
     bao nhiêu lần — nhờ vậy không phải ghi D1 mỗi nhịp hỏi. */
  const lai = (await advanceBots(env, 14000)).find(b => b.id === 'hermes');
  check('hỏi lại cùng mốc giờ → đúng vị trí đó (không phụ thuộc số lần hỏi)',
    Math.abs(lai.x - hMoved.x) < 0.01 && Math.abs(lai.z - hMoved.z) < 0.01);
  const d1Hermes = mockDB.store.get('hermes');
  check('D1 giữ điểm neo + mốc giờ của chặng (đủ để suy ra vị trí, khỏi ghi mỗi nhịp)',
    d1Hermes && Number.isFinite(d1Hermes.leg_at) && Number.isFinite(d1Hermes.tx),
    'neo x=' + d1Hermes.x + ' z=' + d1Hermes.z + ' leg_at=' + d1Hermes.leg_at);

  /* "Worker deploy lại": instance mới đọc từ D1 — phải ra đúng chỗ vừa thấy. */
  const hAfterRedeploy = (await advanceBots(env, 14500)).find(b => b.id === 'hermes');
  const lech = Math.hypot(hAfterRedeploy.x - hMoved.x, hAfterRedeploy.z - hMoved.z);
  check('Sau khi deploy lại: đúng chỗ vừa thấy, không nhảy về chỗ gieo', lech < 2,
    'lệch ' + lech.toFixed(2));
  check('Sau khi deploy lại: vẫn ở trong thế giới, không về 0,0',
    hAfterRedeploy.x > 0 && hAfterRedeploy.z > 0);

  /* Quãng dài không ai ngó (> 15 giây): đi nốt chặng đang đi rồi đứng lại bắt chặng mới
     — KHÔNG chạy bù một chuỗi chặng ngẫu nhiên (trôi đi đâu mất), cũng không tụt về neo. */
  const truoc = { x: hAfterRedeploy.x, z: hAfterRedeploy.z, tx: hAfterRedeploy.tx, tz: hAfterRedeploy.tz };
  const hNghi = (await advanceBots(env, 400000)).find(b => b.id === 'hermes');
  const diThem = Math.hypot(hNghi.x - truoc.x, hNghi.z - truoc.z);
  const conLai = Math.hypot(truoc.tx - truoc.x, truoc.tz - truoc.z);
  check('quãng dài: chỉ đi nốt chặng cũ rồi dừng (không trôi đi xa)',
    diThem <= conLai + 0.5 && diThem < 30,
    'đi thêm ' + diThem.toFixed(2) + ' · chặng còn ' + conLai.toFixed(2));
  const hSau = (await advanceBots(env, 402000)).find(b => b.id === 'hermes');
  check('sau quãng dài: đi tiếp chặng mới một cách bình thường (≤ 6 đơn vị / 2 giây)',
    Math.hypot(hSau.x - hNghi.x, hSau.z - hNghi.z) <= 6.05,
    'đi được ' + Math.hypot(hSau.x - hNghi.x, hSau.z - hNghi.z).toFixed(2));

  console.log('');
  console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
  process.exit(fail ? 1 : 0);
})();
`;

const file = path.join(os.tmpdir(), 'test_bots_persist_run.js');
fs.writeFileSync(file, [
  'const htmlSrc = ' + JSON.stringify(htmlSrc) + ';',
  'const SRC_BUILD_PALS_TEXT = ' + JSON.stringify(SRC_BUILD_PALS) + ';',
  'const SRC_WALKER_TEXT = ' + JSON.stringify(SRC_WALKER) + ';',
  STUBS_CLIENT,
  STUBS_WORKER,
  SRC_BOTS_STATE,
  SRC_WALKER,
  SRC_BUILD_PALS,
  SRC_WORKER_BOTS,
  TEST_SCRIPT
].join('\n'));

try {
  execFileSync(process.execPath, [file], { stdio: 'inherit' });
} catch (e) {
  console.error('\n--- hỏng: giữ lại file chạy tạm để soi: ' + file);
  console.error('--- chạy tay:  node ' + file);
  throw e;
}
if (!process.env.GIU_FILE_TAM) fs.unlinkSync(file);
