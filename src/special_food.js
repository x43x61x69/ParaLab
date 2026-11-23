/* Special Food installer for the three Paradise firmware families. */
(() => {
'use strict';

const root = typeof window === 'undefined' ? globalThis : window;
const C = root.ParamixCore || require('./core');
const F = root.ParamixFeld || require('./feld');
const Home = root.ParamixHomeMenu || require('./home_menu');
const Lab = root.ParamixLabRelease || require('./lab_release');
const Lz4 = root.ParamixLegacyLz4 || require('../six/experimental-lz4/patch');
if (!root.ParamixNeonTransplant && typeof module !== 'undefined') require('../six/experimental-neon/transplant');
const helper = typeof module === 'undefined' ? '__SPECIAL_FOOD_HELPER__' : require('../six/special-food/helper.json');
const release = typeof module === 'undefined' ? '__SPECIAL_FOOD_RELEASE__' : require('../six/my-lab/helper.json');

const PAGE = 0x1000, XIP = 0x11000;
const BANK_START = 0xeb0000, BANK_END = 0xef0000;
// A page transition keeps the outgoing draw objects until the incoming page is ready.
const ORIGINAL_DRAW_POOL = 0x2014, EXPANDED_DRAW_POOL = 0x201c;
const HEADER_SIZE = 0x20;
const MAGIC = 0x31465350; // PSF1
const WORDS = [80, 81, 278, 286];
// PSF1 Connection helper instructions used by ROMs exported before the order fix.
const MENU_TITLE_OFFSETS = [2, 14];
const OLD_MENU_COMPARE = { 1: [70, 4], 4: [70, 4], 5: [68, 5] };
const TRANSPORT = ['allocate_scene', 'initialize_link', 'send_body', 'send_body', 'status_after_body', 'status_after_body'];
const SITES = {
  1: [0x5702c, 0x74374, 0x745c2, 0x746dc, 0x74628, 0x74736],
  4: [0x5a3d6, 0x787d0, 0x78a1e, 0x78b38, 0x78a84, 0x78b92],
  5: [0x6346a, 0x8b61c, 0x8b86a, 0x8b984, 0x8b8d0, 0x8b9de],
};
const TRANSPORT_ENTRIES = ['allocate_probe', 'initialize_probe', 'send_probe', 'send_probe', 'poll_probe', 'poll_probe'];
const read16 = (b, p) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(p, true);
const read32 = (b, p) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p, true);
const write16 = (b, p, n) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint16(p, n, true);
const write32 = (b, p, n) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint32(p, n, true);
const blank = (b, a, z) => b.subarray(a, z).every(x => x === 0xff);
const matches = (b, at, a) => a.every((x, i) => b[at + i] === x);
const overlaps = (ranges, a, z) => ranges.some(([from, to]) => a < to && from < z);
function check(ok, message) { if (!ok) throw new Error(message); }

const PROFILES = {
  1: { row: 0x75df4, choice: 0x75e44, dialog: 0x74354, confirm: 0x743f6,
    list: 0x27170, drawPool: 0x57486, allocation: 0x5745c, allocated: 0x6c, egg: 0xd918, eggStack: 0x70,
    growth: 0xe594, growthStack: 0x90, appearance: 0xe616, rebuild: 0x5668c,
    itemHook: 0xe652, itemLookup: 0x1e3f8 },
  4: { row: 0x7a250, choice: 0x7a2a0, dialog: 0x787b0, confirm: 0x78852,
    list: 0x28f90, drawPool: 0x5a832, allocation: 0x5a808, allocated: 0x6c, egg: 0xdb80, eggStack: 0x68,
    growth: 0xe6c8, growthStack: 0xc0, appearance: 0xe778, rebuild: 0x59a08,
    itemHook: 0xe7ae, itemLookup: 0x1f73c },
  5: { row: 0x8d0f8, choice: 0x8d148, dialog: 0x8b5fc, confirm: 0x8b69e,
    list: 0x2d5c4, drawPool: 0x638c6, allocation: 0x6389c, allocated: 0x78, egg: 0xf708, eggStack: 0x68,
    growth: 0x1014e, growthStack: 0xc8, appearance: 0x101fe, rebuild: 0x62678,
    itemHook: 0x10236, itemLookup: 0x22ff0 },
};

const RELEASE_VENEERS = {
  release_initialize: 'initialize_link',
  release_send: 'send_body',
  release_poll: 'status_after_body',
  release_draw: 'release_dialog',
  release_confirm: 'release_confirmation',
};

function familyOf(rom) {
  const edition = C.editionIdOf(rom);
  return edition >= 1 && edition <= 3 ? 1 : edition === 4 ? 4 : edition >= 5 && edition <= 7 ? 5 : 0;
}

function branch(from, to, link = true) {
  const delta = to - from - 4, sign = (delta >>> 24) & 1;
  const j1 = 1 ^ ((delta >>> 23) & 1) ^ sign, j2 = 1 ^ ((delta >>> 22) & 1) ^ sign;
  const bytes = new Uint8Array(4);
  write16(bytes, 0, 0xf000 | (sign << 10) | ((delta >>> 12) & 1023));
  write16(bytes, 2, (link ? 0xd000 : 0x9000) | (j1 << 13) | (j2 << 11) | ((delta >>> 1) & 2047));
  return bytes;
}

function inspect(rom) {
  const family = familyOf(rom), profile = PROFILES[family];
  if (!profile || rom.length !== 0x1000000) return null;
  for (let page = 0x10e000; page >= 0x90000; page -= PAGE) {
    if (read32(rom, page) !== MAGIC || read16(rom, page + 8) !== family) continue;
    const entry = page + HEADER_SIZE + helper[family].entries.connection_rows;
    const labPage = read32(rom, page + 4), label = read16(rom, page + 10);
    if (labPage < 0x90000 || labPage >= 0x10f000 || labPage % PAGE ||
        !matches(rom, labPage, [0x50, 0x4d, 0x58, 0x4c, 0x41, 0x42, 2, 0])) continue;
    if (matches(rom, XIP + profile.row, branch(XIP + profile.row, entry)))
      return { page, labPage, label, chainedGrowth: read16(rom, page + 12) === 1 };
  }
  return null;
}

function upgrade(rom) {
  const installed = inspect(rom);
  if (!installed) return rom;
  const family = familyOf(rom), profile = PROFILES[family], program = installed.page + HEADER_SIZE;
  const pool = XIP + profile.drawPool, expandPool = read16(rom, pool) !== EXPANDED_DRAW_POOL;
  check(!expandPool || (read16(rom, pool) === ORIGINAL_DRAW_POOL &&
    matches(rom, pool + 2, [0x02, 0x22, 0x0a, 0x23, 0x19, 0x46])),
    'The Special Food Connection draw pool does not match this firmware');

  const rowEntry = program + helper[family].entries.connection_rows;
  const [first, second] = MENU_TITLE_OFFSETS.map(offset => rowEntry + offset);
  const food = installed.label, release = read16(rom, installed.labPage + 8);
  const reorder = movwImmediate(rom, first) === release && movwImmediate(rom, second) === food;
  check(reorder || (movwImmediate(rom, first) === food && movwImmediate(rom, second) === release),
    'The Special Food Connection titles do not match this firmware');
  if (!expandPool && !reorder) return rom;

  const out = new Uint8Array(rom);
  if (expandPool) write16(out, pool, EXPANDED_DRAW_POOL);
  if (reorder) {
    const [compareOffset, oldReleaseRow] = OLD_MENU_COMPARE[family];
    const compare = program + compareOffset;
    const oldChoice = program + helper[family].entries.connection_choice;
    // Move both labels and update the selection that dispatches to RELEASE.
    check(matches(rom, XIP + profile.choice, branch(XIP + profile.choice, oldChoice)) &&
      read16(rom, compare) === (0x2900 | oldReleaseRow) &&
      matches(rom, compare + 2, [0x34, 0x68, 0x00, 0x78, 0xc0, 0xf3]),
    'The Special Food Connection selection does not match this firmware');
    writeMovw(out, first, food);
    writeMovw(out, second, release);
    write16(out, compare, 0x2900 | (oldReleaseRow + 1));
  }
  return out;
}

function movwImmediate(code, at) {
  const first = read16(code, at), second = read16(code, at + 2);
  if ((first & 0xfbf0) !== 0xf240 || second & 0x8000) return -1;
  return ((first & 15) << 12) | ((first & 0x0400) << 1) | ((second & 0x7000) >>> 4) | (second & 255);
}

function writeMovw(code, at, value) {
  write16(code, at, 0xf240 | (value >>> 12) | ((value >>> 1) & 0x0400));
  write16(code, at + 2, (read16(code, at + 2) & 0x0f00) | ((value << 4) & 0x7000) | (value & 255));
}

function replacePrompt(code, from, to) {
  let replaced = 0;
  for (let i = 0; i + 4 <= code.length; i += 2) {
    if (movwImmediate(code, i) !== from) continue;
    writeMovw(code, i, to);
    replaced++;
  }
  check(replaced === 1, 'Invalid Special Food program text reference');
}

function addText(rom, donor, reserved) {
  const ctx = C.openRom(rom), local = C.textTablesOf(rom), source = C.textTablesOf(donor);
  const label = local.tabs[0].n;
  check(local.tabs.length === 9 && source.tabs.length === 9, 'Special Food requires the nine native language tables');
  const tables = local.tabs.map((table, language) => {
    const from = source.tabs[language];
    check(table.native && table.n === label && from.native, 'Invalid Special Food text table');
    const rows = WORDS.map(id => C.txtWords(from, id));
    check(rows.every(row => row.length), 'Special Food text missing from Neon Planets');
    const count = label + rows.length, dataAt = 2 * table.offs[1];
    const end = table.b.length + 2 * rows.length + 2 * rows.reduce((n, row) => n + row.length + 1, 0);
    check(end <= 0x1fffe, 'Special Food text exceeds the language table capacity');
    const result = new Uint8Array(end);
    write16(result, 0, count);
    for (let i = 1; i <= label; ++i) write16(result, 2 * i, table.offs[i] + rows.length);
    result.set(table.b.subarray(dataAt), dataAt + 2 * rows.length);
    let cursor = table.b.length + 2 * rows.length;
    rows.forEach((row, i) => {
      write16(result, 2 * (label + i + 1), cursor / 2);
      for (const glyph of row) { write16(result, cursor, glyph); cursor += 2; }
      cursor += 2;
    });
    write16(result, 2 * (count + 1), cursor / 2);
    return result;
  });
  const archive = C.arc2Build(tables);
  const end = local.off + archive.length, size = end - C.ASSET_BASE - 16;
  const entry = ctx.root.ents[2];
  check(!entry.flags && local.off + entry.clen === ctx.assetEnd && end <= ctx.limit &&
    blank(rom, ctx.assetEnd, end) && !overlaps(reserved, ctx.assetEnd, end),
  'Special Food text overlaps allocated flash');
  rom.set(archive, local.off);
  write32(rom, C.ASSET_BASE + 8, size);
  write32(rom, C.ASSET_BASE + 56, archive.length);
  write32(rom, C.ASSET_BASE + 60, archive.length);
  write32(rom, C.ASSET_BASE + 4, C.arc2Checksum(rom, C.ASSET_BASE, size));
  C.verifyRom(rom, []);
  return label;
}

function apply(base, donor, stub) {
  const installed = inspect(base);
  if (installed) return { rom: upgrade(base), codePage: installed.page, dataStart: BANK_START, dataEnd: BANK_END };
  const family = familyOf(base), profile = PROFILES[family];
  check(profile && donor && C.editionIdOf(donor) === 8 && C.textGet(donor, 81) === 'GET FOOD',
    'Choose an edition 1–6 Paradise ROM and a Neon Planets ROM');
  let rom = new Uint8Array(Lab.apply(base, donor));
  const menu = stub ? F.feldFind(rom, stub) : null;
  const reserved = Home.reservations(rom);
  if (menu?.nslots) {
    const config = menu.off + 0x140;
    check(read32(rom, config + 20) <= BANK_START && BANK_END <= read32(rom, config + 24),
      'Save slots do not cover the Special Food region');
  }
  check(blank(rom, BANK_START, BANK_END), 'The per-save Special Food area is already in use');
  const adults = C.charTable(C.openRom(donor).files[0]).filter(char => char.stage === 5);
  const originals = adults.filter(char => char.id >= 4000 && char.id < 9000);
  const local = new Set(C.charTable(C.openRom(rom).files[0]).map(char => char.id));
  const missing = new Set(originals.filter(char => !local.has(char.id)).map(char => char.id));
  if (missing.size && family !== 1 && !Lz4.isInstalled(rom))
    rom = Lz4.patch(rom, Lz4.embedded(rom), null, true, stub).rom;
  if (missing.size) rom = root.ParamixNeonTransplant.importAdults(rom, donor, missing, reserved);

  const target = adults.filter(char => char.id >= 10000 && char.id < 60000).map(char => {
    const matching = originals.filter(original => original.animation === char.animation && original.name === char.name);
    check(matching.length === 1, 'The Special Food character roster does not match Neon ID ' + char.id);
    return [char.id, matching[0].id];
  });
  const { hex, entries } = helper[family];
  const original = Uint8Array.from(hex.match(/../g), x => parseInt(x, 16));
  const tableAt = entries.special_food_targets;
  check(tableAt === original.length - 2 && target.length === 102, 'Invalid Special Food character table');
  const code = new Uint8Array(original.length + target.length * 4);
  code.set(original);
  target.forEach(([from, to], i) => {
    write16(code, tableAt + 4 * i, from);
    write16(code, tableAt + 4 * i + 2, to);
  });
  write16(code, code.length - 2, 0xffff);

  const size = Math.ceil((code.length + HEADER_SIZE) / PAGE) * PAGE;
  const labPage = Lab.codePage(rom);
  let page = 0x10f000 - size;
  while (page >= 0x90000 && (!blank(rom, page, page + size) || overlaps(reserved, page, page + size))) page -= PAGE;
  check(labPage !== null && page >= 0x90000, 'No free firmware pages for Special Food');
  const program = page + HEADER_SIZE;
  const label = addText(rom, donor, reserved);
  const releaseLabel = read16(rom, labPage + 8);
  [label, releaseLabel, label + 2, label + 1, label + 3].forEach((id, i) => replacePrompt(code, 0x6fe3 + i, id));

  const labEntry = name => labPage + (name === 'connection_row' ? 0x20 : 0x80 + release[family].entries[name]);
  const { allocation, allocated, egg, eggStack, growth, growthStack, appearance, rebuild, itemHook, itemLookup, list } = profile;
  const growthHelper = 0x107010;
  const hasGrowth = matches(rom, XIP + growth, branch(XIP + growth, growthHelper));
  const veneers = {
    ...Object.fromEntries(Object.entries(RELEASE_VENEERS).map(([name, entry]) => [name, labEntry(entry)])),
    list_constructor: XIP + list,
    native_egg_body: XIP + egg + 4,
    ordinary_growth: hasGrowth ? growthHelper : program + entries.stock_growth,
  };
  for (const [name, to] of Object.entries(veneers)) {
    const at = entries[name];
    check(read32(code, at) === 0xb800f000, 'Invalid Special Food program branch');
    code.set(branch(program + at, to, false), at);
  }
  const hooks = [
    ...SITES[family].map((site, i) => [site, TRANSPORT[i], TRANSPORT_ENTRIES[i]]),
    [profile.row, 'connection_row', 'connection_rows'],
    [profile.choice, 'connection_selection', 'connection_choice'],
    [profile.dialog, 'release_dialog', 'food_dialog'],
    [profile.confirm, 'release_confirmation', 'food_confirmation'],
  ];
  for (const [site, before, next] of hooks) {
    const at = XIP + site;
    check(matches(rom, at, branch(at, labEntry(before))), 'The installed RELEASE hooks do not match this firmware');
    rom.set(branch(at, program + entries[next]), at);
  }
  const native = [
    [egg, [0x80, 0xb5, 0x80 | (eggStack / 4), 0xb0], 'ordinary_new_egg', false],
    [growth, hasGrowth ? branch(XIP + growth, growthHelper) : [0xbd, 0xf8, growthStack, 0x10], 'select_adult', true],
    [appearance, branch(appearance, rebuild), 'rebuild_food_appearance', true],
    [itemHook, branch(itemHook, itemLookup), 'food_item', true],
  ];
  for (const [site, before, next, link] of native) {
    const at = XIP + site;
    check(matches(rom, at, before), 'The native Special Food hook does not match at 0x' + at.toString(16));
    rom.set(branch(at, program + entries[next], link), at);
  }
  check(read16(rom, XIP + allocation) === (0x2000 | allocated), 'The Connection list size does not match');
  write16(rom, XIP + allocation, 0x2000 | (allocated + 12));
  write32(rom, page, MAGIC);
  write32(rom, page + 4, labPage);
  write16(rom, page + 8, family);
  write16(rom, page + 10, label);
  write16(rom, page + 12, Number(hasGrowth));
  // The Chinese patcher uses these ranges to convert only the new native glyphs.
  const names = (label - missing.size) | (missing.size << 16);
  write32(rom, page + 16, names);
  write32(rom, page + 20, ~names);
  write32(rom, page + 24, 0);
  write32(rom, page + 28, ~label);
  rom.set(code, program);
  return { rom: upgrade(rom), codeSize: code.length, codePage: page, dataStart: BANK_START, dataEnd: BANK_END };
}

const api = { apply, inspect, upgrade, installed: rom => !!inspect(rom) };
root.ParamixSpecialFood = api;
if (typeof module !== 'undefined') module.exports = api;
})();
