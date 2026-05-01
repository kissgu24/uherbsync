const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ICON_SVG = path.join(ROOT, 'bmp', 'uherbsync_icon_v4.svg');
const FEATURE_SVG = path.join(ROOT, 'bmp', 'uherbsync_feature_graphic_v4.svg');
const STORE_DIR = path.join(ROOT, 'assets', 'store');

const EXPORTS = [
  { src: ICON_SVG,    dest: path.join(STORE_DIR, 'icon-512.png'),              w: 512,  h: 512  },
  { src: ICON_SVG,    dest: path.join(STORE_DIR, 'icon-1024.png'),             w: 1024, h: 1024 },
  { src: ICON_SVG,    dest: path.join(ROOT, 'assets', 'icon.png'),             w: 192,  h: 192  },
  { src: ICON_SVG,    dest: path.join(ROOT, 'assets', 'adaptive-icon.png'),    w: 48,   h: 48   },
  { src: FEATURE_SVG, dest: path.join(STORE_DIR, 'feature-graphic.png'),       w: 1024, h: 500  },
];

async function run() {
  fs.mkdirSync(STORE_DIR, { recursive: true });

  for (const { src, dest, w, h } of EXPORTS) {
    await sharp(src)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(dest);

    const stat = fs.statSync(dest);
    console.log(`✓ ${path.relative(ROOT, dest).padEnd(36)} ${w}x${h}  (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
