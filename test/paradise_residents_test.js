// Node-only coverage of native resident records, roster banks, and settings mirrors.
const assert = require('node:assert/strict');
const R = require('../src/paradise_residents.js');
const S = require('../src/saves.js');

// Probe the editor's mapping independently of the native hook install recipe.
const bankPatch = {
  ranges: [[0xD01000, 0xD29000], [0xFB7000, 0xFF0000]],
  inspect: rom => u32(rom, 0x109000) === bankPatch.commitValue ? { ranges: bankPatch.ranges } : null,
  address: index => index <= 14 ? 0xFB8000 + (index - 1) * RECORD : 0xD01000 + (index - 15) * RECORD,
  markerAddress: index => 0xFB7000 + (index - 1) * 4,
  commitValue: 0x31425352,
};
globalThis.ParamixResidentBanks = bankPatch;

const PAGE = 0x1000;
const RECORD = 0x4000;
const xip = at => 0x60000000 + at;
const u32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
const w16 = (bytes, at, n) => new DataView(bytes.buffer, bytes.byteOffset).setUint16(at, n, true);
const w32 = (bytes, at, n) => new DataView(bytes.buffer, bytes.byteOffset).setUint32(at, n, true);

function fixture({ six = false, neon = false, land = false } = {}) {
  const rom = new Uint8Array(0x1000000).fill(255);
  const [idPage, id, footer, table, count, zero, first, firstIndex, slotCount] = neon ?
    [0xD85000, 7, 0x99431749, 0xAE954, 33, 0xE4E000, 0xE52000, 2, 8] : land ?
    [0xD49000, 1, 0x70169E2C, 0x94214, 24, 0xDEE000, 0xDF2000, 1, 4] :
    [0xD29000, 5, 0x96CB83B8, 0xACBB8, 32, 0xDCE000, 0xDD2000, 1, 8];
  w32(rom, idPage, id);
  w32(rom, idPage + 0xFF8, footer - id);
  w32(rom, idPage + 0xFFC, ~(footer - id));

  for (let i = 0; i < slotCount * 3 + firstIndex; i++) {
    w32(rom, table + 4 * i, xip(i ? first + (i - firstIndex) * RECORD : zero));
    w32(rom, table + 4 * (count + i), RECORD);
  }
  const page = new Uint8Array(PAGE);
  page[0x100] = 0xA1;
  if (six) {
    w32(rom, 0x10F000, 0x31584953);
    w32(rom, 0x10F004, 7);
    w32(rom, 0x10F01C, 0);
    w32(rom, 0x10F020, 10); // DNA and native field menu
    page[0x89] = 1;
    page[0xF0F] = 0x5A;
    page[0xF70] = 1;
  }
  if (neon) {
    rom.set(Buffer.from('40f29420c1f60000d0f8bc007047', 'hex'), 0x229C0);
    const targets = [500, 500, 100, 100, 100, 1000, 10, 7, 50, 50, 100, 50, 100, 99999, 50, 50, 18, 12, 16, 16, 16, 16];
    targets.forEach((target, i) => w32(rom, 0xA6D24 + 4 * i, target));
    w32(page, S.NEON_GENERATION, 3);
  }
  const at = neon ? S.NEON_SETTINGS[4] : S.SET_A;
  S.sealSettings(page);
  rom.set(page, at);
  return rom;
}
function syntheticResident(id) {
  const bytes = new Uint8Array(RECORD);
  w32(bytes, 8, 1);
  w16(bytes, 0xFC, 5);
  w16(bytes, 0x10A, id);
  w32(bytes, 0x10C, 0x1D64);
  w32(bytes, 0x118, 0x1D34);
  w32(bytes, 0x11C, 24);
  w32(bytes, 0x130, 0x1D4C);
  w32(bytes, 0x134, 24);
  let sum = 0;
  for (let off = 8; off < 0x1D64; off += 4) sum = (sum + u32(bytes, off)) >>> 0;
  w32(bytes, 0, sum);
  w32(bytes, 4, -sum);
  return bytes;
}
function slot(rom, field, i) {
  return R.inspect(rom).fields[field].slots[i];
}
function checkRanges(before, after, ranges) {
  let at = 0;
  for (const [start, end] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    assert(start >= at && end > start && !(start % PAGE || end % PAGE));
    assert.equal(Buffer.compare(before.subarray(at, start), after.subarray(at, start)), 0);
    at = end;
  }
  assert.equal(Buffer.compare(before.subarray(at), after.subarray(at)), 0);
}

const adult = syntheticResident(4050);
const nextAdult = syntheticResident(4066);
const put = (rom, field, i, bytes = adult) => R.apply(rom, { type: 'put', field, slot: i, bytes });
const remove = (rom, field, i) => R.apply(rom, { type: 'remove', field, slot: i });
const move = (rom, field, i, toField, toSlot) => R.apply(rom, { type: 'move', field, slot: i, toField, toSlot });

{
  const rom = fixture({ land: true });
  assert.equal(R.inspect(rom).fields.length, 3);
  const result = put(rom, 2, 3);
  assert.equal(slot(result.rom, 2, 3).id, 4050);
  assert.equal(result.rom[S.SET_A + 0x1BC + 2 * 8 + 1] & 2, 2);
  assert.equal(result.rom[S.SET_B + 0x100], 0xA1);
  for (const address of [S.SET_A, S.SET_B]) assert(S.settingsOk(result.rom.subarray(address, address + PAGE)));
  checkRanges(rom, result.rom, result.ranges);
}
{
  const rom = fixture({ six: true });
  assert.deepEqual(R.inspect(rom).fields.map(f => f.slots.length), [8, 4, 4, 8, 4, 4]);
  const bank0 = put(rom, 0, 6).rom;
  assert.equal(slot(bank0, 0, 6).status, 'ready');
  assert.equal(slot(bank0, 3, 6).blocked, true);
  assert.throws(() => put(bank0, 3, 6, nextAdult), /other field bank/);
  const moved = move(bank0, 0, 6, 3, 6);
  assert.equal(slot(moved.rom, 0, 6).occupied, false);
  assert.equal(slot(moved.rom, 3, 6).id, 4050);
  assert.deepEqual(moved.ranges, [[S.SET_A, S.SET_A + PAGE], [S.SET_B, S.SET_B + PAGE]]);
  checkRanges(bank0, moved.rom, moved.ranges);
  const another = put(moved.rom, 0, 7, nextAdult).rom;
  const across = move(another, 3, 6, 4, 0);
  assert.equal(slot(across.rom, 3, 6).status, 'empty');
  assert.equal(slot(across.rom, 4, 0).id, 4050);
  assert.equal(slot(across.rom, 0, 7).id, 4066);
  checkRanges(another, across.rom, across.ranges);
  assert.throws(() => put(across.rom, 4, 0, adult.slice(0, 8)), /missing or damaged/);
  const residentAddress = slot(across.rom, 4, 0).address;
  across.rom[residentAddress + 0x60] ^= 1;
  assert.equal(slot(across.rom, 4, 0).status, 'unreadable');
  const erased = remove(across.rom, 4, 0);
  assert.equal(slot(erased.rom, 4, 0).status, 'empty');
  assert(erased.rom.subarray(residentAddress, residentAddress + RECORD).every(value => value === 255));

  // Both old bank bitmaps can already refer to a shared payload. Deleting one
  // bitmap must preserve the other bank's record.
  const clashing = put(rom, 0, 0).rom;
  for (const at of [S.SET_A, S.SET_B]) {
    const page = clashing.subarray(at, at + PAGE);
    page[0xF65] = 1;
    S.sealSettings(page);
  }
  assert(slot(clashing, 0, 0).blocked && slot(clashing, 3, 0).blocked);
  const cleared = remove(clashing, 0, 0);
  assert.equal(slot(cleared.rom, 0, 0).occupied, false);
  assert.equal(slot(cleared.rom, 3, 0).id, 4050);
  assert.equal(cleared.ranges.length, 2);
}
{
  const rom = fixture({ neon: true });
  const result = put(rom, 0, 0);
  assert.equal(R.inspect(result.rom).edition, 8);
  assert.equal(slot(result.rom, 0, 0).address, 0xE52000);
  assert.equal(slot(result.rom, 0, 0).id, 4050);
  const first = S.NEON_SETTINGS[0], last = S.NEON_SETTINGS[4];
  assert.equal(u32(result.rom, first + S.NEON_GENERATION), 4);
  assert.equal(u32(result.rom, last + S.NEON_GENERATION), 3);
  assert(S.settingsOk(result.rom.subarray(first, first + PAGE)));
  assert.deepEqual(result.ranges, [[0xE52000, 0xE56000], [first, first + PAGE]]);
  checkRanges(rom, result.rom, result.ranges);
  result.rom[first + 0x100] ^= 1;
  assert.equal(slot(result.rom, 0, 0).status, 'empty');
}
{
  const rom = fixture({ six: true });
  const old = put(rom, 3, 0).rom;
  w32(old, 0x109000, bankPatch.commitValue);
  const fallback = slot(old, 3, 0);
  assert.equal(fallback.address, 0xFB8000);
  assert.equal(fallback.id, 4050);
  assert.equal(slot(old, 0, 0).blocked, false);
  const one = put(old, 0, 0, nextAdult);
  assert.equal(slot(one.rom, 0, 0).id, 4066);
  assert.equal(slot(one.rom, 3, 0).id, 4050);
  assert.equal(u32(one.rom, 0xFB7000), bankPatch.commitValue);
  assert.deepEqual(one.ranges.slice(0, 3), [[0xFB8000, 0xFBC000], [0xFB7000, 0xFB8000], [0xDD2000, 0xDD6000]]);
  checkRanges(old, one.rom, one.ranges);
  const two = move(one.rom, 3, 0, 5, 0);
  assert.equal(slot(two.rom, 3, 0).status, 'empty');
  assert.equal(slot(two.rom, 0, 0).id, 4066);
  assert.equal(slot(two.rom, 5, 0).id, 4050);
  assert.equal(slot(two.rom, 5, 0).address, 0xD09000);
  assert.equal(u32(two.rom, bankPatch.markerAddress(17)), bankPatch.commitValue);
  checkRanges(one.rom, two.rom, two.ranges);
  two.rom[0xD09000 + 0x600] ^= 1;
  assert.equal(slot(two.rom, 5, 0).status, 'unreadable');
  const three = remove(two.rom, 5, 0);
  assert.equal(slot(three.rom, 5, 0).status, 'empty');
  assert.equal(u32(three.rom, bankPatch.markerAddress(17)), bankPatch.commitValue);
  checkRanges(two.rom, three.rom, three.ranges);
}
{
  const rom = fixture({ six: true });
  w32(rom, 0x109000, bankPatch.commitValue);
  const edited = put(rom, 5, 0).rom;
  const pages = S.paraFromImage(edited, 5);
  const save = S.paraDecode(S.paraEncode(pages, 5, null));
  const checked = S.paraCheck(save, 5, S.residentRanges(edited));
  assert(checked.complete && checked.supplemental);
  assert.equal(checked.errors.length, 0);
  assert.equal(u32(checked.pages.get(0xFB7000), 16 * 4), bankPatch.commitValue);
  assert.deepEqual(checked.pages.get(0xD09000), edited.subarray(0xD09000, 0xD0A000));
  assert(S.paraCheck(save, 5).warnings.some(warning => warning.code === 'saveOutside'));
  save.pages.delete(0xD09000);
  assert(!S.paraCheck(save, 5, bankPatch.ranges).complete);
  const cleared = S.paraClear(edited, 5);
  assert(S.residentRanges(cleared).every(([start, end]) => cleared.subarray(start, end).every(value => value === 255)));
}
console.log('Paradise resident editing passed');
