/* First-discovery partner card shared by the field-result scenes. */
(function (root) {
'use strict';

const ASSETS = 0x211000, STUB = 0x1EE000;
const hex = text => Uint8Array.from(text.match(/../g), value => parseInt(value, 16));
const matches = (image, offset, bytes) => bytes.every((v, i) => image[offset + i] === v);
const hooks = [
  [0x126C64, hex('04990020'), hex('c7f0ccb9')],
  [0x16843C, hex('e8f78cfe'), hex('85f008fe')]
];
// Generated from feld/src/mylab_paradise/record_badge.S.
const titleCode = hex(
  '04990020bdf81620b2f5ca7f19d10e4a1288552a15d10d4a1288c2f34322092a' +
  '0dd0012a05d152224a808a8801328a8007e0022a05d3072a03d8022040425422' +
  '4a8038f711be000008170018ea06001870b506460c46154663f77ef8b4f5ca7f' +
  '16d10c480088552812d10b480088c0f3432001280cd10021685a48b102311229' +
  'fad3688a0121002818bf02214942318470bd000008170018ea060018'
);
const erased = new Uint8Array(titleCode.length).fill(255);
// Earlier screen-correction builds only adjusted Latin tracking at the first hook.
const legacyCode = erased.slice();
legacyCode.set(hex(
  '04990020bdf81620b2f5ca7f0ed1084a1288552a0ad1074a1288c2f34322' +
  '023a052a03d80220404254224a8038f71cbe08170018ea060018'
));
const fields = [
  // Layout ID, sprite, priority, stock (x, y) and fitted (x, y).
  [0x193, 1462, 50, 11, 11, 26, 10], // Keep the category ball clear of the longest Japanese name.
  [0x199, 105, 15, 32, 55, 36, 55]   // NEW! starts four pixels inside the physical panel.
];

function record(view, id) {
  const pack = ASSETS + view.getUint32(ASSETS + 20, true);
  const index = pack + 2 * view.getUint32(pack + 16, true);
  return pack + 2 * (view.getUint32(pack + 20, true) + view.getUint16(index + 2 * id, true));
}
function badgeEnabled(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  return view.getUint16(record(view, 0x199) + 2, true) === 36;
}
function has(image) {
  return badgeEnabled(image) && hooks.every(([at, , bytes]) => matches(image, at, bytes)) &&
    matches(image, STUB, titleCode);
}
function apply(image, enabled) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const current = badgeEnabled(image), titleEnabled = matches(image, STUB, titleCode);
  const previousTitle = matches(image, STUB, legacyCode);
  if ((!titleEnabled && !previousTitle && !matches(image, STUB, erased)) ||
      !hooks.every(([at, old, next], i) => matches(image, at, titleEnabled || (previousTitle && i === 0) ? next : old)))
    throw Error('Unexpected My Lab partner record title layout');
  const changes = fields.map(([id, sprite, priority, x, y, fittedX, fittedY]) => {
    const at = record(view, id);
    const word = offset => view.getUint16(at + offset, true);
    const legacyBall = current && !titleEnabled && id === 0x193 && word(2) === 27 && word(4) === 11;
    const knownPosition = word(2) === (current ? fittedX : x) && word(4) === (current ? fittedY : y);
    if ((!knownPosition && !legacyBall) || word(0) !== 0x1407 || word(6) !== sprite || word(8) !== priority)
      throw Error('Unexpected My Lab partner record field 0x' + id.toString(16));
    return [at, enabled ? fittedX : x, enabled ? fittedY : y];
  });
  for (const [at, x, y] of changes) {
    view.setUint16(at + 2, x, true);
    view.setUint16(at + 4, y, true);
  }
  if (enabled !== titleEnabled || previousTitle) {
    image.set(enabled ? titleCode : erased, STUB);
    for (const [at, old, next] of hooks) image.set(enabled ? next : old, at);
  }
  return image;
}

const api = { has, enabled: badgeEnabled, apply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabRecordBadge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
