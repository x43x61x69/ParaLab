/* Native Paradise and My Lab text resources. Language slots are part of the
 * firmware, Lab Item ARC2, and visitor packet formats. */
(function (root) {
'use strict';

const core = root.ParamixCore || (typeof require === 'function' && require('./core.js'));
const items = root.ParaLabItems || (typeof require === 'function' && require('./lab_items.js'));
const zh = root.ParaLabZh || (typeof require === 'function' && require('./zh_converter.js'));
const neon = root.ParamixNeonTransplant ||
  (typeof require === 'function' && require('../six/experimental-neon/transplant.js'));

// Reference menu text from stock Paradise (Land), Neon Planets and My Lab.
const gameTerms = /*__GAME_TERMS__*/ {};
function referenceTerm(profile, key, locale) {
  const terms = gameTerms[profile]?.[key] || (profile === 'neon' ? gameTerms.paradise?.[key] : undefined);
  return terms?.[locale === 'zh-Hant' ? 'zh-Hans' : locale] || terms?.en || '';
}

function referenceField(type, locale) {
  const names = gameTerms.fields?.[type];
  return names?.[locale === 'zh-Hant' ? 'zh-Hans' : locale] || names?.en || '';
}

// Reviewed Taiwan wording for ROM labels where character conversion alone is not idiomatic.
const taiwanTerms = new Map([
  ['用户信息', '使用者資訊'],
  ['用戶信息', '使用者資訊'],
  ['设置', '設定'],
  ['設置', '設定'],
  ['研究记录', '研究紀錄'],
  ['拓麻文件', '拓麻檔案'],
]);
const taiwanTextCache = new Map();
function taiwanText(text) {
  if (!text || !/\p{Script=Han}/u.test(text)) return text;
  if (!taiwanTextCache.has(text)) {
    if (taiwanTextCache.size >= 4096) taiwanTextCache.clear();
    taiwanTextCache.set(text, taiwanTerms.get(text) || zh.convertText(text, 'tw'));
  }
  return taiwanTextCache.get(text);
}

const LOCALES = Object.freeze([
  ['ja', '日本語'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['pt', 'Português'], ['es', 'Español'], ['it', 'Italiano'], ['zh-Hans', '简体中文'], ['ko', '한국어'],
].map(Object.freeze));
const slots = new Map(LOCALES.map(([locale], i) => [locale, i]));
const chineseSlot = slots.get('zh-Hans'), englishSlot = slots.get('en');
const romArchives = new WeakMap();
const myLabBase = 0x211000, myLabBootBase = 0x51000;
const arcMagic = 0x32435241;
const labMarker = 'PSID_YD03_MYLAB_CHARA';

function myLabLayout(rom) {
  if (rom.length !== 0x1000000) return false;
  const bytes = rom.subarray(0x18B7B3, 0x18B7B3 + labMarker.length);
  return String.fromCharCode(...bytes) === labMarker;
}

function archiveAt(rom, base) {
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  function validArc(offset, entries, limit) {
    if (offset + 16 > limit || view.getUint32(offset, true) !== arcMagic ||
        view.getUint32(offset + 12, true) !== entries) return false;
    const size = view.getUint32(offset + 8, true);
    return size >= 16 * entries && offset + 16 + size <= limit;
  }
  if (!validArc(base, base === myLabBase ? 24 : 3, rom.length)) return null;
  const dataEnd = base + 16 + view.getUint32(base + 8, true);
  const entry = base + 16 + 2 * 16;
  const textOffset = base + view.getUint32(entry + 4, true);
  const textSize = view.getUint32(entry + 12, true);
  if (textOffset < entry + 16 || textOffset + textSize > dataEnd ||
      !validArc(textOffset, LOCALES.length, textOffset + textSize)) return null;
  const filesEnd = 16 + view.getUint32(textOffset + 8, true);
  for (let i = 0; i < LOCALES.length; i++) {
    const slot = textOffset + 16 * (i + 1);
    const flags = view.getUint32(slot, true), offset = view.getUint32(slot + 4, true);
    const size = view.getUint32(slot + 12, true);
    if (flags || offset < 16 * (1 + LOCALES.length) || size < 2 || offset + size > filesEnd) return null;
  }
  const tables = core.textTablesOf(rom, base)?.tabs;
  return tables ? { tables, base, text: new Map() } : null;
}

function archive(rom, type) {
  if (!(rom instanceof Uint8Array)) return null;
  let item = romArchives.get(rom);
  if (!item) {
    const myLab = myLabLayout(rom);
    item = { myLab, main: archiveAt(rom, myLab ? myLabBase : core.ASSET_BASE) };
    romArchives.set(rom, item);
  }
  if (type !== 'boot') return item.main;
  if (item.boot === undefined) item.boot = item.myLab ? archiveAt(rom, myLabBootBase) : null;
  return item.boot;
}

function decode(words, nativeGlyph) {
  let result = '';
  for (const code of words || []) {
    if (!code) break;
    if (code === 0xf000) result += ' ';
    else if (code !== 1 && code < 0xf000) result += nativeGlyph?.(code) ?? items.nameGlyph(code);
  }
  return result.trim();
}

function isChinese(locale) { return locale === 'zh-Hans' || locale === 'zh-Hant'; }

/** Pick a localized name in an item's or visitor's language slots. */
function name(names, locale, options = {}) {
  const { fallback = true, rom } = typeof options === 'boolean' ? { fallback: options } : options;
  const archiveData = isChinese(locale) && rom ? archive(rom) : null;
  const glyph = archiveData ? chineseGlyph(rom, archiveData) : null;
  const value = entry => typeof entry === 'string' ? entry.trim() : decode(entry, glyph);
  const index = locale === 'zh-Hant' ? chineseSlot : slots.get(locale);
  const selected = value(names?.[index]);
  if (selected || !fallback) return selected;
  return value(names?.[englishSlot]) || value(names?.[0]);
}

function chineseGlyph(rom, data) {
  if (data.glyph === undefined) {
    try { data.glyph = zh.romTraditionalGlyph(rom, { boot: data.base === myLabBootBase }); }
    catch (_) { data.glyph = null; }
  }
  return data.glyph;
}

/** Select a game's native string by its one-based text table row. */
function text(rom, row, locale, { archive: type, fallback = true } = {}) {
  const data = archive(rom, type);
  if (!data || !Number.isInteger(row) || row < 1 || row > data.tables[englishSlot].n) return '';
  const key = `${locale}:${row}:${fallback}`;
  if (data.text.has(key)) return data.text.get(key);
  const index = locale === 'zh-Hant' ? chineseSlot : slots.get(locale);
  const glyph = isChinese(locale) ? chineseGlyph(rom, data) : null;
  const rowText = slot => {
    const table = data.tables[slot];
    const start = table?.offs[row];
    if (!table || row > table.n - Number(!table.native) || !start || 2 * start >= table.b.length) return '';
    return decode(core.txtWords(table, row), slot === chineseSlot ? glyph : null);
  };
  let value = rowText(index);
  if (!value && fallback) value = rowText(englishSlot) || rowText(0);
  data.text.set(key, value);
  return value;
}

const paradiseRows = {
  labLog: 2, miniGames: 3, shop: 4, settings: 7, userInfo: 8, mission: 9, tamaFile: 10,
  item: 19, brightness: 28, sound: 29, dateTime: 30, display: 31, connection: 35,
  decoPlanet: 37, planetLevel: 39, playdate: 40, gifts: 41, download: 43, downloadList: 44,
  food: 52, snacks: 53, outsideToy: 54, decoration: 55, eggHunt: 57, cleanPoop: 58,
};
const myLabRows = {
  settings: 37, userInfo: 35, brightness: 7, sound: 8, dateTime: 9, display: 10, connection: 36,
  decoPlanet: 15, playdate: 27, food: 17, outsideToy: 18, decoration: 19, eggHunt: 21,
  computer: 26, fieldwork: 29, laboratory: 30, partTimeJob: 31, craftRoom: 32,
  garden: 33, shop: 34, labLog: 49, labInvite: 71, update: 75,
};
const gotchiPointsRows = [0, 178, 178, 178, 0, 183, 183, 183, 190];

/** Native edition-specific menu terms used in the web UI. */
function term(rom, key, locale) {
  const data = archive(rom);
  if (!data) return '';
  const edition = core.editionIdOf(rom);
  const rows = data.base === myLabBase ? myLabRows : paradiseRows;
  let row = Object.hasOwn(rows, key) ? rows[key] : 0;
  if (rows === paradiseRows && key === 'gotchiPoints') row = gotchiPointsRows[edition];
  if (rows === paradiseRows && (key === 'specialFood' || key === 'getFood')) {
    const installed = root.ParamixSpecialFood?.inspect(rom);
    const firstRow = edition === 8 ? 80 : installed ? installed.label + 1 : 0;
    if (firstRow) row = firstRow + Number(key === 'getFood');
  }
  return row ? text(rom, row, locale) : '';
}

/** Native field or planet name, based on the firmware edition and field type. */
function field(rom, type, locale) {
  if (!Number.isInteger(type) || type < 1 || type > 9) return '';
  const data = archive(rom);
  if (!data) return '';
  if (data.base === myLabBase) return text(rom, 166 + type, locale);
  const edition = core.editionIdOf(rom);
  let row;
  if (type >= 7) row = neon?.planetTextRows(rom)[type - 7];
  else if (edition === 8) row = [64, 65, 66, 0, 0, 75][type - 1];
  else if (edition >= 5) row = [64, 65, 66, 16, 14, 15][type - 1];
  else if (edition === 4) row = [14, 15, 66, 16][type - 1];
  else if (edition >= 1 && type <= 3) row = 13 + type;
  return row ? text(rom, row, locale) : '';
}

root.ParaLabRomLocale = { LOCALES, decode, name, text, term, referenceTerm, field, referenceField, taiwanText };
if (typeof module !== 'undefined') module.exports = root.ParaLabRomLocale;
})(typeof window !== 'undefined' ? window : globalThis);
