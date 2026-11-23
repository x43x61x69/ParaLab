/* Keep the two generator assemblies and its working meter visible on Paradise. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const assets = 0x211000, backup = 0x1D0000, capacity = 0x1000;
const legacyMagic = 0x3146474D, magic = 0x3246474D; // MGF1, MGF2
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
function has(b) {
  return b.length >= backup + 16 && view(b).getUint32(backup, true) === magic;
}

function installed(b) {
  return has(b) || (b.length >= backup + 16 && view(b).getUint32(backup, true) === legacyMagic);
}

// The opaque bounds of both 64px devices are x=4..67 and x=92..155.
// Their frames keep the same size and relative pivot throughout the game.
const objects = [
  [0x420,0x1407,1716,124,72,-1,4], [0x423,0x1407,1712,124,92,-1,4],
  [0x421,0x1407,1711,36,92,1,4], [0x422,0x1407,1715,36,76,1,4],
  [0x424,0x1407,1713,80,82,0,-5], [0x425,0x1447,1714,80,54,0,-5],
  [0x426,0x347E,2,80,54,0,-5], // Native charge rectangle and its clipping bounds.
  [0x42A,0x1007,1709,80,52,0,-5], [0x42B,0x1007,1710,80,100,0,-5],
  [0x430,0x1447,1714,80,54,0,-5],
];

// Before play, during the tutorial, and in all four result animations the
// same assembly is spawned by child animation commands relative to (80,64).
function animationPositions(clip, inset) {
  const demo = clip === 749, result = clip >= 757;
  const fields = [[5,-12,-5],[8,36,-5]];
  if (demo) fields.push([11,36,-5],[33,-10,-5]);
  const first = demo ? 14 : 11;
  fields.push([first,-44,inset],[first+1,28,4],[first+4,44,-inset],[first+5,28,4]);
  const left = first + (result ? 9 : 8), right = left + (result ? 5 : 4);
  fields.push([left,-44,inset],[left+1,14,4],[right,44,-inset],[right+1,24,4]);
  return fields;
}

function cabinet(entry) {
  const {subs, header} = C.spriteDecode(entry, 0, true);
  if (subs.length !== 1 || subs[0].w !== 64 || subs[0].h !== 128 || header.flags !== 0xA7)
    throw new Error('Unexpected My Lab generator cabinet');
  const {data, w} = subs[0], stride = w * 4;
  // Slide the decorative cap down one row within its sprite. Two adjacent
  // rows of housing above the meter window are identical on v1.0.00.
  // This leaves the tip at display row 0 after raising the working meter.
  if (!data.subarray(29 * stride, 30 * stride).every((v, i) => v === data[30 * stride + i]))
    throw new Error('Unexpected My Lab generator cabinet housing');
  data.copyWithin(16 * stride, 15 * stride, 30 * stride);
  return C.spriteEncode(entry, subs, {keepPalette:true, preservePaletteIndices:true});
}

function apply(image, enable) {
  const fitted = installed(image);
  if (enable ? has(image) : !fitted) return image;
  const fromInset = fitted ? (has(image) ? 6 : 12) : 0;
  const toInset = enable ? 6 : 0;
  const d = view(image), h = at => d.getUint16(at, true), w = at => d.getUint32(at, true);
  const pack = assets + w(assets + 20), table = i => pack + 2 * w(pack + i * 4);
  const changes = [];
  function coordinate(at, old, before, after) {
    if (d.getInt16(at, true) !== old + before)
      throw new Error('Unexpected My Lab generator placement');
    if (before !== after) changes.push([at, old + after]);
  }
  for (const [id, type, asset, x, y, dx, dy] of objects) {
    const at = table(5) + 2 * h(table(4) + 2 * id);
    if (h(at) !== type || h(at + 6) !== asset) throw new Error('Unexpected My Lab generator object');
    coordinate(at + 2, x, dx * fromInset, dx * toInset);
    coordinate(at + 4, y, fitted ? dy : 0, enable ? dy : 0);
  }
  const clipStart = id => table(14) + 4 * h(table(13) + id * 2);
  for (const id of [741,749,757,758,759,760]) {
    const at = clipStart(id);
    if (h(at + 4) !== 743 || h(at + 8) !== 744 || h(at + 14) !== 745)
      throw new Error('Unexpected My Lab generator animation');
    const before = animationPositions(id, fromInset);
    animationPositions(id, toInset).forEach(([index, old, delta], i) => {
      coordinate(at + index * 2, old, fitted ? before[i][2] : 0, enable ? delta : 0);
    });
  }
  // The blue teaching arrow follows the left machine.
  for (const i of [3,12,21,30]) coordinate(clipStart(751) + i * 2, -40, fromInset, toInset);

  const sprites = assets + w(assets + 36);
  const start = sprites + w(sprites + 4*1709), end = sprites + w(sprites + 4*1710);
  if (end <= start || end > image.length) throw new Error('Invalid My Lab generator cabinet slot');
  const entry = image.subarray(start, end), slot = image.subarray(backup, backup + capacity);
  let next, used;
  if (!fitted) {
    next = cabinet(entry);
    used = 16 + next.length;
    if (next.length > entry.length || used > slot.length || !slot.subarray(0, used).every(b => b === 255))
      throw new Error('No space to preserve the original generator cabinet');
    const original = entry.subarray(0, next.length);
    d.setUint32(backup, magic, true);
    d.setUint32(backup + 4, next.length, true);
    d.setUint32(backup + 8, C.crc32(original), true);
    d.setUint32(backup + 12, C.crc32(next), true);
    slot.set(original, 16);
  } else {
    const length = w(backup + 4);
    used = 16 + length;
    if (!length || used > slot.length || length > entry.length ||
        C.crc32(entry.subarray(0, length)) !== w(backup + 12))
      throw new Error('Invalid fitted My Lab generator cabinet');
    next = Uint8Array.from(slot.subarray(16, used));
    if (C.crc32(next) !== w(backup + 8)) throw new Error('Invalid My Lab generator cabinet backup');
    if (enable) d.setUint32(backup, magic, true);
    else slot.fill(255, 0, used);
  }
  if (!fitted || !enable) entry.set(next);
  for (const [at, n] of changes) d.setInt16(at, n, true);
  return image;
}
root.ParamixMyLabGeneratorFit = { apply, has, enabled: installed };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabGeneratorFit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
