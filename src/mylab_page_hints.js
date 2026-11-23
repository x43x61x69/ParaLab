/* Add native page indicators to a Paradise ROM that already contains GridFit v1. */
(function (root) {
'use strict';
const XIP = 0x111000, CODE = 0x1a4480, LIMIT = 0x1a4800;
const tag = (image, at) => String.fromCharCode(...image.subarray(at, at + 8));
const hex = s => Uint8Array.from(s.match(/../g) || [], pair => parseInt(pair, 16));

// Regenerate with feld/src/mylab_paradise/page_hints.S and page_hints.ld.
// The helper occupies the originally erased gap before GridFit's record table.
const patches = [
  [0x1f100, 'f3f762f8',
    '74f0dcf9'],
  [0x1f264, 'e8f740fb',
    '74f031f9'],
  [0x1f4a4, '06b080bd',
    '74f021b8'],
  [0x3b8f2, '1bf095fb',
    '57f025fe'],
  [0x634d0, 'f4f74ef9',
    '30f055f8'],
  [0x634e4, 'f4f7aaf9',
    '30f050f8'],
  [0x63658, '0a980eb0',
    '2ff0b2bf'],
  [0x93480, '',
    '475041473030303170b582b01d4600230093c3f7c5fd064635b1716b01eb054106f11400aef714fc34b1b16d01eb044106f13800aef70cfc02b070bd544a1288242a08bf10207ef77fbe10b5044674f70bfa4f480088242806d1d4f81c010021c160204600f00af810bd49480088242802d1059800f002f806b080bd70b582b00446d4f81c512888042817d96888042834bf7a267926e96839b1d1f8dc00b0420cd0d1f8140175f79dfcd4f814010021324600230093c3f773fde86002b070bd70b582b005460093c3f76afd064631480068008d012807d12846314679226ff011030024fff790ff304602b070bd28480088492802d04a2800d04f28704710b50c46c4f7f5f809e010b50c4682b04ff0000ccdf800c0c4f751f902b003b4fff7e6ff0bd1d4f81c41e088012806d8009800f114004ff08071aef78afb03bc10bd70b5fff7d4ff1dd10d98c588012d19d9bdf93e60013d0224002e0ad011980e9979226ff00703ae4238bf6ff01903fff74bffae4206d211980e997a226ff00703fff742ff0e98bde870400eb080bd0000081700188c1a0118'],
].map(([offset, old, code]) => ({ at: XIP + offset, old: hex(old), code: hex(code) }));
function has(image) { return tag(image, CODE) === 'GPAG0001'; }

function apply(image, enabled) {
  if (has(image) === enabled) return image;
  if (tag(image, 0x1a4000) !== 'PGRD0001') throw Error('Expected My Lab grid fit before page hints');
  for (const { at, old, code } of patches) {
    // Empty original bytes describe the extension code in the reserved flash gap.
    const current = image.subarray(at, at + code.length);
    const expected = enabled ? old : code;
    if (current.length !== code.length || (at === CODE && at + code.length > LIMIT) ||
        (expected.length ? !expected.every((byte, i) => current[i] === byte) :
          !current.every(byte => byte === 0xff)))
      throw Error('Unexpected My Lab page-hint code at 0x' + at.toString(16));
  }
  for (const { at, old, code } of patches) {
    if (!enabled && !old.length) image.fill(0xff, at, at + code.length);
    else image.set(enabled ? code : old, at);
  }
  return image;
}
const api = { has, apply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabPageHints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
