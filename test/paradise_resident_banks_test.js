'use strict';

const assert = require('node:assert/strict');
const RB = require('../src/paradise_resident_banks.js');
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
console.log('Paradise resident bank layout and migration verified');
