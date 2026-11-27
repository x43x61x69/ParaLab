// Prepare verified ParaLink releases for the hosted and single-file builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

module.exports = function buildLink(root, webDirectory, output) {
  const hash = (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest('hex');
  return Object.fromEntries(['h717', 'k191'].map(board => {
    const dir = path.join(root, 'assets/paralink', board);
    const release = JSON.parse(fs.readFileSync(path.join(dir, 'release.json')));
    const packed = fs.readFileSync(path.join(dir, 'factory.zlib'));
    const factory = zlib.inflateSync(packed);
    if (release.board !== board || factory.length !== release.flash_bytes || hash('sha256', factory) !== release.sha256)
      throw new Error('ParaLink factory image does not match the ' + board + ' manifest');
    function asset(name, address, raw, compressed) {
      let source;
      if (webDirectory) {
        source = webDirectory + '/paralink-' + board + '-' + name + '.zlib';
        fs.mkdirSync(path.dirname(path.join(output, source)), {recursive: true});
        fs.writeFileSync(path.join(output, source), compressed);
      } else source = 'data:application/octet-stream;base64,' + compressed.toString('base64');
      return {address, size:raw.length, md5:hash('md5', raw), sha256:hash('sha256', compressed), rawSha256:hash('sha256', raw), source};
    }
    const parts = {};
    for (const part of release.components) {
      const address = Number(part.offset);
      const raw = factory.subarray(address, address + part.bytes);
      if (hash('sha256', raw) !== part.sha256) throw new Error('Invalid ParaLink component ' + part.name);
      if (part.name === 'partitions.bin') parts.layout = {address, size:raw.length, md5:hash('md5', raw)};
      if (['firmware.bin','assets.bin'].includes(part.name))
        parts[part.name] = asset(part.name, address, raw, zlib.deflateSync(raw, {level:9}));
      if (part.name === 'assets.bin') parts.assetCrc = raw.readUInt32LE(12).toString(16).padStart(8, '0');
    }
    parts.factory = asset('factory', 0, factory, packed);
    return [board, {board:board.toUpperCase(), version:release.version, flashBytes:release.flash_bytes, ...parts}];
  }));
};
