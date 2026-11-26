// Exercise the browser updater against a USB ROM-loader double and actual release bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const factory = zlib.inflateSync(fs.readFileSync(path.join(root, 'assets/paralab-link/factory.zlib')));
const release = require('../tools/build_link')(root, null, null);
const source = fs.readFileSync(path.join(root, 'src/link.js'), 'utf8')
  .replace('/*__LINK_RELEASE__*/ {}', () => JSON.stringify(release));
const hash = data => crypto.createHash('md5').update(data).digest('hex');

async function exercise(mode, failure) {
  const written = [], progress = [], nodes = {};
  const $ = id => nodes[id] ||= {children:[], dataset:{}};
  $('linkMode').value = mode;
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
        let reply = Buffer.alloc(0);
        if (op === 0x14) { reply = Buffer.alloc(20); reply[12] = failure === 'chip' ? 2 : 9; }
        if (op === 0x13) {
          const start = body.readUInt32LE(), length = body.readUInt32LE(4);
          const mismatch = failure === 'layout' || (failure === 'verify' && start !== release.layout.address);
          reply = Buffer.from(mismatch ? '0'.repeat(32) : hash(factory.subarray(start,start+length)));
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
            assert(rawImage.equals(factory.subarray(address,address+rawImage.length)));
          }
        }
        const header = Buffer.alloc(8);
        header[0] = 1; header[1] = op; header.writeUInt16LE(reply.length+4,2);
        const response = Buffer.concat([Buffer.from([0xc0]),header,reply,Buffer.alloc(4),Buffer.from([0xc0])]);
        input.enqueue(response.subarray(0,5)); input.enqueue(response.subarray(5));
      } catch (error) { deviceError = error; throw error; }
    }})
  };
  vm.runInNewContext(source, {$, t:x=>x, deviceDialog:async()=>failure !== 'cancel',
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
    assert.deepEqual(written, mode === 'update' ? [0x20000,0x320000] : [0]);
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
(async()=>{
  for (const failure of ['cancel','chip','layout','verify',null]) await exercise('update',failure);
  await exercise('factory');
  console.log('PASS: Link update and installation, payloads, checksums, cancellation, target checks and verification failure');
})().catch(error=>{ console.error(error); process.exitCode=1; });
