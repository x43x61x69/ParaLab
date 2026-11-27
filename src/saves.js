/*
 * Paramix Studio: save games in and out of the Paradise.
 *
 * Paradise: the game keeps its progress in the flash after the edition ID page
 * (0xD4A000, Tropical/Glacier 0xD2A000, Neon Planets 0xD86000) up to 0xF00000. Exported as a
 * .sav (format 3 of the TamaParadise app, formerly named .tamasave): every page of that region,
 * the seconds counter of the device and an armed wake alarm, so the app
 * continues instead of starting like a fresh battery. Behind the pages a
 * Paramix trailer ("PMXE", edition, region) that the app ignores and the
 * Studio uses to refuse a save of another edition.
 *
 * TamaEmu: the guest's own save is its flash. Exported as the raw image the
 * TamaEmu app uses (.sav, 4 MB or 8 MB; named after the app's device: plus-color, idl, ps, 4u): packed blocks plus the spare pages
 * the emulator wrote. Importing a .sav works like choosing a firmware.
 *
 * Author: mameise
 */
(function (root) {
'use strict';

const PAGE = 0x1000;
const MAGIC = 'TAMASAVE', VERSION = 3, TRAILER = 0x45584D50;   // "PMXE"
const SET_A = 0xEFE000, SET_B = 0xEFF000, REGION_END = 0xF00000;
const NEON_SETTINGS = [0xD86000, 0xD87000, 0xD88000, 0xD89000, 0xD8A000];
const NEON_GENERATION = 0xAD0;
const NEON_POINTS = 0xC0;
const NEON_LEVEL = 0x88;
const NEON_MISSION_FLAGS = [0xF8, 0xFC, 0x100];
// [save offset, target, optional bitmap byte count]; mission 13 is a u32 counter.
const NEON_MISSIONS = [
  [0xC4, 500], [0xC6, 500], [0xC8, 100], [0xCA, 100], [0xCC, 100], [0xCE, 1000],
  [0xD0, 10], [0xD2, 7, 1], [0xD4, 50], [0xD6, 50], [0xD8, 100], [0xDA, 50],
  [0xDC, 100], [0xE0, 99999], [0xE4, 50], [0xE6, 50], [0xE8, 18, 3],
  [0xEB, 12, 2], [0xED, 16, 2], [0xEF, 16, 2], [0xF1, 16, 2], [0xF3, 16, 2],
];
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function w32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }

/** Edition 5/6 (Tropical, Glacier) keep their ID page lower. */
function idPage(edition) { return edition === 8 ? 0xD85000 : edition >= 5 && edition <= 7 ? 0xD29000 : 0xD49000; }
function region(edition) { return [idPage(edition) + PAGE, REGION_END]; }
function residentRanges(rom) {
  const residentBanks = root.ParamixResidentBanks || (typeof require !== 'undefined' ? require('./paradise_resident_banks.js') : null);
  return residentBanks?.inspect(rom)?.ranges || [];
}
function paraRanges(rom, edition) {
  return [region(edition), ...residentRanges(rom)];
}
function paraClear(rom, edition) {
  if (rom.length !== 0x1000000 || !Number.isInteger(edition) || edition < 1 || edition > 8)
    throw new Error('expected a Paradise ROM with a known save layout');
  const out = new Uint8Array(rom);
  for (const [start, end] of paraRanges(rom, edition)) out.fill(0xFF, start, end);
  return out;
}
function family(edition) { return edition === 8 ? 'neon' : edition >= 5 && edition <= 7 ? 'gen3' : edition === 4 ? 'jade' : 'gen1'; }

/* Settings block: CRC-16/ARC over bytes 4..4095 at 0, its inverse at 2. */
function crc16arc(d, from, to) {
  let c = 0;
  for (let i = from; i < to; i++) { c ^= d[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xA001 : c >>> 1; }
  return c;
}
function settingsOk(p) { const c = crc16arc(p, 4, PAGE); return u16(p, 0) === c && u16(p, 2) === (~c & 0xFFFF); }

function sealSettings(page) {
  const crc = crc16arc(page, 4, PAGE);
  w32(page, 0, crc | ((~crc & 0xFFFF) << 16));
}

/** The native boot scan picks the highest unsigned generation, with later pages winning ties. */
function neonSettings(pages) {
  let active = null;
  for (const [index, address] of NEON_SETTINGS.entries()) {
    const page = pages.get(address);
    if (!page || page.length !== PAGE || !settingsOk(page)) continue;
    const generation = u32(page, NEON_GENERATION);
    if (!active || generation >= active.generation) active = { index, page, generation };
  }
  return active;
}

// ---------------------------------------------------------------- Paradise
/** Pages of the save region from a 16 MB image (all of them, empty ones too). */
function paraFromImage(img, edition) {
  const pages = new Map();
  for (const [a, b] of paraRanges(img, edition))
    for (let p = a; p < b; p += PAGE) pages.set(p, img.slice(p, p + PAGE));
  return pages;
}
/**
 * Paradise backup from pages (Map address -> 4 KB). clock: { counter, ctrl } of the device or null.
 */
function paraEncode(pages, edition, clock, now = Math.floor(Date.now() / 1000)) {
  const counter = clock ? clock.counter >>> 0 : 0;
  const alarm = counter ? counter - 1 : 0, status = counter ? 0x100 : 0;   // armed, as the app does when it puts the console away
  // the always powered system registers as the app stores them (clock and PLL as the firmware sets them)
  const regs = counter ? [[0x000, 0xC051], [0x004, 0xA55A0000], [0x00C, 4], [0x010, 0], [0x018, 0x21], [0x020, 0x42], [0x050, 0],
    [0x100, 0x157EB7], [0x108, 0], [0x10C, 0x1FFFFD], [0x110, 0], [0x200, clock.ctrl & 0x80 ? clock.ctrl >>> 0 : 0xE0], [0x204, 0],
    [0x210, 0], [0x214, 0], [0x218, 0], [0x230, alarm], [0x234, status], [0x300, 0x10]] : [];
  const list = [...pages.keys()].sort((x, y) => x - y);
  const size = 36 + 8 * regs.length + 4 + list.reduce((n, a) => n + 8 + pages.get(a).length, 0) + 16;
  const out = new Uint8Array(size);
  for (let i = 0; i < 8; i++) out[i] = MAGIC.charCodeAt(i);
  w32(out, 8, VERSION);
  w32(out, 12, counter ? now : 0); w32(out, 16, 0);              // u64 time stamp (seconds since 1970)
  w32(out, 20, counter); w32(out, 24, alarm); w32(out, 28, status); w32(out, 32, regs.length);
  let o = 36;
  for (const [k, v] of regs) { w32(out, o, k); w32(out, o + 4, v); o += 8; }
  w32(out, o, list.length); o += 4;
  for (const a of list) { const d = pages.get(a); w32(out, o, a / PAGE); w32(out, o + 4, d.length); out.set(d, o + 8); o += 8 + d.length; }
  w32(out, o, TRAILER); w32(out, o + 4, edition); w32(out, o + 8, region(edition)[0]); w32(out, o + 12, region(edition)[1]);
  return out;
}
/** Write a decoded save back as it was (time stamp, clock, registers kept). */
function paraWrite(save, edition) {
  const regs = save.regs || [], list = [...save.pages.keys()].sort((x, y) => x - y);
  const size = 36 + 8 * regs.length + 4 + list.reduce((n, a) => n + 8 + save.pages.get(a).length, 0) + 16;
  const out = new Uint8Array(size);
  for (let i = 0; i < 8; i++) out[i] = MAGIC.charCodeAt(i);
  w32(out, 8, VERSION);
  w32(out, 12, save.stamp % 4294967296); w32(out, 16, Math.floor(save.stamp / 4294967296));
  w32(out, 20, save.counter); w32(out, 24, save.alarm); w32(out, 28, save.status); w32(out, 32, regs.length);
  let o = 36;
  for (const [k, v] of regs) { w32(out, o, k); w32(out, o + 4, v); o += 8; }
  w32(out, o, list.length); o += 4;
  for (const a of list) { const d = save.pages.get(a); w32(out, o, a / PAGE); w32(out, o + 4, d.length); out.set(d, o + 8); o += 8 + d.length; }
  const ed = edition || save.edition;
  w32(out, o, TRAILER); w32(out, o + 4, ed); w32(out, o + 8, region(ed)[0]); w32(out, o + 12, region(ed)[1]);
  return out;
}
/** Read a Paradise backup (format 3). Throws on anything else. */
function paraDecode(b) {
  if (b.length < 40 || String.fromCharCode(...b.subarray(0, 8)) !== MAGIC) throw new Error('not a Paradise save (.sav)');
  if (u32(b, 8) !== VERSION) throw new Error('unknown save version ' + u32(b, 8));
  const stamp = u32(b, 12) + u32(b, 16) * 4294967296, counter = u32(b, 20), alarm = u32(b, 24), status = u32(b, 28);
  const nr = u32(b, 32); let o = 36;
  const regs = [];
  for (let i = 0; i < nr; i++) { if (o + 8 > b.length) throw new Error('save is cut off'); regs.push([u32(b, o), u32(b, o + 4)]); o += 8; }
  if (o + 4 > b.length) throw new Error('save is cut off');
  const np = u32(b, o); o += 4;
  const pages = new Map();
  for (let i = 0; i < np; i++) {
    if (o + 8 > b.length) throw new Error('save is cut off');
    const a = u32(b, o) * PAGE, n = u32(b, o + 4); o += 8;
    if (o + n > b.length) throw new Error('save is cut off');
    pages.set(a, b.slice(o, o + n)); o += n;
  }
  let edition = 0;
  if (o + 16 <= b.length && u32(b, o) === TRAILER) {
    edition = u32(b, o + 4);
    const start = u32(b, o + 8), end = u32(b, o + 12);
    // The fork formerly exported Neon as 7. Its recorded region distinguishes
    // these backups from 1.7.6 Tropical/Glacier backups using that number.
    if (edition === 7 && start === region(8)[0]) edition = 8;
    if (edition && (edition > 8 || start !== region(edition)[0] || end !== REGION_END))
      throw new Error('unknown Paradise save layout');
  }
  return { stamp, counter, alarm, status, regs, pages, edition };
}
/**
 * Can this save go onto a device of this edition? Returns { errors, warnings, pages (only the
 * save region, full 4 KB), complete }.
 */
function paraCheck(save, edition, extra = []) {
  const errors = [], warnings = [], [a, b] = region(edition), pages = new Map();
  // 1.7.6 SAVE_FAMILY: the field switch changes the ID (Land/Water/Sky, Tropical/Glacier and their Forest/Sky): a save
  // of the same firmware fits, before a save from Tropical was refused on the device once it had switched to Glacier
  if (save.edition && family(save.edition) !== family(edition)) errors.push({ code: 'saveOtherEd', p: { s: save.edition, d: edition } });
  const supplemental = [...save.pages.keys()].some(p => extra.some(([from, to]) => p >= from && p < to));
  let outside = 0;
  for (const [p, d] of save.pages) {
    if (((p < a || p >= b) && !extra.some(([from, to]) => p >= from && p < to)) || d.length !== PAGE) { outside++; continue; }
    pages.set(p, d);
  }
  if (outside) warnings.push({ code: 'saveOutside', p: { n: outside } });
  const neon = edition === 8, settings = neon ? NEON_SETTINGS : [SET_A, SET_B];
  const set = neon ? neonSettings(pages)?.page : settings.map(a => pages.get(a)).find(p => p && settingsOk(p));
  // Restoring only some ring pages can leave a newer copy of the previous
  // settings on the device. A snapshot must include the whole ring.
  if (!set || (neon && !settings.every(a => pages.has(a)))) errors.push({ code: 'saveNoSettings' });
  else if (!save.edition && !neon) {
    // The word at +0x0C advances with the clock. Prefer the start of a whole
    // backup, with the old heuristic only for partial saves without metadata.
    const [gen3Start] = region(5), [olderStart] = region(1);
    const first = [...save.pages.keys()].reduce((min, at) => at < a && extra.some(([from, to]) => at >= from && at < to) ? min : Math.min(min, at), Infinity);
    const gen3 = first === gen3Start || (first !== olderStart && u16(set, 12) === 0x016D);
    if (first === region(8)[0] || gen3 !== (family(edition) === 'gen3'))
      errors.push({ code: 'saveFamily' });
  }
  let complete = true;
  for (let p = a; p < b; p += PAGE) if (!pages.has(p)) { complete = false; break; }
  if (supplemental) {
    for (const [from, to] of extra) for (let p = from; p < to; p += PAGE) {
      if (!pages.has(p)) complete = false;
    }
  }
  if (!complete) warnings.push({ code: 'saveIncomplete' });
  return { errors, warnings, pages, complete, supplemental };
}
/** Seconds counter to set on the device: the saved one plus the time since. */
function paraClock(save, now = Math.floor(Date.now() / 1000)) {
  if (!save.counter || !save.stamp) return null;
  return (save.counter + Math.max(0, now - save.stamp)) >>> 0;
}

function neonProgress(save) {
  if (save.edition && save.edition !== 8) return null;
  if (!NEON_SETTINGS.every(address => save.pages.get(address)?.length === PAGE)) return null;
  const current = neonSettings(save.pages);
  if (!current) return null;
  const page = current.page;
  const flags = u32(page, NEON_MISSION_FLAGS[0]);
  const id = u16(page, 0x118), stage = (page[0x12C] >> 2) & 7;
  return {
    points: u32(page, NEON_POINTS),
    level: page[NEON_LEVEL] & 15,
    id, stage, canCare: id >= 1001 && id <= 4999 && stage >= 2 && stage <= 5,
    hunger: page[0x130], happy: page[0x131], sick: page[0x124],
    missions: NEON_MISSIONS.map(([, target], index) => ({
      target, count: neonMissionCount(page, index), complete: !!(flags & (1 << index)),
    })),
  };
}

function neonSaveLayout(rom) {
  const getter = [0x40,0xF2,0x94,0x20,0xC1,0xF6,0x00,0x00,0xD0,0xF8,0xBC,0x00,0x70,0x47];
  return rom.length === 0x1000000 && getter.every((byte, index) => rom[0x229C0 + index] === byte)
    && NEON_MISSIONS.every(([, target], index) => u32(rom, 0xA6D24 + index * 4) === target);
}

function neonMissionCount(page, index) {
  const [offset, , bytes] = NEON_MISSIONS[index];
  if (!bytes) return index === 13 ? u32(page, offset) : u16(page, offset);
  let count = 0;
  for (let i = 0; i < bytes; i++) {
    for (let value = page[offset + i]; value; value &= value - 1) count++;
  }
  return count;
}

function neonMissionSet(page, mission) {
  const { index, complete } = mission;
  if (!Number.isInteger(index) || !NEON_MISSIONS[index] || typeof complete !== 'boolean') throw new Error('invalid Neon mission');
  const mask = 1 << index;
  // Preserve the game's unclaimed reward for a mission that was already completed.
  if (complete && (u32(page, NEON_MISSION_FLAGS[0]) & mask)) return;
  const [offset, target, bytes] = NEON_MISSIONS[index];
  const current = neonMissionCount(page, index);
  const next = complete ? Math.max(current, target) : Math.min(current, target - 1);
  if (bytes) {
    let count = current;
    for (let i = 0; i < bytes * 8 && count !== next; i++) {
      const bit = complete ? i : bytes * 8 - 1 - i;
      const at = offset + (bit >> 3), flag = 1 << (bit & 7);
      if (complete && !(page[at] & flag)) { page[at] |= flag; count++; }
      if (!complete && (page[at] & flag)) { page[at] &= ~flag; count--; }
    }
  } else if (index === 13) {
    w32(page, offset, next);
  } else {
    page[offset] = next & 255;
    page[offset + 1] = next >>> 8;
  }
  for (const at of NEON_MISSION_FLAGS) {
    const flags = u32(page, at);
    w32(page, at, complete ? flags | mask : flags & ~mask);
  }
}

function neonProgressSet(save, changes) {
  const progress = neonProgress(save);
  if (!progress) throw new Error('the Neon settings ring is missing or damaged');
  const current = neonSettings(save.pages);
  const page = new Uint8Array(current.page), pages = new Map(save.pages);
  if (changes.id) changePetIdentity(save, pages, page, PET.neon.tama, NEON_SETTINGS, changes);
  if (changes.points !== undefined) {
    const points = changes.points;
    if (!Number.isInteger(points) || points < 0 || points > 99999) throw new Error('Tamapoints must be between 0 and 99999');
    w32(page, NEON_POINTS, points);
  }
  if (changes.level !== undefined) {
    const level = changes.level;
    if (!Number.isInteger(level) || level < 0 || level > 10) throw new Error('Galaxy level must be between 0 and 10');
    if (level !== (page[NEON_LEVEL] & 15)) page[NEON_LEVEL] = level * 0x11;
  }
  if (changes.mission) neonMissionSet(page, changes.mission);
  if (changes.care) {
    if (!progress.canCare) throw new Error('the save has no active Tama to care for');
    careForPet(page, PET.neon);
  }
  if (page.every((byte, index) => byte === current.page[index])) return save;
  if (current.generation === 0xFFFFFFFF) throw new Error('the Neon settings generation cannot be advanced');
  w32(page, NEON_GENERATION, current.generation + 1);
  sealSettings(page);
  pages.set(NEON_SETTINGS[(current.index + 1) % NEON_SETTINGS.length], page);
  return { ...save, edition: 8, pages };
}

// ---------------------------------------------------------------- change a Paradise save (1.6.8)
// The pet in the settings block: +4/+6 character, +0x10 sickness, +0x18 bits 2..4 stage, +0x1C hunger 0..6,
// +0x1D happiness 0..20. Planet level: low nibble = level, high nibble = level already celebrated.
const PET = {
  gen1: { tama: 0x104, level: 0x7C, dirt: 0x142, illnessTimers: 0x17C },
  jade: { tama: 0x108, level: 0x7C, dirt: 0x146, illnessTimers: 0x180 },
  gen3: { tama: 0x114, level: 0x88, dirt: 0x152, illnessTimers: 0x194 },
  neon: { tama: 0x114, level: 0x88, dirt: 0x153, illnessTimers: 0x19C },
};
function careForPet(page, { tama, dirt, illnessTimers }) {
  page[tama + 0x1C] = 6;
  page[tama + 0x1D] = 20;
  page[tama + 0x10] = 0;
  page[tama + 0x14] &= ~0x10;
  page[dirt] = 0;
  page.fill(0, illnessTimers, illnessTimers + 8);
  page[tama - 9] &= ~0x0C;
  page[tama - 4] &= ~0x0C;
}
function paraSettings(save, edition) {
  if (family(edition) === 'neon') return neonSettings(save.pages)?.page || null;
  for (const a of [SET_A, SET_B]) {
    const p = save.pages.get(a);
    if (p && p.length === PAGE && settingsOk(p)) return p;
  }
  return null;
}
// Device clocks store local calendar time without a time zone. UTC arithmetic
// keeps an entered date and time independent of the browser's DST rules.
const CLOCK_EPOCH = Date.UTC(2025, 0, 1) / 1000;
const CLOCK_LIMIT = Date.UTC(2100, 0, 1) / 1000;
const DAY_SECONDS = 86400;

function calendarFields(date) {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
}

function savedCalendar(page) {
  const fields = Array.from({ length: 6 }, (_, i) => u16(page, 0x1C + i * 2));
  const [year, month, day, hour, minute, second] = fields;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return calendarFields(date).every((value, i) => value === fields[i]) ? date.getTime() / 1000 : NaN;
}

function gameClock(page, rtc, myLab = false) {
  if (!page || (rtc?.ctrl & 0x87) !== 0x80) return null;
  const offset = myLab ? 0x14 : 0x0C;
  const days = u32(page, offset), seconds = u32(page, offset + 4);
  const base = CLOCK_EPOCH + days * DAY_SECONDS + seconds;
  const now = base + rtc.counter;
  const calendar = savedCalendar(page);
  const savedCounter = myLab ? u32(page, 0x28) : 0;
  const saved = myLab ? base + savedCounter : calendar;
  if (!Number.isFinite(calendar) || seconds >= DAY_SECONDS || base >= CLOCK_LIMIT || now >= CLOCK_LIMIT ||
      saved < CLOCK_EPOCH || saved >= CLOCK_LIMIT ||
      (myLab && Math.floor(saved / DAY_SECONDS) !== Math.floor(calendar / DAY_SECONDS))) return null;
  // The save can outlive the RTC counter. The last save is the only known
  // time in that case, so show it until the user explicitly sets a new time.
  if (myLab && saved > now)
    return { now: saved, saved, offset, counter: rtc.counter, counterReset: true };
  if (saved > now + 5 || now - saved > 366 * DAY_SECONDS) return null;
  return { now, saved, offset, counter: rtc.counter };
}

function changeGameClock(page, clock, target) {
  const base = target - clock.counter - CLOCK_EPOCH;
  const saved = target - (clock.now - clock.saved);
  if (!Number.isInteger(target) || base < 0 || target >= CLOCK_LIMIT || saved < CLOCK_EPOCH || saved >= CLOCK_LIMIT)
    return null;
  const out = Uint8Array.from(page);
  w32(out, clock.offset, Math.floor(base / DAY_SECONDS));
  w32(out, clock.offset + 4, base % DAY_SECONDS);
  // After a reset, anchor My Lab's saved calendar to the live RTC counter.
  if (clock.counterReset) w32(out, 0x28, clock.counter);
  calendarFields(new Date(saved * 1000)).forEach((value, i) => {
    const offset = 0x1C + i * 2;
    out[offset] = value & 255;
    out[offset + 1] = value >>> 8;
  });
  return out;
}

function paradiseClockPage(pages, edition) {
  return paraSettings({ pages }, edition);
}

function planParadiseClock(pages, edition, page) {
  if (edition === 8) {
    const ring = neonSettings(pages);
    if (!ring || ring.generation === 0xFFFFFFFF) return null;
    w32(page, NEON_GENERATION, ring.generation + 1);
    sealSettings(page);
    return new Map([[NEON_SETTINGS[(ring.index + 1) % NEON_SETTINGS.length], page]]);
  }
  sealSettings(page);
  return new Map([[SET_A, page], [SET_B, page.slice()]]);
}
/** What the save says about the pet: { level, id, stage, hunger, happy, sick } or null. */
function paraPet(save, edition) {
  const p = paraSettings(save, edition), o = PET[family(edition)]; if (!p || !o) return null;
  const t = o.tama;
  return { level: p[o.level] & 15, id: u16(p, t + 4), stage: (p[t + 0x18] >> 2) & 7, hunger: p[t + 0x1C], happy: p[t + 0x1D], sick: p[t + 0x10] };
}
/**
 * Changed copy of the save. ch: { level, id, stage, care } (each optional). A new character goes
 * into the settings block and into the pet's own file (pages with the old character in the header).
 */
const TAMA_ANY = true;
// Update the settings and the active Tama's own file together.
function changePetIdentity(save, pages, p, t, sets, ch) {
  const old = u16(p, t + 4);
  p[t + 4] = ch.id & 255; p[t + 5] = ch.id >> 8; p[t + 6] = ch.id & 255; p[t + 7] = ch.id >> 8;
  if (ch.stage) p[t + 0x18] = (p[t + 0x18] & ~0x1C) | ((ch.stage & 7) << 2);
  let found = 0;
  if (old && old !== ch.id) for (const [a, d] of save.pages) {
    if (sets.includes(a) || d.length !== PAGE) continue;
    // 1.7.2 TAMA_ANY: a bred Tama's file was not found (GitHub): small number at +8, character at +0x0C or +0x0E
    if (TAMA_ANY ? (u32(d, 8) === 0 || u32(d, 8) > 255 || (u16(d, 14) !== old && u16(d, 12) !== old)) : (u32(d, 8) !== 1 || u16(d, 14) !== old)) continue;
    const n = d.slice(); found++;
    if (!TAMA_ANY || u16(n, 14) === old) { n[14] = ch.id & 255; n[15] = ch.id >> 8; }
    if (u16(n, 12) === old) { n[12] = ch.id & 255; n[13] = ch.id >> 8; }
    if (u16(n, 0x10A) === old) { n[0x10A] = ch.id & 255; n[0x10B] = ch.id >> 8; }
    pages.set(a, n);
  }
  if (TAMA_ANY && old && old !== ch.id && !found) throw new Error('the Tama\'s own file is not in the save, the Tama would not change');
}

function paraPetSet(save, edition, ch) {
  const neon = family(edition) === 'neon', ring = neon ? neonSettings(save.pages) : null;
  const p0 = neon ? ring?.page : paraSettings(save, edition), o = PET[family(edition)];
  const sets = neon ? NEON_SETTINGS : [SET_A, SET_B];
  if (!p0 || !o) throw new Error('the save has no settings block');
  const t = o.tama, p = new Uint8Array(p0), pages = new Map(save.pages);
  if (ch.level !== undefined) { const v = Math.max(0, Math.min(10, ch.level | 0)), now = p[o.level] & 15; p[o.level] = v > now ? (p[o.level] & 0xF0) | v : (v << 4) | v; }
  if (ch.id) changePetIdentity(save, pages, p, t, sets, ch);
  if (ch.care) careForPet(p, o);
  if (neon) {
    if (ring.generation === 0xFFFFFFFF) throw new Error('Neon settings generation exhausted');
    w32(p, NEON_GENERATION, ring.generation + 1);
    sealSettings(p);
    pages.set(NEON_SETTINGS[(ring.index + 1) % NEON_SETTINGS.length], p);
  } else {
    sealSettings(p);
    pages.set(SET_A, p); pages.set(SET_B, p.slice());
  }
  return Object.assign({}, save, { pages });
}

// Save editor offsets mirror the on-device Menu, including the CRC prefix.
const EDITOR_LAYOUTS = {
  gen1: { points: 0xB4, bag: 0x240, poop: 0x140, timers: 0x170, elapsed: 0x18A, stars: 0x1DC, active: 0xDEE000, table: 0x94214 },
  jade: { points: 0xB4, bag: 0x244, poop: 0x144, timers: 0x174, elapsed: 0x18E, stars: 0x1E0, active: 0xDEE000, table: 0x9954C },
  gen3: { points: 0xC0, bag: 0x270, poop: 0x150, timers: 0x188, elapsed: 0x1A2, stars: 0x20C, active: 0xDCE000, table: 0xACBB8 },
  neon: { points: 0xC0, bag: 0x284, poop: 0x151, timers: 0x190, elapsed: 0x1AA, stars: 0x220, active: 0xE4E000, table: 0xAE954 },
};
const CARE_SAVE = 0xFC8, CARE_LEGACY_SAVE = 0xF80, CARE_MARK = 0xC7;
const MISSION_NAMES = [
  'Feed Meals', 'Feed Snacks', 'Clean Tamas', 'Play Wins', 'Clean Poop', 'Collect Poop',
  'Fast Collections', 'Visit Planets', 'Put to Sleep', 'Wake Tamas', 'Connections', 'Send Gifts',
  'Minigame Wins', 'Earn Points', 'Breeding', 'Egg Hunt Wins', 'Egg Food Types', 'Chef Meals',
  'Land Adults', 'Water Adults', 'Sky Adults', 'Tama Colors',
];
const MISSION_TARGETS = [500, 500, 100, 100, 100, 1000, 10, 7, 50, 50, 100, 50, 100, 99999, 50, 50, 18, 12, 16, 16, 16, 16];
const MISSION_OFFSETS = [0xB8, 0xBA, 0xBC, 0xBE, 0xC0, 0xC2, 0xC4, 0xC6, 0xC8, 0xCA, 0xCC, 0xCE, 0xD0, 0xD4, 0xD8, 0xDA, 0xDC, 0xDF, 0xE1, 0xE3, 0xE5, 0xE7];
function saveEditorBit(page, bit, value) {
  const at = bit >> 3, mask = 1 << (bit & 7);
  if (value === undefined) return !!(page[at] & mask);
  page[at] = value ? page[at] | mask : page[at] & ~mask;
}
function editorNumber(value, max, min = 0) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Save value out of range');
  return value;
}
function editorCellFields(page, at, config) {
  if (page[at] > 11) return null;
  const ids = [...page.subarray(at + 1, at + 1 + page[at])];
  const split = config?.split;
  const legacy = split && page[0xF0F] !== 0x5A && page[0xF04] === 1;
  return ids.map(id => legacy && id < 3 && (config.ids.length === 6 || id === 1) ? id + 3 : id);
}
function editorLayoutConfig(save, config) {
  if (config) return config;
  const page = paraSettings(save, save.edition);
  if (page?.[0xF0F] !== 0x5A) return null;
  const kind = family(save.edition);
  if (kind === 'gen3') return { ids: [0, 1, 2, 3, 4, 5], split: true };
  if (kind === 'jade') return { ids: [0, 1, 2, 4], split: true };
  return null;
}
function paradiseEditorAppearance(edition, rom) {
  const layout = EDITOR_LAYOUTS[family(edition)];
  return !!rom && u32(rom, layout.table) === 0x60000000 + layout.active;
}
function paradiseEditorInfo(save, config) {
  config = editorLayoutConfig(save, config);
  const kind = family(save.edition), layout = EDITOR_LAYOUTS[kind], pet = PET[kind];
  const neon = kind === 'neon', progress = neon && neonProgress(save), page = paraSettings(save, save.edition);
  if (!page || (neon && !progress)) return null;
  const tama = paraPet(save, save.edition), at = pet.tama, delta = neon ? 1 : 0;
  const legacyCare = !config?.careBookOverlap && !config?.split;
  const care = legacyCare && (config?.legacyCare || page[CARE_SAVE] !== CARE_MARK) ? CARE_LEGACY_SAVE : CARE_SAVE;
  const careFlags = page[care] === CARE_MARK ? page[care + 1] : null;
  const shift = kind === 'gen3' ? 12 : 0, starShift = neon ? 13 : 4, starMax = neon ? 1023 : 255;
  const items = [];
  for (let i = 0; i < 640; i++) {
    const id = u16(page, layout.bag + i * 2);
    if (!neon && !id) break;
    const count = (page[layout.bag + 0x500 + (i >> 1)] >> ((i & 1) * 4)) & 15;
    const reserved = neon ? (page[layout.bag + 0x500 + 320 + (i >> 1)] >> ((i & 1) * 4)) & 15 : 0;
    if (id && id !== 65535 && count) items.push({ id, count, reserved, slot: i });
  }
  const cells = editorCellFields(page, at + 0x21, config);
  return {
    ...tama, alive: tama.id > 0 && tama.id < 65535 && tama.stage >= 2 && tama.stage <= 5 && (!neon || progress.canCare),
    eyeId: u16(page, at + 6), color: (page[at + 0x19] & 31), age: u16(page, at + 0xC), points: u32(page, layout.points),
    cleanliness: page[at + 0x14] & 16 ? 0 : Math.max(0, 3 - page[pet.dirt]),
    fuel: page[at + 0x1B], poop: page[layout.poop], meals: page[at + 0x3A + delta],
    happinessCount: page[at + 0x3B + delta], mistakes: page[at + 0x1E], vitamin: !!(page[at + 0x14] & 2),
    autopilot: careFlags === 15 ? 47 : careFlags & 63,
    autopilotStored: careFlags !== null && (careFlags & 0xC0) === 0x80,
    awake: page[0xFC0] === 0xA7, planetTravel: neon && page[0xFC4] === 0xB6,
    planet: neon ? page[0x207] : null, planets: neon ? page[0x89] & 7 : null,
    cells: cells && (config?.ids || [0, 1, 2]).map(id => ({ id, count: cells.filter(value => value === id).length })),
    items,
    book: (config?.roster || []).map(entry => ({ ...entry, unlocked: saveEditorBit(page, entry.bit) })),
    missions: MISSION_NAMES.map((name, i) => ({ name: neon && i >= 18 && i <= 20 ?
      ['Cosmic Tamas', 'New Tama Kinds', 'Tama Planet Kinds'][i - 18] : name,
      ...(neon ? progress.missions[i] : { complete: saveEditorBit(page, (0xF4 + shift) * 8 + i) }) })),
    stars: Array.from({ length: 5 }, (_, slot) => {
      const word = u32(page, layout.stars + slot * 4);
      return { slot, used: !!(word & 1), age: (word >> starShift) & starMax, cause: (word >> 1) & 7 };
    }),
  };
}
function editParadiseMission(page, kind, index, complete) {
  editorNumber(index, MISSION_NAMES.length - 1);
  if (kind === 'neon') { neonMissionSet(page, { index, complete }); return; }
  const shift = kind === 'gen3' ? 12 : 0, flag = (0xF4 + shift) * 8 + index;
  if (saveEditorBit(page, flag) === complete) return;
  const offset = MISSION_OFFSETS[index] + shift, target = MISSION_TARGETS[index];
  if (index >= 16) {
    for (let i = 0; i < target; i++) saveEditorBit(page, offset * 8 + i, complete);
  } else if (index === 13) {
    const count = u32(page, offset);
    w32(page, offset, complete ? Math.max(count, target) : Math.min(count, target - 1));
  } else {
    const count = u16(page, offset), value = complete ? Math.max(count, target) : Math.min(count, target - 1);
    page[offset] = value & 255;
    page[offset + 1] = value >> 8;
  }
  for (let i = 0; i < 3; i++) saveEditorBit(page, flag - i * 32, complete);
}
function editorClearEvent(page, at, event) {
  const byte = event >> 3, mask = ~(1 << (event & 7));
  page[at - 10 + byte] &= mask;
  page[at - 5 + byte] &= mask;
}
function paradiseEditorSet(save, changes, config) {
  config = editorLayoutConfig(save, config);
  const e = save.edition, kind = family(e), pet = PET[kind], layout = EDITOR_LAYOUTS[kind], neon = kind === 'neon';
  const base = paraSettings(save, e), info = paradiseEditorInfo(save, config);
  if (!base || !info) throw new Error('the save has no settings block');
  for (const key of ['care', 'sick', 'clearPoop', 'vitamin', 'awake', 'planetTravel'])
    if (changes[key] !== undefined && typeof changes[key] !== 'boolean') throw new Error('Choose a valid option.');
  for (const group of ['missions', 'book'])
    if (changes[group]?.some(([, value]) => typeof value !== 'boolean')) throw new Error('Choose a valid option.');
  const page = Uint8Array.from(base), pages = new Map(save.pages), at = pet.tama, delta = neon ? 1 : 0;
  if (changes.appearance) {
    const { body, eyes, color, stage } = changes.appearance;
    if (!info.alive || !config?.appearance) throw new Error('Invalid Appearance');
    editorNumber(body, 4999, 1001); editorNumber(eyes, 4999, 1001); editorNumber(stage, 5, 2);
    const knownCharacter = id => config.characters?.some(character => character.id === id && character.stage === stage);
    if ((body !== info.id || stage !== info.stage) && !knownCharacter(body) ||
        (eyes !== info.eyeId || stage !== info.stage) && !knownCharacter(eyes))
      throw new Error('Choose a valid option.');
    if (color !== 31) editorNumber(color, 15);
    const source = pages.get(layout.active);
    if (source?.length !== PAGE || (neon && u32(source, 0x10C) !== 0xFF000000 &&
        (u16(source, 0x10A) !== info.id || (u32(source, 0) + u32(source, 4)) >>> 0)))
      throw new Error('Invalid Appearance');
    const record = Uint8Array.from(source);
    w32(record, 0x10C, 0xFF000000);
    pages.set(layout.active, record);
    page[at + 4] = body & 255; page[at + 5] = body >> 8;
    page[at + 6] = eyes & 255; page[at + 7] = eyes >> 8;
    page[at + 0x19] = (page[at + 0x19] & ~31) | color;
    if (stage !== info.stage) {
      page[at + 0x18] = (page[at + 0x18] & ~0x1C) | (stage << 2);
      if (!neon) {
        page.fill(0, at + 0x48, at + 0x4C);
        page[at + 0x14] &= 16;
        page.fill(0, at + 0x15, at + 0x18);
        page.fill(0, at - 12, at - 10);
        page.fill(0, at + 0x20, at + 0x2E);
        for (const event of [1, 19, 20, 28]) editorClearEvent(page, at, event);
      }
    }
  }
  if (changes.level !== undefined) {
    const level = editorNumber(changes.level, 10);
    page[pet.level] = !neon && level > info.level ? (base[pet.level] & 0xF0) | level : level * 17;
  }
  if (changes.points !== undefined) w32(page, layout.points, editorNumber(changes.points, 99999));
  if (changes.care) careForPet(page, pet);
  if (changes.age !== undefined) {
    const age = editorNumber(changes.age, 999);
    page[at + 0xC] = age & 255;
    page[at + 0xD] = age >> 8;
  }
  if (!neon && changes.hunger === 6) {
    editorClearEvent(page, at, 0x11);
    page.fill(0, at + 0x40, at + 0x42);
    const timer = pet.illnessTimers + 8;
    page.fill(0, timer, timer + 4);
  }
  if (!neon && changes.happy === 20) editorClearEvent(page, at, 0x12);
  for (const [key, offset, max] of [['hunger', 0x1C, 6], ['happy', 0x1D, 20], ['fuel', 0x1B, 60],
    ['meals', 0x3A + delta, 99], ['happinessCount', 0x3B + delta, 99]]) {
    if (changes[key] !== undefined) page[at + offset] = editorNumber(changes[key], max);
  }
  if (changes.cleanliness !== undefined) {
    const dirt = 3 - editorNumber(changes.cleanliness, 3);
    page[pet.dirt] = dirt;
    page[at + 0x14] = (page[at + 0x14] & ~16) | (dirt === 3 ? 16 : 0);
  }
  if (changes.sick !== undefined) {
    page[at + 0x10] = changes.sick ? 2 : 0;
    page.fill(0, pet.illnessTimers, pet.illnessTimers + 8);
    page[at - 9] &= ~12;
    page[at - 4] &= ~12;
  }
  if (changes.clearPoop) {
    page.fill(0, layout.timers, layout.timers + 12);
    page.fill(0, layout.poop, layout.poop + 2);
    page.fill(0, layout.elapsed, layout.elapsed + 2);
    for (const origin of [at - 10, at - 5]) { page[origin + 1] &= ~64; page[origin + 2] &= ~1; }
  }
  if (changes.vitamin !== undefined)
    page[at + 0x14] = changes.vitamin ? (page[at + 0x14] & 16) | 2 : page[at + 0x14] & ~2;
  if (changes.mistakes !== undefined) {
    const count = editorNumber(changes.mistakes, 255), visible = Math.min(count, 6);
    for (let i = 0; i < 6; i++) {
      if (i >= visible) page[at + 0x34 + i] = 0;
      else if (i >= page[at + 0x33] || !page[at + 0x34 + i]) page[at + 0x34 + i] = 0x11;
    }
    page[at + 0x33] = visible;
    page[at + 0x1E] = count;
  }
  if (changes.autopilot !== undefined && config?.autopilot) {
    const care = config.legacyCare ? CARE_LEGACY_SAVE : CARE_SAVE;
    if (config.legacyCare && (config.careBookOverlap || config.split)) throw new Error('ParaLab Menu Update Available');
    page[care] = CARE_MARK;
    page[care + 1] = 128 | editorNumber(changes.autopilot, 63);
  }
  if (changes.awake !== undefined && config?.awake) {
    page[0xFC0] = changes.awake ? 0xA7 : 0;
    page[at - 2] &= ~4;
  }
  if (changes.planetTravel !== undefined && neon && config?.planetTravel)
    page[0xFC4] = changes.planetTravel ? 0xB6 : 0;
  if (changes.cells) {
    const start = at + 0x21, known = config?.ids || [0, 1, 2], before = editorCellFields(page, start, config);
    if (!before) throw new Error('Invalid field Cells');
    const counts = new Map(changes.cells);
    const rest = before.filter(id => !counts.has(id));
    for (const [id, count] of counts) {
      if (!known.includes(id)) throw new Error('Invalid Cell field');
      rest.push(...Array(editorNumber(count, 11)).fill(id));
    }
    editorNumber(rest.length, 11);
    if (config?.split && page[0xF0F] !== 0x5A) {
      page.fill(0, 0xF10, known.length === 6 ? 0xF71 : 0xF11);
      page[0xF0F] = 0x5A;
    }
    page[start] = rest.length;
    page.set(rest, start + 1);
  }
  for (const [index, complete] of changes.missions || []) editParadiseMission(page, kind, index, complete);
  if (neon && (changes.planet !== undefined || changes.planets !== undefined)) {
    const planet = editorNumber(changes.planet ?? info.planet, 2);
    const access = editorNumber(changes.planets ?? info.planets, 7);
    if (!(access & (1 << planet))) throw new Error('Unlock the current planet before selecting it');
    page[0x89] = (page[0x89] & ~7) | access;
    if (planet !== info.planet) {
      page[0x207] = planet;
      page.fill(0, 0x162, 0x168);
      if ((page[pet.level] & 15) === 4) page[pet.level] = 0x45;
    }
  }
  for (const [bit, unlocked] of changes.book || []) {
    const entry = config?.roster?.find(entry => entry.bit === bit);
    if (!entry) throw new Error('Unknown Tama File entry');
    saveEditorBit(page, bit, unlocked);
    if (!unlocked) saveEditorBit(page, entry.viewed, false);
  }
  for (const [slot, edit] of changes.stars || []) {
    const old = info.stars[editorNumber(slot, 4)], offset = layout.stars + slot * 4;
    const index = layout.stars - 4, latest = (page[index] >> 3) & 7;
    if ((edit.create !== undefined && typeof edit.create !== 'boolean') ||
        (edit.remove !== undefined && typeof edit.remove !== 'boolean') || (edit.create && (old.used || edit.remove)))
      throw new Error('Choose a valid option.');
    if (edit.remove) {
      if (!info.alive && latest === slot) throw new Error('Cannot remove the current memorial');
      w32(page, offset, u32(page, offset) & ~1);
      if (latest === slot) for (let n = 1; n < 5; n++) {
        const other = (slot + 5 - n) % 5;
        if (!(u32(page, layout.stars + other * 4) & 1)) continue;
        page[index] = (page[index] & ~0x38) | (other << 3);
        break;
      }
      continue;
    }
    if (!old.used && !edit.create) throw new Error('The past Tama slot is empty');
    if (edit.create) page[index] = (page[index] & ~7) | ((slot + 1) % 5);
    const shift = neon ? 13 : 4, max = neon ? 1023 : 255;
    const age = editorNumber(edit.age ?? old.age, max);
    const cause = edit.cause === undefined ? old.cause : editorNumber(edit.cause, 4, 1);
    const mask = (max << shift) | 0x100E, current = edit.create ? 1 : u32(page, offset);
    w32(page, offset, (current & ~mask) | (age << shift) | (age > 29 ? 0x1000 : 0) | (cause << 1));
  }
  for (const [slot, count] of changes.items || []) {
    if (!info.items.some(item => item.slot === slot)) throw new Error('The item slot is empty');
    const offset = layout.bag + 0x500 + (slot >> 1), shift = (slot & 1) * 4;
    const old = (page[offset] >> shift) & 15;
    const max = neon ? (config?.itemLimits?.get(u16(page, layout.bag + slot * 2)) ?? (old + ((page[offset + 320] >> shift) & 15))) -
      ((page[offset + 320] >> shift) & 15) : 15;
    page[offset] = (page[offset] & ~(15 << shift)) | (editorNumber(count, Math.max(0, max)) << shift);
  }
  for (const [id, count] of changes.addItems || []) {
    const item = config?.catalog?.find(entry => entry.id === id && !entry.fixed);
    const max = item && (neon ? item.max : 15);
    if (!max || !Number.isInteger(id) || id < 5000 || id > 8999) throw new Error('Unknown item');
    editorNumber(count, max, 1);
    const counts = layout.bag + 0x500;
    let target = -1;
    for (let slot = 0; slot < 640; slot++) {
      const item = u16(page, layout.bag + slot * 2), shift = (slot & 1) * 4;
      const held = (page[counts + (slot >> 1)] >> shift) & 15;
      const reserved = neon && ((page[counts + 320 + (slot >> 1)] >> shift) & 15);
      if (id === item && (held || reserved || !neon)) { target = slot; break; }
      if (target === -1 && (neon ? !held && !reserved : !item)) target = slot;
      if (!neon && !item) break;
    }
    if (target < 0) throw new Error('Bag is full');
    const entry = layout.bag + target * 2, offset = counts + (target >> 1), shift = (target & 1) * 4;
    if (u16(page, entry) === id && ((page[offset] >> shift) & 15)) continue;
    const reserved = neon ? (page[offset + 320] >> shift) & 15 : 0;
    if (reserved && u16(page, entry) === id) continue;
    page[entry] = id & 255;
    page[entry + 1] = id >> 8;
    page[offset] = (page[offset] & ~(15 << shift)) | (count << shift);
  }
  if (pages.size === save.pages.size && [...pages].every(([address, data]) => data === save.pages.get(address)) &&
      page.every((byte, i) => byte === base[i])) return save;
  const settings = planParadiseClock(save.pages, e, page);
  if (!settings) throw new Error('the Neon settings generation cannot be advanced');
  for (const [address, data] of settings) pages.set(address, data);
  return { ...save, pages };
}

// ---------------------------------------------------------------- TamaEmu
const APP_CFG = 0xA0140, PMXC = 0x43584D50, PG_MAGIC = 0x50584D50, PG_MAX = 64;
const KINDS = { 0: { dev: 'pc', size: 0x400000, app: 'plus-color' }, 1: { dev: 'idl', size: 0x800000, app: 'idl' },
  2: { dev: 'ps', size: 0x800000, app: 'ps' }, 3: { dev: '4u', size: 0x800000, app: '4u' }, 4: { dev: '4u-plain', size: 0x800000, app: '4u-plain' } };
/** Settings block of the emulator in an image (or the 4 KB sector at 0xA0000). */
function emuCfg(sec, base = 0xA0000) {
  const c = APP_CFG - base;
  if (u32(sec, c) !== PMXC) return null;
  const v = u32(sec, c + 4), kind = u32(sec, c + 20);
  if (!KINDS[kind]) return null;
  return { version: v, guestOff: u32(sec, c + 8), guestSize: u32(sec, c + 12), saveOff: u32(sec, c + 16), kind, map: sec.slice(c + 24, c + 152), spareEnd: v >= 3 ? u32(sec, c + 152) : 0, lzOff: v >= 5 ? u32(sec, c + 160) : 0, ...KINDS[kind] };
}
/**
 * Guest flash (the .sav of the TamaEmu app) from the packed firmware and the spare pages.
 * read(addr, len) gives bytes of the Paradise flash (sync or async).
 */
function lzDec(s, n) {   // LZ4 block (as emu.js)
  const d = new Uint8Array(n).fill(0xFF); let ip = 0, op = 0;
  for (;;) {
    const t = s[ip++]; let l = t >> 4;
    if (l === 15) { let x; do { x = s[ip++]; l += x; } while (x === 255); }
    while (l-- > 0 && op < n) d[op++] = s[ip++];
    if (op >= n || ip >= s.length) return d;
    const o = s[ip] | (s[ip + 1] << 8); ip += 2; let m = (t & 15) + 4;
    if ((t & 15) === 15) { let x; do { x = s[ip++]; m += x; } while (x === 255); }
    while (m-- > 0 && op < n) { d[op] = d[op - o]; op++; }
  }
}
/* 1.7.3 test21 LZ_GONE: TamaEmu notes behind its page table which packed blocks the pet erased (four words, then
 * their xor with 0x454E4F47). Those blocks read empty, apart from the parts in spare pages (written after this). */
function lzGoneApply(t, o, g, size) {
  if (t.length < o + 20) return;
  let x = 0x454E4F47; for (let i = 0; i < 4; i++) x = (x ^ u32(t, o + 4 * i)) >>> 0;
  if (x !== u32(t, o + 16)) return;
  for (let b = 0; b < 128 && (b << 16) < size; b++) if ((u32(t, o + 4 * (b >> 5)) >>> (b & 31)) & 1) g.fill(0xFF, b << 16, (b + 1) << 16);
}
async function emuGuestAsync(read, cfg, progress) {
  const out = new Uint8Array(cfg.size).fill(0xFF), nb = cfg.size >> 16;
  let done = 0; const todo = [...cfg.map.subarray(0, nb)].filter((k) => k !== 0xFF).length;
  for (let b = 0; b < nb; b++) {
    let k = cfg.map[b];
    if (k === 0xFF) continue;
    if (k === 0xFE) k = b;
    out.set(new Uint8Array(await read(cfg.guestOff + (k << 16), 0x10000)), b << 16);
    if (progress) await progress('read', ++done, todo);
  }
  // 1.7.3 GUEST_LZ: the packed cold blocks (LZ4 parts of 1 KB, see emu.js lzPack)
  if (cfg.lzOff) {
    const t = new Uint8Array(await read(cfg.lzOff, 512));
    for (let b = 0; b < nb; b++) {
      const lp = u32(t, 4 * b); if (!lp || cfg.map[b] !== 0xFF) continue;
      const l = new Uint8Array(await read(cfg.lzOff + lp, 65 * 4)), a0 = u32(l, 0), z0 = u32(l, 256);
      const raw = z0 > a0 ? new Uint8Array(await read(cfg.lzOff + a0, z0 - a0)) : new Uint8Array(0);
      for (let k = 0; k < 64; k++) {
        const a = u32(l, 4 * k) - a0, z = u32(l, 4 * k + 4) - a0, at = (b << 16) + k * 0x400;
        if (z === a) continue;
        out.set(z - a >= 0x400 ? raw.subarray(a, a + 0x400) : lzDec(raw.subarray(a, z), 0x400), at);
      }
    }
  }
  // spare pages (8 KB parts the guest wrote into blocks that are empty in the firmware)
  if (cfg.spareEnd) {
    const lo = (cfg.guestOff + cfg.guestSize + 0x1FFF) & ~0x1FFF, hi = cfg.spareEnd & ~0x1FFF;
    if (hi >= lo + 0x4000) {
      const data = lo + 0x2000; let n = (hi - data) >> 13; if (n > PG_MAX) n = PG_MAX;
      const t = new Uint8Array(await read(lo, 16 + 2 * PG_MAX + 20));
      let x = (PG_MAGIC ^ Math.imul(n, 0x9E3779B1)) >>> 0;
      for (let i = 0; i < PG_MAX; i++) x = (((x << 5) | (x >>> 27)) ^ u16(t, 16 + 2 * i)) >>> 0;
      if (u32(t, 0) === PG_MAGIC && u32(t, 4) === n && u32(t, 8) === x) {
        lzGoneApply(t, 16 + 2 * PG_MAX, out, cfg.size);   // 1.7.3 test21 LZ_GONE: packed blocks the pet erased
        for (let i = 0; i < n; i++) {
          const v = u16(t, 16 + 2 * i);
          if (v === 0xFFFF || (v << 13) >= cfg.size) continue;
          if (cfg.map[(v << 13) >> 16] !== 0xFF) continue;          // only blocks that are empty in the firmware
          out.set(new Uint8Array(await read(data + (i << 13), 0x2000)), v << 13);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- T7Emu
/*
 * The pet's EEPROM (4 KB) in the ROM: two slots of 8 KB from 0x0C1000 (header sector:
 * "T7EE", sequence, page mask, checksum; then the pages). The T7Emu app keeps it as
 * save.bin: page mask (2 bytes) and the 16 pages, 4098 bytes. Same content, so it can go back and forth.
 */
const T7_EE = 0xC1000, T7_EE_MAGIC = 0x45453754, T7_SAVE_LEN = 4098;
function t7Sum(b, o) { let s = 0x7E7E; for (let i = 0; i < 4096; i++) s = (Math.imul(s, 31) + b[o + i]) >>> 0; return s; }
// test27: up to test26 the T7Emu could write its pages 2 bytes off (the flash DMA takes words, its buffer lay at ...2):
// 2 other bytes first, the pages without their last 2. The header sum is over the right pages, so such a slot is found.
function t7Sum2(b, o) { let s = 0x7E7E; for (let i = 2; i < 4096; i++) s = (Math.imul(s, 31) + b[o + i]) >>> 0; return Math.imul(Math.imul(s, 31) >>> 0, 31) >>> 0; }
function t7Slot(img, at) {
  if (u32(img, at) !== T7_EE_MAGIC) return null;
  const sum = u32(img, at + 12), sh = sum === t7Sum(img, at + 0x1000) ? 0 : sum === t7Sum2(img, at + 0x1000) ? 2 : -1;
  if (sh < 0) return null;
  return { seq: u32(img, at + 4), have: u32(img, at + 8) & 0xFFFF, at, sh };
}
function t7Newest(img, ee = T7_EE) { const a = t7Slot(img, ee), b = t7Slot(img, ee + 0x2000); if (a && b) return ((a.seq - b.seq) | 0) > 0 ? a : b; return a || b; }
/** save.bin of the T7Emu app from a 16 MB image (null: the pet has no save yet). base: save area of
 * the T7Emu (0x0C0000, a further one from 1.6.0 its own). */
function t7SaveOut(img, base = 0xC0000) {
  const s = t7Newest(img, base + 0x1000); if (!s) return null;
  const out = new Uint8Array(T7_SAVE_LEN); out[0] = s.have & 255; out[1] = s.have >> 8;
  out.set(img.subarray(s.at + 0x1000 + s.sh, s.at + 0x2000), 2);   // shifted slot: the last 2 bytes stay 0
  return out;
}
function t7SaveCheck(b) { return b && b.length === T7_SAVE_LEN; }
/** save.bin into the image: into the older slot, as the device does. Returns a new image. */
function t7SaveIn(img, save, base = 0xC0000) {
  if (!t7SaveCheck(save)) throw new Error('not a T7Emu save (save.bin, 4098 bytes)');
  const ee = base + 0x1000, out = new Uint8Array(img), cur = t7Newest(img, ee);
  const at = cur && cur.at === ee ? ee + 0x2000 : ee;
  out.fill(0xFF, at, at + 0x2000);
  out.set(save.subarray(2), at + 0x1000);
  w32(out, at, T7_EE_MAGIC); w32(out, at + 4, cur ? (cur.seq + 1) >>> 0 : 1); w32(out, at + 8, save[0] | (save[1] << 8)); w32(out, at + 12, t7Sum(out, at + 0x1000));
  out.fill(0xFF, base, base + 0x1000);          // the running session belongs to the old pet
  return out;
}

root.ParamixSaves = { paraPet, paraPetSet, neonSaveLayout, neonSettings, neonProgress, neonProgressSet, paraClear, paraWrite, t7SaveOut, t7SaveIn, t7SaveCheck, T7_EE, idPage, region, residentRanges, paraRanges, family, settingsOk, sealSettings, crc16arc, paraFromImage, paraEncode, paraDecode, paraCheck, paraClock, emuCfg, emuGuestAsync, lzGoneApply, KINDS, NEON_SETTINGS, NEON_GENERATION, SET_A, SET_B,
  gameClock, changeGameClock, paradiseClockPage, planParadiseClock, paradiseEditorInfo, paradiseEditorSet, paradiseEditorAppearance, paradiseEditorDefaultConfig: editorLayoutConfig };
if (typeof module !== 'undefined') module.exports = root.ParamixSaves;
})(typeof window !== 'undefined' ? window : globalThis);
