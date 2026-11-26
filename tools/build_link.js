// Prepare the same verified H717 release for hosted and single-file builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

module.exports = function buildLink(root, webDirectory, output) {
  const dir = path.join(root, 'assets/paralab-link');
  const release = JSON.parse(fs.readFileSync(path.join(dir, 'release.json')));
  const packed = fs.readFileSync(path.join(dir, 'factory.zlib'));
  const factory = zlib.inflateSync(packed);
  const hash = (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest('hex');
  if (factory.length !== release.flash_bytes || hash('sha256', factory) !== release.sha256)
    throw new Error('ParaLab Link factory image does not match release.json');
  function asset(name, address, raw, compressed) {
    let source;
    if (webDirectory) {
      source = webDirectory + '/link-' + name + '.zlib';
      fs.mkdirSync(path.dirname(path.join(output, source)), {recursive: true});
      fs.writeFileSync(path.join(output, source), compressed);
    } else source = 'data:application/octet-stream;base64,' + compressed.toString('base64');
    return {address, size:raw.length, md5:hash('md5', raw), sha256:hash('sha256', compressed), source};
  }
  const parts = {};
  for (const part of release.components) {
    const address = Number(part.offset);
    const raw = factory.subarray(address, address + part.bytes);
    if (hash('sha256', raw) !== part.sha256) throw new Error('Invalid Link component ' + part.name);
    if (part.name === 'partitions.bin') parts.layout = {address, size:raw.length, md5:hash('md5', raw)};
    if (['firmware.bin','assets.bin'].includes(part.name))
      parts[part.name] = asset(part.name, address, raw, zlib.deflateSync(raw, {level:9}));
  }
  parts.factory = asset('factory', 0, factory, packed);
  const zip = fs.readFileSync(path.join(dir, 'source.zip'));
  const sourceName = 'paralab-link-' + release.version + '-source.zip';
  const source = webDirectory ? webDirectory + '/' + sourceName : 'data:application/zip;base64,' + zip.toString('base64');
  if (webDirectory) fs.writeFileSync(path.join(output, source), zip);
  return {version:release.version, sourceName, source, ...parts};
};
