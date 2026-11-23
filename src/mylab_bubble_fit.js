/* The bubble game uses a single transparent 32×32 cell for all its lanes. */
(function(root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const arc = 0x211000, backup = 0x1D4000, capacity = 4096, header = 16;
const signature = [0x42,0x55,0x42,1];
// The five original shades: b outline, c blue, d pink, e lilac, f highlight.
// Centre this native 16×16 drawing on the original 20×20 drawing's anchor.
const drawing = [
  '.....bbbbbb.....',
  '...bbcccceebb...',
  '..bccceeeeecdb..',
  '.bccfffceeecedb.',
  '.bcffffeccccedb.',
  'bccefffecccceceb',
  'bcceffeecccecedb',
  'bceeeeecececeddb',
  'bceefeceeeeceddb',
  'beefefeeeeededdb',
  'befffefeeededddb',
  '.beffefeededddb.',
  '.bfffefededdddb.',
  '..bfffeedddddb..',
  '...bbddddddbb...',
  '.....bbbbbb.....',
];
function has(image) { return signature.every((v,i) => image[backup + i] === v); }
function fail(reason) { throw new Error('Unexpected My Lab bubble ' + reason); }
function apply(image, on) {
  if (has(image) === on) return image;
  const d = new DataView(image.buffer,image.byteOffset,image.byteLength);
  const u32 = at => d.getUint32(at,true);
  const pack = arc + u32(arc + 36);
  const at = pack + u32(pack + 4 * 1637), end = pack + u32(pack + 4 * 1638);
  if (end <= at || end > image.length || end - at + header > capacity) fail('sprite range');
  const entry = image.subarray(at,end), slot = image.subarray(backup,backup + header + entry.length);
  if (slot.length !== header + entry.length) fail('backup range');
  if (!on) {
    const original = slot.subarray(header);
    if (u32(backup+4) !== entry.length || u32(backup+8) !== C.crc32(original) ||
        u32(backup+12) !== C.crc32(entry)) fail('backup or modified artwork');
    image.set(original,at);
    slot.fill(255);
    return image;
  }
  if (!slot.every(v => v === 255)) fail('occupied backup');
  const {header: h, cells} = C.spriteDecode(entry,0,true);
  if (h.flags !== 0xA7 || h.bpp !== 2 || h.numSprites !== 1 || h.iw !== 1 || h.ih !== 1 ||
      h.sw !== 32 || h.sh !== 32 || h.transp !== 0 || C.crc32(cells[0]) !== 0xBFD5B819)
    fail('source artwork');
  const raw = new Uint8Array(512);
  drawing.forEach((row,y) => Array.from(row).forEach((value,x) => {
    if (value === '.') return;
    const index = (8 + y) * 32 + x + 8;
    raw[index >> 1] |= parseInt(value,16) << ((index & 1) * 4);
  }));
  const pixels = C.rleEncode(raw).map(v => v ^ 0x53);
  const start = h.pixOffset + 8, length = (start + pixels.length + 3) & ~3;
  if (length > entry.length) fail('sprite capacity');
  const fitted = new Uint8Array(entry.length);
  const fd = new DataView(fitted.buffer);
  fitted.set(entry.subarray(0,h.pixOffset));
  fd.setUint32(0,length,true);
  fd.setUint32(h.pixOffset,8,true);
  fd.setUint32(h.pixOffset+4,pixels.length,true);
  fitted.set(pixels,start);
  const originalCRC = C.crc32(entry), fittedCRC = C.crc32(fitted);
  slot.set(signature);
  d.setUint32(backup+4,entry.length,true);
  d.setUint32(backup+8,originalCRC,true);
  d.setUint32(backup+12,fittedCRC,true);
  slot.set(entry,header);
  entry.set(fitted);
  return image;
}
root.ParamixMyLabBubbleFit = {has,apply};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabBubbleFit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
