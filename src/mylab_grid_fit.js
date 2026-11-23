/* Native Paradise pagination for the My Lab research, garden and item collections. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const XIP = 0x111000, ASSETS = 0x211000;
const SECTOR = 0x1a4000, TABLE = SECTOR + 0x800, BACKUP = 0x1cc000;
const view = a => new DataView(a.buffer, a.byteOffset, a.byteLength);
const u16 = (a, i) => view(a).getUint16(i, true);
const u32 = (a, i) => view(a).getUint32(i, true);
const set16 = (a, i, n) => view(a).setUint16(i, n, true);
const set32 = (a, i, n) => view(a).setUint32(i, n, true);
const hex = s => Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16));
const tag = (a, i) => String.fromCharCode(...a.subarray(i, i + 8));
const match = (a, i, expected) => expected.every((byte, j) => byte === a[i + j]);

// Generated from feld/src/mylab_paradise/grid_fit.S. Offsets are relative to
// the game's XIP base. NOP padding preserves the address of each continuation.
const patches = [
  // Scene-specific layout record.
  [0x159e4, '00eb4100',
    '7df010fb'],
  // Scene-specific layout record.
  [0x16332, '00eb4100',
    '7cf069fe'],
  // Scene-specific layout record.
  [0x16372, '00eb4100',
    '7cf049fe'],
  // Move garden page and cursor together.
  [0x1f2c8, '0798816801f114020392',
    '73f004bf00bf00bf00bf'],
  // Restore garden page.
  [0x1f49e, '22f017fc',
    '73f02fff'],
  // Restore selected page.
  [0x1f8b0, '4af6ab21c2f6aa21019180fb011000ebd070',
    '73f0f3fb00bf00bf00bf00bf00bf00bf00bf'],
  // Restore selected cell.
  [0x1f8e6, '80fb012101ebd17101eb4101a0eb4100',
    '73f0defb00bf00bf00bf00bf00bf00bf'],
  // Keep the garden wallpaper fixed when the card group scrolls.
  [0x3ac54, '496a',
    '0021'],
  // Keep the garden wallpaper fixed when the card group scrolls.
  [0x3afa6, '496a',
    '0021'],
  // Build all thirty items.
  [0x3b60c, '0e2854dcffe7',
    '1d2800f3ba80'],
  // Cell template for absolute item.
  [0x3b626, '02f2a122',
    '57f07ffd'],
  // Icon template for absolute item.
  [0x3b65a, '02f52c72',
    '57f06dfd'],
  // Place item on its page.
  [0x3b6ac, 'ffe7bdf856000130',
    '57f04dfdbdf85600'],
  // Advance original item ID.
  [0x3b6b4, 'adf85600a6e70020adf8',
    '0130adf85600fff7a5bf'],
  // Three-page wrap.
  [0x3b838, '01ebd17323f00103c91a',
    '032928bf002100bf00bf'],
  // Up indicator on last page.
  [0x3b8d4, '98b9ffe7',
    '022812d0'],
  // Page count.
  [0x63464, '05304af6ab21c2f6aa2180fb011000ebd070',
    '2ff011fe00bf00bf00bf00bf00bf00bf00bf'],
  // Number of real cells on this page.
  [0x63522, '01eb4101a0eb410005280bdcffe70998b0f90200bdf92e1001eb4101a0eb4100029002e006200290ffe7',
    '2ff0c8fd029000bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf'],
  // First item on page.
  [0x6356c, '02eb420201eb4201',
    '2ff0acfd00bf00bf'],
  // Preserve wheel direction and detect a 4- or 6-cell page boundary.
  [0x63702, '29f08bfc',
    '2ff07dfe'],
  // Render new page.
  [0x637cc, '4af6ab21c2f6aa2180fb011000ebd070',
    '2ff065fc00bf00bf00bf00bf00bf00bf'],
  // Animate cursor to selected cell.
  [0x63892, '4af6ab21c2f6aa2180fb012101ebd17101eb4101a0eb4100',
    '2ff008fc00bf00bf00bf00bf00bf00bf00bf00bf00bf00bf'],
  // Grid Thumb routines.
  [0x93000, '',
    '504752443030303100eb4100b2f5307f2ed2872a2cd33eb553490c68a0eb0405b5f5803f23d251490988492909d04a2909d04f2907d0242907d0342917d1082304e0032302e0022300e00423484d35f8024b64b12988914206d169880b4203d0a9884348401802e00635013cf1e73ebd70473e4b1b88492b05d04a2b03d04f2b01d0062370470423704708b5fff7f1ffc0180138b0fbf3f008bd08b5fff7e9ffb0fbf3f008bd1ab5fff7e3ffb0fbf3f101fb13001abd08b5fff7dbff01fb13009842c8bf184608bd08b5fff7d2ff02fb031108bd25480088242808d10998d0f81c11b1f902108cf7a9f98cf72cb90798816801f1140203928cf7ebb81b480088242818bf70471fb50b9cd4f81c11b1f9021004294ff0000128bfcff6807104f13800aef7d5fd1fbd0c23b2fbf3fc0cfb132202f2a12270470c23b2fbf3fc0cfb132202f2b022002370471fb5bdf86e200c23b2fbf3f21a98816d01ebc2513830aef7b6fd1fbd000040d900180817001800380910'],
  // Grid Thumb routines.
  [0x93300, '',
    '04b5aef7e5fcbde80440fff7f7be'],
  // Grid Thumb routines.
  [0x93400, '',
    '70b50446a588f9f709fefff732feb5fbf3f5a088b0fbf3f0401b18bf012070bd'],
].map(([offset, old, code]) => ({ at: XIP + offset, old: hex(old), code: hex(code) }));

function layoutOverrides(image) {
  const pack = ASSETS + u32(image, ASSETS + 20);
  const index = pack + 2 * u32(image, pack + 16);
  const records = pack + 2 * u32(image, pack + 20);
  const ptr = id => records + 2 * u16(image, index + 2 * id);
  const rows = [];
  function place(scope, id, x, y) {
    const entry = image.slice(ptr(id), ptr(id + 1));
    if (entry.length < 8 || entry.length > 32) throw Error('Unexpected My Lab layout ' + id.toString(16));
    set16(entry, 2, x);
    if (y !== undefined) set16(entry, 4, y);
    rows.push({ scope, id, entry });
  }
  // Scene masks in the lookup shim keep the simulation result list at its native size.
  const research = 1, selectors = 2, garden = 4, collection = 8;
  for (let i = 0; i < 4; i++) place(research, 0x87 + i, 39);
  for (let i = 0; i < 3; i++) place(research, 0x97 + i, 39);
  place(research, 0x193, 27); // Top-left category ball.
  for (let i = 0; i < 4; i++) {
    const x = 50 + 53 * (i % 2), y = 38 + 54 * Math.floor(i / 2);
    place(selectors, 0x1c8 + i, x, y);
    place(selectors, 0x1d0 + i, x, y + 16);
    place(selectors, 0x1d9 + i, x - 4, y - 22);
  }
  place(selectors, 0x1ce, 50, 38);
  for (const id of [0x1d6, 0x1d7, 0x1d8]) place(selectors, id, 138);
  for (let i = 0; i < 6; i++) {
    const x = 54 + 52 * (i % 2);
    const y = 37 + 54 * Math.floor((i % 4) / 2) + 128 * Math.floor(i / 4);
    place(garden, 0x106 + i, x, y);
    place(garden, 0x10d + i, x, y + 16);
  }
  place(garden, 0x10c, 54, 37);
  for (let i = 0; i < 12; i++) {
    const x = 35 + 30 * (i % 4), y = 30 + 34 * Math.floor(i / 4);
    place(collection, 0x2a1 + i, x, y);
    place(collection, 0x2b0 + i, x, y);
  }
  let offset = 2 + rows.length * 6;
  const table = new Uint8Array(offset + rows.reduce((n, row) => n + row.entry.length, 0));
  if (table.length > 0x800) throw Error('My Lab grid layout exceeds its sector');
  set16(table, 0, rows.length);
  rows.forEach(({scope, id, entry}, i) => {
    const at = 2 + 6 * i;
    set16(table, at, id); set16(table, at + 2, scope); set16(table, at + 4, offset);
    table.set(entry, offset);
    offset += entry.length;
  });
  return table;
}

function detailSprite(image) {
  const sprites = ASSETS + u32(image, ASSETS + 36);
  return image.subarray(sprites + u32(image, sprites + 148 * 4), sprites + u32(image, sprites + 149 * 4));
}

// The title and character frame are painted into one image. Move each side
// inward eight pixels; preserve all rows, the stripe period and palette indices.
function redrawDetail(original) {
  const h = C.spriteHeader(original);
  if (h.sw !== 32 || h.sh !== 64 || h.iw !== 5 || h.ih !== 2 || h.numSprites !== 10 ||
      h.flags !== 0xa7 || h.bpp !== 2 || h.numPal !== 1)
    throw Error('Unexpected My Lab research detail sprite');
  const { cells } = C.spriteDecode(original, 0, true);
  // Short cells let the repeating stripe and border tiles share compressed data.
  const sw = 8, sh = 16, cols = 160 / sw, count = cols * (128 / sh);
  const out = new Uint8Array(original.length);
  out.set(original.subarray(0, h.pixOffset));
  set16(out, 6, count);
  out[8] = sw; out[9] = sh; out[12] = cols; out[13] = 128 / sh;
  let pos = h.pixOffset + 8 * count;
  const seen = new Map();
  for (let tile = 0; tile < count; tile++) {
    const raw = new Uint8Array(sw * sh / 2);
    for (let k = 0; k < sw * sh; k++) {
      const x = (tile % cols) * sw + k % sw, y = Math.floor(tile / cols) * sh + Math.floor(k / sw);
      const sx = x < 8 || (x >= 80 && x < 152) ? x + 8 : x - 8;
      const pixel = cells[Math.floor(y / 64) * 5 + Math.floor(sx / 32)][(y % 64) * 32 + sx % 32];
      raw[k >> 1] |= pixel << (4 * (k % 2));
    }
    const key = raw.join(',');
    let payload = seen.get(key);
    if (!payload) {
      const encoded = C.rleEncode(raw).map(b => b ^ 0x53);
      if (pos + encoded.length > out.length) throw Error('Research detail sprite does not fit its original slot');
      payload = { offset: pos - h.pixOffset, length: encoded.length };
      out.set(encoded, pos);
      pos = (pos + encoded.length + 3) & ~3;
      seen.set(key, payload);
    }
    const at = h.pixOffset + tile * 8;
    set32(out, at, payload.offset); set32(out, at + 4, payload.length);
  }
  set32(out, 0, pos);
  return out;
}

function has(image) { return tag(image, SECTOR) === 'PGRD0001'; }
function apply(image, enabled) {
  if (has(image) === enabled) return image;
  // Validate all preconditions before writing this module into the caller's image.
  const sector = image.subarray(SECTOR, SECTOR + 0x1000);
  const backup = image.subarray(BACKUP, BACKUP + 0x2000);
  if (sector.length !== 0x1000 || backup.length !== 0x2000 ||
      (enabled && (!sector.every(b => b === 255) || !backup.every(b => b === 255))))
    throw Error('My Lab grid-fit work area is occupied');
  for (const { at, old, code } of patches) {
    if (!match(image, at, enabled ? old : code))
      throw Error('Unexpected My Lab grid firmware at 0x' + at.toString(16));
  }
  const sprite = detailSprite(image);
  const table = enabled ? layoutOverrides(image) : null;
  let replacement;
  if (enabled) {
    if (sprite.length + 32 > backup.length) throw Error('My Lab detail backup is too large');
    replacement = redrawDetail(sprite);
  } else {
    const length = u32(backup, 8);
    if (tag(backup, 0) !== 'PGRDIMG1' || length !== sprite.length || length > backup.length - 32 ||
        u32(backup, 16) !== C.crc32(sprite)) throw Error('Unexpected fitted My Lab detail sprite');
    replacement = backup.slice(32, 32 + length);
    if (u32(backup, 12) !== C.crc32(replacement)) throw Error('Damaged My Lab detail backup');
  }
  if (enabled) {
    backup.set(new TextEncoder().encode('PGRDIMG1'));
    set32(backup, 8, sprite.length); set32(backup, 12, C.crc32(sprite));
    set32(backup, 16, C.crc32(replacement)); backup.set(sprite, 32);
    image.set(table, TABLE);
  } else {
    sector.fill(255); backup.fill(255);
  }
  for (const { at, old, code } of patches) image.set(enabled ? code : old, at);
  sprite.set(replacement);
  return image;
}
const api = { has, apply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabGridFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
