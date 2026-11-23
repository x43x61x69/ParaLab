// Laboratory camera for the optional Paradise screen correction.
(function (root) {
'use strict';
const bytes = hex => Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
const sector = 0x1A9000;
const makeCode = legacy => bytes(
  (legacy ? '4c414250414e3031' : '4c414250414e3032') +
  // Keep the native B test. With fitted menu bars and no A/B chord, a C edge
  // advances the lab controller's private byte modulo three, then calls the
  // normal cursor sound (effect 0, nominal volume 100).
  '10b56df7effae0b918490968184a914217d11849096811f0030f12d104206df7' +
  'e1fa70b1144c246894f840100131032928bf002184f84010002064217ef7c8fb' +
  '002010bd' +
  // For scene 0x20 alone, bias the stock presenter's input pointer by +4096
  // or -4096 bytes. The native source is stored as reversed 256-byte columns;
  // this selects x=0..127 or 32..159 without touching the game framebuffer.
  '0d49098820290cd10a49096849b191f84010012908bf00f58050022908bfa0f5' +
  '8050' + (legacy ? 'f5f71dbc' : 'fcf7c7bf') + '000000f008104d42523230170018181a011808170018');
const jumpCode = makeCode(false), legacyCode = makeCode(true);
const scrollCode = bytes(
  '4c414250414e303310b56df7effae0b91c4909681c4a914217d11c49096811f0' +
  '030f12d104206df7e1fa70b1184c246894f840100131032928bf002184f84010' +
  '002064217ef7c8fb002010bd11490988202913d10e49096881b191f8402008a3' +
  '9a5691f941309342bcbf023381f84130c4bf023b81f8413000eb0320fcf7c0bf' +
  '0010f00000f008104d42523230170018181a011808170018');
// Assembled from feld/src/mylab_paradise/lab_pan.S and lab_pan.ld.
const followCode = (revision, step) => bytes(
  '4c414250414e30' + revision + '10b56df7effaf8b934490968344a91421ad13449096811f0' +
  '030f15d104206df7e1fa88b1304c246894f840100131032928bf002184f84010' +
  '012084f84300002064217ef7c5fb002010bd2849098820293ed125490968d9b3' +
  'ca6a42b38a8e032a25d8013291f842309a4203d191f84330ebb904e081f84220' +
  '002381f84330042a02d014a39a5c10e00a6b6ab1d2f8202152b1b2f94a30b2f9' +
  '0e209b180122402b03db0222602b00da002281f8402091f8402009a39a5691f9' +
  '41309342bcbf' + step + '3381f84130c4bf' + step + '3b81f8413000eb0320fcf792bf00010002' +
  '0010f00000f008104d42523230170018181a011808170018');
const slowFollowCode = followCode('34', '02'), code = followCode('35', '04');
const hooks = [
  // The same length operand is passed to both allocation and zero-fill on
  // every entry to the laboratory. Its original 64 bytes keep their layout.
  [0x129DC4, '4020', '4420'],
  [0x146C68, 'cff7c0fc', '62f0cef9'], // B check in the home idle input handler
  // Wrap the fitted presenter at its game call site. The interchangeable
  // boot/game adapters remain byte-identical across menu/firmware updates.
  [0x1647A4, '41f02cbc', '44f055bc', '44f052bc'],
].map(([at, before, after, previous = after]) => [at, bytes(before), bytes(after), bytes(previous)]);

function matches(image, address, expected) {
  return expected.every((byte, i) => image[address + i] === byte);
}
function has(image) {
  return matches(image, sector, code.subarray(0, 8));
}
function hasAdapterHook(image) {
  return matches(image, sector, legacyCode.subarray(0, 8));
}
const previousCodes = [slowFollowCode, scrollCode, jumpCode];
const previousCode = image => previousCodes.find(candidate => matches(image, sector, candidate.subarray(0, 8)));
function isLegacy(image) {
  return hasAdapterHook(image) || Boolean(previousCode(image));
}
function removeLegacy(image) {
  const branch = bytes('0bf024b8');
  if (!matches(image, sector, legacyCode) || !matches(image, 0x19E000, branch) ||
      !hooks.slice(0, 2).every(([at,, after]) => matches(image, at, after)))
    throw new Error('Unexpected experimental My Lab camera code');
  image.set(bytes('00f054bc'), 0x19E000);
  for (const [at, before] of hooks.slice(0, 2)) image.set(before, at);
  image.fill(0xff, sector, sector + legacyCode.length);
}
function apply(image, enabled) {
  if (hasAdapterHook(image)) {
    if (enabled && !image.subarray(sector + legacyCode.length, sector + code.length).every(byte => byte === 0xFF))
      throw new Error('Unexpected My Lab lab camera code or occupied flash');
    removeLegacy(image);
  }
  const previous = has(image) ? code : previousCode(image);
  const installed = Boolean(previous);
  const followHook = previous === code || previous === slowFollowCode;
  if (!enabled && !installed) return image;
  if (image.length !== 0x1000000 ||
      !hooks.every(([at, before, after, old]) =>
        matches(image, at, installed ? (followHook ? after : old) : before)))
    throw new Error('Unexpected My Lab lab camera hooks');
  if ((installed && !matches(image, sector, previous)) ||
      (enabled && !image.subarray(sector + (previous?.length || 0), sector + code.length)
        .every(byte => byte === 0xFF)))
    throw new Error('Unexpected My Lab lab camera code or occupied flash');
  if (enabled && previous === code) return image;
  if (enabled) image.set(code, sector);
  else image.fill(0xFF, sector, sector + previous.length);
  for (const [at, before, after] of hooks) image.set(enabled ? after : before, at);
  return image;
}
root.ParamixMyLabLabPan = { has, apply, isLegacy, enabled: image => has(image) || isLegacy(image) };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabLabPan;
})(typeof window !== 'undefined' ? window : globalThis);
