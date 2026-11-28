// Exercise the browser updater against a USB ROM-loader double and actual release bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const releases = require('../tools/build_link')(root, null, null);
const source = fs.readFileSync(path.join(root, 'src/link.js'), 'utf8')
  .replace('/*__LINK_RELEASE__*/ {}', () => JSON.stringify(releases));
const factoryFor = board => zlib.inflateSync(fs.readFileSync(path.join(root, 'assets/paralink', board, 'factory.zlib')));
const hash = data => crypto.createHash('md5').update(data).digest('hex');
const document = {createElement: () => ({dataset:{}})};
function testNodes() {
  const nodes = {};
  return id => nodes[id] ||= {
    children: [],
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(...children) {
      this.children = children;
      this.textContent = children.map(child => child.textContent ?? child).join('');
    },
  };
}

async function exercise(mode, failure, board = "h717") {
  const factory = factoryFor(board), release = releases[board];
  const written = [], progress = [];
  const $ = testNodes();
  $('linkMode').value = mode;
  $('linkBoard').value = board;
  let input, address, chunks, blocks, closed = false, deviceError;
  const port = {
    getInfo: () => ({usbProductId:0x1001}), open() {}, close() { closed = true; },
    readable:new ReadableStream({start(controller) { input = controller; }}),
    writable:new WritableStream({write(slip) {
      try {
        const raw = [];
        for (let i = 1; i < slip.length - 1; i++)
          raw.push(slip[i] === 0xdb ? (slip[++i] === 0xdc ? 0xc0 : 0xdb) : slip[i]);
        const packet = Buffer.from(raw), op = packet[1], body = packet.subarray(8);
        let reply = Buffer.alloc(0), result = 0;
        if (op === 0x0a && body.readUInt32LE() === 0x60002058)
          result = ((failure === 'size' ? 25 : board === 'h717' ? 24 : 23) << 16) | 0x4016;
        if (op === 0x14) { reply = Buffer.alloc(20); reply[12] = failure === 'chip' ? 2 : 9; }
        if (op === 0x13) {
          const start = body.readUInt32LE(), length = body.readUInt32LE(4);
          const mismatch = failure === 'layout' || (failure === 'verify' && start !== release.layout.address);
          const sourceAddress = start === 0x1a0000 ? 0x20000 : start;
          reply = Buffer.from(mismatch ? '0'.repeat(32) : hash(factory.subarray(sourceAddress,sourceAddress+length)));
        }
        if (op === 0x10) {
          address = body.readUInt32LE(12); blocks = body.readUInt32LE(4); chunks = []; written.push(address);
        }
        if (op === 0x11) {
          assert.equal(body.readUInt32LE(4), chunks.length);
          const data = body.subarray(16);
          assert.equal(data.reduce((x,b)=>x^b,0xef),packet.readUInt32LE(4));
          chunks.push(data);
          if (chunks.length === blocks) {
            const rawImage = zlib.inflateSync(Buffer.concat(chunks));
            const sourceAddress = address === 0x1a0000 ? 0x20000 : address;
            assert(rawImage.equals(factory.subarray(sourceAddress,sourceAddress+rawImage.length)));
          }
        }
        const header = Buffer.alloc(8);
        header[0] = 1; header[1] = op; header.writeUInt16LE(reply.length+4,2); header.writeUInt32LE(result,4);
        const response = Buffer.concat([Buffer.from([0xc0]),header,reply,Buffer.alloc(4),Buffer.from([0xc0])]);
        input.enqueue(response.subarray(0,5)); input.enqueue(response.subarray(5));
      } catch (error) { deviceError = error; throw error; }
    }})
  };
  vm.runInNewContext(source, {$,document, t:x=>x, deviceDialog:async()=>failure !== 'cancel',
    transferProgress(prefix, done, total) {
      assert.equal(prefix, 'link');
      progress.push({done, total});
      $('linkProgress').hidden = false;
    },
    navigator:{serial:{requestPort:async()=>port}}, window:{isSecureContext:true, addEventListener(){}, removeEventListener(){}},
    fetch, crypto:crypto.webcrypto, setTimeout,clearTimeout,Uint8Array,DataView,TextDecoder});
  await $('linkConnect').onclick();
  if (deviceError) throw deviceError;
  if (failure) {
    assert.deepEqual(written, failure === 'verify' ? [0x20000] : []);
    assert(!/Write verified/.test($('linkStatus').textContent));
    assert.equal($('linkProgress').hidden, true);
    assert(progress.every(({done, total}) => !total || done < total));
  } else {
    assert.deepEqual(written, mode === 'update' ? [0x20000,0x1a0000,0x320000] : [0]);
    assert.match($('linkStatus').textContent,/Write verified/);
    assert.deepEqual(progress[0], {done: 0, total: 0});
    assert.equal(progress[1].done, 0);
    assert.equal($('linkProgress').hidden, false);
    const {total} = progress.at(-1);
    assert(total > 0);
    assert.equal(progress.at(-1).done, total);
    assert(progress.slice(1, -1).every(({done}, index) => done >= progress[index].done && done / total <= 0.99));
  }
  assert.equal(closed, failure !== 'cancel');
  assert.equal($('linkConnect').disabled,false);
}
async function exerciseOta(board, mismatch = false, framed = false, failure) {
  const release = releases[board];
  const image = factoryFor(board).subarray(0x20000, 0x20000+release['firmware.bin'].size);
  const progress = [];
  const $ = testNodes();
  $('linkMode').value = 'ota';
  $('linkBoard').value = board;
  let input, cursor = 0, header = false, closed = false, droppedAck = false, repeated = false;
  function send(line) { input.enqueue(new TextEncoder().encode(line + '\n')); }
  const port = {
    getInfo: () => ({usbProductId:0x0002}),
    open(options) { if (options.baudRate === 460800) return; assert.equal(options.baudRate, 2400); send('PARALINK ' + (framed ? 'OTA2' : 'OTA') + ' ' + (mismatch ? 'BAD' : release.board) + ' 0.1.11'); },
    close() { closed = true; },
    readable:new ReadableStream({start(controller) { input = controller; }}),
    writable:new WritableStream({write(chunk) {
      if (!header) {
        const message = new TextDecoder().decode(chunk).trim();
        const firmware=release['firmware.bin'], assets=release['assets.bin'];
        assert.equal(message, ['UPDATE',release.board,release.version,firmware.size,assets.size,release.assetCrc,firmware.rawSha256].join(' '));
        header = true;
        send(failure ? 'ERROR ' + failure : framed ? 'OK 0' : 'OK');
      } else {
        let data = Buffer.from(chunk), offset = cursor;
        if (framed) {
          assert.equal(data[0], 0xc0);
          assert.equal(data.at(-1), 0xc0);
          const bytes = [];
          for (let i = 1; i < data.length - 1; i++) bytes.push(data[i] === 0xdb ? data[++i] === 0xdc ? 0xc0 : 0xdb : data[i]);
          data = Buffer.from(bytes);
          offset = data.readUInt32LE();
          assert.equal(data.readUInt32LE(4), zlib.crc32(data.subarray(8)));
          data = data.subarray(8);
        }
        assert(data.equals(image.subarray(offset, offset + data.length)));
        if (offset === cursor) cursor += data.length;
        else { assert.equal(offset + data.length, cursor); repeated = true; }
        if (framed && !droppedAck) { droppedAck = true; return; }
        send(framed ? 'OK ' + cursor : 'OK');
        if(cursor === image.length)send('DONE');
      }
    }})
  };
  let locale = 'en';
  const translate = (key, variables) => {
    const dictionary = locale === 'en' ? {} : require('../src/locales/' + locale + '.json');
    return (dictionary[key] || key).replace(/\{(\w+)\}/g, (_, name) => variables[name]);
  };
  const refreshLinkStatus = vm.runInNewContext(source + '\nrefreshLinkStatus;', {$,document,t:translate,deviceDialog:async()=>true,transferProgress(_,done,total){progress.push({done,total});},
    navigator:{serial:{requestPort:async()=>port}},window:{isSecureContext:true,ParamixCore:{crc32:zlib.crc32},addEventListener(){},removeEventListener(){}},
    fetch,crypto:crypto.webcrypto,setTimeout,clearTimeout,Uint8Array,DataView,TextDecoder,TextEncoder,Response,Blob,DecompressionStream});
  await $('linkConnect').onclick();
  assert(closed);
  if (failure) {
    assert.equal(cursor, 0);
    assert.equal($('linkStatus').textContent, 'Write failed at byte 1024 (0xABCD).');
    locale = 'zh-Hant';
    refreshLinkStatus();
    const localized = '寫入至位元組偏移量 1024 時失敗（0xABCD）。';
    assert.equal($('linkStatus').textContent, localized);
    assert.equal($('linkMeter')['aria-label'], localized);
  } else if (mismatch) {
    assert.equal(cursor,0);
    assert.match($('linkStatus').textContent,/does not match/);
  } else {
    assert.equal(cursor,image.length);
    if (framed) assert(repeated);
    assert.equal($('linkVersions').textContent, `${release.board} · v0.1.11 → v${release.version}`);
    assert.match($('linkStatus').textContent,/Write verified/);
    assert.equal(progress.at(-1).done,progress.at(-1).total);
  }
}
(async()=>{
  for (const failure of ['cancel','chip','layout','size','verify',null]) await exercise('update',failure);
  await exercise('factory');
  await exercise('factory', 'size', 'k191');
  await exercise('factory', null, 'k191');
  await exercise('update', null, 'k191');
  await exerciseOta('h717');
  await exerciseOta('k191');
  await exerciseOta('k191', true);
  await exerciseOta('h717', false, true, 'Write failed at 1024: 0xABCD');
  await exerciseOta('h717', false, true);
  await exerciseOta('k191', false, true);
  console.log('PASS: Link update and installation, payloads, checksums, cancellation, target checks and verification failure');
})().catch(error=>{ console.error(error); process.exitCode=1; });
