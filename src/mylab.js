/* My Lab U2 archives, Garden records and rotating APPDATA pages. */
(function (root) {
'use strict';
const SIZE = 0x1000000, BOOT_ASSETS = 0x51000, MAIN_ASSETS = 0x211000;
const GARDEN = 0xD19000, RECORD_SIZE = 0x1B000, SLOTS = 6;
const SAVE = 0xDFB000, PAGE = 0x1000, PAGES = 5, ROSTER_COUNT = 157;
const DEVICE_SAVE_FIRST = 0xCA1000, DEVICE_SAVE_END = SAVE + PAGES * PAGE;
const POINTS = 0x80, LEVEL = 0x8A, ENCOUNTERS = 0x280;
const BACKUP_MAGIC = 'PXMLSAVE', BACKUP_SIZE = 12 + PAGE;
const SLOT_GARDEN_FIRST = 0xD19000, SLOT_GARDEN_SIZE = 6 * 0x1B000;
const DEVICE_HEADER = 16, DEVICE_BACKUP_SIZE = DEVICE_HEADER + DEVICE_SAVE_END - DEVICE_SAVE_FIRST + 4;
const UPDATE_NAME = 'MLTUPD.BIN', UPDATE_HEADER = 0x100, UPDATE_MAX = UPDATE_HEADER + 0xD00000;
const u16 = (b, o) => b[o] | b[o + 1] << 8;
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const tag = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

// Check the container fields independently of the device's keyed authentication.
function inspectUpdate(bytes) {
  if (tag(bytes, 0, 8) !== 'BTPUPPKG') throw new Error('Expected a My Lab SD update package (BTPUPPKG)');
  if (bytes.length < UPDATE_HEADER + 0x2000 || bytes.length > UPDATE_MAX ||
      u32(bytes, 8) !== 0x00010100 || u32(bytes, 0x0C) !== 1) {
    throw new Error('Unsupported My Lab update header');
  }
  const size = u32(bytes, 0x1C);
  if (u32(bytes, 0x18) !== UPDATE_HEADER || size % 0x1000 || size !== bytes.length - UPDATE_HEADER ||
      u32(bytes, 0x20) !== 0x60100000 || u32(bytes, 0x24) !== 0x60101000 ||
      u32(bytes, 0x28) !== size - 0x1000) throw new Error('Invalid My Lab update layout');
  let sum = 0;
  for (let offset = 0; offset < UPDATE_HEADER; offset++) {
    if ((offset >= 0x10 && offset < 0x18) || (offset >= 0x4C && offset < 0x6C)) continue;
    sum += bytes[offset];
  }
  if (u32(bytes, 0x10) !== sum || u32(bytes, 0x14) !== (-sum >>> 0)) {
    throw new Error('My Lab update header checksum mismatch');
  }
  if (bytes.subarray(0x4C, 0x6C).every(byte => byte === 0) ||
      bytes.subarray(0x4C, 0x6C).every(byte => byte === 0xFF)) {
    throw new Error('My Lab update authentication tag missing');
  }
  return { size };
}

function hasMyLabLayout(rom) {
  return rom.length === SIZE && tag(rom, 0, 8) === 'SONIXDEV' &&
    u32(rom, 0x1F8) === 0x5A5A0033 && tag(rom, 0x186A40, 8) === 'SONIXDEV' &&
    tag(rom, 0x18B7B3, 21) === 'PSID_YD03_MYLAB_CHARA';
}

function isMyLab(rom) {
  return hasMyLabLayout(rom) && u32(rom, 0x10) === 0x60001000 && u32(rom, 0x14) === 0x10000;
}

function isFlashImage(rom, core) {
  if (!hasMyLabLayout(rom)) return false;
  const menu = 0x37000, rescue = 0xFF0000, table = 0xFFE000;
  const nativeVersion = tag(rom, 0x19D100, 8);
  const settingsEntry = nativeVersion === 'PXMLAB01' && u32(rom, 0x148CDA) === 0xF9C1F054;
  const computerEntry = nativeVersion === 'PXMLAB02' && u32(rom, 0x147548) === 0xFD8AF055;
  const native = (settingsEntry || computerEntry) && isMyLab(rom) && u32(rom, 8) === 0x13 &&
    u32(rom, 0x17CA8C) === 0x1008C001 && u32(rom, 0x19D1A4) === 0x7FFE;
  const bootMenu = u32(rom, 8) === 0x12 && u32(rom, 0x10) === 0x60000000 + menu;
  const length = u32(rom, native ? 0x19D108 : 0x14);
  const crc = u32(rom, native ? 0x19D10C : 0x24);
  return (native || bootMenu) && length > 0 && length <= 0xE000 && length % 0x1000 === 0 &&
    u32(rom, menu + 0x140) === 0x444C4546 && u32(rom, menu + 0x160) === 0x36000 &&
    crc === core.crc32(rom.subarray(menu, menu + length)) &&
    tag(rom, table, 8) === 'SONIXDEV' && u32(rom, table + 8) === 0x12 &&
    u32(rom, table + 0x10) === 0x60000000 + rescue && u32(rom, table + 0x14) === table - rescue &&
    u32(rom, table + 0x24) === core.crc32(rom.subarray(rescue, table));
}

const PARADISE_PORT_MARKER_OFFSET = 0x19D100;
function hasParadisePortMarker(rom) {
  return tag(rom, PARADISE_PORT_MARKER_OFFSET, 8) === 'PXMLABP1';
}

function hasParadisePortBoot(header, marker) {
  return header.length >= 0x18 && tag(header, 0, 8) === 'SONIXDEV' &&
    u32(header, 8) === 0x12 && u32(header, 0x10) === 0x60037000 &&
    tag(marker, 0, 8) === 'PXMLABP1';
}

function isParadiseFlashImage(rom, core) {
  return hasParadisePortMarker(rom) &&
    u32(rom, 0x10) === 0x60037000 && isFlashImage(rom, core);
}

const PARADISE_BACKUP_OFFSET = 0xFFF000;
const PARADISE_BACKUP_LENGTH = 52;
function paradiseBackupRecord(bytes) {
  return bytes.length >= PARADISE_BACKUP_LENGTH && tag(bytes, 0, 8) === 'PXMLPB01' ?
    { bootCrc: u32(bytes, 8), sha256: bytes.subarray(12, 44), editionOffset: u32(bytes, 44), editionCrc: u32(bytes, 48) } : null;
}

function readArchive(rom, base, count, core) {
  const length = u32(rom, base + 8), end = base + 16 + length;
  if (tag(rom, base, 4) !== 'ARC2' || u32(rom, base + 12) !== count ||
      length < 16 * count || end > rom.length) throw new Error('Invalid My Lab asset archive');
  const archive = core.arc2Parse(rom, base);
  if (archive.chk !== core.arc2Checksum(rom, base, length)) throw new Error('My Lab asset checksum mismatch');
  let previousEnd = 16 + 16 * count;
  for (const entry of archive.ents) {
    if (entry.flags || entry.offset < previousEnd || entry.ulen > entry.clen ||
        entry.offset + entry.clen > 16 + length) throw new Error('Invalid My Lab archive entry');
    previousEnd = entry.offset + entry.clen;
  }
  const pack = archive.ents[1];
  const bytes = rom.subarray(base + pack.offset, base + pack.offset + pack.ulen);
  const first = u32(bytes, 0);
  if (!first || first % 4 || first > bytes.length) throw new Error('Invalid My Lab sprite index');
  let previous = first - 1;
  for (let i = 0; i < first; i += 4) {
    const offset = u32(bytes, i);
    if (offset < previous + (i ? 24 : 1) || offset + 24 > bytes.length) throw new Error('Invalid My Lab sprite entry');
    previous = offset;
  }
  return { entries: core.packSplit(bytes), data: rom.subarray(base + archive.ents[0].offset, base + archive.ents[0].offset + archive.ents[0].ulen) };
}

// Keep the stock sprite offsets. The ROM may reference other archive members directly.
function sheetChanges(visitor, sheet, core) {
  const changes = new Map();
  core.groupFromSheet(sheet).forEach((frames, part) => {
    const index = visitor.sprites[part], original = visitor.entries[index];
    const current = core.spriteDecode(original).subs;
    if (frames.length === current.length && frames.every((f, i) => core.sameImage(f, current[i]))) return;
    changes.set(index, encodeSpriteSlot(original, frames, core, core.partOptions(part)));
  });
  return changes;
}

function encodeSpriteSlot(original, frames, core, options) {
  const encoded = core.spriteEncode(original, frames, options);
  if (encoded.length > original.length) throw new Error('Sprite needs ' + encoded.length + ' bytes. Its ROM slot holds ' + original.length + '.');
  const slot = new Uint8Array(original.length);
  slot.set(encoded);
  return slot;
}

function applySpriteChanges(image, changes, core, bootChanges = new Map()) {
  if (!changes.size && !bootChanges.size) return image;
  const out = new Uint8Array(image);
  for (const [base, edits] of [[BOOT_ASSETS, bootChanges], [MAIN_ASSETS, changes]]) {
    if (!edits.size) continue;
    const archive = core.arc2Parse(image, base);
    const pack = archive.ents[1], start = base + pack.offset;
    const count = u32(image, start) / 4;
    for (const [index, entry] of edits) {
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Invalid My Lab sprite index');
      const offset = u32(image, start + index * 4);
      const end = index + 1 === count ? pack.ulen : u32(image, start + (index + 1) * 4);
      const target = image.subarray(start + offset, start + end);
      if (entry.length !== target.length ||
          !entry.subarray(6, 14).every((value, i) => value === target[i + 6])) {
        throw new Error('My Lab sprite ' + index + ' no longer matches its ROM slot');
      }
      out.set(entry, start + offset);
    }
    view(out).setUint32(base + 4, core.arc2Checksum(out, base, archive.length), true);
  }
  return out;
}

function collectCharacters(pack, entries, text, core, records = core.charTable(pack)) {
  const poses = core.paraLayers(pack);
  const characters = new Map();
  if (!poses || !text) return characters;
  for (const character of records) {
    if (character.stage !== 5 || character.field < 1 || character.field > 9 ||
        character.id < 4000 || character.id >= 5000) continue;
    const frames = [20, 24].map((count, zoom) =>
      Array.from({ length: count }, (_, i) => poses.frameAt(54 * character.animation + (zoom ? 30 : 1) + i)));
    if (!frames.every(group => group.every(Boolean))) continue;
    const sprites = frames.flatMap(group => [0, 1, 15].map(type => group[0].find(layer => layer.type === type)?.img));
    if (!sprites.every(index => entries[index])) continue;
    const names = text.map(table => core.txtWords(table, character.name));
    characters.set(character.id, { character, sprites, frames, names, pack, entries });
  }
  return characters;
}

function openRom(rom, core, visit) {
  const flashImage = isFlashImage(rom, core);
  if (!flashImage && !isMyLab(rom)) return null;
  const boot = readArchive(rom, BOOT_ASSETS, 3, core);
  const main = readArchive(rom, MAIN_ASSETS, 24, core);
  const pack = main.data;
  const records = core.charTable(pack);
  const textOffset = MAIN_ASSETS + core.arc2Parse(rom, MAIN_ASSETS).ents[2].offset;
  const textCount = u32(rom, textOffset + 12);
  const text = textCount === 9 ? core.textTablesOf(rom, MAIN_ASSETS)?.tabs : null;
  const characters = collectCharacters(pack, main.entries, text, core, records);
  const menu = readMenu(rom, core, flashImage);
  return { rom, archives: [boot.entries, main.entries], ...readSaveRegion(rom.subarray(DEVICE_SAVE_FIRST, DEVICE_SAVE_END), visit), menu, text, characters,
    flashImage: flashImage ? rom : null };
}

function readMenu(rom, core, flashImage) {
  const marker = tag(rom, 0x19D100, 8), address = 0x37000;
  const knownNative = isMyLab(rom) && (
    (marker === 'PXMLAB02' && u32(rom, 0x147548) === 0xFD8AF055) ||
    (marker === 'PXMLAB01' && u32(rom, 0x148CDA) === 0xF9C1F054));
  const bootMenu = flashImage && !isMyLab(rom);
  const size = knownNative ? u32(rom, 0x19D108) : bootMenu ? u32(rom, 0x14) : 0;
  const crc = u32(rom, knownNative ? 0x19D10C : 0x24);
  const valid = size > 0 && size <= 0xE000 && size % PAGE === 0 &&
    u32(rom, address + 0x140) === 0x444C4546 && core.crc32(rom.subarray(address, address + size)) === crc;
  const mode = knownNative ? (marker === 'PXMLAB02' ? 'computer' : 'settings')
    : bootMenu ? (marker === 'PXMLABP1' ? 'paradise' : 'boot') : 'stock';
  const rowBase = mode === 'computer' && valid ? 0x19D180 : 0x1897B4;
  const rows = Array.from({ length: rowBase === 0x19D180 ? 5 : 4 }, (_, i) => u32(rom, rowBase + 8 * i));
  return { mode, size, valid, rows };
}

const blank = bytes => bytes.every(byte => byte === 0xFF) || bytes.every(byte => byte === 0);

function readSlot(record, slot, visit) {
  if (blank(record)) return { slot, status: 'empty' };
  const bytes = new Uint8Array(visit.GHOST_SIZE).fill(0xFF);
  bytes.set(record);
  const id = u16(bytes, 0x10A);
  if (u32(bytes, 0x10C) > RECORD_SIZE || !id || u16(bytes, 0xFC) !== 5 || !visit.verifyGhost(bytes))
    return { slot, status: 'unreadable' };
  return { slot, status: 'ready', id, bytes };
}

function validPage(page, visit) {
  return page.length === PAGE && (u16(page, 0) ^ u16(page, 2)) === 0xFFFF &&
    u16(page, 0) === visit.crc16(page.subarray(4));
}
function appPages(region, visit) {
  return Array.from({ length: PAGES }, (_, index) => {
    const bytes = region.subarray(index * PAGE, (index + 1) * PAGE);
    const valid = validPage(bytes, visit);
    return { index, bytes, status: valid ? 'ready' : blank(bytes) ? 'empty' : 'unreadable', sequence: valid ? u32(bytes, 4) : null };
  });
}
function latestPage(pages) {
  return pages.reduce((best, page) =>
    page.sequence !== null && (!best || page.sequence > best.sequence) ? page : best, null);
}

function readSaveRegion(data, visit) {
  const start = GARDEN - DEVICE_SAVE_FIRST;
  const slots = Array.from({ length: SLOTS }, (_, slot) =>
    readSlot(data.subarray(start + slot * RECORD_SIZE, start + (slot + 1) * RECORD_SIZE), slot, visit));
  const pages = appPages(data.subarray(SAVE - DEVICE_SAVE_FIRST), visit);
  return { data, slots, pages, latest: latestPage(pages) };
}

function saveRecoveryPending(slots, garden, visit) {
  if (tag(slots, 0, 8) === 'PXMLSV01' &&
      u32(slots, 0x1000) === 0x4A534C4D && u32(slots, 0x1004) === (~0x4A534C4D >>> 0)) return true;
  return u32(garden, 4) === 0x4A474C4D && validPage(garden, visit);
}

function gardenEyeLayers(bytes) {
  return [1, 4].map(part => {
    const at = 0x110 + part * 8, start = u32(bytes, at);
    return bytes.subarray(start, start + u32(bytes, at + 4));
  });
}
function gardenAppearance(source, body, eyes, color, palette, core, visit, defaultPalettes) {
  const base = body ? visit.buildRomGhost(body, core) : source;
  if (body && !eyes) {
    const sprites = gardenEyeLayers(source), native = gardenEyeLayers(base);
    if (u16(source, 0x0e) !== u16(base, 0x0e) ||
        sprites.some((sprite, i) => sprite.length !== native[i].length || !sprite.every((byte, j) => byte === native[i][j]))) {
      const resident = { character: { stage: u16(source, 0xfc), id: u16(source, 0x0e) },
        entries: sprites, sprites: [0, 0, 0, 0, 1] };
      eyes = visit.romEyes(resident, visit.ghostAppearanceOptions(base, core).eyes, core);
      if (!eyes) throw new Error('These eyes do not fit this body. Choose compatible eyes or use the body default.');
    }
  }
  const tint = color;
  const edited = visit.editGhostAppearance(base, {
    eyes, palette, color: tint !== null && tint < 16 ? tint : undefined,
  });
  const end = u32(edited, 0x10c);
  const bytes = Uint8Array.from(source);
  bytes.set(edited.subarray(0, end));
  if (body) {
    // Preserve the resident's origin and opaque slot fields, as the device editor does.
    for (const [start, end] of [[8, 12], [0x104, 0x10a], [0x180, 0x600]])
      bytes.set(source.subarray(start, end), start);
  }
  if (body && color === null) bytes.set(source.subarray(0x140, 0x180), 0x140);
  if (color === 255 && defaultPalettes) bytes.set(defaultPalettes, 0x140);
  else if (color === 255) {
    for (const [part, dest] of [[0, 0x140], [2, 0x160]]) {
      const start = u32(bytes, 0x110 + part * 8);
      const offset = start + u16(bytes, start + 18);
      bytes.set(bytes.subarray(offset, offset + 32), dest);
    }
  }
  bytes[0x10] = color ?? source[0x10];
  let sum = 0;
  for (let i = 8; i < end; i += 4) sum = (sum + u32(bytes, i)) >>> 0;
  view(bytes).setUint32(0, sum, true);
  view(bytes).setUint32(4, -sum, true);
  if (!visit.verifyGhost(bytes)) throw new Error('Garden preview checksum mismatch');
  return bytes;
}
function editGardenSlot(rom, data, slot, bytes, visit) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS || bytes.length !== visit.GHOST_SIZE ||
      u16(bytes, 0xfc) !== 5 || !visit.verifyGhost(bytes)) throw new Error('Invalid Garden visitor');
  if (saveRecoveryPending(rom.subarray(0xC64000, 0xC66000), rom.subarray(0xFEB000, 0xFEC000), visit))
    throw new Error('Pending My Lab save recovery');
  const draft = Uint8Array.from(data);
  draft.set(bytes.subarray(0, u32(bytes, 0x10c)), GARDEN - DEVICE_SAVE_FIRST + slot * RECORD_SIZE);
  const result = readSaveRegion(draft, visit);
  if (!result.slots[slot].bytes) throw new Error('Could not verify the edited Garden slot');
  return result;
}

function editRomSave(rom, data, backup, visit) {
  if (saveRecoveryPending(rom.subarray(0xC64000, 0xC66000), rom.subarray(0xFEB000, 0xFEC000), visit)) {
    throw new Error('Pending My Lab save recovery');
  }
  const draft = backup ? new Uint8Array(data) : new Uint8Array(data.length).fill(0xFF);
  if (backup) {
    if (backup.data) draft.set(backup.data, backup.dataStart - DEVICE_SAVE_FIRST);
    // All five APPDATA pages belong to the same active game.
    draft.fill(0xFF, SAVE - DEVICE_SAVE_FIRST);
    draft.set(stamp(backup.page, 1, visit), SAVE - DEVICE_SAVE_FIRST);
  }
  return readSaveRegion(draft, visit);
}

function saveInfo(page) {
  let count = 0;
  for (let i = 0; i < ROSTER_COUNT; i++) count += (page[ENCOUNTERS + (i >> 3)] >>> (i & 7)) & 1;
  return { points: u32(page, POINTS), level: page[LEVEL], count };
}

function stamp(page, sequence, visit) {
  const out = Uint8Array.from(page), bytes = view(out);
  bytes.setUint32(4, sequence, true);
  const crc = visit.crc16(out.subarray(4));
  bytes.setUint16(0, crc, true);
  bytes.setUint16(2, ~crc, true);
  return out;
}

function saveBackup(page, visit) {
  const out = new Uint8Array(BACKUP_SIZE);
  out.set(new TextEncoder().encode(BACKUP_MAGIC));
  view(out).setUint32(8, 1, true);
  out.set(stamp(page, u32(page, 4), visit), 12);
  return out;
}

function readBackup(bytes, visit) {
  const page = bytes.subarray(12);
  if (bytes.length !== BACKUP_SIZE || tag(bytes, 0, 8) !== BACKUP_MAGIC ||
      u32(bytes, 8) !== 1 || !validPage(page, visit)) throw new Error('Invalid My Lab save backup');
  return page;
}
function deviceSaveBackup(region, clock, core, visit) {
  if (region.length !== DEVICE_SAVE_END - DEVICE_SAVE_FIRST ||
      !latestPage(appPages(region.subarray(SAVE - DEVICE_SAVE_FIRST), visit))) {
    throw new Error('No valid My Lab save on the device');
  }
  const out = new Uint8Array(DEVICE_BACKUP_SIZE), header = view(out);
  out.set(new TextEncoder().encode(BACKUP_MAGIC));
  header.setUint32(8, 2, true);
  header.setUint32(12, clock ?? 0xFFFFFFFF, true);
  out.set(region, DEVICE_HEADER);
  header.setUint32(out.length - 4, core.crc32(out.subarray(0, -4)), true);
  return out;
}
function readDeviceSaveBackup(bytes, core, visit) {
  if (bytes.length === BACKUP_SIZE) return { page: readBackup(bytes, visit), data: null, clock: null };
  const version = u32(bytes, 8);
  const gardenOnly = version === 3;
  const dataStart = gardenOnly ? SLOT_GARDEN_FIRST : DEVICE_SAVE_FIRST;
  const appStart = DEVICE_HEADER + (gardenOnly ? SLOT_GARDEN_SIZE : SAVE - DEVICE_SAVE_FIRST);
  if ((version !== 2 && !gardenOnly) || bytes.length !== appStart + PAGES * PAGE + 4 ||
      tag(bytes, 0, 8) !== BACKUP_MAGIC ||
      u32(bytes, bytes.length - 4) !== core.crc32(bytes.subarray(0, -4))) {
    throw new Error('Invalid My Lab save backup');
  }
  const latest = latestPage(appPages(bytes.subarray(appStart, -4), visit));
  if (!latest) throw new Error('No valid My Lab save in this backup');
  const clock = u32(bytes, 12);
  return { page: latest.bytes, data: bytes.subarray(DEVICE_HEADER, appStart), dataStart,
    clock: clock === 0xFFFFFFFF ? null : clock };
}
function activeDeviceSave(current, visit) {
  return latestPage(appPages(current, visit));
}

function planDeviceSavePage(page, current, visit) {
  const latest = activeDeviceSave(current, visit);
  if (latest && page.subarray(8).every((byte, i) => byte === latest.bytes[i + 8])) return null;
  if (latest?.sequence === 0xFFFFFFFF) throw new Error('The My Lab save sequence is full');
  // Commit the restored settings to the next ring page. The last valid page
  // remains available if writing the new one is interrupted.
  const index = latest ? (latest.index + 1) % PAGES : 0;
  const sequence = latest ? latest.sequence + 1 : 1;
  return { off: SAVE + index * PAGE, bytes: stamp(page, sequence, visit) };
}

root.ParamixMyLab = { sheetChanges, encodeSpriteSlot, applySpriteChanges, isMyLab, isFlashImage, isParadiseFlashImage, hasParadisePortMarker,
  hasParadisePortBoot, PARADISE_PORT_MARKER_OFFSET,
  paradiseBackupRecord, PARADISE_BACKUP_OFFSET, PARADISE_BACKUP_LENGTH, openRom, inspectUpdate, UPDATE_NAME, UPDATE_MAX,
  saveInfo, saveBackup, readBackup, collectCharacters, gardenAppearance, editGardenSlot, editRomSave, saveRecoveryPending,
  DEVICE_SAVE_FIRST, DEVICE_SAVE_END, APPDATA_FIRST: SAVE, GARDEN_FIRST: GARDEN,
  GARDEN_END: GARDEN + SLOTS * RECORD_SIZE, deviceSaveBackup, readDeviceSaveBackup, activeDeviceSave, planDeviceSavePage };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLab;
})(typeof window !== 'undefined' ? window : globalThis);
