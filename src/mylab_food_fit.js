/* Draw the native food sprites at pixel scale in the four-choice food menu. */
(function (root) {
'use strict';
const XIP = 0x111000, CODE = 0x1a46b0, LIMIT = 0x1a4800;
const tag = (image, at) => String.fromCharCode(...image.subarray(at, at + 8));
const hex = s => Uint8Array.from(s.match(/../g) || [], pair => parseInt(pair, 16));

// Regenerate with feld/src/mylab_paradise/food_fit.S and food_fit.ld.
// The helper occupies the originally erased gap before GridFit's record table.
const patches = [
  [0x3c52c, '48822898',
    '57f0c4f8'],
  [0x936b0, '',
    '47464f4f30303031488202b501f17c0040f24811aef72cfabde8024028987047'],
].map(([offset, old, code]) => ({ at: XIP + offset, old: hex(old), code: hex(code) }));
function hasLegacy(image) { return tag(image, CODE) === 'GFOO0001'; }

// Draw the cursor between the plate (5) and food (10). The visible outline
// remains on top of the plate without obscuring opaque pixels of the food.
function cursorDepth(view) {
  const assets = 0x211000;
  const pack = assets + view.getUint32(assets + 20, true);
  const table = pack + 2 * view.getUint32(pack + 16, true);
  const data = pack + 2 * view.getUint32(pack + 20, true);
  const record = data + 2 * view.getUint16(table + 2 * 0x274, true);
  if (view.getUint16(record, true) !== 0x1407 || view.getUint16(record + 6, true) !== 218)
    throw Error('Unexpected My Lab food cursor');
  return record + 8;
}

function applyLegacy(image, enabled) {
  if (hasLegacy(image) === enabled) return image;
  if (tag(image, 0x1a4000) !== 'PGRD0001') throw Error('Expected My Lab grid fit before food fit');
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const depth = cursorDepth(view);
  if (view.getUint16(depth, true) !== (enabled ? 50 : 8))
    throw Error('Unexpected My Lab food cursor depth');
  for (const { at, old, code } of patches) {
    // Empty original bytes describe the extension code in the reserved flash gap.
    const current = image.subarray(at, at + code.length);
    const expected = enabled ? old : code;
    if (current.length !== code.length || (at === CODE && at + code.length > LIMIT) ||
        (expected.length ? !expected.every((byte, i) => current[i] === byte) :
          !current.every(byte => byte === 0xff)))
      throw Error('Unexpected My Lab food-fit code at 0x' + at.toString(16));
  }
  for (const { at, old, code } of patches) {
    if (!enabled && !old.length) image.fill(0xff, at, at + code.length);
    else image.set(enabled ? code : old, at);
  }
  view.setUint16(depth, enabled ? 8 : 50, true);
  return image;
}
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const TILE_CODE = 0x1a46e0, TILE_START = 0x1d8000, TILE_SIZE = 0x8000;
const CHECKSUM = 0xbc;
const tilePatches = [
  [0x7c2c, '01980e90',
    '8bf05cfd'],
  [0x936e0, '',
    '47464f4f3030303201981eb4154909882b2924d11449096809b31f9a4b6e9a4209d001f13401082451f8043b9a4204d0013cf9d113e0002309e0042c01d9012305e0538aa3f21b535a2b08d80233074931f813301bb1c9180e914ff480301ebc0e90704708170018981a011800801d60'],
].map(([offset, old, code]) => ({at: XIP + offset, old: hex(old), code: hex(code)}));
const foodIds = [1307,1308,1310,1312,1314,1316,1318,1320,1322,1324,1361,1363,1365,
  1371,1373,1375,1381,1383,1385,1391,1392,1393,1394,1395,1396,1397];

// Each 3×3 block covers a 4×4 source block. Choose an existing palette
// index by area, giving exterior outlines priority so stems and thin edges
// remain defined. No interpolated colours are introduced, including in
// the partially eaten poses. Place the 24×24 result on a 32×32 native tile.
function compactFood(cell, palette, transparent) {
  const pixels = new Uint8Array(1024).fill(transparent);
  let outline = -1, minLight = Infinity;
  for (const index of new Set(cell)) {
    const c = palette[index];
    const light = 2 * (c >> 11) + 3 * ((c >> 5) & 63) + (c & 31);
    if (index !== transparent && light < minLight) { minLight = light; outline = index; }
  }
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const left = 4*x, top = 4*y;
    const weight = new Uint8Array(palette.length);
    for (let sy = Math.floor(top/3); 3*sy < top+4; sy++) {
      const wy = Math.min(top+4,3*sy+3) - Math.max(top,3*sy);
      for (let sx = Math.floor(left/3); 3*sx < left+4; sx++) {
        const wx = Math.min(left+4,3*sx+3) - Math.max(left,3*sx);
        weight[cell[32*sy+sx]] += wx*wy;
      }
    }
    if (weight[transparent] >= 10) continue;
    let color = cell[Math.floor((top+2)/3)*32 + Math.floor((left+2)/3)];
    if (color === transparent) color = outline;
    for (let i = 0; i < weight.length; i++)
      if (i !== transparent && weight[i] > weight[color]) color = i;
    if (weight[transparent] && weight[outline] >= 3) color = outline;
    pixels[(4+y)*32+4+x] = color;
  }
  return pixels;
}

function plateOrCursor(cursor) {
  const pixels = new Uint8Array(1024);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = Math.min(x,31-x), b = Math.min(y,31-y);
    let index = 0;
    if (cursor) {
      // Four unconnected L brackets with the original amber outline and fill.
      if (a < 7 && b < 7 && (a < 3 || b < 3)) {
        index = a === 0 || b === 0 || a === 6 || b === 6 || (a >= 2 && b >= 2) ? 1 : 2;
      }
    } else if (a >= 1 && b >= 1 && a+b >= 4) {
      index = a === 1 || b === 1 || a+b === 4 ? 1 : 2;
    }
    pixels[y*32+x] = index;
  }
  return pixels;
}

function packTile(source, id) {
  const {header:h, cells, palettes} = C.spriteDecode(source,0,true);
  const food = id >= 1307;
  if (h.flags !== 0xa7 || h.numPal !== 1 || h.transp !== 0 ||
      (food ? h.bpp !== 2 || h.sw !== 32 || h.sh !== 32 || h.iw !== 1 || h.ih !== 1 :
        h.bpp !== 1 || h.sw !== 16 || h.sh !== 16 || h.iw !== 3 || h.ih !== 3))
    throw Error('Unexpected My Lab food sprite ' + id);
  const frames = food ? cells.map(cell => compactFood(cell,palettes[0],h.transp)) :
    [plateOrCursor(id === 218)];
  const bits = food ? 4 : 2;
  const streams = frames.map(pixels => {
    const raw = new Uint8Array(1024 * bits / 8);
    pixels.forEach((index,i) => { raw[(i*bits)>>3] |= index << ((i*bits)&7); });
    return C.rleEncode(raw).map(byte => byte ^ 0x53);
  });
  let pos = h.pixOffset + frames.length*8;
  const tile = new Uint8Array(pos + streams.reduce((n,s) => n + ((s.length+3)&~3),0));
  const view = new DataView(tile.buffer);
  tile.set(source.subarray(0,h.pixOffset));
  tile[8] = 32; tile[9] = 32; tile[12] = 1; tile[13] = 1;
  view.setUint16(6,frames.length,true);
  streams.forEach((stream,i) => {
    view.setUint32(h.pixOffset+i*8,pos-h.pixOffset,true);
    view.setUint32(h.pixOffset+i*8+4,stream.length,true);
    tile.set(stream,pos);
    pos += (stream.length+3)&~3;
  });
  view.setUint32(0,pos,true);
  return tile;
}

function tilePack(image) {
  const view = new DataView(image.buffer,image.byteOffset,image.byteLength);
  const assets = 0x211000, base = assets + view.getUint32(assets+36,true);
  const offset = i => base + view.getUint32(base+4*i,true);
  const pack = new Uint8Array(TILE_SIZE).fill(255);
  const table = new DataView(pack.buffer);
  pack.fill(0,0,0xc0);
  let pos = 0xc0;
  for (const id of [218,219,...foodIds]) {
    const tile = packTile(image.subarray(offset(id),offset(id+1)),id);
    if (pos+tile.length > pack.length) throw Error('Compact My Lab food tiles exceed reserved space');
    table.setUint16(2*(id < 1307 ? id-218 : id-1307+2),pos,true);
    pack.set(tile,pos);
    pos += tile.length;
  }
  // The pointer table ends before 0xbc. Keep a checksum of the installed
  // bank so removing the patch also works after unrelated sprite edits.
  table.setUint32(CHECKSUM, C.crc32(pack), true);
  return pack;
}

function validBank(slot) {
  const copy = Uint8Array.from(slot);
  const header = new DataView(copy.buffer);
  const stored = header.getUint32(CHECKSUM, true);
  header.setUint32(CHECKSUM, 0, true);
  return stored === C.crc32(copy);
}

function has(image) { return tag(image,TILE_CODE) === 'GFOO0002'; }
function installed(image) { return has(image) || hasLegacy(image); }
function apply(image, enabled) {
  const compact = has(image);
  if (enabled ? compact : !installed(image)) return image;
  if (!enabled && !compact) return applyLegacy(image,false);
  const slot = image.subarray(TILE_START,TILE_START+TILE_SIZE);
  if (slot.length !== TILE_SIZE || !(enabled ? slot.every(b => b === 255) : validBank(slot)))
    throw Error('Unexpected My Lab food tile storage');
  for (const {at,old,code} of tilePatches) {
    const expected = enabled ? old : code;
    if (!code.every((_,i) => image[at+i] === (expected.length ? expected[i] : 255)))
      throw Error('Unexpected My Lab compact food hook at 0x'+at.toString(16));
  }
  const pack = enabled ? tilePack(image) : null;
  // Legacy changes do not overlap these two hooks or the tile bank.
  applyLegacy(image,enabled);
  if (enabled) slot.set(pack); else slot.fill(255);
  for (const {at,old,code} of tilePatches) {
    if (!enabled && !old.length) image.fill(255,at,at+code.length);
    else image.set(enabled ? code : old,at);
  }
  return image;
}
const api = { has, enabled: installed, apply };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabFoodFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
