/* Fit the five My Lab researcher cards to Paradise's 128-pixel display. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const ASSETS = 0x211000, BACKUP = 0x1C0000, CAPACITY = 0xB000, HEADER = 20;
const LEGACY = 0x3144434D, MAGIC = 0x3244434D; // MCD1, MCD2
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const read16 = (b, at) => view(b).getUint16(at, true);
const read32 = (b, at) => view(b).getUint32(at, true);
const put16 = (b, at, n) => view(b).setUint16(at, n, true);
const put32 = (b, at, n) => view(b).setUint32(at, n, true);

function has(image) {
  return image.length >= BACKUP + HEADER && read32(image, BACKUP) === MAGIC;
}

function enabled(image) {
  return image.length >= BACKUP + HEADER && [LEGACY, MAGIC].includes(read32(image, BACKUP));
}

// Each row drops exactly 32 columns. Coordinates are in the original 160px
// artwork. Keep every pixel of the emblem, lettering, five stars and barcode.
const bands = [
  [45, [[33, 57], [141, 149]]],                                   // emblem and TAMA LAB masthead
  [61, [[8, 24], [135, 151]]],                                    // name and underline
  [88, [[7, 15], [40, 46], [64, 76], [99, 103], [149, 151]]],     // Lv., rank digit, birthday flag
  [128, [[7, 10], [23, 25], [38, 40], [53, 55], [68, 70], [84, 102], [149, 152]]],
];
const columns = bands.map(([, cuts]) =>
  Array.from({length: 160}, (_, x) => x).filter(x => cuts.every(([a, b]) => x < a || x >= b)));
const fields = [
  [0x24F, 0x2D9F, 0x1055, 86, 80],   // centered name
  [0x250, 0x2D1F, 0x1056, 117, 103],  // month, slash, day on the same banner
  [0x251, 0x2D1F, 0x1057, 126, 112],
  [0x252, 0x2D1F, 0x1058, 135, 121],
];

// All five numerals use palette index 162. Erase just their ink, recovering
// the diagonal background from the same pattern phase in an adjacent gap.
// Sample the original ink mask at pixel centres, keeping each native baseline.
function compactRank(cells, frame) {
  const x = 48, y = [63, 63, 62, 61, 61][frame], w = frame === 0 ? 12 : 16, h = 24;
  const width = frame === 0 ? 10 : 13, height = 20, ink = 162;
  const cell = (sx, sy) => cells[frame * 10 + (sy >> 6) * 5 + (sx >> 5)];
  const index = (sx, sy) => (sy % 64) * 32 + sx % 32;
  const pixel = (sx, sy) => cell(sx, sy)[index(sx, sy)];
  const mask = new Uint8Array(w * h);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = x + dx, sy = y + dy;
      if (pixel(sx, sy) !== ink) continue;
      mask[dy * w + dx] = 1;
      // The clear band x=40..76, y=56..87 contains no other lettering.
      // Moving (+4,-4) preserves the diagonal and its four-pixel dither.
      for (let bx = 40 + sx % 4; bx <= 76; bx += 4) {
        const by = sy + sx - bx;
        if (by < 56 || by > 87 || (bx >= x && bx < x + w && by >= y && by < y + h)) continue;
        cell(sx, sy)[index(sx, sy)] = pixel(bx, by);
        break;
      }
    }
  }
  const left = x + Math.floor((w - width) / 2), top = y + h - height;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const sx = Math.floor((2 * dx + 1) * w / (2 * width));
      const sy = Math.floor((2 * dy + 1) * h / (2 * height));
      if (mask[sy * w + sx]) cell(left + dx, top + dy)[index(left + dx, top + dy)] = ink;
    }
  }
}

function fitCard(entry) {
  const h = C.spriteHeader(entry);
  if (h.sw !== 32 || h.sh !== 64 || h.iw !== 5 || h.ih !== 2 || h.numSprites !== 50 ||
      h.bpp !== 3 || h.flags !== 0xA7 || h.dataLength > entry.length)
    throw new Error('Unexpected My Lab researcher card artwork');
  const {cells} = C.spriteDecode(entry, 0, true);
  for (let frame = 0; frame < 5; frame++) compactRank(cells, frame);
  const out = new Uint8Array(entry.length);
  out.set(entry.subarray(0, h.pixOffset));
  const tiles = 40;
  put16(out, 6, tiles);
  out[12] = 4;
  let pos = h.pixOffset + tiles * 8;
  for (let tile = 0; tile < tiles; tile++) {
    const frame = Math.floor(tile / 8), row = Math.floor(tile % 8 / 4), column = tile % 4;
    const raw = new Uint8Array(32 * 64);
    for (let dy = 0; dy < 64; dy++) {
      const y = row * 64 + dy;
      const map = columns[bands.findIndex(([end]) => y < end)];
      for (let dx = 0; dx < 32; dx++) {
        const x = map[column * 32 + dx];
        raw[dy * 32 + dx] = cells[frame * 10 + row * 5 + (x >> 5)][dy * 32 + x % 32];
      }
    }
    const data = C.rleEncode(raw);
    if (pos + data.length > entry.length) throw new Error('Researcher card artwork exceeds its original slot');
    put32(out, h.pixOffset + tile * 8, pos - h.pixOffset);
    put32(out, h.pixOffset + tile * 8 + 4, data.length);
    out.set(data.map(byte => byte ^ 0x53), pos);
    pos += (data.length + 3) & ~3;
  }
  put32(out, 0, pos);
  return out.subarray(0, pos);
}

function apply(image, enable) {
  const fitted = enabled(image);
  if (enable ? has(image) : !fitted) return image;
  const pack = ASSETS + read32(image, ASSETS + 36);
  const start = pack + read32(image, pack + 180 * 4);
  const end = pack + read32(image, pack + 181 * 4);
  if (end <= start || end > image.length) throw new Error('Invalid My Lab researcher card slot');
  const entry = image.subarray(start, end);
  const layout = ASSETS + read32(image, ASSETS + 20);
  const index = layout + read32(image, layout + 16) * 2;
  const objects = layout + read32(image, layout + 20) * 2;
  const positions = fields.map(([id, type, text, oldX, newX]) => {
    const at = objects + read16(image, index + id * 2) * 2;
    if (read16(image, at) !== type || read16(image, at + (type === 0x2D9F ? 18 : 16)) !== text ||
        read16(image, at + 2) !== (fitted ? newX : oldX))
      throw new Error('Unexpected My Lab researcher card text ' + id.toString(16));
    return at + 2;
  });
  const slot = image.subarray(BACKUP, BACKUP + CAPACITY);
  let original = entry, oldUsed = 0;
  if (fitted) {
    const len = read32(slot, 4), size = read32(slot, 8);
    if (!len || len > slot.length - HEADER || !size || size > entry.length ||
        C.crc32(entry.subarray(0, size)) !== read32(slot, 16))
      throw new Error('Invalid fitted My Lab researcher card');
    const prefix = C.lzDecodeSprite(slot.subarray(HEADER, HEADER + len), size);
    if (C.crc32(prefix) !== read32(slot, 12)) throw new Error('Invalid My Lab researcher card backup');
    original = Uint8Array.from(entry);
    original.set(prefix);
    oldUsed = HEADER + len;
  }
  if (enable) {
    const next = fitCard(original);
    // Bytes past the new payload stay in place. Back up only the overwritten
    // prefix, including its original palette, compression and tile padding.
    const prefix = original.subarray(0, next.length);
    const compressed = C.lzEnc(prefix, true);
    const used = HEADER + compressed.length;
    if (used > slot.length || !slot.subarray(oldUsed, used).every(byte => byte === 255))
      throw new Error('No space for My Lab researcher card backup');
    put32(slot, 0, MAGIC);
    put32(slot, 4, compressed.length);
    put32(slot, 8, prefix.length);
    put32(slot, 12, C.crc32(prefix));
    put32(slot, 16, C.crc32(next));
    slot.set(compressed, HEADER);
    if (oldUsed > used) slot.fill(255, used, oldUsed);
    if (fitted) entry.set(original);
    entry.set(next);
  } else {
    entry.set(original);
    slot.fill(255, 0, oldUsed);
  }
  positions.forEach((pos, i) => put16(image, pos, fields[i][enable ? 4 : 3]));
  return image;
}

root.ParamixMyLabCardFit = {apply, has, enabled};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabCardFit;
})(typeof window !== 'undefined' ? window : globalThis);
