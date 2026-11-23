/* Keep Egg Calling's two outer button balloons inside Paradise's centre crop. */
(function (root) {
'use strict';
const ASSETS = 0x211000, SPRITE = 1628;
// Scene 0x37 uses the same four native objects for the demonstration and the
// timed game. The two middle balloons (x=56,104) already fit. The string and
// glyph are in the balloon sprite, including its second animation frame.
const outer = [
  {id: 0x32E, type: 0x1007, stock: 24, fitted: 40},
  {id: 0x331, type: 0x10C7, stock: 136, fitted: 120},
];
function records(image) {
  if (image.length < ASSETS + 24) return [];
  const d = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const pack = ASSETS + d.getUint32(ASSETS + 20, true);
  if (pack + 24 > image.length) return [];
  const index = pack + 2 * d.getUint32(pack + 16, true);
  const data = pack + 2 * d.getUint32(pack + 20, true);
  if (index + 2 * (outer[1].id + 1) > image.length) return [];
  return outer.map(({id}) => data + 2 * d.getUint16(index + 2 * id, true));
}
function matches(image, positions, on) {
  const d = new DataView(image.buffer, image.byteOffset, image.byteLength);
  return positions.length === outer.length && positions.every((at, i) => at + 8 <= image.length &&
    d.getUint16(at, true) === outer[i].type && d.getUint16(at + 6, true) === SPRITE &&
    d.getUint16(at + 4, true) === 72 && d.getUint16(at + 2, true) === (on ? outer[i].fitted : outer[i].stock));
}
function has(image) {
  return matches(image, records(image), true);
}
function apply(image, on) {
  const positions = records(image);
  if (matches(image, positions, on)) return image;
  if (!matches(image, positions, !on)) throw new Error('Unexpected My Lab Egg Calling balloons');
  const d = new DataView(image.buffer, image.byteOffset, image.byteLength);
  positions.forEach((at, i) => d.setUint16(at + 2, on ? outer[i].fitted : outer[i].stock, true));
  return image;
}
root.ParamixMyLabEggFit = {apply, has};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabEggFit;
})(typeof window !== 'undefined' ? window : globalThis);
