/* Independent snapshot storage for the Land/Water/Sky bank of the six fields.
 * The stock bitmap/cursors and ghost format are unchanged. A commit word makes
 * each private slot authoritative while allowing old saves to use their legacy
 * shared snapshot until it can be copied safely. */
(function (root) {
'use strict';

const PAGE = 0x1000, RECORD = 0x4000;
const CODE = 0x109000, COMMIT = 0xFB7000, HIGH = 0xFB8000, LOW = 0xD01000;
const MAGIC = 0x31425352, ORIGINAL = 0xDD2000;
const SETTINGS_A = 0xEFE000, SETTINGS_B = 0xEFF000;
const BANK_FLAG = 0xF04, DNA_MARK = 0xF0F, LIVE = 0x1F8, STASH = 0xF64;
const ranges = Object.freeze([Object.freeze([LOW, 0xD29000]), Object.freeze([COMMIT, 0xFF0000])]);
const hooks = [
  [0x296A8, [0x80, 0xB5, 0x82, 0xB0], 8, false],       // Record address resolver
  [0xA193C, [0x80, 0xB5, 0x8C, 0xB0], 12, false],      // Stock snapshot writer
  [0xA1960, [0x87, 0xF7, 0xC0, 0xFE], 16, true],       // Writer capacity call
  [0x29430, [0x00, 0xF0, 0x58, 0xF9], 16, true],       // Validator capacity call
  [0x29D1C, [0x9D, 0xF8, 0x03, 0x00, 0xFF, 0xF7, 0x6C, 0xFB], 20, true], // Release validation
];
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
function w32(b, o, v) { for (let i = 0; i < 4; i++) b[o + i] = (v >>> (8 * i)) & 0xFF; }
const matches = (b, at, bytes) => bytes.every((v, i) => b[at + i] === v);
const blank = (b, a, z) => b.subarray(a, z).every(v => v === 0xFF);
const nativeAddress = index => ORIGINAL + (index - 1) * RECORD;

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
function manifest(rom) {
  return rom?.length === 0x1000000 && u32(rom, CODE) === MAGIC && u32(rom, CODE + 4) === 1 &&
    u32(rom, CODE + 24) === COMMIT + 0x60000000 && u32(rom, CODE + 28) === HIGH + 0x60000000 &&
    u32(rom, CODE + 32) === LOW + 0x60000000;
}
function inspect(rom) {
  if (!manifest(rom)) return null;
  const payload = rom.subarray(CODE, CODE + PAGE);
  try {
    if (matches(rom, CODE, payloadBytes()) && hooks.every(hook => matches(rom, hook[0], replacement(payload, hook))))
      return { page: CODE, ranges };
  } catch { /* An incomplete manifest cannot establish ownership of the flash ranges. */ }
  return null;
}
function compatible(rom) {
  return rom?.length === 0x1000000 && u32(rom, 0x10F000) === 0x31584953 &&
    u32(rom, 0x10F004) === 7 && u32(rom, 0x10F008) === 0x18001AE8 &&
    (u32(rom, 0x10F020) & 0x0A) === 0x0A && hooks.every(([at, original]) => matches(rom, at, original));
}
function needsInstall(rom) { return !inspect(rom) && compatible(rom); }
let embedded;
function payloadBytes() {
  if (embedded) return embedded;
  const base64 = '__RESIDENT_BANK_HELPER__';
  if (base64.startsWith('__')) {
    if (typeof require === 'undefined') throw new Error('Resident bank helper is missing');
    embedded = new Uint8Array(require('node:fs').readFileSync(require('node:path').join(__dirname, '../six/resident-banks/helper.bin')));
  } else {
    embedded = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }
  return embedded;
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
function occupied(page, roster, index) {
  return Boolean(page[roster + ((index - 1) >>> 3) * 4 + 1] & (1 << ((index - 1) & 7)));
}
function copyRecord(out, to, from) { out.set(out.subarray(from, from + RECORD), to); }
/** Migrate old snapshots after the caller has verified the target firmware. */
function migrateSave(rom) {
  if (rom?.length !== 0x1000000) throw new Error('Expected a complete Paradise flash staging image');
  const page = settings(rom);
  if (!page) return rom;
  const secondary = page[BANK_FLAG] === 1 ? LIVE : page[DNA_MARK] === 0x5A ? STASH : -1;
  if (secondary < 0) return rom;
  let out = rom;
  for (let index = 1; index <= 24; index++) {
    if (committed(rom, index) || !occupied(page, secondary, index)) continue;
    const source = nativeAddress(index);
    if (!validRecord(rom, source)) continue;
    if (out === rom) out = new Uint8Array(rom);
    copyRecord(out, address(index), source);
    w32(out, markerAddress(index), MAGIC);
  }
  return out;
}
const migrate = rom => inspect(rom) ? migrateSave(rom) : rom;
function apply(rom) {
  if (inspect(rom)) return migrate(rom);
  if (!compatible(rom)) throw new Error('The six-field resident bank hooks do not match this firmware');
  if (!blank(rom, CODE, CODE + PAGE)) throw new Error('The resident bank helper page is in use');
  const limit = 0x111000 + 16 + u32(rom, 0x111008);
  if (limit > LOW || ranges.some(([a, z]) => !blank(rom, a, z)))
    throw new Error('The resident bank backup area overlaps other flash data');
  const payload = payloadBytes();
  if (payload.length > PAGE || u32(payload, 0) !== MAGIC) throw new Error('Invalid resident bank helper');
  const out = new Uint8Array(rom);
  out.set(payload, CODE);
  for (const hook of hooks) out.set(replacement(payload, hook), hook[0]);
  if (!inspect(out)) throw new Error('Could not verify the resident bank patch');
  return migrate(out);
}
function strip(rom) {
  if (!inspect(rom)) return rom;
  const out = new Uint8Array(rom), page = settings(rom);
  if (page?.[BANK_FLAG] === 1) {
    for (let index = 1; index <= 24; index++) {
      if (!occupied(page, LIVE, index) || !committed(rom, index)) continue;
      const source = address(index);
      if (!validRecord(rom, source)) throw new Error('An active resident snapshot is damaged');
      copyRecord(out, nativeAddress(index), source);
    }
  }
  for (const [at, original] of hooks) out.set(original, at);
  for (const [a, z] of [[CODE, CODE + PAGE], ...ranges]) out.fill(0xFF, a, z);
  return out;
}
const installed = rom => Boolean(inspect(rom));
const codePage = rom => inspect(rom)?.page ?? null;
const hookPages = [...new Set(hooks.map(([offset]) => offset & ~(PAGE - 1)))];
const api = { address, markerAddress, committed, commitValue: MAGIC, ranges, hookPages, inspect, installed, needsInstall, codePage, apply, install: apply, migrate, migrateSave, strip };
root.ParamixResidentBanks = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
