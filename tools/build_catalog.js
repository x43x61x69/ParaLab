const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { deflateRawSync, deflateSync } = require('node:zlib');
const core = require('../src/core.js');
const { forTransfer, thumbnail } = require('../src/lab_items.js');
const gifts = require('../src/gift_catalog.json');

function pngChunk(type, payload) {
  const data = Buffer.concat([Buffer.from(type), payload]);
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  checksum.writeUInt32BE(core.crc32(data));
  return Buffer.concat([size, data, checksum]);
}

function labAtlas(images, cell, columns) {
  const width = cell * columns, height = cell * Math.ceil(images.length / columns);
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(height * stride);
  for (const [index, image] of images.entries()) {
    const scale = Math.min(cell / image.w, cell / image.h);
    const w = Math.max(1, Math.round(image.w * scale)), h = Math.max(1, Math.round(image.h * scale));
    const left = (index % columns) * cell + Math.floor((cell - w) / 2);
    const top = Math.floor(index / columns) * cell + Math.floor((cell - h) / 2);
    const rgba = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const source = (Math.floor(y * image.h / h) * image.w + Math.floor(x * image.w / w)) * 4;
        const target = (top + y) * stride + (left + x) * 4 + 1;
        rgba.copy(pixels, target, source, source + 4);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildCatalog(root, webDirectory) {
  const assets = new Map(), payloads = {};
  const items = [], images = [], seen = new Set();
  const directory = path.join(root, 'assets', 'lab-items');
  const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
  for (const { filename } of catalog) {
    const bytes = fs.readFileSync(path.join(directory, filename));
    const key = createHash('sha256').update(bytes).digest('hex');
    if (seen.has(key)) continue;
    const item = forTransfer(bytes, core);
    if (!item) {
      console.warn('Skipping unsupported Lab Item: ' + filename);
      continue;
    }
    seen.add(key);
    const image = thumbnail(item, core);
    const tile = image ? images.push(image) - 1 : null;
    items.push({ key, filename, name: item.name, names: item.names, id: item.id, buy: item.buy, sell: item.sell,
      checksum: item.checksum, crc: core.crc32(bytes), tile });
    if (webDirectory) assets.set(key + '.arc2', bytes);
    else payloads[key] = deflateRawSync(bytes).toString('base64');
  }

  function imageSource(name, bytes) {
    const type = name.endsWith('.webp') ? 'webp' : 'png';
    if (!webDirectory) return 'data:image/' + type + ';base64,' + bytes.toString('base64');
    assets.set(name, bytes);
    return './' + webDirectory + '/' + name;
  }

  const cell = 40, columns = 8;
  const { events, sources, groups } = JSON.parse(fs.readFileSync(path.join(directory, 'acquisition.json'), 'utf8'));
  const byItem = {};
  for (const [id, event] of Object.entries(events)) {
    if (!Object.hasOwn(sources, event.source)) throw new Error('Missing official source for Lab Item event: ' + id);
  }
  for (const links of Object.values(sources)) {
    if (!Object.values(links).length || Object.values(links).some(link => !/^\/[a-z]+\/(?:series\/paradise\/)?news\/\d+_\d+\/$/.test(link)))
      throw new Error('Invalid official Lab Item article path');
  }
  for (const group of groups) {
    if (group.events.some(id => !Object.hasOwn(events, id))) throw new Error('Unknown Lab Item event: ' + group.events);
    const { ids, ...record } = group;
    for (const id of ids) {
      if (Object.hasOwn(byItem, id)) throw new Error('Duplicate Lab Item acquisition record: ' + id);
      byItem[id] = record;
    }
  }
  items.sort((a, b) => b.id - a.id);
  const lab = { items, cell, columns, acquisition: { events, sources, byItem },
    atlas: images.length ? imageSource('lab.png', labAtlas(images, cell, columns)) : null };
  // gift-atlas.webp is the lossless encoding of the original PNG atlas.
  const giftFormat = ['webp', 'png'].find(type => fs.existsSync(path.join(root, 'src/art/gift-atlas.' + type)));
  const gift = { items: gifts, atlas: giftFormat
    ? imageSource('gift.' + giftFormat, fs.readFileSync(path.join(root, 'src/art/gift-atlas.' + giftFormat)))
    : null };
  if (!webDirectory) return { config: { lab, gift, payloads }, assets };
  assets.set('lab.json', JSON.stringify(lab));
  assets.set('gift.json', JSON.stringify(gift));
  return { config: { base: './' + webDirectory + '/', giftAtlas: gift.atlas }, assets };
}

module.exports = { buildCatalog };
