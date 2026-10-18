/* Kích thước thế giới được khai ở HAI nơi: app và Worker. Chú thích trong app
   ghi rõ "Hình học (PLOT, PLOT_COLS, MAX_Y) PHẢI khớp" — nhưng không có gì
   bắt buộc, nên sửa một bên là hai bên lệch nhau và biên thế giới sai.
   Bài kiểm này đọc cả hai file và so. */
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'the-gioi', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? 'ĐẠT ' : 'HỎNG') + ' ' + name + (extra ? '   ' + extra : ''));
}
function so(nguon, re, ten) {
  const m = re.exec(nguon);
  if (!m) throw new Error('không đọc được ' + ten);
  return parseFloat(m[1]);
}

const appPlot = so(app, /const PLOT = (\d+)/, 'PLOT');
const appCols = so(app, /const PLOT = \d+, COLS = (\d+)/, 'COLS');
const appMaxY = so(app, /MAX_Y = (\d+)/, 'MAX_Y');
const appMinHang = so(app, /const rows = Math\.max\((\d+), Math\.ceil\(Math\.max\(members\.length/, 'số hàng tối thiểu');

const wPlot = so(worker, /const PLOT = (\d+)/, 'PLOT (worker)');
const wCols = so(worker, /const PLOT_COLS = (\d+)/, 'PLOT_COLS');
const wMaxY = so(worker, /const MAX_Y = (\d+)/, 'MAX_Y (worker)');
const wMinHang = so(worker, /const rows = Math\.max\((\d+), Math\.ceil\(\(\(c \? c\.c : 1\) \|\| 1\) \/ PLOT_COLS\)\)/, 'số hàng tối thiểu (worker)');

console.log('=== kích thước hai bên ===');
console.log('  app    : PLOT=' + appPlot + '  COLS=' + appCols + '  MAX_Y=' + appMaxY + '  hàng tối thiểu=' + appMinHang);
console.log('  worker : PLOT=' + wPlot + '  COLS=' + wCols + '  MAX_Y=' + wMaxY + '  hàng tối thiểu=' + wMinHang);
console.log('  => thế giới: ' + (appCols * appPlot) + ' × ' + (appMinHang * appPlot) + ' (ngang × sâu), cao tối đa ' + appMaxY);
console.log('');

check('cạnh lô khớp nhau', appPlot === wPlot, appPlot + ' vs ' + wPlot);
check('số lô mỗi hàng khớp nhau', appCols === wCols, appCols + ' vs ' + wCols);
check('chiều cao tối đa khớp nhau', appMaxY === wMaxY, appMaxY + ' vs ' + wMaxY);
check('số hàng tối thiểu khớp nhau', appMinHang === wMinHang, appMinHang + ' vs ' + wMinHang);
check('bản đồ đã được mở rộng (>= 6 hàng)', appMinHang >= 6, appMinHang + ' hàng');
check('bản đồ rộng ít nhất 48 ô', appCols * appPlot >= 48, appCols * appPlot + ' ô');

console.log('');
console.log('TỔNG: ' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
