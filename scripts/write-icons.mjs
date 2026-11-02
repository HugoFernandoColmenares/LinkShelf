import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      const inTile = nx > 0.08 && nx < 0.92 && ny > 0.08 && ny < 0.92;
      const dx = nx - 0.5;
      const dy = ny - 0.28;
      const ring = Math.hypot(dx, dy);
      const stem = Math.abs(nx - 0.5) < 0.045 && ny > 0.28 && ny < 0.78;
      const bar = Math.abs(ny - 0.48) < 0.04 && nx > 0.32 && nx < 0.68;
      const hook = Math.hypot(nx - 0.5, ny - 0.72) < 0.16 && ny > 0.72 && Math.abs(nx - 0.5) < 0.16;
      const glyph = (ring > 0.07 && ring < 0.12 && ny < 0.42) || stem || bar || hook;
      const color = !inTile ? [0, 0, 0, 0] : glyph ? [255, 255, 255, 255] : [14, 116, 144, 255];
      const index = row + 1 + x * 4;
      raw[index] = color[0];
      raw[index + 1] = color[1];
      raw[index + 2] = color[2];
      raw[index + 3] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/extension/public/icon');
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(resolve(dir, `${size}.png`), png(size));
