// Compare the public P-COM catalog, or validate and import downloaded ARC2 files.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Core = require('../src/core');
const Lab = require('../src/lab_items');

const origin = 'https://tamagotchicenter.com';
const catalogPage = new URL('/p-com/lab-items', origin);
const archiveBase = new URL('/api/webmeets/v1/lab-items/', origin);
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'assets/lab-items');
const catalogPath = path.join(directory, 'catalog.json');
const publicPath = path.join(root, 'tools/public-files.txt');
const archiveName = /^[a-z0-9][a-z0-9_-]*\.arc2$/i;

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function key(name) {
  return name.toLowerCase().replace(/\.(?:arc2|bin)$/, '')
    .replace(/^labitem_\d+_|-0x[\da-f]+$|_unfixed$/g, '')
    .replace(/bandanna/g, 'bandana').replace(/[^a-z0-9]/g, '');
}

function archives(text) {
  return [...text.matchAll(/\bfilename['"]?\s*:\s*['"`]([a-z0-9_-]+\.arc2)['"`]/gi)].map(match => match[1]);
}

function previews(text) {
  return [...text.matchAll(/\/p-com\/lab-items\/([a-z0-9_-]+)\.png\b/gi)].map(match => match[1] + '.arc2');
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function liveEntries() {
  const html = await fetchText(catalogPage);
  const modules = [...new Set([...html.matchAll(/\b(?:src|href)=["'](\/_nuxt\/[\w.-]+\.js)["']/g)].map(match => match[1]))];
  const entries = new Set(archives(html));
  for (let index = 0; index < modules.length; index += 8) {
    const results = await Promise.allSettled(modules.slice(index, index + 8).map(file => fetchText(new URL(file, origin))));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.includes('/lab-items/'))
        archives(result.value).forEach(name => entries.add(name));
    }
    if (entries.size) break;
  }
  return { names: [...entries], previews: previews(html) };
}

async function savedEntries(file) {
  const source = await fs.readFile(file, 'utf8');
  if (/^\s*[\[{]/.test(source)) {
    const json = JSON.parse(source);
    const files = Array.isArray(json) ? json : json.files;
    if (!Array.isArray(files)) throw new Error('Expected a filename list or a P-COM Lab Items manifest.');
    return { names: files.map(file => typeof file === 'string' ? file : file.filename), previews: [] };
  }
  return { names: archives(source), previews: previews(source) };
}

function paddedArchive(bytes) {
  if (bytes.length !== Lab.SIZE || bytes.toString('ascii', 0, 4) !== 'ARC2') return bytes;
  const size = bytes.readUInt32LE(8), end = 16 + size;
  if (end >= bytes.length || end < 64 || bytes.readUInt32LE(12) !== 3) return bytes;
  const { chk, ents } = Core.arc2Parse(bytes, 0);
  if (ents.at(-1).offset + ents.at(-1).clen !== end || Core.arc2Checksum(bytes, 0, size) !== chk ||
      bytes.subarray(end).some(byte => byte !== 0)) return bytes;
  const padded = Buffer.from(bytes);
  padded.writeUInt32LE(padded.length - 16, 8);
  padded.writeUInt32LE(Core.arc2Checksum(padded, 0, padded.length - 16), 4);
  return padded;
}

async function checkDownloads(files, catalog, install) {
  const added = [];
  const addedAt = new Date().toISOString();
  for (const file of files) {
    const filename = path.basename(file);
    const original = await fs.readFile(file);
    const bytes = paddedArchive(original);
    const item = Lab.forTransfer(bytes, Core);
    if (!item || !Lab.thumbnail(item, Core)) throw new Error(`${filename}: invalid Lab Item archive or thumbnail`);
    const sha256 = digest(bytes);
    const entries = [...catalog, ...added];
    const same = entries.find(known => known.sha256 === sha256);
    const conflict = entries.find(known => known.item.id === item.id || known.filename.toLowerCase() === filename.toLowerCase());
    console.log(`${filename}\t#${item.id}\t${item.name}\t${sha256}${same ? ' (already in ' + same.filename + ')' : ''}`);
    if (bytes !== original) console.log(`  Padded archive length and checksum normalized (original SHA-256: ${digest(original)})`);
    if (same) continue;
    if (conflict) throw new Error(`${filename}: conflicts with ${conflict.filename} (#${conflict.item.id})`);
    if (!archiveName.test(filename)) throw new Error(`${filename}: use an ARC2 filename with letters, digits, dashes or underscores`);
    added.push({ filename, addedAt, bytes, item, sha256 });
  }
  if (!install || !added.length) return;
  const publicFiles = (await fs.readFile(publicPath, 'utf8')).trimEnd().split('\n');
  const firstOther = publicFiles.findIndex(file => file.startsWith('assets/') && !file.startsWith('assets/lab-items/'));
  if (firstOther === -1) throw new Error('Missing Lab Items section in tools/public-files.txt');
  await Promise.all(added.map(async ({ filename }) => {
    try {
      await fs.access(path.join(directory, filename));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    throw new Error(`A file already exists for ${filename}`);
  }));
  const paths = added.map(({ filename }) => 'assets/lab-items/' + filename);
  publicFiles.splice(firstOther, 0, ...paths.filter(file => !publicFiles.includes(file)));
  for (const { filename, bytes } of added) await fs.writeFile(path.join(directory, filename), bytes, { flag: 'wx' });
  await fs.writeFile(catalogPath, JSON.stringify([...added, ...catalog].map(({ filename, addedAt }) => ({ filename, addedAt })), null, 2) + '\n');
  await fs.writeFile(publicPath, publicFiles.join('\n') + '\n');
  console.log(`Imported ${added.length} Lab Items.`);
}

async function main([mode, ...args]) {
  if (mode === '--help') {
    console.log('node tools/lab_items_sync.js [--from <saved HTML, JS or JSON> | --check <ARC2...> | --import <ARC2...>]');
    return;
  }
  const entries = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const catalog = await Promise.all(entries.map(async ({ filename, addedAt }) => {
    const bytes = await fs.readFile(path.join(directory, filename));
    const item = Lab.forTransfer(bytes, Core);
    if (!item) throw new Error(`${filename}: invalid existing catalog archive`);
    return { filename, addedAt, item, sha256: digest(bytes) };
  }));
  if ((mode === '--check' || mode === '--import') && args.length) return checkDownloads(args, catalog, mode === '--import');
  if (mode && (mode !== '--from' || args.length !== 1)) throw new Error('See --help for usage.');
  const source = mode ? await savedEntries(args[0]) : await liveEntries();
  if (!source.names.length && !source.previews.length) throw new Error('No P-COM Lab Items recognized.');
  const known = new Set(catalog.flatMap(({ filename, item }) => [key(filename), key(item.name)]));
  const previewKeys = new Set(source.names.filter(filename => archiveName.test(filename)).map(key));
  const candidates = source.previews.filter(filename => !previewKeys.has(key(filename)));
  const names = [...new Set([...source.names, ...candidates])].filter(filename => archiveName.test(filename));
  const missing = names.filter(filename => !known.has(key(filename)));
  for (const filename of missing) {
    const previewOnly = !source.names.includes(filename);
    console.log(`${new URL(filename, archiveBase)}${previewOnly ? '\t(unconfirmed filename from preview)' : ''}`);
  }
  console.log(`${names.length} P-COM entries checked. ${missing.length} possible additions.`);
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.cause?.message || error.message);
  process.exitCode = 1;
});
