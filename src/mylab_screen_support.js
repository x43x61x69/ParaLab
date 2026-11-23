// Compatibility of the My Lab v1.0.00 firmware with the Paradise screen patches.
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const M = root.ParamixMyLab || (typeof require === 'function' ? require('./mylab') : null);
const SIZE = 0x1000000, ASSETS = 0x211000, TRAILER = 0xA6B000;
const HEADER = 0x100000, XIP = 0x111000, CHUNK = 0x4000;
const crc = (rom, start, length) => C.crc32(rom.subarray(start, start + length));
const text = (rom, offset, length) => String.fromCharCode(...rom.subarray(offset, offset + length));
const view = rom => new DataView(rom.buffer, rom.byteOffset, rom.byteLength);

// CRCs of every 16 KiB of the retail game XIP, in order, after undoing screen
// corrections. Alternatives are the Computer launcher, language selector,
// Paradise GPIO/presenter/wheel/sleep fixes and their supported earlier forms.
// Graphics, localized strings, Garden records, and all save slots are outside.
const gameChunks = [
  [0x78F569CB],
  [0x873FE43F, 0x0057CB13],
  [0x74D187B3],
  [0x3A1541E0],
  [0x533B7A1D, 0xE09ECC61],
  [0xA7D05CEE, 0x38C8D069],
  [0x585EA2B4],
  [0x63744F83, 0x77BDA112, 0xE42B73AC],
  [0xA6BCA415],
  [0xDDDAF3C3],
  [0xA69A9FD5, 0xFB13BFE4],
  [0x92DC603B],
  [0x31D644E1],
  [0x06639C89, 0x8A618CAF, 0x8EF0FCAC, 0x3FDDCFA7, 0xB3DFDF81, 0x3B4CBFA4],
  [0xE1E376B3],
  [0x47E74027],
  [0x13680197],
  [0x94D058ED, 0x1BF5F3C4, 0x3BB215C8],
  [0xE1841AEC],
  [0x04025FE6],
  [0x8EE3FDE9, 0x4A4E2D44],
  [0xB76FB56F],
  [0x4F9B65F2],
  [0x42BE31DE, 0x9DB7E455],
  [0x89D94F1A, 0xFF45B559],
  [0x04981E15, 0xFC6DF7B4, 0xF6D388A2],
  [0xA7D525F4, 0x3AF14D01, 0x41C0EC8C, 0xF866C3FC],
  [0xAEBE3A7D],
  [0x07B87534],
  [0x98C723A3],
  [0xBBDE41EE],
];
const adapterCrcs = [
  0x378CEC2E, 0xC4579999, 0x240AA59A, 0x238F6826, 0x3105BF25, 0x3559256E,
  0xE0722EA2, 0x8D1A5666, 0x23F0417B, 0x59D8A174, 0x752BE1D5, 0x365F6437,
  0x33A78456, 0xE7EE2CF1, 0xB5EC9F70, 0x4E6E4393, 0x36E7C760, 0xF04D170E,
];
function archive(rom, offset, count, limit) {
  const v = view(rom);
  if (offset + 16 + count * 16 > limit || text(rom, offset, 4) !== 'ARC2' ||
      v.getUint32(offset + 12, true) !== count) return false;
  const length = v.getUint32(offset + 8, true);
  const end = offset + 16 + length;
  if (end > limit) return false;
  let previous = 16 + 16 * count;
  for (let i = 0; i < count; i++) {
    const desc = offset + 16 + i * 16, at = v.getUint32(desc + 4, true);
    const size = v.getUint32(desc + 8, true);
    if (v.getUint32(desc, true) || at < previous || v.getUint32(desc + 12, true) > size ||
        offset + at + size > end) return false;
    previous = at + size;
  }
  return v.getUint32(offset + 4, true) === C.arc2Checksum(rom, offset, length);
}
function assetsSupported(rom) {
  if (!archive(rom, ASSETS, 24, TRAILER)) return false;
  const v = view(rom), read = at => v.getUint32(at, true);
  const strings = ASSETS + read(ASSETS + 52);
  if (!archive(rom, strings, 9, strings + read(ASSETS + 60))) return false;
  const sprites = ASSETS + read(ASSETS + 36), size = read(ASSETS + 44);
  if (size < 4 || read(sprites) % 4 || read(sprites) < 4 * 1749 || read(sprites) > size / 6)
    return false;
  const indexSize = read(sprites);
  for (let i = 0; i < indexSize; i += 4) {
    const off = read(sprites + i), next = i + 4 < indexSize ? read(sprites + i + 4) : size;
    if (off < indexSize || off + 24 > next || next > size) return false;
    const at = sprites + off;
    if (read(at) > next - off ||
        v.getUint16(at + 6, true) * rom[at + 8] * rom[at + 9] > 0x1000000) return false;
  }
  return true;
}
function inspect(rom, operations) {
  let version = null;
  const fail = reason => ({ supported: false, state: null, version, reason });
  try {
    if (!ArrayBuffer.isView(rom) || rom.BYTES_PER_ELEMENT !== 1 || rom.length !== SIZE)
      return fail('Invalid My Lab ROM size');
    if (text(rom, HEADER, 8) === 'SN_FWIN\0') {
      const field = text(rom, HEADER + 8, 8).replace(/\0+$/, '');
      version = /^v(\d+\.\d+\.\d+)$/.exec(field)?.[1] || null;
    }
    if (version !== '1.0.00' || crc(rom, HEADER, 4096) !== 0x6DEFC54A ||
        crc(rom, TRAILER, 4096) !== 0x6DEFC54A)
      return fail('Unrecognized My Lab firmware header or trailer');
    const mode = operations.status(rom);
    if (!mode) return fail('Unrecognized My Lab launcher');
    const port = M.hasParadisePortMarker(rom);
    const source = port ? 'paradise' : mode === 'install' ? 'stock' : 'native-menu';
    const sleepHandler = crc(rom, 0x110000, 4096);
    const diagnostic = port && text(rom, 0x19D108, 8) === 'PXMLSLPD' &&
      sleepHandler === 0xD24EFE8B;
    if (crc(rom, 0x101000, 0xF000) !== (port ? 0xA99EC765 : 0xFDD503FA) ||
        (sleepHandler !== 0xFFC5881E && !diagnostic) ||
        crc(rom, XIP, CHUNK) !== gameChunks[0][0])
      return fail('Unrecognized My Lab game program');
    if (!assetsSupported(rom)) return fail('Unrecognized My Lab asset layout');
    const state = port ? operations.state(rom) : false;
    const original = Uint8Array.from(rom);
    const plain = port ? operations.edit(original, false) : original;
    if (port) operations.normalizeSceneWheel(plain);
    if (!gameChunks.every((allowed, i) => allowed.includes(crc(plain, XIP + i * CHUNK, CHUNK))))
      return fail('Unrecognized My Lab game program');
    if (port) {
      const gameAdapter = crc(plain, 0x19E000, 4096);
      if (!adapterCrcs.includes(gameAdapter) || gameAdapter !== crc(plain, 0x45000, 4096))
        return fail('Unrecognized Paradise display adapter');
    } else {
      // The real port installs both the display call and the wheel controls
      // before applying screen corrections. Preview those dependencies here.
      const v = view(plain);
      if (v.getUint32(0x1647A4, true) !== 0xB082B580)
        return fail('Unrecognized My Lab display entry');
      v.setUint32(0x1647A4, 0xBC2CF039, true);
      operations.prepareWheel(plain);
    }
    const fitted = operations.edit(plain, true);
    // A recognized marker by itself is insufficient. Exercise both sets of
    // structure and backup guards, including the native sprite capacities.
    const restored = operations.edit(fitted, false);
    for (let i = 0; i < plain.length; i++) {
      if (plain[i] !== restored[i]) return fail('My Lab screen corrections do not restore the original data');
    }
    return { supported: true, state, version, source };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unrecognized My Lab screen layout');
  }
}
root.ParamixMyLabScreenSupport = {inspect};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabScreenSupport;
})(typeof window !== 'undefined' ? window : globalThis);
