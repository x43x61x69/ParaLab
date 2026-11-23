/* Shared My Lab menu installer for the offline Studio and the CLI. */
(function (root) {
'use strict';
const dependency = (name, path) => root[name] || (typeof require === 'function' ? require(path) : null);
const C = dependency('ParamixCore', './core');
const F = dependency('ParamixFeld', './feld');
const FL = dependency('ParamixFlash', './flash');
const M = dependency('ParamixMyLab', './mylab');
const S = dependency('ParamixVisit', './visit');
const labPan = dependency('ParamixMyLabLabPan', './mylab_lab_pan');
const screenSupport = dependency('ParamixMyLabScreenSupport', './mylab_screen_support');
const gamesFit = dependency('ParamixMyLabGamesFit', './mylab_games_fit');
const screenCorrections = [
  dependency('ParamixMyLabGridFit', './mylab_grid_fit'),
  dependency('ParamixMyLabItemFit', './mylab_item_fit'),
  gamesFit,
  dependency('ParamixMyLabBubbleFit', './mylab_bubble_fit'),
  dependency('ParamixMyLabPuzzleFit', './mylab_puzzle_fit'),
  dependency('ParamixMyLabEggFit', './mylab_egg_fit'),
  dependency('ParamixMyLabTextFit', './mylab_text_fit'),
  dependency('ParamixMyLabCardFit', './mylab_card_fit'),
  dependency('ParamixMyLabPanelFit', './mylab_panel_fit'),
  dependency('ParamixMyLabGeneratorFit', './mylab_generator_fit'),
  dependency('ParamixMyLabPageHints', './mylab_page_hints'),
  dependency('ParamixMyLabSimulationFit', './mylab_simulation_fit'),
  dependency('ParamixMyLabFoodFit', './mylab_food_fit'),
  labPan,
  dependency('ParamixMyLabLetterWrap', './mylab_letter_wrap'),
  dependency('ParamixMyLabCraftWrap', './mylab_craft_wrap'),
  dependency('ParamixMyLabRecordBadge', './mylab_record_badge'),
  dependency('ParamixMyLabDialogWrap', './mylab_dialog_wrap'),
  dependency('ParamixMyLabTutorialFit', './mylab_tutorial_fit'),
];
const encoder = new TextEncoder();
const tag = (bytes, offset, size) => String.fromCharCode(...bytes.subarray(offset, offset + size));
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (bytes, offset) => view(bytes).getUint16(offset, true);
const u32 = (bytes, offset) => view(bytes).getUint32(offset, true);
const w16 = (bytes, value, offset=0) => view(bytes).setUint16(offset, value, true);
const w32 = (bytes, value, offset=0) => view(bytes).setUint32(offset, value, true);
const hex = text => Uint8Array.from(text.match(/../g), pair => parseInt(pair, 16));
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
function concat(parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

const STUB = 0x36000, MENU = 0x37000, STOCK_BOOT = 0x18D000;
const PARADISE_STUB = 0xB0000;
const BOOT = 0x1000, BOOT_SIZE = 0x10000, BOOT_CRC = 0x3A4F8F7D;
const NATIVE_HOOK = 0x19D000, NATIVE_STUB = NATIVE_HOOK + 0x200;
const HOME_UPDATE = 0x17CA8C, COMPUTER_ROWS = 0x1897B4, ROW_COPY = NATIVE_HOOK + 0x180;
const COLD_ENTRY = 0x50000, COLD_CALL = 0x2216C;
const TOOL_ENTRY = 0xFC0000, TOOL_SIZE = 0x10000, TOOL_MARKER = 0xF000;
const STOCK_COLD_CALL = '00200880', PATCHED_COLD_CALL = '2df048ff'; // BL to flash 0x50000 in the stock XIP map.
const ASSETS = 0x211000, ASSET_LIMIT = 0xA6B000;
const GARDEN_CATALOG = 0xE00000, GARDEN_WORK = 0xFD0000, GARDEN_WORK_END = 0xFEC000;
const GARDEN_HEADER = 0x1D34, GARDEN_ROW = GARDEN_HEADER + 6 * 8, GARDEN_INDEX = 28;
const LEGACY_GARDEN_INDEX = 24;
const xip = offset => 0x10000000 + offset - 0x11000;
function tableSum(image, start) {
  let sum = 0;
  for (let i = 0; i < 0x1FC; i += 4) sum = (sum + u32(image, start + i)) >>> 0;
  w32(image, sum, start + 0x1FC);
}

function patchBytes(image, address, expected, replacement) {
  const original = hex(expected);
  if (!same(image.subarray(address, address + original.length), original)) {
    throw new Error('Unexpected My Lab firmware code at 0x' + address.toString(16));
  }
  image.set(hex(replacement), address);
}

function addMyLabLabel(image, name) {
  const archive = C.arc2Parse(image, ASSETS);
  const files = C.arc2Files(image, ASSETS);
  const languages = C.arc2Files(files[2], 0);
  if (languages.length !== 9) throw new Error('Unexpected My Lab languages');
  const count = u16(languages[0], 0);
  const label = new Uint8Array(2 * (name.length + 1));
  Array.from(name, (letter, i) => w16(label, C.TXT_ENC[letter], 2 * i));
  files[2] = C.arc2Build(languages.map(table => {
    const indexEnd = 2 * (count + 2);
    if (u16(table, 0) !== count || u16(table, 2) * 2 !== indexEnd ||
        u16(table, indexEnd - 2) * 2 !== table.length ||
        table.length + 2 + label.length > 2 * 0xFFFF) {
      throw new Error('Unexpected My Lab strings');
    }
    const extended = new Uint8Array(table.length + 2 + label.length);
    w16(extended, count + 1);
    for (let offset = 2; offset < indexEnd; offset += 2) {
      w16(extended, u16(table, offset) + 1, offset);
    }
    w16(extended, extended.length / 2, indexEnd);
    extended.set(table.subarray(indexEnd), indexEnd + 2);
    extended.set(label, table.length + 2);
    return extended;
  }));
  const assets = C.arc2Build(files);
  const oldEnd = ASSETS + 16 + archive.length;
  const newEnd = ASSETS + assets.length;
  // The My Lab archive is zero-padded to the next firmware header.
  if (newEnd > ASSET_LIMIT || !image.subarray(oldEnd, newEnd).every(byte => byte === 0)) {
    throw new Error('My Lab strings would overwrite occupied flash');
  }
  image.set(assets, ASSETS);
  return count;
}

function installNativeMenu(image, hook, stub, size) {
  if (!hook || hook.length <= 0x100 || hook.length > 0x1100 || hook.length % 4 || stub.length > 0xE00) {
    throw new Error('Invalid My Lab menu hook');
  }
  const label = addMyLabLabel(image, 'PARALAB');
  patchBytes(image, HOME_UPDATE, '1d8e0110', '01c00810');
  // Relocate Computer's rows for creation, cursor restoration and selection.
  patchBytes(image, 0x147468, '48f2b471c1f2070151600421', '4cf28011c1f2080151600521');
  patchBytes(image, 0x14749A, '0328', '0428');
  patchBytes(image, 0x1474A6, '48f2b471c1f20701', '4cf28011c1f20801');
  patchBytes(image, 0x14753A, '48f2b470c1f20700', '4cf28010c1f20800');
  patchBytes(image, 0x147548, 'ccf7eefa', '55f08afd'); // BL to the Computer dispatcher at NATIVE_HOOK + 0x60.
  image.copyWithin(ROW_COPY, COMPUTER_ROWS, COMPUTER_ROWS + 32);
  w32(image, label, ROW_COPY + 32);
  w32(image, 0x7FFE, ROW_COPY + 36);
  image.set(hook.subarray(0, 0x100), NATIVE_HOOK);
  image.set(image.subarray(STUB, STUB + stub.length), NATIVE_STUB);
  image.set(encoder.encode('PXMLAB02'), NATIVE_HOOK + 0x100);
  w32(image, size, NATIVE_HOOK + 0x108);
  w32(image, C.crc32(image.subarray(MENU, MENU + size)), NATIVE_HOOK + 0x10C);
}

// The running Flash Tool protects the top 64 KiB. Keep that working rescue
// and put a newer normal-use Flash Tool in a separate updatable region.
function installFlashToolUpdate(image, app) {
  if (!app || !app.length || same(image.subarray(FL.RESCUE_OFF, FL.RESCUE_OFF + app.length), app)) return;
  const slot = image.subarray(TOOL_ENTRY, TOOL_ENTRY + TOOL_SIZE);
  if (tag(slot, TOOL_MARKER, 8) !== 'PXMLFT01' && !slot.every(byte => byte === 0xFF)) {
    throw new Error('The My Lab Flash Tool update would overwrite occupied flash');
  }
  const block = FL.rescueBlock(app, image.subarray(0, 0x1000));
  if (!block) throw new Error('Invalid My Lab Flash Tool');
  const table = 0xE000;
  w32(block, 0x60000000 + TOOL_ENTRY, table + 0x10);
  tableSum(block, table);
  block.set(encoder.encode('PXMLFT01'), TOOL_MARKER);
  slot.set(block);
}

function reserveSaveSlots(image) {
  const first = 0xA6C000, marker = 0xC64000, end = 0xC66000;
  if (tag(image, marker, 8) === 'PXMLSV01') return;
  if (!image.subarray(first, end).every(byte => byte === 0xFF)) {
    throw new Error('The My Lab save slots would overwrite occupied flash');
  }
  image.set(encoder.encode('PXMLSV01'), marker);
}

function installColdRescue(image, hook) {
  const code = hook?.subarray(0x100);
  if (!code?.length || code.length > 0x1000 || tag(code, 4, 8) !== 'PXMLCOLD') {
    throw new Error('Invalid My Lab cold boot hook');
  }
  const oldCall = image.subarray(COLD_CALL, COLD_CALL + 4);
  const sector = image.subarray(COLD_ENTRY, COLD_ENTRY + 0x1000);
  if (same(oldCall, hex(STOCK_COLD_CALL)) && sector.every(byte => byte === 0xFF)) {
    patchBytes(image, COLD_CALL, STOCK_COLD_CALL, PATCHED_COLD_CALL);
  } else if (!same(oldCall, hex(PATCHED_COLD_CALL)) || tag(sector, 4, 8) !== 'PXMLCOLD') {
    throw new Error('The My Lab cold boot hook would overwrite occupied flash');
  }
  sector.fill(0xFF);
  sector.set(code);
}

function removeColdRescue(image) {
  if (same(image.subarray(COLD_CALL, COLD_CALL + 4), hex(STOCK_COLD_CALL))) return;
  if (tag(image, COLD_ENTRY + 4, 8) !== 'PXMLCOLD') throw new Error('Unexpected My Lab cold boot code');
  patchBytes(image, COLD_CALL, PATCHED_COLD_CALL, STOCK_COLD_CALL);
  image.fill(0xFF, COLD_ENTRY, COLD_ENTRY + 0x1000);
  if (tag(image, TOOL_ENTRY + TOOL_MARKER, 8) === 'PXMLFT01') image.fill(0xFF, TOOL_ENTRY, TOOL_ENTRY + TOOL_SIZE);
}

function menuTemplate(rom, feld, stub) {
  const template = new Uint8Array(rom.length).fill(0xFF);
  template.set(rom.subarray(0, 0x1000));
  // cleanApply uses the Paradise edition to select defaults. Transfer only its
  // configured program and stub, never its edition or restart shim.
  const id = new DataView(template.buffer);
  id.setUint32(0xEFD000, 6, true);
  const footer = 0x96CB83B8 - 6;
  id.setUint32(0xEFDFF8, footer, true);
  id.setUint32(0xEFDFFC, ~footer, true);
  return F.cleanApply(template, {
    apps: [{ src: xip(STOCK_BOOT), name: 'MY LAB' }], noClock: true, spot: { feld: MENU, clock: 0 },
  }, { feld, stub });
}

// Each entry contains the stock animation layers and six references into the
// Lab's own sprite archive. The menu streams the referenced sprites into a
// selected slot and uses the same data to preview the appearance.
function gardenCatalog(image) {
  const assets = C.arc2Parse(image, ASSETS);
  const { characters, archives: [, entries] } = M.openRom(image, C, S);
  const spriteBase = ASSETS + assets.ents[1].offset;
  const palette = C.characterPaletteVariants(entries);
  if (!palette) throw new Error('Missing My Lab Garden palette');
  const rows = [];
  for (const donor of characters.values()) {
    const ghost = S.buildRomGhost(donor, C);
    if (!S.verifyGhost(ghost)) throw new Error('Invalid Garden catalog entry ' + donor.character.id);
    const row = new Uint8Array(GARDEN_ROW);
    row.set(ghost.subarray(0, GARDEN_HEADER));
    donor.sprites.forEach((index, part) => {
      const offset = u32(image, spriteBase + index * 4);
      w32(row, spriteBase + offset, GARDEN_HEADER + part * 8);
      w32(row, entries[index].length, GARDEN_HEADER + part * 8 + 4);
    });
    rows.push(row);
  }
  if (rows.length !== 173) throw new Error('Unexpected My Lab Garden catalog size');
  const body = concat(rows);
  const header = new Uint8Array(GARDEN_INDEX);
  header.set(encoder.encode('MLGC'));
  w32(header, 1, 4);
  w32(header, rows.length, 8);
  w32(header, GARDEN_ROW, 12);
  w32(header, spriteBase + u32(image, spriteBase + palette.index * 4) + palette.offset, 16);
  w32(header, C.crc32(body), 20);
  w32(header, assets.chk, 24);
  return concat([header, body]);
}

function installGarden(image) {
  const catalog = gardenCatalog(image);
  const old = image.subarray(GARDEN_CATALOG, GARDEN_CATALOG + catalog.length);
  if (same(catalog, old)) return;
  const legacyEnd = old.length - (GARDEN_INDEX - LEGACY_GARDEN_INDEX);
  const supported = tag(old, 0, 4) === 'MLGC' && u32(old, 4) === 1 &&
    u32(old, 8) === 173 && u32(old, 12) === GARDEN_ROW && (
      u32(old, 20) === C.crc32(old.subarray(GARDEN_INDEX)) ||
      (old.subarray(legacyEnd).every(byte => byte === 0xFF) &&
        u32(old, 20) === C.crc32(old.subarray(LEGACY_GARDEN_INDEX, legacyEnd)))
    );
  if ((!supported && !old.every(byte => byte === 0xFF)) ||
      !image.subarray(GARDEN_WORK, GARDEN_WORK_END).every(byte => byte === 0xFF)) {
    throw new Error('The My Lab Garden editor would overwrite occupied flash');
  }
  image.set(catalog, GARDEN_CATALOG);
}

function build(rom, boot, { feld, flashApp, hook, stub }) {
  if (!M.openRom(rom, C, S) || u32(rom, 8) !== 0x13 || u32(rom, 0x24) !== BOOT_CRC) {
    throw new Error('Expected a supported My Lab v1.0.00 dump');
  }
  const size = Math.ceil(feld.length / 0x1000) * 0x1000;
  if (!size || size > 0xE000) throw new Error('Invalid My Lab menu size');
  const regions = [[STUB, MENU + size], [STOCK_BOOT, STOCK_BOOT + BOOT_SIZE], [NATIVE_HOOK, NATIVE_HOOK + 0x1000]];
  if (flashApp) regions.push([FL.RESCUE_OFF, rom.length]);
  for (const [start, end] of regions) {
    if (start === STOCK_BOOT && boot.length === BOOT_SIZE &&
        rom.subarray(start, end).every((byte, i) => byte === 0xFF ||
          ((i < 0x8000 || (i >= 0xBF00 && i < 0xBF20)) && byte === boot[i]))) continue;
    if (!rom.subarray(start, end).every(byte => byte === 0xFF)) throw new Error('My Lab launcher would overwrite occupied flash');
  }
  if (boot.length !== BOOT_SIZE || C.crc32(boot) !== BOOT_CRC) throw new Error('My Lab boot CRC mismatch');
  const menu = menuTemplate(rom, feld, stub);

  const image = Uint8Array.from(rom);
  image.set(boot, STOCK_BOOT);
  image.set(menu.subarray(PARADISE_STUB, PARADISE_STUB + 0x1000), STUB);
  image.set(menu.subarray(MENU, MENU + size), MENU);
  w32(image, STUB, MENU + 0x140 + 32);
  w32(image, F.F_LAUNCH | F.F_APPS, MENU + 0x140 + 36);
  installNativeMenu(image, hook, stub, size);
  installGarden(image);
  if (flashApp) {
    const rescue = FL.rescueBlock(flashApp, rom.subarray(0, 0x1000));
    if (!rescue) throw new Error('Invalid My Lab Flash Tool');
    image.set(rescue, FL.RESCUE_OFF);
    tableSum(image, 0xFFE000);
    installColdRescue(image, hook);
    reserveSaveSlots(image);
    if (!M.isFlashImage(image, C)) throw new Error('Invalid My Lab boot or rescue layout');
  }
  return image;
}

function updateMenu(rom, { feld, stub, hook, flashApp }) {
  if (!M.isFlashImage(rom, C) || tag(rom, NATIVE_HOOK + 0x100, 8) !== 'PXMLAB02') {
    throw new Error('Expected a native My Lab image with the Computer menu and Flash Tool');
  }
  const size = Math.ceil(feld.length / 0x1000) * 0x1000;
  const oldSize = u32(rom, NATIVE_HOOK + 0x108);
  if (!size || size > 0xE000 || (size > oldSize &&
      !rom.subarray(MENU + oldSize, MENU + size).every(byte => byte === 0xFF))) {
    throw new Error('The new menu does not fit in the My Lab menu region');
  }
  const template = menuTemplate(rom, feld, stub);
  const image = Uint8Array.from(rom);
  const languageTables = C.arc2Files(C.arc2Files(image, ASSETS)[2], 0);
  const labelIndex = u32(image, ROW_COPY + 32);
  const labelStart = u16(languageTables[0], 2 * (labelIndex + 1));
  const label = C.txtWords({ b: languageTables[0], offs: [labelStart] }, 0);
  const expected = text => Array.from(text, letter => C.TXT_ENC[letter]);
  if (same(label, expected('PARAMIX'))) {
    w32(image, addMyLabLabel(image, 'PARALAB'), ROW_COPY + 32);
  } else if (!same(label, expected('PARALAB'))) {
    throw new Error('Unexpected My Lab Computer menu label');
  }
  image.fill(0xFF, MENU, MENU + oldSize);
  image.set(template.subarray(MENU, MENU + size), MENU);
  w32(image, STUB, MENU + 0x160);
  w32(image, F.F_LAUNCH | F.F_APPS, MENU + 0x164);
  w32(image, size, NATIVE_HOOK + 0x108);
  w32(image, C.crc32(image.subarray(MENU, MENU + size)), NATIVE_HOOK + 0x10C);
  installGarden(image);
  installColdRescue(image, hook);
  installFlashToolUpdate(image, flashApp);
  reserveSaveSlots(image);
  if (!M.isFlashImage(image, C)) throw new Error('Invalid My Lab menu or rescue layout');
  return image;
}

function bundled(binary) {
  return Uint8Array.from(atob(binary), c => c.charCodeAt(0));
}
const bins = () => ({
  feld: bundled('__MYLAB_MENU_B64__'), hook: bundled('__MYLAB_HOOK_B64__'),
  stub: bundled('__MYLAB_STUB_B64__'), flashApp: bundled('__MYLAB_FLASH_B64__'),
});

async function decryptBoot(rom, key, subtle = root.crypto?.subtle) {
  if (!subtle) throw new Error('This browser does not support local My Lab boot decoding');
  const aes = Uint8Array.from(rom.subarray(0x28, 0x48)).reverse();
  const material = new Uint8Array(16), zero = new Uint8Array(16);
  for (let i = 0; i < 16; i += 4) view(material).setUint32(i, key, false);
  for (let i = 0; i < 16; i++) material[i] ^= aes[i];
  const [ivKey, bootKey] = await Promise.all([
    subtle.importKey('raw', aes.subarray(16), 'AES-CBC', false, ['encrypt']),
    subtle.importKey('raw', aes, 'AES-CBC', false, ['encrypt', 'decrypt']),
  ]);
  // For a single block with a zero IV, the first CBC block is the ECB result.
  const encryptBlock = async (aesKey, block) =>
    new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: zero }, aesKey, block)).subarray(0, 16);
  const iv = await encryptBlock(ivKey, material);
  const code = new Uint8Array(BOOT_SIZE);
  const reverseBlocks = bytes => {
    for (let i = 0; i < bytes.length; i += 16) bytes.subarray(i, i + 16).reverse();
    return bytes;
  };
  for (let page = 0; page < BOOT_SIZE; page += 0x1000) {
    const input = new Uint8Array(0x1010);
    input.set(reverseBlocks(Uint8Array.from(rom.subarray(BOOT + page, BOOT + page + 0x1000))));
    // Add a CBC block that decrypts to a full padding block for Web Crypto.
    const padding = input.slice(0xff0, 0x1000).map(byte => byte ^ 16);
    input.set(await encryptBlock(bootKey, padding), 0x1000);
    const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv }, bootKey, input));
    code.set(reverseBlocks(plain), page);
  }
  return code;
}

function status(rom) {
  if (M.isParadiseFlashImage(rom, C)) return 'update';
  if (tag(rom, NATIVE_HOOK + 0x100, 8) === 'PXMLAB02' && M.isFlashImage(rom, C)) return 'update';
  if (M.isMyLab(rom) && u32(rom, 8) === 0x13 && u32(rom, 0x24) === BOOT_CRC &&
      tag(rom, NATIVE_HOOK + 0x100, 8) !== 'PXMLAB02' &&
      rom.subarray(NATIVE_HOOK, NATIVE_HOOK + 0x1000).every(byte => byte === 0xFF)) return 'install';
  return null;
}
const UART_DISPATCHER = 0x1AE000, UART_ROWS = UART_DISPATCHER + 0x100;
const UART_APP = 0x1AF000, UART_APP_CAPACITY = 0xE000;
const UART_STOCK_ROWS = COMPUTER_ROWS, UART_ROW_BYTES = 32;
const UPDATE_FIRST = 0x100000, UPDATE_LAST = 0xE00000, UPDATE_HEADER = 0x100;

function uartProbeRom(stock, entry, app, updatePayloadOnly = false, pram = null) {
  if (!updatePayloadOnly && status(stock) !== 'install') throw new Error('Open a stock My Lab v1.0.00 ROM');
  if (!entry.length || entry.length > UART_ROWS - UART_DISPATCHER ||
      app.length < 16 || app.length > UART_APP_CAPACITY ||
      !['PXMLRO01', 'PXMLBS01'].includes(tag(app, 8, 8))) throw new Error('Invalid My Lab UART tool');
  if (!stock.subarray(UART_DISPATCHER, UART_APP + UART_APP_CAPACITY)
      .every(byte => byte === 0xFF)) throw new Error('No free space for the UART tool');
  const rom = Uint8Array.from(stock);
  const label = addMyLabLabel(rom, 'UART');
  // The full ParaLab menu occupies Computer's fifth row. Put the temporary
  // UART launcher in that same slot so installing ParaLab replaces it in place.
  patchBytes(rom, 0x147468, '48f2b471c1f2070151600421', '4df20011c1f2090151600521');
  patchBytes(rom, 0x14749A, '0328', '0428');
  patchBytes(rom, 0x1474A6, '48f2b471c1f20701', '4df20011c1f20901');
  patchBytes(rom, 0x14753A, '48f2b470c1f20700', '4df20010c1f20900');
  patchBytes(rom, 0x147548, 'ccf7eefa', '66f05afd'); // BL to UART_DISPATCHER.
  rom.copyWithin(UART_ROWS, UART_STOCK_ROWS, UART_STOCK_ROWS + UART_ROW_BYTES);
  w32(rom, label, UART_ROWS + UART_ROW_BYTES);
  w32(rom, 0x7FFD, UART_ROWS + UART_ROW_BYTES + 4);
  rom.set(entry, UART_DISPATCHER);
  rom.set(app, UART_APP);
  if (pram && tag(app, 8, 8) === 'PXMLBS01') {
    if (pram.length !== BOOT_SIZE || C.crc32(pram) !== BOOT_CRC)
      throw new Error('My Lab boot CRC mismatch');
    // Only the lower native vectors/code and the stock disk dispatch table are needed.
    for (const [start, end] of [[0, 0x8000], [0xBF00, 0xBF20]]) {
      const source = pram.subarray(start, end);
      const dest = rom.subarray(STOCK_BOOT + start, STOCK_BOOT + end);
      if (!dest.every(byte => byte === 0xFF) && !same(dest, source))
        throw new Error('The SD driver would overwrite occupied My Lab flash');
      dest.set(source);
    }
  }
  return rom;
}

async function packUartUpdate(rom, pram, subtle = root.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto is unavailable');
  if (rom.length !== 0x1000000 || pram.length !== 0x10000 ||
      tag(rom, UPDATE_FIRST, 8) !== 'SN_FWIN\0' ||
      tag(rom, UPDATE_FIRST + 0xB0, 8) !== 'UBFWEXT\0') {
    throw new Error('Invalid My Lab update source');
  }
  const size = u32(rom, UPDATE_FIRST + 0xD4);
  if (size < 0x2000 || size > UPDATE_LAST - UPDATE_FIRST || size % 0x1000 ||
      !same(rom.subarray(UPDATE_FIRST, UPDATE_FIRST + 0x1000),
            rom.subarray(UPDATE_FIRST + size - 0x1000, UPDATE_FIRST + size))) {
    throw new Error('Invalid My Lab firmware length or trailer');
  }
  const iv = new Uint8Array(16);
  root.crypto.getRandomValues(iv);
  const key = await subtle.importKey('raw', Uint8Array.from(pram.subarray(0xBA24, 0xBA44)).reverse(),
    { name: 'AES-CTR' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 128 },
    key, rom.subarray(UPDATE_FIRST, UPDATE_FIRST + size)));
  const packageBytes = new Uint8Array(UPDATE_HEADER + size);
  const header = packageBytes.subarray(0, UPDATE_HEADER);
  header.set(encoder.encode('BTPUPPKG'));
  for (const [offset, value] of [[8, 0x10100], [0x0C, 1], [0x18, UPDATE_HEADER],
    [0x1C, size], [0x20, 0x60100000], [0x24, 0x60101000], [0x28, size - 0x1000]]) {
    w32(header, value, offset);
  }
  header.set(iv, 0x3C);
  header.set(rom.subarray(UPDATE_FIRST + 8, UPDATE_FIRST + 16), 0x6C);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  w32(header, checksum, 0x10);
  w32(header, -checksum >>> 0, 0x14);
  packageBytes.set(ciphertext, UPDATE_HEADER);
  const hmacKey = await subtle.importKey('raw', pram.subarray(0xBA44, 0xBA64),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  header.set(new Uint8Array(await subtle.sign('HMAC', hmacKey, packageBytes)), 0x4C);
  M.inspectUpdate(packageBytes);
  return packageBytes;
}

// A signed update already contains the entire writable firmware region. A
// decrypted boot PRAM supplies the separate encryption and authentication
// keys; neither key can be recovered from the update container itself.
async function patchUartUpdate(packageBytes, pram, entry, app, subtle = root.crypto?.subtle) {
  if (!subtle || pram.length !== BOOT_SIZE || C.crc32(pram) !== BOOT_CRC)
    throw new Error('A matching decrypted My Lab boot PRAM is required');
  const { size } = M.inspectUpdate(packageBytes);
  const header = Uint8Array.from(packageBytes.subarray(0, UPDATE_HEADER));
  const mac = header.slice(0x4C, 0x6C);
  header.fill(0, 0x4C, 0x6C);
  const authenticated = concat([header, packageBytes.subarray(UPDATE_HEADER)]);
  const hmacKey = await subtle.importKey('raw', pram.subarray(0xBA44, 0xBA64),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await subtle.verify('HMAC', hmacKey, mac, authenticated))
    throw new Error('My Lab update authentication does not match this boot PRAM');
  const aesKey = await subtle.importKey('raw', Uint8Array.from(pram.subarray(0xBA24, 0xBA44)).reverse(),
    { name: 'AES-CTR' }, false, ['decrypt']);
  const payload = new Uint8Array(await subtle.decrypt(
    { name: 'AES-CTR', counter: header.slice(0x3C, 0x4C), length: 128 },
    aesKey, packageBytes.subarray(UPDATE_HEADER)));
  if (payload.length !== size || tag(payload, 0, 8) !== 'SN_FWIN\0' ||
      tag(payload, 0xB0, 8) !== 'UBFWEXT\0' || u32(payload, 0xD4) !== size ||
      !same(payload.subarray(0, 0x1000), payload.subarray(size - 0x1000)))
    throw new Error('Authenticated update payload is not a supported My Lab firmware');
  const image = new Uint8Array(0x1000000).fill(0xFF);
  image.set(payload, UPDATE_FIRST);
  return packUartUpdate(uartProbeRom(image, entry, app, true, pram), pram, subtle);
}

async function createUartUpdate(rom, deviceKey, subtle = root.crypto?.subtle) {
  if (!/^(?:0x)?[0-9a-f]{8}$/i.test(deviceKey)) {
    throw new Error('Open the matching eight-digit My Lab device key');
  }
  const pram = await decryptBoot(rom, parseInt(deviceKey, 16), subtle);
  if (C.crc32(pram) !== BOOT_CRC) throw new Error('My Lab device key does not match this ROM');
  const target = uartProbeRom(rom, bundled('__MYLAB_UART_ENTRY_B64__'),
    bundled('__MYLAB_UART_WRITE_APP_B64__'), false, pram);
  return packUartUpdate(target, pram, subtle);
}
async function patchUartUpdateFromRom(packageBytes, rom, deviceKey, subtle = root.crypto?.subtle) {
  if (!/^(?:0x)?[0-9a-f]{8}$/i.test(deviceKey))
    throw new Error('Open the matching eight-digit My Lab device key');
  const pram = await decryptBoot(rom, parseInt(deviceKey, 16), subtle);
  return patchUartUpdate(packageBytes, pram, bundled('__MYLAB_UART_ENTRY_B64__'),
    bundled('__MYLAB_UART_WRITE_APP_B64__'), subtle);
}
async function apply(rom, key) {
  const mode = status(rom);
  if (mode === 'update' && M.hasParadisePortMarker(rom)) return updateParadiseImage(rom, paradiseBins());
  if (mode === 'update') return updateMenu(rom, bins());
  if (mode !== 'install') throw new Error('This My Lab ROM does not support menu installation');
  if (!/^(?:0x)?[0-9a-f]{8}$/i.test(key)) throw new Error('Open the matching eight-digit My Lab device key');
  return build(rom, await decryptBoot(rom, parseInt(key, 16)), bins());
}

const SETTINGS_SELECT = 0x148CDA;
const GAME_HEADER = 0x100000, GAME_PRAM = 0x101000, GAME_XIP = 0x111000, GAME_PORT = 0x19E000;
const BOOT_PORT = 0x45000;
const PARADISE_GAME_CRC_062 = 0x378CEC2E;
const PARADISE_GAME_CRC_063 = 0xC4579999;

function branch(from, to, link = false) {
  const delta = (to - from - 4) >>> 0;
  const sign = (delta >>> 24) & 1;
  const j1 = 1 ^ sign ^ ((delta >>> 23) & 1), j2 = 1 ^ sign ^ ((delta >>> 22) & 1);
  const instruction = new Uint8Array(4);
  w16(instruction, 0xF000 | (sign << 10) | ((delta >>> 12) & 0x3FF));
  w16(instruction, (link ? 0xD000 : 0x9000) | (j1 << 13) | (j2 << 11) | ((delta >>> 1) & 0x7FF), 2);
  return Array.from(instruction, byte => byte.toString(16).padStart(2, '0')).join('');
}

// The v1.0.00 layout decoder and a reserved slot in the port's native hook page.
const SETTINGS_LAYOUT_RETURN = GAME_XIP + 0x16274, SETTINGS_LAYOUT_CODE = NATIVE_HOOK + 0xB00;
const SETTINGS_CURSOR_Y = GAME_XIP + 0x16376;
const cursorYJump = branch(SETTINGS_CURSOR_Y, SETTINGS_LAYOUT_CODE + 0x60);
const layoutJump = branch(SETTINGS_LAYOUT_RETURN, SETTINGS_LAYOUT_CODE);
// My Lab's main layout pack, tables 4 and 5, contains the native object
// records used by both the renderer and animation coordinate lookups.
// Only edge-anchored navigation sprites in the retail v1.0.00 pack.
const menuArrows = [
  [12, 152, [0x79, 0x8C, 0x113, 0x145, 0x15E, 0x197, 0x19F, 0x255, 0x29F]],
  [12, 150, [0x207]],
  [13, 152, [0x7A, 0x8D, 0xA8, 0x114, 0x146, 0x206, 0x256]],
  [13, 150, [0x198, 0x2A0]],
  [14, 12, [0xC3, 0xD9, 0xEA]], [15, 148, [0xC4, 0xDA, 0xEB]],
  [14, 16, [0x168]], [15, 144, [0x169]],
  [14, 7, [0x178]], [15, 153, [0x179]],
  [14, 10, [0x20F]], [15, 150, [0x210]],
];
function layoutRecord(image, id) {
  const pack = ASSETS + u32(image, ASSETS + 20); // first ARC2 member
  const index = pack + 2 * u32(image, pack + 16);
  return pack + 2 * (u32(image, pack + 20) + u16(image, index + 2 * id));
}
// Main-pack anchors. Each group carries the original X, the sprite or text ID,
// and a signed shift. Keep icon stacks and right-aligned digits together.
const cornerLayout = [
  // Minigame score and timer plates and their live numbers.
  [0x1427, 15, 1594, 16, [0x2EF, 0x40D, 0x459]],
  [0x1427, 12, 1594, 16, [0x332, 0x3ED, 0x488, 0x4AD]],
  [0x2D1F, 15, 4197, 16, [0x2F0]],
  [0x2D1F, 12, 4199, 16, [0x334]],
  [0x2D1F, 12, 4202, 16, [0x3EE]],
  [0x2D1F, 15, 4203, 16, [0x40F]],
  [0x2D1F, 15, 4207, 16, [0x45A]],
  [0x2D1F, 12, 4208, 16, [0x48A]],
  [0x2D1F, 12, 4210, 16, [0x4AF]],
  [0x1427, 150, 1595, -16, [0x312, 0x33D, 0x427, 0x43E]],
  [0x1427, 151, 1595, -16, [0x333, 0x489, 0x4AE, 0x4DC]],
  [0x1427, 152, 1595, -16, [0x40E]],
  [0x2C97, 150, 4198, -16, [0x313]],
  [0x2C97, 151, 4200, -16, [0x335]],
  [0x2C97, 150, 4201, -16, [0x33E]],
  [0x2C97, 152, 4204, -16, [0x410]],
  [0x2C97, 150, 4205, -16, [0x428]],
  [0x2C97, 150, 4206, -16, [0x43F]],
  [0x2C97, 151, 4209, -16, [0x48B]],
  [0x2C97, 151, 4211, -16, [0x4B0]],
  [0x2C97, 151, 4212, -16, [0x4DD]],
  // Stacked charges, lives and item indicators. Move the entire row or column.
  [0x1487, 10, 1612, 16, [0x381]],
  [0x1487, 25, 1612, 16, [0x382]],
  [0x1487, 40, 1612, 16, [0x383]],
  [0x1407, 9, 1612, 16, [0x397, 0x398, 0x399]],
  [0x1487, 9, 1612, 16, [0x39A]],
  [0x1027, 12, 1745, 16, [0x4C7]],
  [0x1127, 30, 1745, 16, [0x4C8]],
  [0x1047, 12, 1745, 16, [0x4C9]],
  [0x1047, 30, 1745, 16, [0x4CA]],
  [0x1407, 12, 1763, 16, [0x506]],
  [0x1407, 34, 1763, 16, [0x507]],
  [0x1407, 56, 1763, 16, [0x508]],
  [0x1487, 12, 1760, 16, [0x509]],
  [0x1407, 12, 1760, 16, [0x50A]],
  [0x14C7, 34, 1760, 16, [0x50B]],
  [0x14C7, 56, 1760, 16, [0x50C]],
  [0x1407, 12, 1762, 16, [0x50D]],
  [0x1447, 12, 1762, 16, [0x50E]],
  // Shop item quantity, owned-item mark and purchase balance (coin, plate, text).
  [0x2D8F, 9, 4126, 16, [0xC5]],
  [0x1407, 9, 114, 16, [0xC6, 0xD7]],
  [0x1407, 12, 97, 16, [0xC7, 0xD8, 0xED]],
  [0x2D8F, 9, 4130, 16, [0xD6]],
  [0x2D8F, 9, 4134, 16, [0xEC]],
  [0x1407, 36, 73, 16, [0x1A8, 0x1B6]],
  [0x2D87, 62, 4161, 16, [0x1A9]],
  [0x1407, 12, 108, 16, [0x1AA, 0x1B8]],
  [0x2D87, 62, 4166, 16, [0x1B7]],
  [0x1407, 148, 53, -16, [0xEE]],
];

const cornerTextOffsets = { 0x2C97: 14, 0x2D1F: 16, 0x2D87: 14, 0x2D8F: 16 };

function updateLayoutChecksum(image) {
  const previous = u32(image, ASSETS + 4), next = C.arc2Checksum(image, ASSETS, u32(image, ASSETS + 8));
  w32(image, next, ASSETS + 4);
  if (tag(image, GARDEN_CATALOG, 4) === 'MLGC' && u32(image, GARDEN_CATALOG + 24) === previous)
    w32(image, next, GARDEN_CATALOG + 24);
}

function hasCornerLayout(image) {
  return u16(image, layoutRecord(image, 0xC5) + 2) === 25;
}
function withCornerLayout(image, enabled) {
  requireScreenFitPort(image);
  return editCornerLayout(image, enabled);
}
function editCornerLayout(image, enabled) {
  const fitted = hasCornerLayout(image);
  if (enabled === fitted) return image;
  const out = Uint8Array.from(image);
  for (const [type, x, asset, shift, ids] of cornerLayout) {
    for (const id of ids) {
      const at = layoutRecord(out, id);
      // Text IDs follow the optional fields encoded in the low mask bits.
      const assetAt = at + (cornerTextOffsets[type] || 6);
      if (u16(out, at) !== type || u16(out, assetAt) !== asset ||
          u16(out, at + 2) !== x + (fitted ? shift : 0))
        throw new Error('Unexpected My Lab corner layout at 0x' + at.toString(16));
      w16(out, x + (enabled ? shift : 0), at + 2);
    }
  }
  updateLayoutChecksum(out);
  return out;
}

// Remove eight centre columns and add four transparent pixels at each edge. Retain palette indices so selected and disabled
// rows still use their native colours. The source consists of two 64px cells per row.
function narrowMenuSprite(entry) {
  const h = C.spriteHeader(entry);
  if (h.sw !== 64 || h.iw !== 2 || h.numSprites !== h.ih * 2 ||
      h.flags !== 0xA7 || ![1, 2].includes(h.bpp)) throw new Error('Unexpected My Lab menu sprite');
  const { cells } = C.spriteDecode(entry, 0, true);
  const bits = 1 << h.bpp, count = h.numSprites;
  const header = new Uint8Array(h.pixOffset + 8 * count);
  header.set(entry.subarray(0, h.pixOffset));
  const parts = [header];
  let size = header.length;
  const tiles = new Map();
  for (let tile = 0; tile < count; tile++) {
    const raw = new Uint8Array(64 * h.sh * bits / 8);
    for (let i = 0; i < 64 * h.sh; i++) {
      const x = tile % 2 * 64 + i % 64;
      const sourceX = x < 64 ? x - 4 : x + 4;
      const index = sourceX < 0 || sourceX >= 128 ? h.transp : cells[tile][(i >> 6) * 64 + (sourceX & 63)];
      raw[i * bits >> 3] |= index << (i * bits % 8);
    }
    const data = C.rleEncode(raw).map(b => b ^ 0x53);
    const key = data.join();
    const offset = tiles.get(key) ?? size;
    w32(header, offset - h.pixOffset, h.pixOffset + 8 * tile);
    w32(header, data.length, h.pixOffset + 8 * tile + 4);
    if (tiles.has(key)) continue;
    tiles.set(key, offset);
    const padding = new Uint8Array((4 - data.length % 4) % 4);
    parts.push(data, padding);
    size += data.length + padding.length;
  }
  w32(header, size);
  return concat(parts);
}

const menuBarSprites = [58, 59, 60, 66, 67];
// One unused sector after the port adapter holds the original sprite entries,
// including custom palettes, so disabling the option restores them byte for byte.
const MENU_BAR_BACKUP = 0x1A0000;
function hasMenuBars(image) {
  return ['MBR1', 'MBR2'].includes(tag(image, MENU_BAR_BACKUP, 4));
}
const menuRowFields = [
  // Label, selection marker and unread badge in the four- and three-row lists.
  [0x07B, 0x07E, 0x2C87, 34], [0x083, 0x086, 0x1447, 22], [0x087, 0x08A, 0x1407, 24],
  [0x08E, 0x090, 0x2D97, 34], [0x094, 0x096, 0x1447, 22], [0x097, 0x099, 0x1407, 24],
  [0x09F, 0x0A1, 0x2C87, 36], [0x0A5, 0x0A7, 0x1447, 24],
  [0x4FB, 0x4FD, 0x2D97, 36], [0x501, 0x503, 0x1447, 24],
];
// Native text records omit the tracking field when its value is zero. Insert or
// remove its word in table 5 and relocate the word offsets in the table directory.
function restoreLegacyMenuTracking(pack) {
  const index = 2 * u32(pack, 16), data = 2 * u32(pack, 20);
  const cuts = [];
  for (const [first, last, type] of menuRowFields) {
    if (type >> 12 !== 2) continue;
    for (let id = first; id <= last; id++) {
      const at = data + 2 * u16(pack, index + 2 * id);
      if (u16(pack, at) !== (type | 8) || u16(pack, at + 8) !== 0xFFFE) throw new Error('Unexpected menu label spacing');
      w16(pack, type, at);
      cuts.push(at + 8);
    }
  }
  cuts.sort((a, b) => a - b);
  const parts = [];
  let previous = 0;
  for (const at of cuts) {
    parts.push(pack.subarray(previous, at));
    previous = at + 2;
  }
  parts.push(pack.subarray(previous));
  const result = concat(parts);
  for (let at = index; at < data; at += 2) {
    const offset = u16(pack, at), pos = data + 2 * offset;
    w16(result, offset - cuts.filter(cut => cut < pos).length, at);
  }
  for (let at = 24; at < u32(pack, 0) * 2; at += 4)
    w32(result, u32(pack, at) - cuts.length, at);
  return result;
}
function withMenuBars(image, enabled) {
  requireScreenFitPort(image);
  return editMenuBars(image, enabled);
}
function editMenuBars(image, enabled) {
  const legacy = tag(image, MENU_BAR_BACKUP, 4) === 'MBR1';
  if (enabled && legacy) return editMenuBars(editMenuBars(image, false), true);
  if (hasMenuBars(image) === enabled) return image;
  const out = Uint8Array.from(image), files = C.arc2Files(out, ASSETS), entries = C.packSplit(files[1]);
  const slot = out.subarray(MENU_BAR_BACKUP, MENU_BAR_BACKUP + 4096);
  if (enabled) {
    const originals = C.packJoin(menuBarSprites.map(id => entries[id]));
    if (originals.length + 12 > slot.length || !slot.every(b => b === 255))
      throw new Error('No space to preserve the original My Lab menu bars');
    slot.set(encoder.encode('MBR2'));
    w32(slot, originals.length, 4);
    w32(slot, C.crc32(originals), 8);
    slot.set(originals, 12);
    for (const id of menuBarSprites) entries[id] = narrowMenuSprite(entries[id]);
  } else {
    const size = u32(slot, 4), indexSize = menuBarSprites.length * 4;
    if (size < indexSize || size > slot.length - 12 || u32(slot, 12) !== indexSize)
      throw new Error('Invalid My Lab menu bar backup');
    const originals = slot.subarray(12, 12 + size);
    for (let i = 0; i < indexSize; i += 4) {
      const start = u32(originals, i), end = i + 4 === indexSize ? size : u32(originals, i + 4);
      if (start < indexSize || start + 24 > end || end > size || u32(originals, start) > end - start)
        throw new Error('Invalid My Lab menu bar backup');
    }
    if (C.crc32(originals) !== u32(slot, 8)) throw new Error('Invalid My Lab menu bar backup');
    const saved = C.packSplit(originals);
    menuBarSprites.forEach((id, index) => { entries[id] = saved[index]; });
    slot.fill(255);
  }
  if (legacy) files[0] = restoreLegacyMenuTracking(files[0]);
  files[1] = C.packJoin(entries);
  const assets = C.arc2Build(files), end = ASSETS + assets.length, oldEnd = ASSETS + 16 + u32(out, ASSETS + 8);
  if (end > ASSET_LIMIT || !out.subarray(oldEnd, end).every(b => b === 0))
    throw new Error('My Lab menu bars would overwrite occupied flash');
  out.set(assets, ASSETS);
  if (end < oldEnd) out.fill(0, end, oldEnd);
  for (const [first, last, type, x] of menuRowFields) {
    for (let id = first; id <= last; id++) {
      const at = layoutRecord(out, id);
      if (u16(out, at) !== type || u16(out, at + 2) !== x + (enabled ? 0 : legacy ? 16 : 4))
        throw new Error('Unexpected My Lab menu row ' + id.toString(16));
      w16(out, x + (enabled ? 4 : 0), at + 2);
    }
  }
  w32(out, C.arc2Checksum(out, ASSETS, assets.length - 16), ASSETS + 4);
  // Garden keeps absolute flash pointers to character sprites in this pack.
  if (tag(out, GARDEN_CATALOG, 4) === 'MLGC') installGarden(out);
  return out;
}

// The lab idle animation (169) uses signed horizontal destinations relative
// to object 0x155. Its cursor (0x15a) receives the same walk offsets.
function withLabWalkRange(image, enabled) {
  const object = layoutRecord(image, 0x155);
  const cursor = layoutRecord(image, 0x15A);
  const pack = ASSETS + u32(image, ASSETS + 20);
  const index = pack + 2 * u32(image, pack + 13 * 4);
  const script = pack + 2 * u32(image, pack + 14 * 4) + 4 * u16(image, index + 169 * 2);
  const x = u16(image, object + 2), cursorX = u16(image, cursor + 2), fitted = x === 122;
  if (u16(image, object) !== 0x5207 || u16(image, object + 6) !== 169 || (!fitted && x !== 130))
    throw new Error('Unexpected My Lab home character');
  if (u16(image, cursor) !== 0x5207 || u16(image, cursor + 6) !== 20 ||
      (cursorX !== 130 && !(fitted && cursorX === x)))
    throw new Error('Unexpected My Lab guest cursor');
  const stops = [[49, -80, -64], [109, -16, -8]];
  for (const [word, stock, inset] of stops) {
    const at = script + 2 * word;
    if (u16(image, at) !== 0x2C04 || u16(image, at + 2) !== 0x7FFF ||
        u16(image, at + 4) !== ((fitted ? inset : stock) & 0xFFFF) || u16(image, at + 6) !== 60)
      throw new Error('Unexpected My Lab home walk animation');
  }
  if (enabled === fitted && cursorX === x) return image;
  const out = Uint8Array.from(image);
  w16(out, enabled ? 122 : 130, object + 2);
  w16(out, enabled ? 122 : 130, cursor + 2);
  for (const [word, stock, inset] of stops) w16(out, enabled ? inset : stock, script + 2 * (word + 2));
  updateLayoutChecksum(out);
  return out;
}

// Some revisions have an earlier, removable form of the same correction.
function correctionNeedsChange(fit, image, enabled) {
  if (fit.applicable && !fit.applicable(image)) return false;
  return enabled ? !fit.has(image) : (fit.enabled || fit.has)(image);
}

// A mixed state preserves older ports with individually enabled corrections.
function screenFitState(image) {
  const parts = [hasMenuBars(image), hasSettingsLayout(image), hasCornerLayout(image)];
  if (parts.every(Boolean)) return true;
  return parts.some(Boolean) || screenCorrections.some(fit => correctionNeedsChange(fit, image, false)) ? null : false;
}
function screenFitChanged(image, enabled) {
  return enabled !== null && (screenFitState(image) !== enabled ||
    (enabled && (tag(image, MENU_BAR_BACKUP, 4) === 'MBR1' || hasLegacySettingsLayout(image) ||
      u16(image, layoutRecord(image, 0x155) + 2) !== 122 ||
      u16(image, layoutRecord(image, 0x15A) + 2) !== 122)) ||
    screenCorrections.some(fit => correctionNeedsChange(fit, image, enabled)));
}
function withScreenCorrections(image, enabled) {
  const pending = screenCorrections.filter(fit => correctionNeedsChange(fit, image, enabled));
  if (!pending.length) return image;
  // Several scenes share resources. Undo them in reverse order before restoring the original menu assets.
  const out = Uint8Array.from(image);
  for (const fit of enabled ? pending : pending.reverse()) fit.apply(out, enabled);
  updateLayoutChecksum(out);
  return out;
}
function editScreenFit(image, enabled, legacyCode) {
  const base = enabled ? image : withScreenCorrections(image, false);
  const layout = editCornerLayout(editSettingsLayout(editMenuBars(base, enabled), enabled, legacyCode), enabled);
  const walk = withLabWalkRange(layout, enabled);
  return enabled ? withScreenCorrections(walk, true) : walk;
}

const screenFitOperations = {
  'mylab-1.0.00-retail': legacyCode => ({
    status, state: screenFitState, prepareWheel: installParadiseWheel,
    normalizeSceneWheel: image => setSceneWheel(image, false),
    edit: (copy, on) => editScreenFit(copy, on, legacyCode),
  }),
};
function screenFitSupport(image, legacyCode, firmwareOnly = false) {
  return screenSupport.inspect(image, id => screenFitOperations[id]?.(legacyCode), firmwareOnly);
}
function requireScreenFitPort(image, legacyCode) {
  const compatibility = screenFitSupport(image, legacyCode);
  if (!compatibility.supported || compatibility.source !== 'paradise')
    throw new Error(compatibility.reason || 'Screen corrections require a supported My Lab on Paradise ROM');
  return compatibility.profileId;
}
function withScreenFit(image, enabled, legacyCode) {
  if (enabled === null) return image;
  const profileId = requireScreenFitPort(image, legacyCode);
  return screenFitOperations[profileId](legacyCode).edit(image, enabled);
}

function hasLegacySettingsLayout(image) {
  return same(image.subarray(SETTINGS_LAYOUT_RETURN, SETTINGS_LAYOUT_RETURN + 4), hex(layoutJump));
}
function hasSettingsLayout(image) {
  return u16(image, layoutRecord(image, 0x79) + 2) === 136 || hasLegacySettingsLayout(image);
}
function withSettingsLayout(image, enabled, legacyCode) {
  requireScreenFitPort(image, legacyCode);
  return editSettingsLayout(image, enabled, legacyCode);
}
function editSettingsLayout(image, enabled, legacyCode) {
  const legacy = hasLegacySettingsLayout(image);
  const fitted = u16(image, layoutRecord(image, 0x79) + 2) === 136;
  if (!legacy && fitted === enabled) return image;
  const out = Uint8Array.from(image);
  if (legacy) {
    const code = legacyCode || bundled('__MYLAB_SETTINGS_LAYOUT_B64__');
    const slot = out.subarray(SETTINGS_LAYOUT_CODE, SETTINGS_LAYOUT_CODE + code.length);
    if (!same(slot, code)) throw new Error('Unexpected My Lab firmware code at 0x' + SETTINGS_LAYOUT_CODE.toString(16));
    patchBytes(out, SETTINGS_LAYOUT_RETURN, layoutJump, '9df90500');
    patchBytes(out, SETTINGS_CURSOR_Y, cursorYJump, 'b0f90400');
    slot.fill(0xFF);
  }
  if (fitted !== enabled) {
    for (const [sprite, originalX, ids] of menuArrows) {
      const insetX = originalX + (sprite === 14 ? 16 : -16);
      for (const id of ids) {
        const record = layoutRecord(out, id);
        if (u16(out, record) !== 0x5207 || u16(out, record + 6) !== sprite ||
            u16(out, record + 2) !== (fitted ? insetX : originalX))
          throw new Error('Unexpected My Lab menu arrow at 0x' + record.toString(16));
        w16(out, enabled ? insetX : originalX, record + 2);
      }
    }
    updateLayoutChecksum(out);
  }
  return out;
}

function setSceneWheel(image, enabled = true) {
  const patches = [];
  // Poll in both the idle and animation states. Resume after the native
  // A-only latch write, leaving the B-confirm path in place.
  for (const [offset,original] of [[0x36080,'cff7b4fa48b1ffe7'],[0x361EC,'cff7fef948b1ffe7']]) {
    const call = GAME_XIP + offset;
    patches.push([offset,original,branch(call,GAME_PORT+0x3C,true) + branch(call+4,call+0x1A)]);
  }
  // Defer clearing the event until the native five-door cursor consumes it.
  patches.push([0x360CC,'82f85410','00bf00bf']);
  // r2 = scene. Add signed byte +0x54 to index +0x56, wrap in [0,4],
  // clear the latch, store the index, and resume the original animation.
  patches.push([0x3611A,'b2f95610013146f26763c6f2666381fb033c4fea5c0303ebdc7303eb8303c91aa2f85610','92f95430b2f95610c9180029b8bf04210529a8bf0021002382f85430a2f85610' + branch(GAME_XIP+0x3613A,GAME_XIP+0x3613E)]);
  // These scenes read A directly instead of using one of the shared widgets.
  const signedEdge = GAME_PORT + 0x40;
  for (const [offset, entry] of [[0x3892A,signedEdge], [0x39542,signedEdge],
    [0x3A39E,signedEdge], [0x3C6CA,signedEdge], [0x3B7EC,GAME_PORT+0x2C],
    [0x2DDC0,GAME_PORT+0x2C]]) {
    const call = GAME_XIP + offset;
    patches.push([offset,branch(call,GAME_XIP+0x55EC,true),branch(call,entry,true)]);
  }
  // Garden targets are a zero-terminated list at scene +0x60, immediately
  // before the cursor at +0x72. Wrap a negative step to the last live target.
  patches.push([0x38934,'ffe741f67420c1f601000268b2f872100131a2f872100068b0f8721000eb4100b0f8600048b9ffe741f67420c1f6010001680020a1f87200ffe7',
    '41f67422c1f601021268b2f87210091802f1600306d4092902d233f8110050b9002108e00021082905d2481c33f8100008b10131f7e7a2f87210']);
  // Equipment keeps the step in ip through its slot search. The carried-food
  // picker saves r7 in its prologue, so the step survives the selection sound.
  for (const offset of [0x3954C,0x3A3A8]) patches.push([offset,'ffe7','8446']); // mov ip,r0
  patches.push([0x3C6D0,'ffe7','0746']); // mov r7,r0
  for (const [offset,mask] of [[0x39572,3],[0x395C4,1],[0x3A3DC,3],[0x3C6E8,3]]) {
    const original = mask === 3 ? '013101eb917323f00303c91a' : '013101ebd17323f00103c91a';
    const addStep = offset === 0x3C6E8 ? '3944' : '6144'; // add r1,r7/ip
    patches.push([offset,original,addStep+'01f00'+mask+'0100bf00bf00bf']); // and r1,r1,#mask
  }
  for (const [offset,original,replacement] of patches) {
    const at = GAME_XIP + offset;
    const target = enabled ? replacement : original;
    if (!same(image.subarray(at, at + target.length / 2), hex(target)))
      patchBytes(image, at, enabled ? original : replacement, target);
  }
}

function installParadiseWheel(image) {
  const cursorEdge = GAME_PORT + 0x14, cursorRepeat = GAME_PORT + 0x18, advance = GAME_PORT + 0x1C;
  const heldKey = GAME_XIP + 0x584C;
  patchBytes(image, heldKey, '81b08df8', branch(heldKey, GAME_PORT + 0x20));
  const carousel = GAME_XIP + 0x5D7AE;
  patchBytes(image, carousel, 'a7f761ff', branch(carousel, GAME_PORT + 0x24, true));
  const homeEvent = GAME_XIP + 0x35BA4, homeCursor = GAME_XIP + 0x35BF8;
  patchBytes(image, homeEvent, 'cff722fd', branch(homeEvent, cursorEdge, true));
  patchBytes(image, homeCursor, '40f27460c1f60000', branch(homeCursor, GAME_PORT + 0x28, true) +
    branch(homeCursor + 4, GAME_XIP + 0x35C50));
  for (const [offset, oldCall] of [[0x368EC, 'cef77efe'], [0x36F18, 'cef768fb'], [0x376C8, 'cdf790ff']]) {
    const call = GAME_XIP + offset;
    patchBytes(image, call, oldCall, branch(call, GAME_PORT + 0x2C, true));
  }
  // Each widget keeps its native input gates, rendering and page transitions.
  // Replace its A event query and the following forward-only index update.
  const widgets = [
    [0x1F29C, 'e6f790f9', cursorRepeat, 0x1F2B4, 'b1f90020b1f90200431c93fb', 0, '', 0x1F2C8],
    [0x62C9C, 'a2f790fc', cursorRepeat, 0x62CCA, '4888013048800798b0f90010', 0, '', 0x62CE8],
    [0x636C6, 'a1f77bff', cursorRepeat, 0x636FE, '8888013088801598b0f90210b0f90400', 1, '8df84f00', 0x6377C],
    [0x63FD6, 'a1f709fb', cursorEdge, 0x6400E, '8888013088800b98b0f90210b0f90400', 2, '8df82700', 0x6405E],
    [0x63076, 'a2f7b9fa', cursorEdge, 0x630AE, 'c8880130c8800b98b0f90410b0f90600', 3, '8df82700', 0x630E4],
    [0x63BAE, 'a1f71dfd', cursorEdge, 0x63BE6, 'c8880130c8801198b0f90410b0f90600', 4, '8df83f00', 0x63C36],
  ];
  for (const [query, oldQuery, queryEntry, update, oldUpdate, layout, storeRedraw, resume] of widgets) {
    const event = GAME_XIP + query, cursor = GAME_XIP + update;
    patchBytes(image, event, oldQuery, branch(event, queryEntry, true));
    // MOV r0,r1; MOVS r1,#layout; BL adapter; optional STRB of the redraw flag.
    const skipFrom = cursor + 8 + storeRedraw.length / 2;
    const loadArgs = '0846' + layout.toString(16).padStart(2, '0') + '21';
    patchBytes(image, cursor, oldUpdate, loadArgs +
      branch(cursor + 4, advance, true) + storeRedraw + branch(skipFrom, GAME_XIP + resume));
  }
}

async function installParadiseGame(image, gamePort, subtle) {
  if (!gamePort.length || gamePort.length > 0x1000 || [BOOT_PORT, GAME_PORT].some(offset =>
      !image.subarray(offset, offset + 0x1000).every(byte => byte === 0xFF))) {
    throw new Error('The Paradise game adapter does not fit in the available flash region');
  }
  const key = await subtle.importKey('raw', image.slice(STOCK_BOOT + 0xBA64, STOCK_BOOT + 0xBA84).reverse(),
    'AES-CTR', false, ['decrypt']);
  const counter = image.slice(GAME_HEADER + 0x104, GAME_HEADER + 0x114);
  const core = new Uint8Array(await subtle.decrypt({ name: 'AES-CTR', counter, length: 128 },
    key, image.subarray(GAME_PRAM, GAME_PRAM + 0xF000)));
  if (C.crc32(core) !== 0xCD61EB78) throw new Error('Unexpected My Lab game PRAM revision');
  // The Paradise LCD tearing interrupt is on P1.10 instead of P1.12.
  patchBytes(core, 0x2540, '000b', '800a');
  patchBytes(core, 0x2560, '4ff48050', '4ff48060');
  patchBytes(image, STOCK_BOOT + 0x2150, '000b', '800a');
  patchBytes(image, STOCK_BOOT + 0x2170, '4ff48050', '4ff48060');
  image.set(core, GAME_PRAM);
  // The stock launcher already has a plain PRAM copy path.
  patchBytes(image, 0x164A0, '3cd0', '3ce0');
  image.set(gamePort, BOOT_PORT);
  image.set(gamePort, GAME_PORT);
  // Replace the LCD init in both the My Lab loader and the game itself.
  patchBytes(image, 0x1A7A8, 'b0b582b0', branch(0x1A7A8, BOOT_PORT + 8));
  patchBytes(image, GAME_XIP + 0x12400, 'b0b582b0', branch(GAME_XIP + 0x12400, GAME_PORT + 8));
  // The stock startup writes the P0 pad register again after LCD init.
  // Install the Paradise value there too, before the first key sample.
  patchBytes(image, GAME_XIP + 0x44F12, 'c1f21050', 'c1f25550');
  // Stock game startup selects SPI0 pin group 0, which owns A/B on
  // Paradise. Select the alternate Paradise group before any transfer.
  patchBytes(image, GAME_XIP + 0x536D4, '0021', '0121');
  patchBytes(image, 0x26CD0, '1c20', '1a20');
  patchBytes(image, 0x26CFC, '1c20', '1a20');
  patchBytes(image, 0x26D0A, '1c20', '1a20');
  patchBytes(image, 0x26CDC, '80b582b0', branch(0x26CDC, BOOT_PORT));
  const present = GAME_XIP + 0x537A4, waitForFrame = GAME_XIP + 0x537C0, readPin = GAME_XIP + 0x68AB6;
  patchBytes(image, GAME_XIP + 0x53798, '1c20', '1a20');
  patchBytes(image, present, '80b582b0', branch(present, GAME_PORT));
  // RGB565 is already on the wire when present returns. The stock getter
  // reads native DMA state from the driver that the adapter bypasses.
  patchBytes(image, GAME_XIP + 0x53790, '80b5c1f7', '00207047');
  patchBytes(image, waitForFrame, '80b500bf', branch(waitForFrame, GAME_PORT + 0x10));
  patchBytes(image, readPin, '42f2915c', branch(readPin, GAME_PORT + 4));
  installParadiseWheel(image);
  setSceneWheel(image);
  installParadiseP23(image);
  installParadiseMutedNotes(image);
  // The sleep transition configures the inputs separately from the final
  // wake-mask setup. Move both paths to the Paradise GPIO bank.
  for (const [offset, stock, paradise] of [
    [0x1C426, '1d20', '0a20'], [0x1C43A, '1e20', '0b20'], [0x1C446, '1f20', '0920'],
    [0x67DB4, '1d20', '0a20'], [0x67DC0, '1e20', '0b20'], [0x67DC8, '1f20', '0920'],
  ]) patchBytes(image, GAME_XIP + offset, stock, paradise);
  installParadiseSleep(image);
}

// Native Paradise board init configures P2.3 as an input in mode 1.
// My Lab drives this pin low in mode 0 during both loader and game boot.
// Match the Paradise call arguments at the source, before the pin is driven.
function installParadiseP23(image) {
  for (const [at, stock, paradise] of [
    [0x22092, '0299039b23201a46', '029a039b23201946'],
    [GAME_XIP + 0x44E04, '0799089b23201a46', '079a089b23201946'],
  ]) {
    if (!same(image.subarray(at, at + 8), hex(paradise)))
      patchBytes(image, at, stock, paradise);
  }
}

// Keep the note duration and sequencer state even when its computed pulse
// width is zero. The native rest branch turns off a preceding audible note.
function installParadiseMutedNotes(image) {
  const at = GAME_XIP + 0x6896E;
  // CBZ r0,0x6897c; LDR r2,[sp,#32]; STR r0,[r2,#20]; LDR r0,[sp,#36].
  const mutedRest = '28b1089a50610998';
  if (!same(image.subarray(at, at + 8), hex(mutedRest)))
    patchBytes(image, at, '089a014609985161', mutedRest);
}

function installParadiseSleep(image, hasParkHook = false, hasWheelWakeHook = false) {
  // Restore the stock scheduler when upgrading the 60-second experiment.
  const branchOffset = GAME_XIP + 0x1C48C, delayOffset = GAME_XIP + 0x1C494;
  const rtcTest = same(image.subarray(branchOffset, branchOffset + 2), hex('00bf'));
  patchBytes(image, branchOffset, rtcTest ? '00bf' : '05d2', '05d2');
  patchBytes(image, delayOffset, rtcTest ? '3c30' : '0230', '0230');
  // Replace the board shutdown for each native power mode.
  for (const [entryOffset, prologue, offset] of [
    [0x1C2A8, '80b584b0', 0x1C2F2], [0x1C308, '80b582b0', 0x1C328],
    [0x1C398, '80b586b0', 0x1C40C], [0x1C420, '80b586b0', 0x1C4A6],
    [0x1C4BC, '80b582b0', 0x1C4FA],
  ]) {
    const call = GAME_XIP + offset;
    // Restore the prologue in images carrying the 0.1.68 entry diagnostic.
    const entry = GAME_XIP + entryOffset, jump = branch(entry, call);
    patchBytes(image, entry, same(image.subarray(entry, entry + 4), hex(jump)) ? jump : prologue, prologue);
    const park = branch(call, GAME_PORT + 0x30, true);
    patchBytes(image, call, hasParkHook ? park : branch(call, GAME_XIP + 0x55B44, true), park);
  }
  const lcdSleep = GAME_XIP + 0x14CB4, panel = branch(lcdSleep, GAME_PORT + 0x38);
  if (!same(image.subarray(lcdSleep, lcdSleep + 4), hex(panel)))
    patchBytes(image, lcdSleep, '10b582b0', panel);
  const snapshot = GAME_XIP + 0x67DCE;
  const wheelWake = branch(snapshot, GAME_PORT + 0x34, true);
  patchBytes(image, snapshot, hasWheelWakeHook ? wheelWake : '00f0cbff', wheelWake);
}

function updateParadiseImage(rom, { feld, gamePort, stub, flashApp }) {
  if (!M.isParadiseFlashImage(rom, C) || !gamePort.length || gamePort.length > 0x1000)
    throw new Error('Invalid Paradise boot or rescue layout');
  const compatibility = screenFitSupport(rom);
  if (compatibility.profileId !== 'mylab-1.0.00-retail')
    throw new Error('Unsupported My Lab firmware for Paradise port updates');
  // Upgrade earlier cameras before checking the boot and game adapters.
  // The standalone experiment also needs its adapter hook restored.
  if (compatibility.supported && labPan.isLegacy(rom)) {
    const migrated = Uint8Array.from(rom);
    labPan.apply(migrated, true);
    rom = migrated;
  }
  const adapter = new Uint8Array(0x1000).fill(0xFF);
  adapter.set(gamePort);
  const bootAdapter = rom.subarray(BOOT_PORT, BOOT_PORT + adapter.length);
  const gameAdapter = rom.subarray(GAME_PORT, GAME_PORT + adapter.length);
  const oldCrc = C.crc32(gameAdapter);
  const current = same(gameAdapter, adapter);
  if (!same(bootAdapter, gameAdapter) ||
      (!current && oldCrc !== PARADISE_GAME_CRC_062 && oldCrc !== PARADISE_GAME_CRC_063 &&
       ![0x240AA59A, 0x238F6826, 0x3105BF25, 0x3559256E, 0xE0722EA2, 0x8D1A5666, 0x23F0417B, 0x59D8A174, 0x752BE1D5, 0x365F6437, 0x33A78456, 0xE7EE2CF1, 0xB5EC9F70, 0x4E6E4393, 0x36E7C760].includes(oldCrc)))
    throw new Error('Unexpected My Lab firmware code at 0x' + GAME_PORT.toString(16));

  const oldSize = u32(rom, 0x14);
  const size = Math.ceil(feld.length / 0x1000) * 0x1000;
  if (!size || size > 0xE000 || (size > oldSize &&
      !rom.subarray(MENU + oldSize, MENU + size).every(byte => byte === 0xFF))) {
    throw new Error('The Paradise menu does not fit in the My Lab menu region');
  }
  const template = menuTemplate(rom, feld, stub);
  const image = Uint8Array.from(rom);
  if (tag(rom, NATIVE_HOOK + 0x108, 8) === 'PXMLSLPD' &&
      C.crc32(image.subarray(0x110000, 0x111000)) === 0xD24EFE8B) {
    // Restore the native wake handler from the earlier trace image.
    image.set(hex('11e0'), 0x11048E);
    image.set(hex('fff7ccff'), 0x11052C);
    image.fill(0xFF, 0x11060C, 0x111000);
  }
  if (C.crc32(image.subarray(0x110000, 0x111000)) !== 0xFFC5881E)
    throw new Error('Unexpected deep power-down handler');
  if (compatibility.supported && gamesFit.upgradePresenter(image)) updateLayoutChecksum(image);
  image.fill(0, NATIVE_HOOK + 0x108, NATIVE_HOOK + 0x110);
  setSceneWheel(image);
  installParadiseP23(image);
  installParadiseMutedNotes(image);
  installParadiseSleep(image, oldCrc !== PARADISE_GAME_CRC_062, oldCrc !== PARADISE_GAME_CRC_062 && oldCrc !== PARADISE_GAME_CRC_063);
  if (!current) {
    image.set(adapter, BOOT_PORT);
    image.set(adapter, GAME_PORT);
  }
  image.fill(0xFF, MENU, MENU + oldSize);
  image.set(template.subarray(MENU, MENU + size), MENU);
  w32(image, STUB, MENU + 0x160);
  w32(image, F.F_LAUNCH | F.F_APPS, MENU + 0x164);
  w32(image, size, 0x14);
  w32(image, C.crc32(image.subarray(MENU, MENU + size)), 0x24);
  tableSum(image, 0);
  if (flashApp) {
    const rescue = FL.rescueBlock(flashApp, image.subarray(0, 0x1000));
    if (!flashApp.length || !rescue) throw new Error('Invalid Paradise Flash Tool');
    const table = 0xFFE000;
    image.set(rescue.subarray(0, table - FL.RESCUE_OFF), FL.RESCUE_OFF);
    w32(image, C.crc32(image.subarray(FL.RESCUE_OFF, table)), table + 0x24);
    tableSum(image, table);
  }
  if (!M.isParadiseFlashImage(image, C)) throw new Error('Invalid Paradise boot or rescue layout');
  return image;
}

async function forParadise(rom, { feld, flashApp, hook, gamePort, stub }, backup, subtle = root.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto is unavailable');
  const backupEdition = backup && validateParadiseBackup(backup);
  if (!screenFitSupport(rom, null, true).portSupported ||
      !M.isFlashImage(rom, C) || tag(rom, NATIVE_HOOK + 0x100, 8) !== 'PXMLAB02' ||
      C.crc32(rom.subarray(STOCK_BOOT, STOCK_BOOT + BOOT_SIZE)) !== BOOT_CRC) {
    throw new Error('Expected a My Lab v1.0.00 image with the Computer menu and Flash Tool');
  }
  const size = Math.ceil(feld.length / 0x1000) * 0x1000;
  const oldSize = u32(rom, NATIVE_HOOK + 0x108);
  if (!size || size > 0xE000 || (size > oldSize &&
      !rom.subarray(MENU + oldSize, MENU + size).every(byte => byte === 0xFF))) {
    throw new Error('The Paradise menu does not fit in the My Lab menu region');
  }
  if (!hook || hook.length <= 0x70 || hook.length > 0x100) throw new Error('Invalid Paradise menu hook');
  const image = Uint8Array.from(rom);
  const template = menuTemplate(rom, feld, stub);
  image.fill(0xFF, MENU, MENU + oldSize);
  image.set(template.subarray(MENU, MENU + size), MENU);
  w32(image, STUB, MENU + 0x160);
  w32(image, F.F_LAUNCH | F.F_APPS, MENU + 0x164);
  image.set(hook, NATIVE_HOOK);
  patchBytes(image, SETTINGS_SELECT, 'caf725ff', branch(SETTINGS_SELECT, NATIVE_HOOK + 0x70, true));
  image.set(encoder.encode('PXMLABP1'), NATIVE_HOOK + 0x100);
  image.fill(0, NATIVE_HOOK + 0x108, NATIVE_HOOK + 0x110);
  removeColdRescue(image);
  await installParadiseGame(image, gamePort, subtle);
  installGarden(image);

  // Keep ParaLab as the boot entry so it can check the recovery key before
  // handing off to the relocated My Lab loader.
  image.set(template.subarray(0, 0x1000));
  w32(image, C.crc32(image.subarray(MENU, MENU + size)), 0x24);
  tableSum(image, 0);
  const rescue = FL.rescueBlock(flashApp, image.subarray(0, 0x1000));
  if (!rescue) throw new Error('Invalid Paradise Flash Tool');
  image.set(rescue, FL.RESCUE_OFF);
  tableSum(image, 0xFFE000);
  if (backup) {
    const offset = M.PARADISE_BACKUP_OFFSET;
    image.set(encoder.encode('PXMLPB01'), offset);
    w32(image, C.crc32(backup.subarray(0, 0x1000)), offset + 8);
    image.set(new Uint8Array(await subtle.digest('SHA-256', backup)), offset + 12);
    w32(image, backupEdition.at, offset + 44);
    w32(image, C.crc32(backup.subarray(backupEdition.at, backupEdition.at + 0x1000)), offset + 48);
  }
  if (!M.isParadiseFlashImage(image, C)) throw new Error('Invalid Paradise boot or rescue layout');
  return image;
}

function validateParadiseBackup(backup) {
  if (backup.length !== FL.FLASH_SIZE || M.isMyLab(backup) || M.isFlashImage(backup, C) ||
      M.hasParadisePortMarker(backup) || F.isClean(backup))
    throw new Error('Choose an original Paradise ROM backup from this device');
  const edition = F.edition(backup);
  if (!edition)
    throw new Error('Choose an original Paradise ROM backup from this device');
  C.openRom(backup);
  C.verifyRom(backup, []);
  return edition;
}

function paradiseBins() {
  return {
    feld: bundled('__MYLAB_PARADISE_MENU_B64__'), flashApp: bundled('__MYLAB_PARADISE_FLASH_B64__'),
    hook: bundled('__MYLAB_PARADISE_HOOK_B64__'), gamePort: bundled('__MYLAB_PARADISE_GAME_B64__'),
    stub: bundled('__MYLAB_STUB_B64__'),
  };
}

async function createParadiseImage(rom, backup, key) {
  if (!screenFitSupport(rom, null, true).portSupported)
    throw new Error('Unsupported My Lab firmware for Paradise porting');
  if (status(rom) === 'install') rom = await apply(rom, key);
  return forParadise(rom, paradiseBins(), backup);
}

root.ParamixMyLabMenu = { screenFitSupport, screenFitState, screenFitChanged, withScreenFit, hasMenuBars, withMenuBars, hasCornerLayout, withCornerLayout, hasLegacySettingsLayout, hasSettingsLayout, withSettingsLayout, forParadise, createParadiseImage, validateParadiseBackup, build, updateMenu, updateParadiseImage, installGarden, removeColdRescue, tableSum, patchBytes, addMyLabLabel, menuTemplate, decryptBoot, status, apply, uartProbeRom, packUartUpdate, patchUartUpdate, patchUartUpdateFromRom, createUartUpdate };
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabMenu;
})(typeof window !== 'undefined' ? window : globalThis);
