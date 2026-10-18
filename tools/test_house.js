/* Kiểm logic đi đứng quanh TOÀ NHÀ: TRÍCH ĐÚNG các hàm trong
   the-gioi/index.html rồi ghép vào file tạm chạy bằng node.

   Ca hỏng trước đây: ô cửa ra vào có khối phía trên (lanh tô / mái đua) nên
   topAt(ô cửa) rất cao, mà va chạm lại so đúng số đó -> không vào được nhà
   dù chỗ đứng ngang tầm chân trống. */
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
const SRC_COLLIDE = slice('const HEAD = 1.75;', 'function addBlockMesh(', 'khối va chạm');
const SRC_MOVE = slice('function moveBy(dx, dz) {', '/* ---------------------------------------------------------------- nhảy', 'moveBy');

const STUBS = [
  'const blockMeshes = new Map();',
  "const keyOf = (x, y, z) => x + ',' + y + ',' + z;",
  'function dat(x, y, z) { blockMeshes.set(keyOf(x, y, z), { userData: { x: x, y: y, z: z } }); }',
  'const colTop = new Map();',
  "const colKey = (x, z) => x + ',' + z;",
  'function bumpCol(x, z) { let top = 0; for (const [, m] of blockMeshes) { const d = m.userData; if (d.x === x && d.z === z) top = Math.max(top, d.y + 1); } colTop.set(colKey(x, z), top); return top; }',
  'const topAt = (x, z) => colTop.get(colKey(x, z)) || 0;',
  'const PLOT = 8, COLS = 6, ROWS = 8;',
  'const player = { x: 0, y: 0, z: 0, grounded: true, ready: true, vy: 0 };',
  'let pass = 0, fail = 0;',
  "function check(name, ok, extra) { ok ? pass++ : fail++; console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : '')); }",
  'function datToaNha() {',
  '  blockMeshes.clear(); colTop.clear();',
  '  // tường nhà: vành ngoài 5..7 (x) và 4..6 (z), cao 2 tầng (tầng 0 và 1)',
  '  for (let x = 5; x <= 7; x++) for (let z = 4; z <= 6; z++) {',
  '    const vien = (x === 5 || x === 7 || z === 4 || z === 6);',
  '    if (!vien) continue;',
  '    if ((x === 5 && z === 5)) continue;            // CHỪA Ô CỬA',
  '    dat(x, 0, z); dat(x, 1, z);',
  '  }',
  '  // mái (hoặc lanh tô đua ra) ở tầng 4, trùm cả ô cửa',
  '  for (let x = 5; x <= 7; x++) for (let z = 4; z <= 6; z++) dat(x, 4, z);',
  '  for (const [, m] of blockMeshes) bumpCol(m.userData.x, m.userData.z);',
  '}',
].join('\n');

const CHECKS = [
  'datToaNha();',
  "console.log('=== căn nhà trong bài kiểm ===');",
  "console.log('  ô cửa (5,5): đỉnh cột = ' + topAt(5, 5) + '  (mái ở tầng 4 -> đỉnh 5)');",
  "console.log('  trong nhà (6,5): đỉnh cột = ' + topAt(6, 5));",
  "console.log('');",
  "console.log('=== 1. vì sao trước đây không vào được ===');",
  "check('luật CŨ (so đỉnh cột) chặn ô cửa', topAt(5, 5) - 0 > 1.05, 'đỉnh cột 5 > 1,05');",
  "console.log('');",
  "console.log('=== 2. luật MỚI: vào nhà được ===');",
  "check('ô cửa có chỗ cho thân người', bodyFree(5, 5, surfaceAt(5, 5, 1.05)));",
  "check('sàn ô cửa là nền nhà (0), không phải mái', surfaceAt(5, 5, 1.05) === 0, 'sàn = ' + surfaceAt(5, 5, 1.05));",
  "player.x = 4.5; player.z = 5.5; player.y = 0; player.grounded = true;",
  "const vaoDuoc = moveBy(0.5, 0);",
  "check('bước từ ngoài vào ô cửa', vaoDuoc && Math.floor(player.x) === 5, 'x = ' + player.x.toFixed(1));",
  "let buoc = 0; for (let i = 0; i < 4; i++) if (moveBy(0.5, 0)) buoc++;",
  "check('vào tới giữa nhà (ô 6)', Math.floor(player.x) === 6, 'x = ' + player.x.toFixed(1) + ' sau ' + buoc + ' bước');",
  "check('bước thứ 4 bị tường trong chặn lại', buoc === 3, buoc + '/4 bước — bước cuối đâm vào tường xa');",
  "check('vẫn ở mặt đất, không bị hút lên mái', player.y === 0, 'y = ' + player.y);",
  "console.log('');",
  "console.log('=== 3. trọng lực bám sàn, không bám đỉnh cột ===');",
  "const sanTrongNha = surfaceAt(6, 5, player.y + 1.05);",
  "check('sàn trong nhà = 0', sanTrongNha === 0, 'sàn = ' + sanTrongNha);",
  "check('đứng trên mái thì sàn = 5', surfaceAt(6, 5, 5 + 1.05) === 5, 'sàn = ' + surfaceAt(6, 5, 5 + 1.05));",
  "console.log('');",
  "console.log('=== 4. tường vẫn phải chặn ===');",
  "player.x = 4.5; player.z = 4.5; player.y = 0;",
  "check('tường 2 tầng chặn (z=4)', !moveBy(0, -0.5) || Math.floor(player.z) !== 3, 'pz = ' + player.z);",
  "player.x = 4.5; player.z = 4.5; player.y = 0;",
  "check('ô tường (5,4) chắn ngang tầm thân (y=0)', !bodyFree(5, 4, 0));",
  "check('nhưng đứng TRÊN đỉnh tường thì trống', bodyFree(5, 4, 2), 'tường cao 2 tầng -> đứng ở y=2');",
  "console.log('');",
  "console.log('=== 5. bậc 1 tầng trèo được, tường 2 tầng thì không ===');",
  "blockMeshes.clear(); colTop.clear(); dat(9, 0, 9); bumpCol(9, 9);",
  "player.x = 8.5; player.z = 9.5; player.y = 0; player.grounded = true;",
  "check('trèo bậc 1 tầng', moveBy(0.5, 0) && Math.floor(player.x) === 9, 'x = ' + player.x.toFixed(1));",
  "blockMeshes.clear(); colTop.clear(); dat(9, 0, 9); dat(9, 1, 9); bumpCol(9, 9);",
  "player.x = 8.5; player.z = 9.5; player.y = 0; player.grounded = true;",
  "check('tường 2 tầng chặn ở mặt đất', !moveBy(0.5, 0), 'x = ' + player.x.toFixed(1));",
  "console.log('');",
  "console.log('=== 6. đọc mã: không còn so đỉnh cột để chặn ===');",
  "const TOAN_BO = " + JSON.stringify(src) + ";",
  "const MOVE_SRC = " + JSON.stringify(SRC_MOVE) + ";",
  "check('moveBy không còn dùng topAt', MOVE_SRC.indexOf('topAt') < 0);",
  "check('moveBy dùng surfaceAt + bodyFree', MOVE_SRC.indexOf('surfaceAt') >= 0 && MOVE_SRC.indexOf('bodyFree') >= 0);",
  "check('trọng lực dùng surfaceAt', TOAN_BO.indexOf('const ground = surfaceAt(') >= 0);",
  "check('không còn chỗ nào đặt cao độ bằng topAt cho nhân vật', TOAN_BO.indexOf('player.y = player.targetY = topAt(') < 0);",
  "console.log('');",
  "console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');",
  "process.exit(fail ? 1 : 0);",
].join('\n');

const file = path.join(os.tmpdir(), 'thegioi_test_house.js');
fs.writeFileSync(file, [STUBS, SRC_COLLIDE, SRC_MOVE, CHECKS].join('\n'));
try { execFileSync(process.execPath, [file], { stdio: 'inherit' }); }
finally { fs.unlinkSync(file); }
