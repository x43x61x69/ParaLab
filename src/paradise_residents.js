/* Paradise field residents use a settings-page roster and a native ghost record
 * for each physical slot. The six-field helper can swap rosters, while older
 * ROMs still address the same ghost records from either bank. */
(function (root) {
'use strict';

const F = root.ParamixFeld || (typeof require !== 'undefined' ? require('./feld.js') : null);
const S = root.ParamixSaves || (typeof require !== 'undefined' ? require('./saves.js') : null);
const SIX = root.ParamixSix || (typeof require !== 'undefined' ? require('./six.js') : null);
const V = root.ParamixVisit || (typeof require !== 'undefined' ? require('./visit.js') : null);
const PAGE = 0x1000, RECORD = 0x4000;
const COMPOSITES = 0x600, SPRITES = 0x1D34;
const SIX_SET = 0xF04, SIX_DNA_MARK = 0xF0F, SIX_ROSTER = 0xF64, SIX_EXPANSION = 0xF70;
const layouts = {
  gen1: { table: 0x94214, count: 24, zero: 0xDEE000, first: 0xDF2000, index: 1, roster: 0x1BC, stride: 8, packed: true },
  jade: { table: 0x9954C, count: 24, zero: 0xDEE000, first: 0xDF2000, index: 1, roster: 0x1C0, stride: 8, packed: true },
  gen3: { table: 0xACBB8, count: 32, zero: 0xDCE000, first: 0xDD2000, index: 1, roster: 0x1F8, stride: 4 },
  neon: { table: 0xAE954, count: 33, zero: 0xE4E000, first: 0xE52000, index: 2, roster: 0x20C, stride: 4, cursorSlots: 8 },
};
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
function w16(b, o, v) { b[o] = v & 255; b[o + 1] = v >>> 8; }
function w32(b, o, v) { w16(b, o, v & 0xFFFF); w16(b, o + 2, v >>> 16); }
function sumWords(b, from, to) {
  let sum = 0;
  for (let o = from; o < to; o += 4) sum = (sum + u32(b, o)) >>> 0;
  return sum;
}

function nativeGhost(record) {
  if (!(record instanceof Uint8Array) || record.length < SPRITES) return null;
  const length = u32(record, 0x10C);
  const id = u16(record, 0x10A) || u16(record, 0x0E);
  if (!id || id === 0xFFFF || u16(record, 0xFC) !== 5 ||
      length < SPRITES || length > RECORD || length > record.length || length % 4 ||
      ((u32(record, 0) + u32(record, 4)) >>> 0) !== 0 ||
      sumWords(record, 8, length) !== u32(record, 0)) return null;
  const parts = [];
  let end = SPRITES;
  for (let p = 0; p < 6; p++) {
    const start = u32(record, 0x110 + 8 * p), size = u32(record, 0x114 + 8 * p);
    if (!start && !size) { parts.push(null); continue; }
    if (start < end || size < 24 || start + size > length || (start | size) % 4) return null;
    parts.push(record.subarray(start, start + size));
    end = start + size;
  }
  const bytes = new Uint8Array(V.GHOST_SIZE);
  bytes.set(record.subarray(0, length));
  return { id, bytes, length, parts };
}

function fillParts(out, parts, limit, native) {
  out.fill(0, 0x110, 0x140);
  let end = SPRITES;
  for (const [i, bytes] of parts.entries()) {
    if (!bytes) continue;
    if (end + bytes.length > limit) throw new Error('The selected resident appearance is too large for this slot.');
    w32(out, 0x110 + 8 * i, end);
    w32(out, 0x114 + 8 * i, bytes.length);
    out.set(bytes, end);
    end += bytes.length;
  }
  w32(out, 0x10C, end);
  const sum = native ? sumWords(out, 8, end) :
    (sumWords(out, 8, 0x180) + sumWords(out, COMPOSITES, end)) >>> 0;
  w32(out, 0, sum);
  w32(out, 4, -sum);
  return out;
}
function ghostParts(full) {
  return Array.from({ length: 6 }, (_, i) => {
    const start = u32(full, 0x110 + 8 * i), size = u32(full, 0x114 + 8 * i);
    return size ? full.subarray(start, start + size) : null;
  });
}

/** Build a native resident using the species' ROM assets and bundled eyes. */
function build(visitor, core, appearance) {
  if (visitor?.character?.stage !== 5) throw new Error('Choose an adult Tama.');
  let full = V.buildRomGhost(visitor, core);
  if (appearance) full = V.editGhostAppearance(full, appearance);
  const parts = ghostParts(full).map((part, i) => i === 1 || i === 4 ? part : null);
  const out = new Uint8Array(V.GHOST_SIZE);
  out.set(full.subarray(0, SPRITES));
  w32(out, 8, 1);
  const native = fillParts(out, parts, RECORD, true);
  if (!nativeGhost(native)) throw new Error('Could not verify the resident appearance.');
  return native;
}
/** Rebuild preview-only body layers from the same ROM. */
function preview(record, visitor, core) {
  const ghost = nativeGhost(record);
  if (!ghost) return null;
  if (V.verifyGhost(ghost.bytes)) return ghost.bytes;
  if (!visitor || visitor.character.id !== ghost.id) return null;
  const fallback = V.buildRomGhost(visitor, core);
  const out = new Uint8Array(V.GHOST_SIZE);
  out.set(ghost.bytes.subarray(0, SPRITES));
  w32(out, 8, 0);
  const missing = ghostParts(fallback);
  fillParts(out, ghost.parts.map((part, i) => part || missing[i]), 0x1B000, false);
  return V.verifyGhost(out) ? out : null;
}

/** On-device resident editor metadata. Sprite and layer data stay in ARC2. */
function catalog(rom, core) {
  const ctx = core.openRom(rom);
  const visitors = V.collectRomVisitors(ctx, core).filter(visitor => visitor.character.stage === 5);
  const byId = new Map(visitors.map(visitor => [visitor.character.id, visitor]));
  const adults = [...byId.values()].sort((a, b) => a.character.id - b.character.id);
  const rowSize = 0x104;
  const base = core.ASSET_BASE;
  const archive = core.arc2Parse(rom, base);
  const [data, sprites, text] = archive.ents.map(entry => base + entry.offset);
  const tables = core.arc2Parse(rom, text).ents;
  const out = new Uint8Array(16 + adults.length * rowSize);
  w32(out, 0, 0x31435352); // RSC1
  w32(out, 4, adults.length);
  w32(out, 8, rowSize);
  w32(out, 12, archive.chk);
  const spriteAt = id => sprites + u32(rom, sprites + 4 * id);
  for (const [i, visitor] of adults.entries()) {
    const row = 16 + i * rowSize;
    const { id, rank, field, flags, name } = visitor.character;
    [id, rank, field, flags].forEach((word, index) => w16(out, row + 2 * index, word));
    for (const [eye, part] of [1, 4].entries()) {
      const sprite = visitor.sprites[part];
      w32(out, row + 8 + 8 * eye, spriteAt(sprite));
      w32(out, row + 12 + 8 * eye, (visitor.entries[sprite].length + 3) & ~3);
    }
    for (const [palette, part] of [0, 2].entries()) {
      const sprite = visitor.sprites[part];
      w32(out, row + 0x18 + 4 * palette, spriteAt(sprite) + core.spriteHeader(visitor.entries[sprite]).palOffset);
    }
    visitor.sprites.forEach((sprite, part) => w16(out, row + 0x20 + 2 * part, sprite));
    w16(out, row + 0x2C, name);
    visitor.frames.flat().forEach((frame, pose) => {
      if (!frame.length) return;
      w32(out, row + 0x30 + 4 * pose, (frame.length << 24) | (data + frame[0].offset));
    });
    tables.slice(0, 9).forEach((entry, language) => {
      if (name * 2 + 2 > entry.ulen) return;
      const table = text + entry.offset, offset = 2 * u16(rom, table + 2 * name);
      if (offset + 2 <= entry.ulen) w32(out, row + 0xE0 + 4 * language, table + offset);
    });
  }
  return out;
}

function flashAddress(rom, d, i) {
  const native = u32(rom, d.table + i * 4);
  const off = i === 0 ? d.zero : d.first + (i - d.index) * RECORD;
  return native === 0x60000000 + off && u32(rom, d.table + (d.count + i) * 4) === RECORD ? off : 0;
}
function settings(rom, neon) {
  if (neon) {
    const ring = new Map(S.NEON_SETTINGS.map(at => [at, rom.subarray(at, at + PAGE)]));
    return S.neonSettings(ring);
  }
  const page = [S.SET_A, S.SET_B].map(at => rom.subarray(at, at + PAGE)).find(S.settingsOk);
  return page ? { page } : null;
}
function bankPatch(rom) {
  const banks = root.ParamixResidentBanks ||
    (typeof require !== 'undefined' ? require('./paradise_resident_banks.js') : null);
  return banks?.inspect(rom) ? banks : null;
}
function info(rom) {
  if (!(rom instanceof Uint8Array) || rom.length !== 0x1000000)
    return { reason: 'Open a Paradise ROM to edit its field residents.' };
  const edition = F.edition(rom);
  const d = edition && layouts[edition.profile.name];
  const neon = d === layouts.neon;
  if (!d || edition.at !== edition.profile.idPage || !flashAddress(rom, d, 0) ||
      (neon && !S.neonSaveLayout(rom)))
    return { reason: 'This ROM does not have a supported field resident layout.' };
  const store = settings(rom, neon);
  if (!store) return { reason: 'The active save settings are missing or damaged.' };
  const six = SIX.sixInfo(rom);
  const names = F.fieldNames(rom);
  const bank = six && store.page[SIX_SET] === 1 ? 1 : 0;
  const banks = six?.dna ? bankPatch(rom) : null;
  if (banks && d === layouts.jade) store.page = banks.initializeJade(store.page);
  const separate = (banks && d === layouts.jade) || six?.kind === 'gen3' && six.dna && six.fieldMenu && store.page[SIX_DNA_MARK] === 0x5A;
  return { d, neon, store, bank, separate, banks, six, names, edition: edition.id,
    physicalField: store.page[edition.profile.fieldByte] };
}
function flags(page, d, at) { return d.packed ? (u16(page, at) >>> 6) & 15 : page[at + 1]; }
function fieldView(rom, data, id) {
  const { d, store, bank: activeBank, separate, banks, names, six } = data;
  const bank = names.length > 3 && id >= 3 ? 1 : 0;
  const physical = six?.kind === 'jade' && bank ? 1 : id % 3;
  const switches = names.length > 3 && (six?.kind === 'gen3' || physical === 1);
  const active = !switches || bank === activeBank;
  const available = active || separate;
  const inactive = d === layouts.jade ? (banks?.JADE_ROSTER ?? 0) - d.stride : SIX_ROSTER;
  const roster = (active || !separate ? d.roster : inactive) + physical * d.stride;
  const expansion = (active ? 0x89 : SIX_EXPANSION);
  const capacity = d.packed || !((store.page[expansion] >> physical) & 1) ? 4 : 8;
  // Occupied upper slots remain visible even if the expansion flag was lost.
  const own = available ? flags(store.page, d, roster) : 0;
  const other = switches && separate
    ? flags(store.page, d, (active ? inactive : d.roster) + physical * d.stride) : 0;
  const slots = Array.from({ length: own & 0xF0 ? 8 : capacity }, (_, slot) => {
    const index = d.index + physical * (d.packed ? 4 : 8) + slot;
    const primary = flashAddress(rom, d, index);
    const privateAddress = banks && primary ? banks.address(index) : 0;
    const marker = privateAddress ? banks.markerAddress(index) : 0;
    const committed = marker && u32(rom, marker) === banks.commitValue;
    const address = bank && privateAddress ? privateAddress : primary;
    const readAddress = bank && committed ? privateAddress : primary;
    const occupied = !!(own & (1 << slot));
    const oppositeOccupied = !!(other & (1 << slot));
    const blocked = !available || !address || (!banks && oppositeOccupied);
    const resident = occupied && readAddress ? nativeGhost(rom.subarray(readAddress, readAddress + RECORD)) : null;
    const preserve = privateAddress && !committed && !bank && oppositeOccupied ? privateAddress : 0;
    return { field: id, slot, address, occupied, blocked, status: resident ? 'ready' : occupied ? 'unreadable' : 'empty',
      id: resident?.id ?? null, bytes: resident?.bytes ?? null, marker, preserve };
  });
  return { id, name: names[id], bank, active, available, physical, roster, capacity, slots };
}
function inspect(rom) {
  const data = info(rom);
  if (data.reason) return { reason: data.reason, fields: [], current: null };
  const fields = data.names.map((_, id) => fieldView(rom, data, id));
  const active = nativeGhost(rom.subarray(data.d.zero, data.d.zero + RECORD));
  const currentField = fields.find(field => field.active && field.physical === data.physicalField)?.id;
  return { edition: data.edition, fields, currentField, current: active ? { id: active.id, bytes: active.bytes } : null };
}

function previousSlot(bits, slot, count) {
  for (let step = 1; step < count; step++) {
    const candidate = (slot + count - step) % count;
    if (bits & (1 << candidate)) return candidate;
  }
  return 0;
}
function writeRoster(page, d, field, slot, occupied) {
  const at = field.roster;
  if (d.packed) {
    let v = u16(page, at);
    const mark = 1 << (slot + 6);
    v = occupied ? (v | mark) : (v & ~mark);
    if (occupied) v = (v & ~0x3F) | ((((slot + 1) % 4) & 7) | (slot << 3));
    else if (((v >>> 3) & 7) === slot) {
      const last = previousSlot(v >>> 6, slot, 4);
      v = (v & ~0x38) | (last << 3);
      v = (v & ~7) | slot;
    }
    w16(page, at, v);
  } else {
    page[at + 1] = occupied ? (page[at + 1] | (1 << slot)) : (page[at + 1] & ~(1 << slot));
    page[at + 2] &= ~(1 << slot); // the field's transient screen selection
    // Neon advances through eight physical slots even before expansion.
    if (occupied) page[at] = (slot << 4) | ((slot + 1) % (d.cursorSlots || field.capacity));
    else if ((page[at] >>> 4) === slot) {
      const last = previousSlot(page[at + 1], slot, field.slots.length);
      page[at] = (last << 4) | slot;
    }
  }
}

function apply(rom, change) {
  const data = info(rom);
  if (data.reason) throw new Error(data.reason);
  const { d, neon, store, names, banks } = data;
  const fields = names.map((_, id) => fieldView(rom, data, id));
  const from = fields[change.field], source = from?.slots[change.slot];
  if (!source || !from.available || !source.address) throw new Error('This resident slot is unavailable.');
  const { type } = change;
  const to = type === 'move' ? fields[change.toField] : from;
  const target = type === 'move' ? to?.slots[change.toSlot] : source;
  if (!['put', 'remove', 'move'].includes(type) || !target || !to.available || !target.address)
    throw new Error('This resident slot is unavailable.');
  const sameAddressMove = type === 'move' && source.address === target.address;
  if (type === 'move' && (source === target || target.occupied))
    throw new Error('Move the resident to an empty slot.');
  if (type !== 'remove' && target.blocked && !sameAddressMove)
    throw new Error('That resident slot is in use by the other field bank.');
  if (type !== 'put' && !source.occupied) throw new Error('That resident slot is empty.');
  const resident = type === 'put' ? nativeGhost(change.bytes) : type === 'move' ? nativeGhost(source.bytes) : null;
  if (type !== 'remove' && !resident) throw new Error('The resident appearance is missing or damaged.');
  const out = new Uint8Array(rom), page = Uint8Array.from(store.page);
  const privateRanges = [], primaryRanges = [];
  const markers = new Set();
  const commit = marker => {
    if (u32(out, marker) === banks.commitValue) return;
    w32(out, marker, banks.commitValue);
    markers.add(marker & ~(PAGE - 1));
  };
  const rewrite = (address, bytes, length, secondary = false) => {
    out.fill(0xFF, address, address + RECORD);
    if (bytes) out.set(bytes.subarray(0, length), address);
    (secondary ? privateRanges : primaryRanges).push([address, address + RECORD]);
  };
  const preserve = slot => {
    if (!slot.preserve) return;
    rewrite(slot.preserve, rom.subarray(slot.address, slot.address + RECORD), RECORD, true);
    commit(slot.marker);
  };
  if (type !== 'put') {
    writeRoster(page, d, from, source.slot, false);
    if (!source.blocked && !sameAddressMove) {
      preserve(source);
      rewrite(source.address, null, 0, !!(banks && from.bank));
      if (banks && from.bank) commit(source.marker);
    }
  }
  if (type !== 'remove') {
    if (!sameAddressMove) {
      preserve(target);
      rewrite(target.address, resident.bytes, resident.length, !!(banks && to.bank));
      if (banks && to.bank) commit(target.marker);
    }
    writeRoster(page, d, to, target.slot, true);
  }
  const ranges = [...privateRanges, ...Array.from(markers, at => [at, at + PAGE]), ...primaryRanges];
  const offsets = neon ? [S.NEON_SETTINGS[(store.index + 1) % S.NEON_SETTINGS.length]] : [S.SET_A, S.SET_B];
  if (neon) {
    if (store.generation === 0xFFFFFFFF) throw new Error('The Neon settings generation is exhausted.');
    w32(page, S.NEON_GENERATION, store.generation + 1);
  }
  S.sealSettings(page);
  for (const at of offsets) { out.set(page, at); ranges.push([at, at + PAGE]); }
  return { rom: out, ranges };
}

const api = { inspect, apply, build, preview, catalog };
if (typeof module !== 'undefined') module.exports = api;
else root.ParamixResidents = api;
})(typeof window !== 'undefined' ? window : globalThis);
