/* Downloaded Paradise Lab Items in flash and standalone ARC2 files. */
(function (root) {
'use strict';

const SECTOR = 0x1000, SIZE = 0x4000, MAGIC = 0x32435241;
const BUY = 0xD2, SELL = 0xD4, ITEM_TABLE_WORDS = 46;
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u32 = (b, o) => b.getUint32(o, true);

function archive(bytes, core) {
  if (bytes.length < 16) return null;
  const b = view(bytes), length = u32(b, 8), count = u32(b, 12);
  if (u32(b, 0) !== MAGIC || length + 16 !== bytes.length || count > length / 16) return null;
  const parsed = core.arc2Parse(bytes, 0);
  if (core.arc2Checksum(bytes, 0, length) !== parsed.chk) return null;
  let end = 16 + count * 16;
  for (const e of parsed.ents) {
    if (e.flags || e.offset < end || e.ulen > e.clen || e.offset + e.clen > bytes.length) return null;
    end = e.offset + e.clen;
  }
  return parsed;
}

// These ROM glyph indices precede the CJK table. They are not Unicode code points.
const VIS_NAME_SYMBOLS = [];
for (const [start, chars] of [
  [2, '0123456789+-'],
  [15, 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんぁぃぅぇぉっゃゅょがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'],
  [95, 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ'],
  [175, 'ヴー〜…、。（）「」．・！？＆○×,:“”’#$*/;<=>@[¥]^_‘{|}♡☀★🍥𝅘𝅥𝅮╬⤴⤵→←¢%ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+😁😠😡😑😫😢😸🎱😦😖😒🎁👜🍙🍰✨🔄🌣'],
  [299, '²💩'],
  [305, ' 0123456789+-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!“#$%&’()*,./:;<=>?@[¥]^_‘{|}~ÀÁÂÃÄÆÇÉÈÊËÎÏÓÒÔÕÖŒÙÚÛÜŸÍÌÑ¿¡°'],
  [432, 'カ💦💡☂🌩🍀🌠🌃🌙🌧⚾🎮👜📖⌚☕🚗🏘😷👓🌷🌸🛒🛸😀😓😖😵😬😳😮'],
]) {
  Array.from(chars).forEach((char, index) => { VIS_NAME_SYMBOLS[start + index] = char; });
}
VIS_NAME_SYMBOLS[298] = '✈️';
let visCjkNames;
function visCjkGlyphs() {
  if (visCjkNames) return visCjkNames;
  const decodePairs = (encoding, first, last, skip) => {
    const decoder = new TextDecoder(encoding, { fatal: true }), chars = new Set();
    const pair = new Uint8Array(2);
    for (let lead = first; lead <= last; lead++) for (let trail = 0xa1; trail <= 0xfe; trail++) {
      if (skip?.(lead, trail)) continue;
      pair[0] = lead; pair[1] = trail;
      try {
        const char = decoder.decode(pair);
        if (char.length === 1) chars.add(char);
      } catch (_) {}
    }
    return Array.from(chars).sort().join('');
  };
  const sequence = (start, count) => Array.from({ length: count }, (_, i) => String.fromCharCode(start + i)).join('');
  // KS X 1001 Hangul and GB2312 Han characters are both in Unicode order in the ROM.
  visCjkNames = decodePairs('euc-kr', 0xb0, 0xc8) + '　　' +
    sequence(0x3105, 37) + sequence(0x3220, 10) +
    decodePairs('gbk', 0xb0, 0xf7, (lead, trail) => lead === 0xd7 && trail > 0xf9);
  return visCjkNames;
}
function visNameGlyph(code) {
  const glyph = code < 481 ? VIS_NAME_SYMBOLS[code] : visCjkGlyphs()[code - 481];
  return glyph ?? '[0x' + code.toString(16).toUpperCase().padStart(4, '0') + ']';
}

let nameCodes;
function encodeName(text) {
  if (!nameCodes) {
    nameCodes = new Map();
    Array.from(visCjkGlyphs()).forEach((c, i) => nameCodes.set(c, i + 481));
    VIS_NAME_SYMBOLS.forEach((c, i) => nameCodes.set(c, i));
    nameCodes.set("'", 376);
  }
  if (!text.trim()) throw new Error('Enter a name for each edited language.');
  const codes = [];
  for (const c of text.normalize('NFC').replaceAll('✈️', '✈')) {
    const code = c === '✈' ? 298 : nameCodes.get(c);
    if (code === undefined) throw new Error('The device font does not contain “' + c + '”.');
    codes.push(code);
  }
  return codes;
}

function readNames(bytes, core) {
  return core.textTablesOf(bytes, 0).tabs.map(table => core.txtWords(table, 1).map(visNameGlyph).join(''));
}

function withNames(item, names, core) {
  if (names.length !== item.names.length) throw new Error('Expected one name per language.');
  if (names.every((text, i) => text === item.names[i])) return item;
  const tables = core.textTablesOf(item.bytes, 0).tabs;
  const parts = tables.map((table, i) => {
    if (names[i] === item.names[i]) return table.b;
    if (!table.native || !table.n) throw new Error('Unsupported name table.');
    const codes = encodeName(names[i]);
    if (codes.length >= SIZE / 2) throw new Error('This name is too long for the ARC2.');
    const replacement = new Uint8Array((codes.length + 1) * 2);
    codes.forEach((code, j) => view(replacement).setUint16(j * 2, code, true));
    const first = table.b.subarray(table.offs[1] * 2, table.offs[2] * 2);
    const rows = [];
    for (let j = 1; j <= table.n; j++) {
      const row = table.b.subarray(table.offs[j] * 2, table.offs[j + 1] * 2);
      rows.push(j === 1 || (j === 2 && row.length === first.length && row.every((b,k) => b === first[k])) ? replacement : row);
    }
    let offset = (table.n + 2) * 2;
    const out = new Uint8Array(offset + rows.reduce((n, row) => n + row.length, 0));
    const v = view(out);
    v.setUint16(0, table.n, true);
    rows.forEach((row, j) => { v.setUint16(2 + j * 2, offset / 2, true); out.set(row, offset); offset += row.length; });
    v.setUint16(2 + table.n * 2, offset / 2, true);
    return out;
  });
  const packed = core.arc2Build(parts), entry = core.arc2Parse(item.bytes, 0).ents[2];
  const end = entry.offset + packed.length;
  if (end > SIZE || item.bytes.subarray(entry.offset + entry.clen, end).some(b => b !== 0 && b !== 255))
    throw new Error('The edited names exceed the available space in this ARC2.');
  const bytes = new Uint8Array(item.bytes);
  bytes.fill(0, entry.offset, entry.offset + entry.clen);
  bytes.set(packed, entry.offset);
  const v = view(bytes);
  v.setUint32(56, packed.length, true);
  v.setUint32(60, packed.length, true);
  v.setUint32(4, core.arc2Checksum(bytes, 0, SIZE - 16), true);
  return { ...item, bytes, names, name:names[1], checksum:u32(v, 4) };
}

function spriteEntries(pack, core) {
  if (pack.length < 28) return null;
  const b = view(pack), first = u32(b, 0);
  if (!first || first % 4 || first + 24 > pack.length) return null;
  let end = first - 24;
  for (let i = 0; i < first; i += 4) {
    const offset = u32(b, i);
    if (offset < end + 24 || offset + 24 > pack.length) return null;
    end = offset;
  }
  return core.packSplit(pack);
}

function parse(bytes, core) {
  if (bytes.length !== SIZE) return null;
  const parsed = archive(bytes, core);
  if (parsed?.ents.length !== 3) return null;
  const [data, sprites, text] = parsed.ents, b = view(bytes);
  if (data.offset !== 64 || data.offset + data.ulen < SELL + 2 || u32(b, data.offset) !== ITEM_TABLE_WORDS) return null;
  const labels = bytes.subarray(text.offset, text.offset + text.ulen);
  const strings = archive(labels, core);
  if (strings?.ents.length !== 9) return null;
  const entries = spriteEntries(bytes.subarray(sprites.offset, sprites.offset + sprites.ulen), core);
  if (!entries) return null;
  const names = readNames(bytes, core);
  return {
    names, name: names[1],
    buy: b.getUint16(BUY, true), sell: b.getUint16(SELL, true),
    checksum: parsed.chk, entries, bytes,
  };
}

function forTransfer(bytes, core) {
  const item = parse(bytes, core);
  if (!item) return null;
  const b = view(bytes), base = 64, length = u32(b, 28);
  const words = u32(b, base + 0x4c);
  if (words * 2 < 0x54 || words * 2 + 2 > length) return null;
  const id = b.getUint16(base + words * 2, true);
  const editable = base + words * 2 >= SELL + 2 &&
    [4, 8, 12].every(offset => u32(b, base + offset) === ITEM_TABLE_WORDS) &&
    [0x2c, 0x30].every(offset => u32(b, base + offset) === 0x54) &&
    u32(b, base + 0x50) === words + 1;
  // Table 10 contains the item record. Its icon and display words reference
  // sprites in the same 128-ID bank as the item.
  const record = base + u32(b, base + 40) * 2;
  const recordEnd = base + u32(b, base + 44) * 2;
  const previewEntries = [];
  if (record >= base + ITEM_TABLE_WORDS * 2 && record + 46 <= recordEnd && recordEnd <= base + length) {
    const bank = b.getUint16(record, true) & 0xff80;
    for (const offset of [4, 6]) {
      const ref = b.getUint16(record + offset, true);
      if (ref && ref >= bank && ref - bank < item.entries.length) previewEntries.push(ref - bank);
    }
  }
  return { ...item, id, editable, previewEntries };
}

function scan(bytes, base, core) {
  const b = view(bytes), items = [];
  for (let off = 0; off + SIZE <= bytes.length; off += SECTOR) {
    if (u32(b, off) !== MAGIC || u32(b, off + 8) !== SIZE - 16) continue;
    const item = forTransfer(bytes.subarray(off, off + SIZE), core);
    if (item) items.push({ ...item, address: base + off });
  }
  return items;
}

function picture(entry, core, index = 0, includeBlank = false) {
  const h = core.spriteHeader(entry);
  const w = h.sw * Math.max(1, h.iw), height = h.sh * Math.max(1, h.ih);
  if (!w || !height || w > 256 || height > 256 || h.dataLength > entry.length ||
      h.pixOffset < 24 || h.pixOffset >= entry.length || h.numPal > 32) return null;
  try {
    const frame = core.spriteDecode(entry, 0, true, index).subs[0];
    return includeBlank || frame?.data.some((alpha, i) => i % 4 === 3 && alpha) ? frame : null;
  } catch (_) {
    return null;
  }
}

function withPicture(item, index, frame, image, core) {
  const entry = item.entries[index];
  const original = entry && picture(entry, core, frame, true);
  if (!original) throw new Error('This sprite frame cannot be edited.');
  if (image.w !== original.w || image.h !== original.h)
    throw new Error('The PNG dimensions do not match the sprite.');
  if (image.data.length !== original.data.length) throw new Error('Invalid PNG pixel data.');
  if (image.data.every((value, i) => value === original.data[i])) return item;
  const header = core.spriteHeader(entry);
  if (header.numSprites * header.sw * header.sh > 0x100000) throw new Error('This sprite frame cannot be edited.');
  if (image.data.some((alpha, i) => i % 4 === 3 && alpha !== 0 && alpha !== 255))
    throw new Error('Use fully transparent or fully opaque pixels.');
  const decoded = core.spriteDecode(entry, 0, true);
  const untouched = decoded.subs.slice();
  decoded.subs[frame] = image;
  const entries = item.entries.slice();
  entries[index] = core.spriteEncode(entry, decoded.subs, { allowMoreColors: true, preservePaletteIndices: true });
  const preview = core.spriteDecode(entries[index], 0, true).subs;
  if (preview.some((actual, i) => i !== frame && !actual.data.every((value, p) => value === untouched[i].data[p])))
    throw new Error('The PNG would change colors in other frames of this sprite.');
  const tolerance = [5, 3, 5, 0]; // The device stores RGB565 rather than full RGB.
  if (preview[frame].data.some((value, i) => image.data[i | 3] === 0 ? i % 4 === 3 && value !== 0 :
    Math.abs(image.data[i] - value) > tolerance[i % 4])) throw new Error('The PNG uses colors this sprite cannot display.');
  const files = core.arc2Files(item.bytes, 0);
  files[1] = core.packJoin(entries);
  const packed = core.arc2Build(files);
  const last = core.arc2Parse(item.bytes, 0).ents[2];
  const tailStart = last.offset + last.clen;
  const tail = item.bytes.subarray(tailStart);
  const filler = tail[0] === 255 ? 255 : 0;
  if (packed.length > SIZE || tail.some(byte => byte !== filler))
    throw new Error('The edited sprite cannot fit safely in this 16 KiB ARC2.');
  const bytes = new Uint8Array(SIZE).fill(filler);
  bytes.set(packed);
  const b = view(bytes);
  b.setUint32(8, SIZE - 16, true);
  b.setUint32(4, core.arc2Checksum(bytes, 0, SIZE - 16), true);
  const updated = forTransfer(bytes, core);
  if (!updated || updated.id !== item.id) throw new Error('The edited sprite could not be repacked.');
  return { ...item, ...updated };
}

function thumbnail(item, core) {
  const fallback = item.entries.map((_, index) => index);
  for (const index of new Set([...(item.previewEntries || []), ...fallback])) {
    const image = picture(item.entries[index], core);
    if (!image) continue;
    let left = image.w, right = -1, top = image.h, bottom = -1;
    for (let y = 0; y < image.h; y++) for (let x = 0; x < image.w; x++) {
      if (!image.data[(y * image.w + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return core.crop(image, left, top, right - left + 1, bottom - top + 1);
  }
  return null;
}

function withPrices(item, buy, sell, core) {
  if (!item.editable) throw new Error('This Lab Item layout cannot be edited.');
  if ([buy, sell].some(price => !Number.isInteger(price) || price < 0 || price > 0xFFFF))
    throw new Error('Enter whole prices from 0 to 65535.');
  const bytes = new Uint8Array(item.bytes), b = view(bytes);
  b.setUint16(BUY, buy, true);
  b.setUint16(SELL, sell, true);
  b.setUint32(4, core.arc2Checksum(bytes, 0, SIZE - 16), true);
  return { ...item, bytes, buy, sell, checksum: u32(b, 4) };
}

async function readDevice(device, start, end, core, progress, cancel) {
  const sectors = await device.usedSectors(start, end, progress, cancel);
  const bytes = new Uint8Array(end - start).fill(0xFF);
  for (const [index, address] of sectors.entries()) {
    if (cancel()) throw new Error('Cancelled.');
    bytes.set(await device.read(address, SECTOR), address - start);
    progress('read', (index + 1) * SECTOR, sectors.length * SECTOR);
  }
  if (cancel()) throw new Error('Cancelled.');
  return scan(bytes, start, core);
}

root.ParaLabItems = { SIZE, nameGlyph:visNameGlyph, withNames, parse, forTransfer, scan, picture, withPicture, thumbnail, withPrices, readDevice };
if (typeof module !== 'undefined') module.exports = root.ParaLabItems;
})(typeof window !== 'undefined' ? window : globalThis);
