/* Fit My Lab letters and the invitation, skill-test and Tama-sitting text. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const ASSETS = 0x211000, SECTOR = 0x1A8000, CODE = SECTOR + 0xE00, HOOK = 0x126D28;
const MAGIC = 0x3146544D; // MTF1
const HEADER = 16;
const STOCK = [0x00, 0x88, 0x04, 0x99], FITTED = [0x82, 0xF0, 0x6A, 0xB8];
// Built from feld/src/mylab_paradise/text_fit.S for the v1.0.00 layout decoder.
const code = Uint8Array.from((
  '00880499bdf81620174b1b88502b02d19b2a23d025e0242b01d0482b0cd19d2a' +
  '1fd118224a80114b1a88c2f34322012a17d0082a15d211e05b2b12d140f24d23' +
  '9a420ed1094b1a88c2f34322082a02d01b224a8002e01b224a8002e002225242' +
  '0a817df763bf000008170018ea060018').match(/../g), byte => parseInt(byte, 16));
const view = image => new DataView(image.buffer, image.byteOffset, image.byteLength);
const matches = (image, at, bytes) => bytes.every((value, i) => image[at + i] === value);

// The first release placed the leftmost ink on x=2 in Japanese and Korean.
const legacyCode = code.slice();
legacyCode[80] = 24;
function installed(image) {
  return image.length >= SECTOR + HEADER && view(image).getUint32(SECTOR, true) === MAGIC;
}

function has(image) { return installed(image) && matches(image, CODE, code); }

function fitPaper(entry) {
  const h = C.spriteHeader(entry);
  if (h.sw !== 32 || h.sh !== 64 || h.iw !== 5 || h.ih !== 2 ||
      h.numSprites !== 10 || h.flags !== 0xA3 || h.bpp !== 2 || h.numPal !== 1 ||
      h.dataLength > entry.length) throw new Error('Unexpected My Lab letter artwork');
  const source = C.spriteDecode(entry, 0, true).subs[0].data;
  const row = 128 * 4, result = new Uint8ClampedArray(row * 128);
  // Keep both paper edges and the seal at their native scale. Remove four
  // pixels of background per side and 24 blank columns from the ruled paper.
  for (let y = 0; y < 128; y++) {
    const start = y * 160 * 4;
    result.set(source.subarray(start + 4 * 4, start + 68 * 4), y * row);
    result.set(source.subarray(start + 92 * 4, start + 156 * 4), y * row + 64 * 4);
  }
  const template = new Uint8Array(entry);
  template[6] = 8;
  template[12] = 4;
  return C.spriteEncode(template, [{w: 128, h: 128, data: result}], {keepPalette: true});
}

function apply(image, enabled) {
  const fitted = installed(image);
  if (fitted && !matches(image, CODE, code) && !matches(image, CODE, legacyCode))
    throw new Error('Unexpected My Lab letter or text renderer');
  if (enabled === fitted) {
    if (fitted && !has(image)) image.set(code, CODE);
    return image;
  }
  const dv = view(image), pack = ASSETS + dv.getUint32(ASSETS + 36, true);
  const start = pack + dv.getUint32(pack + 179 * 4, true);
  const end = pack + dv.getUint32(pack + 180 * 4, true);
  if (end <= start || end > image.length || !matches(image, HOOK, fitted ? FITTED : STOCK))
    throw new Error('Unexpected My Lab letter or text renderer');
  const entry = image.subarray(start, end);
  if (enabled) {
    const next = fitPaper(entry);
    if (next.length > entry.length || SECTOR + HEADER + next.length > CODE ||
        !image.subarray(SECTOR, SECTOR + HEADER + next.length).every(b => b === 255) ||
        !image.subarray(CODE, CODE + code.length).every(b => b === 255))
      throw new Error('No space to preserve the original My Lab letter');
    // Back up only the changed prefix. The original padding and trailing
    // payload stay exactly where they were in the sprite pack.
    const original = entry.subarray(0, next.length);
    dv.setUint32(SECTOR, MAGIC, true);
    dv.setUint32(SECTOR + 4, next.length, true);
    dv.setUint32(SECTOR + 8, C.crc32(original), true);
    dv.setUint32(SECTOR + 12, C.crc32(next), true);
    image.set(original, SECTOR + HEADER);
    entry.set(next);
    image.set(code, CODE);
    image.set(FITTED, HOOK);
  } else {
    const size = dv.getUint32(SECTOR + 4, true);
    const original = image.subarray(SECTOR + HEADER, SECTOR + HEADER + size);
    if (!size || size > entry.length || SECTOR + HEADER + size > CODE ||
        C.crc32(original) !== dv.getUint32(SECTOR + 8, true) ||
        C.crc32(entry.subarray(0, size)) !== dv.getUint32(SECTOR + 12, true))
      throw new Error('Invalid My Lab text layout or letter backup');
    entry.set(original);
    image.fill(255, SECTOR, SECTOR + HEADER + size);
    image.fill(255, CODE, CODE + code.length);
    image.set(STOCK, HOOK);
  }
  return image;
}

root.ParamixMyLabTextFit = {apply, has, enabled: installed};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabTextFit;
})(typeof window !== 'undefined' ? window : globalThis);
