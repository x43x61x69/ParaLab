'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RB = require('../src/paradise_resident_banks.js');
const F = require('../src/feld.js');
const FL = require('../src/flash.js');
require('../src/saves.js');
const SV = globalThis.ParamixSaves;

const ROM_SIZE = 0x1000000, PAGE = 0x1000;
const BANK_FLAG = 0xF04, DNA_MARK = 0xF0F, MASK_LIVE = 0x1F9, MASK_STASH = 0xF65;
const PRIMARY = 0xDD2000;
const u32 = (data, at) => new DataView(data.buffer, data.byteOffset).getUint32(at, true);
const w32 = (data, at, value) => new DataView(data.buffer, data.byteOffset).setUint32(at, value, true);

function baseline() {
  const image = new Uint8Array(ROM_SIZE).fill(0xFF);
  w32(image, 0x111008, 0x20);
  w32(image, 0x10F000, 0x31584953);
  w32(image, 0x10F004, 7);
  w32(image, 0x10F008, 0x18001AE8);
  w32(image, 0x10F020, 0x0A);
  for (const [at, bytes] of [
    [0x296A8, '80b582b0'], [0xA193C, '80b58cb0'], [0xA1960, '87f7c0fe'],
    [0x29430, '00f058f9'], [0x29D1C, '9df80300fff76cfb'],
  ]) image.set(Buffer.from(bytes, 'hex'), at);
  return image;
}

function setRoster(image, activeBank, active, inactive) {
  const page = new Uint8Array(PAGE);
  page[BANK_FLAG] = activeBank;
  page[DNA_MARK] = 0x5A;
  page[MASK_LIVE] = active;
  page[MASK_STASH] = inactive;
  SV.sealSettings(page);
  for (const address of [SV.SET_A, SV.SET_B]) image.set(page, address);
}

function writeNative(image, at, identity) {
  const record = image.subarray(at, at + 0x4000);
  record.fill(0, 0, 0x600);
  w32(record, 0x10, identity);
  w32(record, 0x10C, 0x600);
  const checksum = identity + 0x600;
  w32(record, 0, checksum);
  w32(record, 4, -checksum);
}

const stock = baseline();
assert.equal(RB.needsInstall(stock), true);
assert.equal(RB.address(1), 0xFB8000);
assert.equal(RB.address(14), 0xFEC000);
assert.equal(RB.address(15), 0xD01000);
assert.equal(RB.address(24), 0xD25000);
assert.equal(RB.markerAddress(24), 0xFB705C);
assert.throws(() => RB.address(25), RangeError);

writeNative(stock, PRIMARY, 101);
setRoster(stock, 0, 1, 1);
const installed = RB.apply(stock);
assert.equal(RB.needsInstall(installed), false);
assert.equal(RB.codePage(installed), 0x109000);
assert.equal(RB.committed(installed, 1), true);
assert.equal(u32(installed, RB.address(1) + 0x10), 101);
assert.equal(u32(stock, RB.markerAddress(1)), 0xFFFFFFFF);
assert.equal(RB.migrate(installed), installed);

writeNative(installed, PRIMARY, 102);
assert.equal(u32(RB.migrate(installed), RB.address(1) + 0x10), 101);
setRoster(installed, 1, 1, 1);
const stripped = RB.strip(installed);
assert.equal(RB.installed(stripped), false);
assert.equal(RB.needsInstall(stripped), true);
assert.equal(u32(stripped, PRIMARY + 0x10), 101);
assert.equal(u32(stripped, RB.markerAddress(1)), 0xFFFFFFFF);
assert.equal(u32(stripped, RB.address(1)), 0xFFFFFFFF);

const staging = new Uint8Array(ROM_SIZE).fill(0xFF);
setRoster(staging, 1, 1, 0);
writeNative(staging, PRIMARY, 103);
assert.equal(RB.migrate(staging), staging);
const migrated = RB.migrateSave(staging);
assert.equal(RB.committed(migrated, 1), true);
assert.equal(u32(migrated, RB.address(1) + 0x10), 103);

stock[RB.address(1)] = 0x00;
assert.throws(() => RB.apply(stock), /overlaps/);
installed[RB.codePage(installed) + 36] ^= 0x01;
assert.equal(RB.installed(installed), false);

async function keepSavesCapacity() {
  const stub = fs.readFileSync(path.join(__dirname, '../feld/stub_feld_tpl.bin'));
  const slots = 0xC00000, menu = 0xB1000, cfg = menu + 0x140;
  function setLayout(image, size) {
    const pointer = stub.indexOf(Buffer.from([1, 0xEF, 0x89, 0x67]));
    assert(pointer >= 0);
    w32(image, 0xB0000 + pointer, 0x10000000 + menu - 0x11000);
    for (const [offset, value] of [[0, 0x444C4546], [4, 11], [8, slots], [12, size], [16, 3], [36, F.F_FIELDS], [364, 0], [368, 0], [612, 0], [616, 0]])
      w32(image, cfg + offset, value);
    return F.feldFind(image, stub);
  }
  const old = baseline();
  const oldLayout = setLayout(old, 0x6000);
  const used = new Set();
  let seed = 321;
  for (const slot of [0, 2]) {
    const pages = new Map();
    for (let a = 0xD2A000; a < 0xD2D000; a += PAGE) {
      const data = new Uint8Array(PAGE);
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = seed;
      }
      pages.set(a, data);
    }
    F.slotPlace(old, oldLayout, slot, F.slotBuild(pages, slot, 0xD2A000, 0xF00000), used);
  }
  const target = RB.apply(baseline());
  setLayout(target, 0x3000);
  const keep = FL.keepPlan({ ...F, edition: () => ({ id: 5, profile: { idPage: 0xD29000, name: 'gen3' } }) }, {}, { stub });
  const plan = (device, image) => {
    const changed = new Set();
    for (let a = 0; a < ROM_SIZE; a += PAGE) if (!device.subarray(a, a + PAGE).every((v, i) => v === image[a + i])) changed.add(a);
    return keep({ info: { edition: 5 }, read: async (a, n) => device.subarray(a, a + n) }, image, changed);
  };
  await assert.rejects(plan(old, target), { code: 'slotResidentBankSpace', p: { f: 3 } });
  const fallback = RB.strip(target);
  setLayout(fallback, 0x5000);
  const kept = await plan(old, fallback);
  assert.deepEqual(F.feldSlots(kept.image, stub).map(s => [s.index, F.slotPages(s)]), F.feldSlots(old, stub).map(s => [s.index, F.slotPages(s)]));
  await assert.rejects(plan(target, fallback), { code: 'slotResidentBanksRequired' });
  console.log('Paradise resident bank layout, migration and Keep Saves capacity verified');
}

keepSavesCapacity().catch(error => { console.error(error); process.exitCode = 1; });
