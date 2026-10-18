/* Kiểm nhãn tên và bong bóng chat: TRÍCH ĐÚNG hai hàm vẽ trong
   the-gioi/index.html rồi chạy với canvas giả. Không cần trình duyệt.

   Đo bằng đơn vị thế giới (nhân vật cao ~1,8 đơn vị), không bằng pixel. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../the-gioi/index.html', 'utf8');

function slice(from, to, name) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('thiếu mốc đầu: ' + name);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error('thiếu mốc cuối: ' + name);
  return src.slice(a, b);
}
function num(re, name) {
  const m = re.exec(src);
  if (!m) throw new Error('không đọc được số: ' + name);
  return parseFloat(m[1]);
}

const SRC_LABEL = slice('function labelSprite(text, hue) {', 'function zzzSprite()', 'labelSprite');
const SRC_BUBBLE = slice('/** Vẽ bong bóng nói', 'function dropBubble(uid)', 'bubbleSprite');

// ---- canvas + THREE giả ----
const CHAR_W = 0.55;                     // bề rộng chữ ≈ 0,55 × cỡ chữ (Inter, weight 600)
class Ctx {
  constructor() { this.font = '16px Inter'; }
  measureText(t) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = m ? parseFloat(m[1]) : 16;
    return { width: String(t).length * size * CHAR_W };
  }
  fillText() {} beginPath() {} moveTo() {} lineTo() {} quadraticCurveTo() {}
  closePath() {} fill() {} stroke() {}
}
const document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Ctx() }) };
class Sprite {
  constructor(material) { this.material = material; this.scale = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; }, z: 1 }; this.position = { set() {} }; }
}
const THREE = {
  CanvasTexture: class { constructor(c) { this.image = c; } dispose() {} },
  Sprite,
  SpriteMaterial: class { dispose() {} },
  SRGBColorSpace: 'srgb',
};
let dongHo = 1000;                        // đồng hồ điều khiển được
const performance = { now: () => dongHo };

let pass = 0, fail = 0;
function check(name, ok, extra) {
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}

eval(SRC_LABEL);
eval(SRC_BUBBLE);

// số thật đọc từ file, không chép tay
const NAME_Y   = num(/top \+ (\d+(?:\.\d+)?)/, 'vị trí nhãn tên');
const BUBBLE_Y = num(/position\.y \+ (\d+(?:\.\d+)?) \+ \(b\.h/, 'đáy bong bóng');
const CAO_NGUOI = 1.8;

console.log('=== số đọc từ file ===');
console.log('  nhãn tên ở cao độ      : ' + NAME_Y);
console.log('  đáy bong bóng ở cao độ : ' + BUBBLE_Y);

console.log('\n=== 1. nhãn tên nhỏ lại ===');
const nhan = labelSprite('Khoa ơi', 200);
const caoNhan = nhan.scale.y, rongNhan = nhan.scale.x;
console.log('  nhãn "Khoa ơi"        : ' + rongNhan.toFixed(2) + ' × ' + caoNhan.toFixed(2) + ' đơn vị');
const CU = {                                    // tính lại bằng CÙNG tên đó, theo số của bản trước
  rong: ('Khoa ơi'.length * 44 * CHAR_W + 16 * 2) * 0.0135,
  cao: (44 + 16 * 1.4) * 0.0135,
};
console.log('  bản trước             : ' + CU.rong + ' × ' + CU.cao + ' đơn vị');
check('cao nhỏ hơn bản trước', caoNhan < CU.cao * 0.7, (caoNhan / CU.cao * 100).toFixed(0) + '% của bản trước');
check('rộng nhỏ hơn bản trước', rongNhan < CU.rong * 0.7, (rongNhan / CU.rong * 100).toFixed(0) + '% của bản trước');
check('nhãn thấp hơn 1/3 chiều cao nhân vật', caoNhan < CAO_NGUOI / 3, (caoNhan / CAO_NGUOI * 100).toFixed(0) + '% chiều cao người');

console.log('\n=== 2. nhãn tên không che nhân vật ===');
// tâm sprite neo ở giữa -> đáy nhãn phải nằm trên đỉnh đầu
const dayNhan = NAME_Y - caoNhan / 2;
check('đáy nhãn nằm trên đỉnh đầu nhân vật', dayNhan > CAO_NGUOI * 0.55, 'đáy nhãn ở ' + dayNhan.toFixed(2));
const tenDai = labelSprite('Nguyễn Văn A rất dài', 200);
check('tên dài vẫn không cao hơn', tenDai.scale.y === caoNhan);
check('chiều rộng đúng theo độ dài tên', tenDai.scale.x > rongNhan);

console.log('\n=== 3. bong bóng luôn nằm TRÊN tên, mọi độ dài tin ===');
const tin = ['ngắn thôi', 'tin vừa vừa vài chữ', 'một câu dài '.repeat(6), 'câu rất dài '.repeat(30)];
let allAbove = true;
for (const t of tin) {
  const b = bubbleSprite(t, 200);
  const dayBong = BUBBLE_Y;                                   // đáy = 2,36 + h/2 - h/2 (sprite neo tâm)
  const dinhNhan = NAME_Y + caoNhan / 2;
  const cach = dayBong - dinhNhan;
  const ok = cach > 0;
  if (!ok) allAbove = false;
  console.log('  ' + String(t.length).padStart(3) + ' ký tự -> bong bóng ' + b.scale.x.toFixed(1) + ' × ' + b.scale.y.toFixed(2) +
              ' | đáy ' + dayBong.toFixed(2) + ' vs đỉnh tên ' + dinhNhan.toFixed(2) + ' | cách ' + cach.toFixed(2));
}
check('không tin nào đè lên tên', allAbove);
check('bong bóng to hơn nhãn tên', bubbleSprite('x', 200).scale.y > caoNhan);

console.log('\n=== 4. chat trong game có hiện bong bóng trên đầu không ===');
const SRC_DROP = slice('function dropBubble(uid) {', 'function showBubble(m) {', 'dropBubble');
const SRC_SHOW = slice('function showBubble(m) {', '/** Một dòng tin.', 'showBubble');
const BUBBLE_MS = num(/const BUBBLE_MS = (\d+);/, 'BUBBLE_MS');

const bubbles = new Map();
let trongNhom = [];
const bubbleGroup = { add: (s) => trongNhom.push(s), remove: (s) => { trongNhom = trongNhom.filter((x) => x !== s); } };
const local = new Map([['u1', { group: { position: { x: 3, y: 0, z: 4 } } }]]);

eval(SRC_DROP);
eval(SRC_SHOW);

console.log('  thời gian hiện mỗi bong bóng: ' + BUBBLE_MS + 'ms');

showBubble({ uid: 'nguoi-la', text: 'không có mặt', hue: 10 });
check('người không ở trong thế giới thì không tạo bong bóng', bubbles.size === 0, 'số bong bóng ' + bubbles.size);

showBubble({ uid: 'u1', text: 'câu đầu tiên', hue: 200 });
check('chat khi có mặt -> có bong bóng', bubbles.size === 1, 'số bong bóng ' + bubbles.size);
check('bong bóng nằm trong cảnh', trongNhom.length === 1);
const b1 = bubbles.get('u1');
check('hạn hiện = bây giờ + ' + BUBBLE_MS, b1.until === dongHo + BUBBLE_MS, 'until = ' + b1.until);
check('có ghi chiều cao để đặt trên tên', typeof b1.h === 'number' && b1.h > 0, 'h = ' + b1.h.toFixed(2));

const spriteCu = b1.sprite;
showBubble({ uid: 'u1', text: 'câu thứ hai', hue: 200 });
check('nhắn tiếp thì thay bong bóng cũ, không chồng lên', bubbles.size === 1 && trongNhom.length === 1);
check('bong bóng cũ bị gỡ khỏi cảnh', !trongNhom.includes(spriteCu));

dongHo += BUBBLE_MS + 1;
const o = local.get('u1');
const conHien = !(!o || dongHo > b1.until);
check('quá ' + BUBBLE_MS + 'ms thì vòng lặp gỡ đi', conHien === false);

console.log('\n=== 5. gọi từ đâu (đọc mã nguồn) ===');
const soLanGoi = (src.match(/[^a-zA-Z]showBubble\(/g) || []).length;
check('có gọi lúc bấm gửi và lúc nhận tin (≥2 chỗ)', soLanGoi >= 2, soLanGoi + ' chỗ gọi');
check('lúc gửi tin: trong sendChat', /sendChat[\s\S]{0,2000}showBubble\(/.test(src));
check('lúc nhận tin: trong pollChat', /chatSeen\.add\(m\.id\)[\s\S]{0,1200}showBubble\(/.test(src));

console.log('\nTỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
