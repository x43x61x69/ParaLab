// My Lab v1.0.00 confirmation prompts and Traditional Chinese dialogue.
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const ASSETS = 0x211000, SECTOR = 0x1E2000, HOOK = 0x126D2C;
const hex = str => Uint8Array.from(str.match(/../g), b => parseInt(b, 16));
const marker = hex('444c475752503031'); // DLGWRP01
const stockHook = hex('088003e0'), fitHook = hex('bbf078b9');
// Continues after the existing text-layout decoder. The displaced STRH writes
// the native text ID. For the six chosen scenes and confirmation record 0x9D,
// set X to 28 (visible ink starts at panel x=6). The Latin-language versions
// use the same -2 px tracking as the existing translated confirmation screens.
const marginCode = hex(
  '0880bdf816209d2a1ad10e4a1288242a09d0472a07d0482a05d04f2a03d0' +
  '502a01d0642a0cd11c224a80074a1288c2f34322012a04d0082a02d20222' +
  '52420a8144f76abe08170018ea060018');
// Number of native glyphs on each line. Keep the existing number of breaks so
// all text records and all nine language tables retain their original addresses.
const paragraphs = [
  [615, [0x49C8EAE6, 0xFD39026C], [7,5,0,5,12], [7,5,0,9,8]], // skill-test reward
  [629, [0x99A98C7F, 0xFE1AA9F4], [7,5,10], [7,8,7]],          // sending a crafted item
  [637, [0x80EC0486, 0x1EC67B37], [8,5,7,6,3,10], [8,5,7,6,5,8]], // sending special food
  [639, [0xB61B5D1F, 0x6214AC8D], [3,11], [5,9]],              // confirm sending food
  [640, [0x5FF00C6C, 0x0124F6AB], [9,9,11,6], [9,9,9,8]],     // replacing a garden Tama
  [641, [0x93CFB6EC, 0x0680671C], [4,10], [8,6]],              // confirm replacement
];
const same = (a, offset, b) => b.every((v, i) => a[offset + i] === v);
function hasChinese(rom) { return same(rom, SECTOR, marker); }
function wrap(glyphs, lengths) {
  const result = new Uint8Array((glyphs.length + lengths.length) * 2);
  const view = new DataView(result.buffer);
  let start = 0, offset = 0;
  for (const length of lengths) {
    for (const glyph of glyphs.slice(start, start + length)) {
      view.setUint16(offset, glyph, true);
      offset += 2;
    }
    start += length;
    view.setUint16(offset, start === glyphs.length ? 0 : 0xF000, true);
    offset += 2;
  }
  return result;
}
function applyChinese(rom, enabled) {
  const installed = hasChinese(rom);
  if (enabled === installed) return rom;
  if (rom.length !== 0x1000000 || !same(rom, HOOK, installed ? fitHook : stockHook) ||
      (installed ? !same(rom, SECTOR + 32, marginCode) :
        rom.subarray(SECTOR, SECTOR + 4096).some(b => b !== 255)))
    throw new Error('Unexpected My Lab dialogue hook or reserved sector');
  const changes = [];
  let mask = installed ? rom[SECTOR + marker.length] : 0;
  if (installed && (mask >= (1 << paragraphs.length) ||
      rom[SECTOR + marker.length + 1] !== (mask ^ 255)))
    throw new Error('Invalid My Lab wrapped dialogue list');
  paragraphs.forEach(([id, checksums, stock, fit], index) => {
    if (installed && !(mask & (1 << index))) return;
    const entry = C.nativeTextEntry(rom, ASSETS, 7, id - 1);
    if (!entry) return;
    const {start, end} = entry;
    const glyphs = [];
    for (let at = start; at < end - 2; at += 2) {
      const glyph = rom[at] | rom[at + 1] << 8;
      if (glyph !== 0xF000) glyphs.push(glyph);
    }
    if (glyphs.length !== stock.reduce((sum, n) => sum + n, 0)) return;
    const original = wrap(glyphs, stock), wrapped = wrap(glyphs, fit);
    // Stock Chinese and the community font use different codes for some
    // identical characters. Leave independently edited dialogue as supplied.
    if (original.length !== end - start || !checksums.includes(C.crc32(original)) ||
        !same(rom, start, installed ? wrapped : original)) return;
    changes.push([start, enabled ? wrapped : original]);
    mask |= 1 << index;
  });
  for (const [at, bytes] of changes) rom.set(bytes, at);
  rom.set(enabled ? fitHook : stockHook, HOOK);
  if (enabled) {
    rom.set(marker, SECTOR);
    rom[SECTOR + marker.length] = mask;
    rom[SECTOR + marker.length + 1] = mask ^ 255;
    rom.set(marginCode, SECTOR + 32);
  } else {
    rom.fill(255, SECTOR, SECTOR + marker.length + 2);
    rom.fill(255, SECTOR + 32, SECTOR + 32 + marginCode.length);
  }
  return rom;
}
// DLGWRP01 ROMs also remain removable when upgrading to the other languages.
const DRAW_SECTOR = 0x1E3000, DRAW_HOOK = 0x15089C;
const drawMarker = hex('444c47414c4c3031'); // DLGALL01
const drawStock = hex('80b598b0'), drawHook = hex('92f0c0bb');
const drawCode = hex(
  '70b504461a49098846292ad3502928d818480088c0f343200138082821d8164a536b1a4402eb' +
  '00135b691a440ff24c052b78b3b18b4212d16b8832f8133002eb43032668b3420ad105f10403' +
  '1b5643b1268c2384204600f007f8268470bd0e35e6e72046bde8704080b598b06df708bc0817' +
  '0018ea0600180010216046003e02000000000000fe000000470047020000ff00ff00fe000000' +
  '4800670200fefefefefffe00ff004e007502fe0000ffff00000000004f007d02fefffefefffe' +
  'fe00fe004f007f02ff00000000000000fe004f008002fe00ffffffffff00fe004f008102ff00' +
  '000000000000ff0050008102ff00000000000000ff0000');
// Indexed within the native word stream. Positive positions turn a space
// into a break, negative positions join two lines with a native space.
const latinBreaks = [
  [1, 629, 926523449, 7, -12, 18, 45],
  [1, 637, 3562039341, -30, 36],
  [1, 640, 567164633, 10, -12, -17, 22, -26, 34, -41, 46],
  [2, 629, 3035315502, 26, -32, 37],
  [2, 640, 3228099360, 31],
  [4, 640, 2835744617, 41],
  [5, 629, 1242278201, 6, 35, -38, 41, -50, 53],
  [6, 629, 3426449800, 15, 48, -55, 61],
];
function has(rom) { return hasChinese(rom) && same(rom, DRAW_SECTOR, drawMarker); }
function enabled(rom) { return hasChinese(rom) || same(rom, DRAW_SECTOR, drawMarker); }
function apply(rom, on) {
  const installed = same(rom, DRAW_SECTOR, drawMarker);
  if (installed === on) return applyChinese(rom, on);
  if (rom.length !== 0x1000000 || !same(rom, DRAW_HOOK, installed ? drawHook : drawStock) ||
      (installed ? !same(rom, DRAW_SECTOR + 32, drawCode) :
        rom.subarray(DRAW_SECTOR, DRAW_SECTOR + 4096).some(b => b !== 255)))
    throw new Error('Unexpected My Lab localized dialogue renderer');
  const dv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const changes = [];
  let mask = installed ? dv.getUint16(DRAW_SECTOR + 8, true) : 0;
  if (installed && dv.getUint16(DRAW_SECTOR + 10, true) !== (mask ^ 0xffff))
    throw new Error('Invalid My Lab localized dialogue list');
  let strings, checksumDelta = 0;
  latinBreaks.forEach(([language, id, checksum, ...positions], index) => {
    if (installed && !(mask & (1 << index))) return;
    const e = C.nativeTextEntry(rom, ASSETS, language, id - 1);
    if (!e || positions.some(p => e.start + 2 * Math.abs(p) + 2 > e.end)) return;
    const original = Uint8Array.from(rom.subarray(e.start, e.end));
    const view = new DataView(original.buffer);
    for (const p of positions) {
      const prev = p < 0 ? 0xf000 : 305, next = p < 0 ? 305 : 0xf000;
      if (view.getUint16(2 * Math.abs(p), true) !== (installed ? next : prev)) return;
      view.setUint16(2 * Math.abs(p), prev, true);
    }
    if (C.crc32(original) !== checksum) return;
    strings = e.strings;
    mask |= 1 << index;
    for (const p of positions) {
      const at = e.start + 2 * Math.abs(p), next = (p > 0) === on ? 0xf000 : 305;
      checksumDelta += (next & 255) + (next >> 8) - rom[at] - rom[at + 1];
      changes.push([at, next]);
    }
  });
  applyChinese(rom, on);
  for (const [at, next] of changes) dv.setUint16(at, next, true);
  if (checksumDelta) dv.setUint32(strings + 4, dv.getUint32(strings + 4, true) + checksumDelta, true);
  rom.set(on ? drawHook : drawStock, DRAW_HOOK);
  if (on) {
    rom.set(drawMarker, DRAW_SECTOR);
    dv.setUint16(DRAW_SECTOR + 8, mask, true);
    dv.setUint16(DRAW_SECTOR + 10, mask ^ 0xffff, true);
    rom.set(drawCode, DRAW_SECTOR + 32);
  } else {
    rom.fill(255, DRAW_SECTOR, DRAW_SECTOR + 12);
    rom.fill(255, DRAW_SECTOR + 32, DRAW_SECTOR + 32 + drawCode.length);
  }
  return rom;
}
root.ParamixMyLabDialogWrap = {apply, has, enabled};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabDialogWrap;
})(typeof window !== 'undefined' ? window : globalThis);
