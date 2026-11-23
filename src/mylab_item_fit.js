/* My Lab food selection, field results and character attribute panels. */
(function (root) {
'use strict';

const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const ASSETS = 0x211000, XIP = 0x111000, STUB = 0x1A5000;
const bytes = hex => Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
const legacyThumb = bytes(
  // Preserve the record ID and output pointer, then call the native layout decoder.
  '70b504460d4681f7d3fc' +
  // Record 1EC is the large portrait frame. Records 264–267 are the four food
  // cards, 274 is the selection frame, and 268–26B hold the actual food images.
  '40f2ec118c4210d0a4f26421032909d9b4f51d7f06d0a4f26821032908d8' +
  // Store the native Q12 scale at decoded record +10. Food is 7/8 size,
  // cards are 25/32, and the portrait frame is 3/4. Other IDs return unchanged.
  '40f6006104e040f6804101e040f60041698170bd' +
  // At the portrait constructor, keep the new character in its original stack
  // slot and set its scale controller (+0x7C) to the same 3/4 size in Q8.
  '0a9010b504467c30c021adf76bfd204610bd'
);
const parseHook = XIP + 0x57784, portraitHook = XIP + 0x2239C;
const parseCall = bytes('3cf03cfc'), portraitCall = bytes('71f04efe');
const originalParse = bytes('bef714f9'), originalPortrait = bytes('0a900a98');
// The item layout hook still handles the four food choices. The two detail
// pages select their native small character pose in the layout record itself.
const thumb = bytes(
  '70b504460d4681f7d3fca4f26421032909d9b4f51d7f06d0a4f26821032905d8' +
  '40f6006101e040f68041698170bd' + '00'.repeat(18) +
  // Sprite lookup at +0x40: only for the main archive's sprite 156 and
  // scenes 0x4B/0x4F return the compact frame at 0x601A5100. All other
  // callers, including the two other scenes using 156, use the retail lookup.
  '9c297ff44f8e074a536ad21890427ff4498e054a12884b2a02d04f2a7ff4428e' +
  '02487047001021600817001800511a60'
);
const lookupHook = XIP + 0x22E62, originalLookup = bytes('30f03fff'), lookupCall = bytes('71f0edf8');
const frameAt = STUB + 0x100, frameInfo = STUB + 0xF8;
const erased = (image, start, end) => image.subarray(start, end).every(b => b === 255);

function compactFrame(image, sprites) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const offset = id => sprites + view.getUint32(sprites + 4 * id, true);
  const source = image.subarray(offset(156), offset(157));
  const {header: h, cells} = C.spriteDecode(source, 0, true);
  if (h.flags !== 0xA7 || h.bpp !== 2 || h.iw !== 3 || h.ih !== 3 ||
      h.sw !== 32 || h.sh !== 32 || h.numSprites !== 9)
    throw new Error('Unexpected My Lab portrait monitor');
  const frame = new Uint8Array(0x1000 - (frameAt - STUB));
  const out = new DataView(frame.buffer);
  frame.set(source.subarray(0, h.pixOffset));
  let pos = h.pixOffset + 8 * 9;
  for (let tile = 0; tile < 9; tile++) {
    const raw = new Uint8Array(512);
    for (let dy = 0; dy < 32; dy++) {
      const y = Math.floor(tile / 3) * 32 + dy;
      const sy = y < 48 ? y - 12 : y + 12;
      for (let dx = 0; dx < 32; dx++) {
        const x = tile % 3 * 32 + dx;
        // Delete 18 uniform columns and 24 rows of repeated scanlines. The
        // corners and status lights are copied at their native resolution.
        const sx = x < 47 ? x - 9 : x + 9;
        const index = sx < 0 || sx >= 96 || sy < 0 || sy >= 96 ? h.transp :
          cells[(sy >> 5) * 3 + (sx >> 5)][(sy % 32) * 32 + sx % 32];
        raw[dy * 16 + (dx >> 1)] |= index << ((dx % 2) * 4);
      }
    }
    const data = C.rleEncode(raw).map(b => b ^ 0x53);
    if (pos + data.length > frame.length) throw new Error('Compact My Lab portrait monitor is too large');
    out.setUint32(h.pixOffset + 8 * tile, pos - h.pixOffset, true);
    out.setUint32(h.pixOffset + 8 * tile + 4, data.length, true);
    frame.set(data, pos);
    pos += (data.length + 3) & ~3;
  }
  out.setUint32(0, pos, true);
  return frame.subarray(0, pos);
}
const matches = (image, offset, expected) =>
  expected.every((value, i) => image[offset + i] === value);

function has(image) {
  return matches(image, parseHook, parseCall) && matches(image, lookupHook, lookupCall);
}
function installed(image) {
  return matches(image, parseHook, parseCall);
}

function apply(image, enabled) {
  const current = installed(image), latest = has(image), legacy = current && !latest;
  const v = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const word = offset => v.getUint16(offset, true);
  const long = offset => v.getUint32(offset, true);
  const pack = ASSETS + long(ASSETS + 20);
  const table = index => pack + 2 * long(pack + 4 * index);
  const layouts = table(4), data = table(5);
  const edits = [];

  function check(good, offset) {
    if (!good) throw new Error('Unexpected My Lab item layout at 0x' + offset.toString(16));
  }
  function edit(offset, original, fitted, previous = fitted) {
    check(word(offset) === (legacy ? previous : current ? fitted : original), offset);
    edits.push([offset, enabled ? fitted : original]);
  }
  const record = id => data + 2 * word(layouts + 2 * id);
  function anchor(id, original, fitted, previous = fitted) {
    edit(record(id) + 2, original, fitted, previous);
  }

  check(matches(image, parseHook, current ? parseCall : originalParse), parseHook);
  check(matches(image, portraitHook, legacy ? portraitCall : originalPortrait), portraitHook);
  check(matches(image, lookupHook, latest ? lookupCall : originalLookup), lookupHook);
  const activeStub = legacy ? legacyThumb : thumb;
  check(current ? matches(image, STUB, activeStub) : erased(image, STUB, STUB + thumb.length), STUB);

  // All four choices stay on one row. Quantities are centered over their plates.
  for (let col = 0; col < 4; col++) {
    const oldCenter = 20 + 40 * col, center = 32 + 32 * col;
    anchor(0x264 + col, oldCenter, center);
    anchor(0x268 + col, oldCenter, center);
    anchor(0x26C + col, oldCenter - 10, center - 7);
    anchor(0x270 + col, oldCenter - 10, center - 7);
  }
  anchor(0x274, 20, 32);

  // Food results have three slots above two staggered slots. Keep the food,
  // its background and its reveal animation at the same coordinates.
  const foodX = [32, 80, 128, 56, 104], resultX = [40, 80, 120, 60, 100];
  for (const first of [0x289, 0x28E, 0x293]) {
    for (let i = 0; i < foodX.length; i++) anchor(first + i, foodX[i], resultX[i]);
  }

  // Field results play a different movie in each area, with the same two
  // side stands. Move the stands and the two objects on them as a unit.
  const index = table(13), movies = table(14);
  for (let id = 258; id <= 272; id += 2) {
    const movie = movies + 4 * word(index + 2 * id);
    for (const [start, sprite, oldX, newX] of [
      [6, 329, -36, -30], [12, 329, 36, 30],
      [23, 331, -36, -30], [29, 332, 36, 30]
    ]) {
      const at = movie + 2 * start;
      check(word(at) === 0xEC10 && word(at + 2) === sprite, at);
      edit(at + 6, oldX & 0xFFFF, newX & 0xFFFF);
    }
  }

  // Pose 30 is the game's small body/eyes/mouth assembly, also used by the
  // three attribute rows. The character constructor still receives the mixed
  // body's own genetics and palette, and uses its normal unit scale.
  anchor(0x1EB, 46, 48, 47);
  edit(record(0x1EB) + 4, 98, 81, 90);
  edit(record(0x1EB) + 8, 1, 30, 1);
  anchor(0x1EC, 46, 48, 47);
  for (let row = 0; row < 3; row++) {
    anchor(0x1ED + row, 118, 105, 101); // attribute portrait
    anchor(0x1F0 + row, 128, 115, 111); // plate
    anchor(0x1F3 + row, 149, 133, 132); // attribute symbol
    anchor(0x1F6 + row, 90, 81, 76);    // pointer
  }

  if ((enabled && latest) || (!enabled && !current)) return image;
  let frame = null;
  if (enabled) {
    frame = compactFrame(image, ASSETS + long(ASSETS + 36));
    if (legacy) check(erased(image, STUB + legacyThumb.length, STUB + thumb.length), STUB);
    check(erased(image, frameInfo, frameAt + frame.length), frameInfo);
  } else if (latest) {
    const size = long(frameInfo);
    check(size > 24 && size <= 0x1000 - (frameAt - STUB) && size === long(frameAt), frameInfo);
    frame = image.subarray(frameAt, frameAt + size);
    check(C.crc32(frame) === long(frameInfo + 4), frameInfo);
  }
  for (const [offset, value] of edits) v.setUint16(offset, value, true);
  if (enabled) {
    image.set(thumb, STUB);
    v.setUint32(frameInfo, frame.length, true);
    v.setUint32(frameInfo + 4, C.crc32(frame), true);
    image.set(frame, frameAt);
  } else {
    image.fill(255, STUB, STUB + activeStub.length);
    if (latest) image.fill(255, frameInfo, frameAt + frame.length);
  }
  image.set(enabled ? parseCall : originalParse, parseHook);
  image.set(enabled ? lookupCall : originalLookup, lookupHook);
  if (legacy) image.set(originalPortrait, portraitHook);
  return image;
}

root.ParamixMyLabItemFit = { apply, has, enabled: installed };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabItemFit;
})(typeof window !== 'undefined' ? window : globalThis);
