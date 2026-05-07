const { createCanvas } = require('canvas');
const fs = require('fs');

const BG   = '#0D1117';
const BLUE = '#4D9EFF';
const GOLD = '#E3B341';

// ==================
// 1. App Icon (multi-size)
// ==================
function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 512;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy * 0.95);
  ctx.scale(1, 1.35);
  ctx.beginPath();
  ctx.arc(0, 0, 105 * scale, 0, Math.PI * 2);
  ctx.fillStyle = '#1B2A4A';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 85 * scale, 0, Math.PI * 2);
  ctx.fillStyle = '#1E3A6E';
  ctx.fill();
  ctx.restore();

  const points = [
    [0.28, 0.50], [0.37, 0.50], [0.41, 0.36],
    [0.47, 0.64], [0.52, 0.43], [0.56, 0.54], [0.72, 0.54]
  ];
  ctx.beginPath();
  ctx.moveTo(points[0][0] * size, points[0][1] * size);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0] * size, points[i][1] * size);
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 7 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return canvas;
}

const iconSizes = [
  { size: 512, path: 'assets/store/icon-512.png' },
  { size: 192, path: 'assets/icon.png' },
  { size: 192, path: 'assets/adaptive-icon.png' },
];
iconSizes.forEach(({ size, path }) => {
  const canvas = drawIcon(size);
  fs.writeFileSync(path, canvas.toBuffer('image/png'));
  console.log(`✅ ${path} (${size}x${size})`);
});

// ==================
// 2. Splash Screen 1242x2688
// ==================
function drawSplash() {
  const W = 1242, H = 2688;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = W / 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(cx, H * 0.38);
  ctx.scale(1, 1.35);
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.fillStyle = '#1B2A4A';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 165, 0, Math.PI * 2);
  ctx.fillStyle = '#1E3A6E';
  ctx.fill();
  ctx.restore();

  const baseY = H * 0.38;
  const pts = [
    [cx - 200, baseY], [cx - 120, baseY],
    [cx - 75,  baseY - 130], [cx,       baseY + 130],
    [cx + 55,  baseY - 95],  [cx + 110, baseY + 50],
    [cx + 200, baseY + 50]
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.fillStyle = BLUE;
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('uHerbSync', cx, H * 0.60);
  ctx.fillStyle = '#8B949E';
  ctx.font = '48px sans-serif';
  ctx.fillText('保健品智能管家', cx, H * 0.64);

  return canvas;
}

const splash = drawSplash();
fs.writeFileSync('assets/splash-icon.png', splash.toBuffer('image/png'));
console.log('✅ assets/splash-icon.png (1242x2688)');

// ==================
// 3. Notification Icon 96x96 (monochrome white)
// ==================
function drawNotificationIcon() {
  const canvas = createCanvas(96, 96);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 96, 96);

  const pts = [
    [10, 48], [28, 48], [36, 28],
    [48, 68], [56, 38], [64, 52], [86, 52]
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return canvas;
}

const notif = drawNotificationIcon();
fs.writeFileSync('assets/notification-icon.png', notif.toBuffer('image/png'));
console.log('✅ assets/notification-icon.png (96x96)');

console.log('\n🎉 所有圖片產生完成！');
