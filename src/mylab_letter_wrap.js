/* Reflow the Chinese November 23 director's letter in place. The other
 * languages and the birthday and New Year greetings use separate strings. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const BREAK = 0xf000;

function letter(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const entry = C.nativeTextEntry(image, 0x211000, 7, 0x2a5);
  if (!entry) return null;
  const { start, end } = entry;
  const u16 = at => view.getUint16(at, true);
  // Preserve the ROM's own glyphs in both the stock and the translated
  // Chinese table. “重要” and the two signature dashes are common anchors.
  let important = -1, signature = -1;
  for (let at = start; at + 2 < end; at += 2) {
    if (u16(at) === 0x2261 && u16(at + 2) === 0x1fbf) important = at;
    if (u16(at) === 13 && u16(at + 2) === 13) signature = at;
  }
  if (important <= start || signature < important + 12 || u16(signature - 2) !== BREAK ||
      u16(signature - 4) !== BREAK) return null;
  const fitted = u16(important - 2) === BREAK;
  if ((u16(signature - 6) === BREAK) === fitted) return null;
  return { start: fitted ? important - 2 : important, last: signature - 2, fitted };
}

function has(image) { return letter(image)?.fitted === true; }
function apply(image, enabled) {
  const span = letter(image);
  if (!span) throw Error('Unexpected My Lab November 23 letter');
  if (enabled === span.fitted) return image;
  // Move one existing blank line above the second paragraph. The signature,
  // string length, glyph bytes and additive ARC2 checksums stay intact.
  const { start, last } = span;
  if (enabled) image.copyWithin(start + 2, start, last);
  else image.copyWithin(start, start + 2, last + 2);
  const at = enabled ? start : last;
  image[at] = BREAK & 255;
  image[at + 1] = BREAK >> 8;
  return image;
}
const api = { has, apply, applicable: image => letter(image) !== null };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabLetterWrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
