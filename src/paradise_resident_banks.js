/* Independent snapshot storage for the Land/Water/Sky bank of the six fields.
 * The stock bitmap/cursors and ghost format are unchanged. A commit word makes
 * each private slot authoritative while allowing old saves to use their legacy
 * shared snapshot until it can be copied safely. */
(function (root) {
'use strict';

const PAGE = 0x1000, RECORD = 0x4000;
const CODE = 0x109000, COMMIT = 0xFB7000, HIGH = 0xFB8000, LOW = 0xD01000;
const MAGIC = 0x31425352;
const SETTINGS_A = 0xEFE000, SETTINGS_B = 0xEFF000;
const BANK_FLAG = 0xF04, DNA_MARK = 0xF0F, LIVE = 0x1F8, STASH = 0xF64;
const ranges = Object.freeze([Object.freeze([LOW, 0xD29000]), Object.freeze([COMMIT, 0xFF0000])]);
const gen3Hooks = [
  [0x296A8, [0x80, 0xB5, 0x82, 0xB0], 8, false],       // Record address resolver
  [0xA193C, [0x80, 0xB5, 0x8C, 0xB0], 12, false],      // Stock snapshot writer
  [0xA1960, [0x87, 0xF7, 0xC0, 0xFE], 16, true],       // Writer capacity call
  [0x29430, [0x00, 0xF0, 0x58, 0xF9], 16, true],       // Validator capacity call
  [0x29D1C, [0x9D, 0xF8, 0x03, 0x00, 0xFF, 0xF7, 0x6C, 0xFB], 20, true], // Release validation
];
const JADE_ROSTER = 0xF14, JADE_READY = 0xF1C;
const jadeSwitch = [0x4D498, null, 36, true];
const jadeHooks = [
  [0x271A8, [0x80, 0xB5, 0x82, 0xB0], 8, false],
  [0x8E5EC, [0x80, 0xB5, 0x8C, 0xB0], 12, false],
  [0x8E610, [0x98, 0xF7, 0xE8, 0xFD], 16, true],
  [0x26F30, [0x00, 0xF0, 0x58, 0xF9], 16, true],
  [0x27448, [0x9D, 0xF8, 0x03, 0x00, 0xFF, 0xF7, 0x56, 0xFD], 20, true],
];
const profiles = {
  1: { hooks: gen3Hooks, first: 0xDD2000, bankRam: 0x18001AE8, start: 1, end: 24 },
  2: { hooks: jadeHooks, first: 0xDF2000, bankRam: 0x18001AA0, start: 5, end: 8 },
};
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
function w32(b, o, v) { for (let i = 0; i < 4; i++) b[o + i] = (v >>> (8 * i)) & 0xFF; }
const matches = (b, at, bytes) => bytes.every((v, i) => b[at + i] === v);
const blank = (b, a, z) => b.subarray(a, z).every(v => v === 0xFF);
const nativeAddress = (p, index) => p.first + (index - 1) * RECORD;
const profileOf = rom => u32(rom, 0x10F008) === profiles[2].bankRam ? 2 : 1;
const hasFieldMenu = rom => (u32(rom, 0x10F020) & 2) !== 0;

function address(index) {
  if (!Number.isInteger(index) || index < 1 || index > 24) throw new RangeError('Invalid resident snapshot slot');
  return index <= 14 ? HIGH + (index - 1) * RECORD : LOW + (index - 15) * RECORD;
}
function markerAddress(index) {
  if (!Number.isInteger(index) || index < 1 || index > 24) throw new RangeError('Invalid resident snapshot slot');
  return COMMIT + (index - 1) * 4;
}
function committed(rom, index) { return u32(rom, markerAddress(index)) === MAGIC; }

function branch(from, to, link) {
  const n = (to & ~1) - from - 4;
  const s = (n >>> 24) & 1, j1 = ((n >>> 23) & 1) ^ s ^ 1, j2 = ((n >>> 22) & 1) ^ s ^ 1;
  const hi = 0xF000 | (s << 10) | ((n >>> 12) & 0x3FF);
  const lo = (link ? 0xD000 : 0x9000) | (j1 << 13) | (j2 << 11) | ((n >>> 1) & 0x7FF);
  return [hi & 0xFF, hi >>> 8, lo & 0xFF, lo >>> 8];
}
function replacement(payload, [from, original, entry, link]) {
  const offset = u32(payload, entry);
  if (!(offset & 1) || offset < 36 || offset >= PAGE) throw new Error('Invalid resident bank helper entry');
  const code = branch(from, CODE + offset, link);
  while (code.length < original.length) code.push(0, 0xBF);
  return code;
}
function manifestVersion(page) {
  const version = u32(page, 4);
  return u32(page, 0) === MAGIC && profiles[version] &&
    u32(page, 24) === COMMIT + 0x60000000 && u32(page, 28) === HIGH + 0x60000000 &&
    u32(page, 32) === LOW + 0x60000000 ? version : 0;
}
function jadeSwitchHook(rom) {
  if (!hasFieldMenu(rom)) return null;
  const at = jadeSwitch[0], target = u32(rom, 0x10FC64);
  if (!(target & 1) || target < 0x100FEC70 || target >= 0x100FEF60) return null;
  return [at, branch(at, target - 0x10000000 + 0x11000, true), ...jadeSwitch.slice(2)];
}
function inspect(rom) {
  if (rom?.length !== 0x1000000) return null;
  const payload = rom.subarray(CODE, CODE + PAGE), version = manifestVersion(payload);
  if (!version) return null;
  const switchHook = version === 2 ? jadeSwitchHook(rom) : null;
  if (version === 2 && hasFieldMenu(rom) && !switchHook) return null;
  const hooks = switchHook ? profiles[version].hooks.concat([switchHook]) : profiles[version].hooks;
  try {
    if (matches(rom, CODE, payloadBytes(version)) && hooks.every(hook => matches(rom, hook[0], replacement(payload, hook))))
      return { page: CODE, ranges, version };
  } catch { /* An incomplete manifest cannot establish ownership of the flash ranges. */ }
  return null;
}
function compatible(rom) {
  if (rom?.length !== 0x1000000 || u32(rom, 0x10F000) !== 0x31584953 || u32(rom, 0x10F004) !== 7 ||
      (u32(rom, 0x10F020) & 10) !== 10) return false;
  const version = profileOf(rom), p = profiles[version], hook = version === 2 ? jadeSwitchHook(rom) : null;
  return u32(rom, 0x10F008) === p.bankRam && (version === 1 || (hook && matches(rom, hook[0], hook[1]))) &&
    p.hooks.every(([at, original]) => matches(rom, at, original));
}
function needsInstall(rom) { return !inspect(rom) && compatible(rom); }
const payloads = new Map();
function payloadBytes(version) {
  if (!payloads.has(version)) {
    const base64 = version === 2 ? '__RESIDENT_BANK_JADE_HELPER__' : '__RESIDENT_BANK_HELPER__';
    const file = 'helper' + (version === 2 ? '-jade' : '') + '.bin';
    const payload = base64.startsWith('__') && typeof require !== 'undefined'
      ? new Uint8Array(require('node:fs').readFileSync(require('node:path').join(__dirname, '../six/resident-banks', file)))
      : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    payloads.set(version, payload);
  }
  return payloads.get(version);
}
function initializeJade(page) {
  if (page[JADE_READY] === 0x5A) return page;
  const out = Uint8Array.from(page);
  out.fill(0, JADE_ROSTER, JADE_ROSTER + 8);
  out[JADE_READY] = 0x5A;
  return out;
}
function validRecord(rom, at) {
  const length = u32(rom, at + 0x10C);
  if (length < 0x600 || length > RECORD || length % 4) return false;
  let sum = 0;
  for (let off = at; off < at + length; off += 4) sum = (sum + u32(rom, off)) >>> 0;
  return sum === u32(rom, at);
}
function settings(rom) {
  const S = root.ParamixSaves || (typeof require !== 'undefined' ? require('./saves.js') : null);
  return [SETTINGS_A, SETTINGS_B].map(at => rom.subarray(at, at + PAGE)).find(page => S?.settingsOk(page));
}
function occupied(page, roster, index, version) {
  if (version === 2) return Boolean((page[roster] | page[roster + 1] << 8) & (1 << (6 + index - 5)));
  return Boolean(page[roster + ((index - 1) >>> 3) * 4 + 1] & (1 << ((index - 1) & 7)));
}
function liveRoster(version) { return version === 2 ? 0x1C8 : LIVE; }
function copyRecord(out, to, from) { out.set(out.subarray(from, from + RECORD), to); }
/** Migrate old snapshots after the caller has verified the target firmware. */
function migrateSave(rom, version = profileOf(rom)) {
  if (rom?.length !== 0x1000000) throw new Error('Expected a complete Paradise flash staging image');
  const page = settings(rom), profile = profiles[version];
  if (!page || !profile) return rom;
  const secondary = page[BANK_FLAG] === 1 ? liveRoster(version) :
    version === 2 ? (page[JADE_READY] === 0x5A ? JADE_ROSTER : -1) : (page[DNA_MARK] === 0x5A ? STASH : -1);
  if (secondary < 0) return rom;
  let out = rom;
  for (let index = profile.start; index <= profile.end; index++) {
    if (committed(rom, index) || !occupied(page, secondary, index, version)) continue;
    const source = nativeAddress(profile, index);
    if (!validRecord(rom, source)) continue;
    if (out === rom) out = new Uint8Array(rom);
    copyRecord(out, address(index), source);
    w32(out, markerAddress(index), MAGIC);
  }
  return out;
}
function migrate(rom) {
  const patch = inspect(rom);
  return patch ? migrateSave(rom, patch.version) : rom;
}
function refresh(rom) {
  const patch = rom.subarray(CODE, CODE + PAGE), hook = jadeSwitchHook(rom);
  if (!hook || manifestVersion(patch) !== 2 || !matches(rom, CODE, payloadBytes(2)) ||
      !jadeHooks.every(h => matches(rom, h[0], replacement(patch, h))) || !matches(rom, hook[0], hook[1])) return rom;
  const out = new Uint8Array(rom);
  out.set(replacement(patch, hook), hook[0]);
  return out;
}
function apply(rom) {
  if (inspect(rom)) return migrate(rom);
  if (!compatible(rom)) throw new Error('The resident bank hooks do not match this firmware');
  const version = profileOf(rom), p = profiles[version];
  if (!blank(rom, CODE, CODE + PAGE)) throw new Error('The resident bank helper page is in use');
  const limit = 0x111000 + 16 + u32(rom, 0x111008);
  if (limit > LOW || ranges.some(([a, z]) => !blank(rom, a, z)))
    throw new Error('The resident bank backup area overlaps other flash data');
  const payload = payloadBytes(version);
  if (payload.length > PAGE || u32(payload, 0) !== MAGIC) throw new Error('Invalid resident bank helper');
  const out = new Uint8Array(rom);
  out.set(payload, CODE);
  for (const hook of p.hooks) out.set(replacement(payload, hook), hook[0]);
  const patched = version === 2 ? refresh(out) : out;
  if (!inspect(patched)) throw new Error('Could not verify the resident bank patch');
  return migrate(patched);
}
function strip(rom) {
  const patch = inspect(rom);
  if (!patch) return rom;
  const { version } = patch, p = profiles[version];
  const out = new Uint8Array(rom), page = settings(rom);
  if (page?.[BANK_FLAG] === 1) {
    for (let index = p.start; index <= p.end; index++) {
      if (!occupied(page, liveRoster(version), index, version) || !committed(rom, index)) continue;
      const source = address(index);
      if (!validRecord(rom, source)) throw new Error('An active resident snapshot is damaged');
      copyRecord(out, nativeAddress(p, index), source);
    }
  }
  const hook = version === 2 ? jadeSwitchHook(rom) : null;
  for (const [at, original] of hook ? p.hooks.concat([hook]) : p.hooks) out.set(original, at);
  for (const [a, z] of [[CODE, CODE + PAGE], ...ranges]) out.fill(0xFF, a, z);
  return out;
}
const installed = rom => Boolean(inspect(rom));
const codePage = rom => inspect(rom)?.page ?? null;
const hookPages = [...new Set([...gen3Hooks, ...jadeHooks, jadeSwitch].map(([offset]) => offset & ~(PAGE - 1)))];
const api = { address, markerAddress, committed, commitValue: MAGIC, ranges, hookPages, inspect, installed, needsInstall, codePage, apply, install: apply, migrate, migrateSave, strip, refresh, manifestVersion, initializeJade, JADE_ROSTER };
root.ParamixResidentBanks = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
