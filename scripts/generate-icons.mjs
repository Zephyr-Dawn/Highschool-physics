import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { maskable = false } = {}) {
  const ss = 4;
  const w = size * ss;
  const px = new Float32Array(w * w * 4);
  const p = maskable ? 0.32 : 0.24;

  const setPixel = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= w) return;
    const i = (y * w + x) * 4;
    const a = Math.max(0, Math.min(1, alpha));
    px[i] = px[i] * (1 - a) + color[0] * a;
    px[i + 1] = px[i + 1] * (1 - a) + color[1] * a;
    px[i + 2] = px[i + 2] * (1 - a) + color[2] * a;
    px[i + 3] = Math.min(1, px[i + 3] + a);
  };

  const roundRect = (x0, y0, x1, y1, r, color) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cx = Math.min(Math.max(x + 0.5, x0 + r), x1 - r);
        const cy = Math.min(Math.max(y + 0.5, y0 + r), y1 - r);
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = Math.max(0, Math.min(1, r - d + 0.5));
        if (a > 0) setPixel(x, y, color, a);
      }
    }
  };

  const disc = (cx, cy, r, color) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = Math.max(0, Math.min(1, r - d + 0.5));
        if (a > 0) setPixel(x, y, color, a);
      }
    }
  };

  const ring = (cx, cy, r, width, color, from = 0, to = Math.PI * 2) => {
    for (let y = Math.floor(cy - r - width - 1); y <= Math.ceil(cy + r + width + 1); y++) {
      for (let x = Math.floor(cx - r - width - 1); x <= Math.ceil(cx + r + width + 1); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        const a = Math.max(0, Math.min(1, width / 2 - Math.abs(d - r) + 0.5));
        if (a <= 0) continue;
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI * 2;
        let f = from;
        let t = to;
        if (t < f) t += Math.PI * 2;
        let aa = ang;
        if (aa < f) aa += Math.PI * 2;
        if (aa <= t) setPixel(x, y, color, a);
      }
    }
  };

  const line = (x0, y0, x1, y1, width, color, dash = 0) => {
    const minX = Math.floor(Math.min(x0, x1) - width);
    const maxX = Math.ceil(Math.max(x0, x1) + width);
    const minY = Math.floor(Math.min(y0, y1) - width);
    const maxY = Math.ceil(Math.max(y0, y1) + width);
    const vx = x1 - x0;
    const vy = y1 - y0;
    const lenSq = vx * vx + vy * vy;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * vx + (y + 0.5 - y0) * vy) / lenSq));
        const dist = Math.hypot(x + 0.5 - (x0 + t * vx), y + 0.5 - (y0 + t * vy));
        const a = Math.max(0, Math.min(1, width / 2 - dist + 0.5));
        if (a <= 0) continue;
        if (dash > 0) {
          const along = t * Math.sqrt(lenSq);
          if (along % dash > dash * 0.62) continue;
        }
        setPixel(x, y, color, a);
      }
    }
  };

  const triangle = (ax, ay, bx, by, cx, cy, color) => {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const sign = (x1, y1, x2, y2) => (x1 - x2) * (ay - y2) - (ax - x2) * (y1 - y2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x + 0.5, y + 0.5, bx, by);
        const d2 = sign(x + 0.5, y + 0.5, cx, cy);
        const d3 = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) *
          ((bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax));
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) setPixel(x, y, color, 0.98);
      }
    }
  };

  const bg = [24, 36, 66];
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / w) / 2;
      const i = (y * w + x) * 4;
      px[i] = bg[0] + t * 12;
      px[i + 1] = bg[1] + t * 16;
      px[i + 2] = bg[2] + t * 26;
      px[i + 3] = 1;
    }
  }

  const pad = w * p;
  roundRect(0, 0, w, w, 0, [0, 0, 0]);

  const fieldColor = [96, 123, 172];
  const symbolR = w * 0.011;
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      const cx = w * 0.16 + gx * w * 0.17;
      const cy = w * 0.16 + gy * w * 0.17;
      disc(cx, cy, symbolR, fieldColor);
      if ((gx + gy) % 2 === 0) {
        line(cx - w * 0.013, cy, cx + w * 0.013, cy, w * 0.005, fieldColor);
        line(cx, cy - w * 0.013, cx, cy + w * 0.013, w * 0.005, fieldColor);
      } else {
        disc(cx, cy, w * 0.0045, [160, 184, 222]);
      }
    }
  }

  const cx = w * 0.5;
  const cy = w * 0.52;
  const r = (w * 0.5 - pad) * 0.82;
  ring(cx, cy, r, w * 0.033, [148, 197, 255]);
  ring(cx, cy, r, w * 0.008, [186, 220, 255], Math.PI * 0.7, Math.PI * 1.85);

  const ang = -Math.PI * 0.64;
  const px1 = cx + r * Math.cos(ang);
  const py1 = cy + r * Math.sin(ang);
  disc(px1, py1, w * 0.05, [251, 191, 36]);
  disc(px1, py1, w * 0.021, [255, 247, 222]);

  const ta = ang + Math.PI / 2;
  const tx = px1 + Math.cos(ta) * w * 0.11;
  const ty = py1 + Math.sin(ta) * w * 0.11;
  line(px1 + Math.cos(ta) * w * 0.03, py1 + Math.sin(ta) * w * 0.03, tx, ty, w * 0.014, [251, 191, 36]);
  const head = w * 0.032;
  triangle(
    tx + Math.cos(ta) * head * 1.3,
    ty + Math.sin(ta) * head * 1.3,
    tx + Math.cos(ta + 2.5) * head,
    ty + Math.sin(ta + 2.5) * head,
    tx + Math.cos(ta - 2.5) * head,
    ty + Math.sin(ta - 2.5) * head,
    [251, 191, 36],
  );

  disc(cx, cy, w * 0.014, [214, 231, 255]);
  line(cx - w * 0.014, cy, cx + w * 0.014, cy, w * 0.006, [214, 231, 255]);
  line(cx, cy - w * 0.014, cx, cy + w * 0.014, w * 0.006, [214, 231, 255]);

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r0 = 0;
      let g0 = 0;
      let b0 = 0;
      let a0 = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * w + (x * ss + sx)) * 4;
          r0 += px[i];
          g0 += px[i + 1];
          b0 += px[i + 2];
          a0 += px[i + 3];
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r0 / n);
      out[o + 1] = Math.round(g0 / n);
      out[o + 2] = Math.round(b0 / n);
      out[o + 3] = Math.round((a0 / n) * 255);
    }
  }
  return encodePng(size, size, out);
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]) {
  writeFileSync(join(outDir, name), drawIcon(size, opts));
  console.log('wrote', name);
}
