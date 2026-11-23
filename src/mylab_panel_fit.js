/* Narrow the shared My Lab dialogue background without resizing its colored edges. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const ASSETS = 0x211000, SPRITE = 134;
const read32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;

// Old tile IDs in fitted order. The original middle column is retained in
// two unused descriptors at the end, so the operation is exactly reversible.
const order = [0, 1, 3, 4, 5, 6, 8, 9, 2, 7];
// Offsets and compressed lengths in this sprite fit in 16 bits. The high
// halves of the last two descriptors are unused by the fitted renderer.
const markAt = [66, 67, 70, 71, 74, 75, 78, 79];
const marker = [80, 78, 76, 70, 73, 84, 48, 49]; // PNLFIT01

function sprite(image) {
  const pack = ASSETS + read32(image, ASSETS + 36);
  return image.subarray(pack + read32(image, pack + SPRITE * 4),
                        pack + read32(image, pack + (SPRITE + 1) * 4));
}

function has(image) {
  const e = sprite(image);
  if (e.length < 24 || e[12] !== 4 || e[6] !== 8 || e[7] !== 0) return false;
  const h = C.spriteHeader(e);
  return h.sw === 32 && h.sh === 64 && h.ih === 2 && h.bpp === 1 && h.flags === 0xA3 &&
    h.numPal === 7 && markAt.every((offset, i) => e[h.pixOffset + offset] === marker[i]);
}

function apply(image, enabled) {
  const fitted = has(image);
  if (enabled === fitted) return image;
  const entry = sprite(image);
  const h = C.spriteHeader(entry);
  if (h.sw !== 32 || h.sh !== 64 || h.ih !== 2 || h.iw !== (fitted ? 4 : 5) ||
      h.numSprites !== (fitted ? 8 : 10) || h.bpp !== 1 || h.numPal !== 7 ||
      h.flags !== 0xA3 || h.dataLength > entry.length ||
      h.pixOffset + 80 > h.dataLength || read32(entry, h.pixOffset) < 80)
    throw new Error('Unexpected My Lab dialogue background');

  // Materialize and check the stock-order table before changing the ROM.
  const before = Uint8Array.from(entry.subarray(h.pixOffset, h.pixOffset + 80));
  if (fitted) markAt.forEach(offset => { before[offset] = 0; });
  const next = new Uint8Array(80);
  order.forEach((stock, i) => {
    const from = fitted ? i : stock, to = fitted ? stock : i;
    next.set(before.subarray(8 * from, 8 * (from + 1)), 8 * to);
  });
  const original = Uint8Array.from(entry);
  if (fitted) {
    original.set(next, h.pixOffset);
    original[6] = 10;
    original[12] = 5;
  }
  const {cells} = C.spriteDecode(original, 0, true);
  if (![2, 7].every(tile => cells[tile].every(pixel => pixel === 0)))
    throw new Error('My Lab dialogue background has artwork in its middle column');

  if (enabled) {
    if (markAt.some(offset => next[offset] !== 0)) throw new Error('My Lab dialogue background cannot store its fit marker');
    markAt.forEach((offset, i) => { next[offset] = marker[i]; });
  }
  entry.set(next, h.pixOffset);
  entry[6] = enabled ? 8 : 10;
  entry[12] = enabled ? 4 : 5;
  return image;
}

root.ParamixMyLabPanelFit = {apply, has};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabPanelFit;
})(typeof window !== 'undefined' ? window : globalThis);
