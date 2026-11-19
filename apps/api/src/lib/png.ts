import { deflateSync } from 'node:zlib';

/** Minimal PNG encoder (8-bit RGB, no filtering). Used to generate sample images without any assets. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

export type Rgb = [number, number, number];

/** Encodes a width x height image whose pixel colors come from `pixel(x, y)`. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A few abstract patterns for seed data and tests (no real artwork). */
export const SAMPLE_PATTERNS = {
  rose(x: number, y: number, size: number): Rgb {
    const dx = x - size / 2;
    const dy = y - size / 2;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.floor((r + Math.atan2(dy, dx) * 3) / 4) % 2 === 0;
    return r < size * 0.42 ? (ring ? [150, 20, 40] : [210, 60, 80]) : [245, 240, 235];
  },
  stripes(x: number, y: number): Rgb {
    return Math.floor((x + y) / 6) % 2 === 0 ? [20, 20, 20] : [240, 240, 240];
  },
  gradient(x: number, y: number, size: number): Rgb {
    const t = Math.round((x / size) * 255);
    const u = Math.round((y / size) * 255);
    return [t, 80, 255 - u];
  },
  dots(x: number, y: number): Rgb {
    const cx = (x % 16) - 8;
    const cy = (y % 16) - 8;
    return cx * cx + cy * cy < 18 ? [30, 30, 30] : [228, 222, 210];
  },
  wave(x: number, y: number, size: number): Rgb {
    const w = Math.sin((x / size) * Math.PI * 4) * size * 0.15 + size / 2;
    return Math.abs(y - w) < 4 ? [15, 60, 120] : y > w ? [120, 180, 220] : [250, 250, 245];
  },
} satisfies Record<string, (x: number, y: number, size: number) => Rgb>;

export type SamplePattern = keyof typeof SAMPLE_PATTERNS;

export function samplePng(pattern: SamplePattern, size = 64): Buffer {
  return encodePng(size, size, (x, y) => SAMPLE_PATTERNS[pattern](x, y, size));
}
