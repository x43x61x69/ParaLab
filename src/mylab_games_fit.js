/* Optional My Lab game layouts for the 128-column Paradise panel. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const cave = 0x1A6000, present = 0x1647A4, assets = 0x211000;
const stockPresent = [0x39, 0xF0, 0x2C, 0xBC], fittedPresent = [0x41, 0xF0, 0x2C, 0xBC];
// Compiled from feld/src/mylab_paradise/games_fit.c (build_games_fit.sh).
const nativeCode = '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';
const program = Uint8Array.from(atob(nativeCode), c => c.charCodeAt(0));
const maps = [
  [[0,16],[127,143]],                                      // Standard centre crop.
  [[0,0],[23,23],[104,136],[127,159]],                     // Keep both gauge faces round.
  [[0,0],[127,159]],                                        // Five puzzle columns share one grid.
  [[0,32],[127,159]],                                       // Live balloon round, native right edge.
];
function buildSector() {
  const sector = new Uint8Array(4096).fill(255);
  sector.set(program);
  sector.set([0x47, 0x46, 0x54, 3], 0xBF8);
  maps.forEach((points, index) => {
    for (let i = 1; i < points.length; i++) {
      const [x0, s0] = points[i - 1], [x1, s1] = points[i];
      for (let x = x0; x <= x1; x++) {
        // RGB565 source columns are stored right to left.
        sector[0xC00 + index * 128 + x] = 159 - Math.round(s0 + (s1 - s0) * (x - x0) / (x1 - x0));
      }
    }
  });
  return sector;
}
const sector = buildSector();
const backup = 0x1D1000;
const prefix = [0x47, 0x46, 0x54];
function matches(bytes, at, expected) {
  return expected.every((v, i) => v === bytes[at + i]);
}
function version(image) {
  return matches(image, cave + 0xBF8, prefix) ? image[cave + 0xBFB] : 0;
}
function knownV2(image) {
  return version(image) === 2 &&
    [0xBC0F3DD3,0xE1E0AA2E].includes(C.crc32(image.subarray(cave,cave+4096)));
}
function oldTitleRows(image) {
  return version(image) === 3 && C.crc32(image.subarray(cave,cave+4096)) === 0xCA419827;
}
function upgradePresenter(image) {
  if (oldTitleRows(image)) {
    image.set(sector,cave);
    return false; // Only native code changed; the ARC2 checksums still match.
  }
  if (version(image) !== 2) return false;
  apply(image,true);
  return true;
}
function has(image) { return version(image) === 3 && !oldTitleRows(image); }
function enabled(image) { return version(image) > 0; }
function fail(reason) { throw new Error('Unexpected My Lab game ' + reason); }
function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

// Values for the original corner option, the original game fit, and the revised game fit.
const positions = [
  [0x2EF,0x1427,31,15,15,47], [0x2F0,0x2D1F,31,15,15,47],
  [0x332,0x1427,28,12,28], [0x334,0x2D1F,28,12,28],
  [0x333,0x1427,135,151,135], [0x335,0x2C97,135,151,135],
  [0x33D,0x1427,134,150,134], [0x33E,0x2C97,134,150,134],
  [0x397,0x1407,25,9,25], [0x398,0x1407,25,9,25],
  [0x399,0x1407,25,9,25], [0x39A,0x1487,25,9,25],
  [0x43E,0x1427,134,150,150], [0x43F,0x2C97,134,150,150],
  [0x457,0x5207,32,48,48], [0x458,0x4207,32,48,48],
  [0x342,0x1407,144,144,128],
];
for (let id = 0x343; id < 0x346; id++) positions.push([id,0x5207,14,14,30]);
for (let id = 0x346; id < 0x36E; id++) {
  const column = (id - 0x346) % 5, original = 37 + column * 19;
  positions.push([id,0x1407,original,original,50 + column * 13]);
}
// Tutorial heart X, bank/actor/bubble X, teaching arrows, and crossing distance.
const animations = [
  [605,4,-71,-55],[605,10,-71,-55],[605,16,-71,-55],
  [570,6,64,48],[570,12,-68,-52],[570,18,-43,-30],[570,35,-24,-17],
  // Intro: bring the two left eggs inside the centred crop. Tutorial:
  // move only its animated character so all three balloons fit at native size.
  [461,20,-52,-44,3],[461,26,-60,-48,3],[468,6,54,38,3],
  [575,3,-40,-27],[576,3,-40,-27],[578,8,128,96],[580,8,128,96],
];

// Only the stretch of terrain between the two banks loses columns. The animated
// bubbles are independent native sprites, positioned by their own lane records.
function fitTerrain(original) {
  const {header: h, cells} = C.spriteDecode(original, 0, true);
  if (h.flags !== 0xA3 || h.bpp !== 2 || h.iw !== 5 || h.ih !== 2 ||
      h.sw !== 32 || h.sh !== 64 || h.numSprites !== 10) fail('bubble backdrop');
  const out = new Uint8Array(original.length), d = view(out);
  out.set(original.subarray(0, h.pixOffset));
  d.setUint16(6, 8, true);
  out[12] = 4;
  let pos = h.pixOffset + 64;
  for (let tile = 0; tile < 8; tile++) {
    const raw = new Uint8Array(1024);
    for (let k = 0; k < 2048; k++) {
      const x = (tile % 4) * 32 + k % 32;
      const sx = x <= 28 ? x : x >= 99 ? x + 32 : 28 + Math.round((x - 28) * 103 / 71);
      const source = cells[(tile >> 2) * 5 + (sx >> 5)];
      raw[k >> 1] |= source[(k & ~31) + (sx & 31)] << (4 * (k & 1));
    }
    const encoded = C.rleEncode(raw).map(x => x ^ 0x53);
    if (pos + encoded.length > out.length) fail('bubble backdrop capacity');
    d.setUint32(h.pixOffset + 8 * tile, pos - h.pixOffset, true);
    d.setUint32(h.pixOffset + 8 * tile + 4, encoded.length, true);
    out.set(encoded, pos);
    pos = (pos + encoded.length + 3) & ~3;
  }
  d.setUint32(0, pos, true);
  return out;
}

function apply(image, on) {
  const previous = version(image), next = on ? 3 : 0;
  if (previous === next) {
    if (on && oldTitleRows(image)) image.set(sector,cave);
    return image;
  }
  const d = view(image), u16 = at => d.getUint16(at, true), u32 = at => d.getUint32(at, true);
  const slot = image.subarray(cave, cave + 4096);
  const validLegacy = previous === 1 &&
    C.crc32(slot.subarray(0, 0x900)) === 0x29F5D633 &&
    slot.subarray(0xB40, 0xBF4).every(b => b === 255) &&
    u32(cave + 0xBF4) === C.crc32(slot.subarray(0x900, 0xB40)) &&
    C.crc32(slot.subarray(0xBF8)) === 0xE114C2AA;
  if (!(previous === 0 && slot.length === 4096 && slot.every(b => b === 255) ||
        validLegacy || knownV2(image) || previous === 3 && (matches(slot,0,sector) || oldTitleRows(image))) ||
      // Upgrading an active presenter leaves its caller alone; later options
      // can already have wrapped that call (including the puzzle overlay).
      !(previous === 2 && next === 3) && !matches(image, present, previous ? fittedPresent : stockPresent)) fail('display adapter');
  const pack = assets + u32(assets + 20), table = id => pack + 2 * u32(pack + 4 * id);
  const words = [];
  for (const [id,type,...xs] of positions) {
    const at = table(5) + 2 * u16(table(4) + 2 * id);
    const x = v => xs[Math.min(v,xs.length-1)];
    if (u16(at) !== type || u16(at + 2) !== x(previous)) fail('object 0x' + id.toString(16));
    words.push([at + 2, x(next)]);
  }
  for (const [id,word,before,after,minimumVersion = 2] of animations) {
    const at = table(14) + 4 * u16(table(13) + 2 * id) + 2 * word;
    if (d.getInt16(at,true) !== (previous >= minimumVersion ? after : before)) fail('animation ' + id + '/' + word);
    words.push([at,next >= minimumVersion ? after : before]);
  }
  const sprites = assets + u32(assets + 36), edits = [];
  let size = 32;
  for (let id = 1631; id <= 1633; id++) {
    const at = sprites + u32(sprites + 4 * id);
    const end = sprites + u32(sprites + 4 * (id + 1));
    if (end <= at || end > image.length || end - at > 0x5000) fail('terrain range');
    const current = image.subarray(at,end);
    const original = previous >= 2 ? image.subarray(backup + size, backup + size + current.length) : current;
    edits.push({at, original, current, size});
    size += current.length;
  }
  if (size > 0xF000 || backup + size > image.length) fail('terrain backup range');
  const saved = image.subarray(backup, backup + size);
  if (previous >= 2) {
    if (!matches(saved,0,[71,66,71,2]) || u32(backup+4) !== size ||
        C.crc32(saved.subarray(32)) !== u32(backup+8)) fail('terrain backup');
    edits.forEach(({current}, i) => {
      if (C.crc32(current) !== u32(backup+12+4*i)) fail('modified terrain');
    });
  } else if (next && !saved.every(b => b === 255)) fail('occupied terrain backup');
  if (previous === 2 && next === 3) {
    for (const [at,x] of words) d.setInt16(at,x,true);
    image.set(sector,cave);
    return image;
  }
  let save;
  if (next) {
    save = new Uint8Array(size);
    const sd = view(save);
    save.set([71,66,71,2]);
    sd.setUint32(4,size,true);
    edits.forEach((e,i) => {
      e.fitted = fitTerrain(e.original);
      save.set(e.original,e.size);
      sd.setUint32(12+4*i,C.crc32(e.fitted),true);
    });
    sd.setUint32(8,C.crc32(save.subarray(32)),true);
  }
  // All guards and encodes finish before the first write.
  for (const [at,x] of words) d.setInt16(at,x,true);
  if (next) {
    image.set(save,backup);
    for (const e of edits) image.set(e.fitted,e.at);
    image.set(sector,cave);
  } else {
    if (previous >= 2) {
      for (const e of edits) image.set(e.original,e.at);
      saved.fill(255);
    }
    slot.fill(255);
  }
  image.set(next ? fittedPresent : stockPresent,present);
  return image;
}
root.ParamixMyLabGamesFit = { apply, has, enabled, upgradePresenter };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabGamesFit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
