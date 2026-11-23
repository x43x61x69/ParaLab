/* Apply the existing four-cell character selector to the simulation results. */
(function (root) {
'use strict';
const XIP = 0x111000, CODE = 0x1a4640, LIMIT = 0x1a4800;
const tag = (image, at) => String.fromCharCode(...image.subarray(at, at + 8));
const hex = s => Uint8Array.from(s.match(/../g) || [], pair => parseInt(pair, 16));

// Regenerate with feld/src/mylab_paradise/simulation_fit.S and simulation_fit.ld.
// The helper occupies the originally erased gap before GridFit's record table.
// All four lists use the same native scrollbar and page constructor. Restore
// that constructor's retail return so it doesn't also create corner arrows.
const gridReturn = { at: XIP + 0x63658, old: hex('2ff0b2bf'), code: hex('0a980eb0') };
const patches = [
  [0x9302e, '4a2909d0',
    '00f00bbb'],
  [0x9307a, '4a2b03d0',
    '00f0edba'],
  [0x93576, '4a2800d0',
    '00f077b8'],
  [0x93600, 'fff742ff',
    '00f038f8'],
  [0x93640, '',
    '4753494d303030314b293ff4fcac4a293ff4f9acfff7edbc4b2b3ff414ad4a2b3ff411adfff70bbd4b2818bf4a2818bf4f2870470124fff707bf'],
].map(([offset, old, code]) => ({ at: XIP + offset, old: hex(old), code: hex(code) }));
function installed(image) { return tag(image, CODE) === 'GSIM0001'; }
function has(image) {
  return installed(image) && gridReturn.code.every((b, i) => image[gridReturn.at + i] === b);
}

function apply(image, enabled) {
  const existing = installed(image);
  if (enabled ? has(image) : !existing) return image;
  if (tag(image, 0x1a4480) !== 'GPAG0001') throw Error('Expected My Lab page hints before simulation fit');
  // Older fitted images already own the simulation code. Upgrade only the
  // shared constructor, or leave its existing branch in place on removal.
  const changes = existing && enabled ? [gridReturn] : [...patches, gridReturn];
  if (existing && !enabled && gridReturn.old.every((b, i) => image[gridReturn.at + i] === b))
    changes.pop();
  for (const { at, old, code } of changes) {
    // Empty original bytes describe the extension code in the reserved flash gap.
    const current = image.subarray(at, at + code.length);
    const expected = enabled ? old : code;
    if (current.length !== code.length || (at === CODE && at + code.length > LIMIT) ||
        (expected.length ? !expected.every((byte, i) => current[i] === byte) :
          !current.every(byte => byte === 0xff)))
      throw Error('Unexpected My Lab simulation-fit code at 0x' + at.toString(16));
  }
  for (const { at, old, code } of changes) {
    if (!enabled && !old.length) image.fill(0xff, at, at + code.length);
    else image.set(enabled ? code : old, at);
  }
  return image;
}
const api = { has, enabled: installed, apply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabSimulationFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
