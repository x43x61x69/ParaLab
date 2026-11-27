/*
 * Paramix Studio: read and write the Paradise over a UART dongle.
 *
 * Two protocols on the same serial line (460800 baud, 8N1):
 *
 * 1. App loading (firmware download screen, "CONNECTION"). The Paradise firmware
 *    accepts a PDLO file over its own transfer protocol: text lines (PKT, ACK,
 *    ENQ, NAK, CAN) and binary chunks of up to 4 KB, each with a 12 byte header
 *    and a keystream from SHA-256(nonce || key). A PDLO file is a 16 byte header
 *    ("PDLO", length in words, token) plus a 64 KB image, word-wise XORed. The
 *    device copies the image to PRAM and starts it. Nothing is written to flash;
 *    switching the device off and on returns to the normal firmware.
 *
 * 2. PAU1, spoken by our own flash app (flash/src/fw.c) once it runs: COBS framed
 *    packets with a CRC-32. HELLO, READ, CRC and the write commands below.
 *
 * Writing goes sector by sector (4 KB): data, then commit, the device erases,
 * programs and compares. Order as in the original tool: user data from 0x111000
 * to the end first, then 0x1000..0x111000, sector 0 (boot header) last. At the
 * end every 64 KB block is checked against its CRC.
 *
 * "Only changes": compare CRCs first (64 KB blocks, then 4 KB sectors) and write
 * only sectors that differ.
 *
 * "Keep saves": sectors that hold game progress are taken from the device
 * instead of the new image (see keepPlan). The rest of the image is written.
 *
 * The transport is an object { write(Uint8Array): Promise, onData: fn } so the
 * same code runs with Web Serial in the browser and with a pipe in tests.
 *
 * Author: mameise. License: GPL-3.0-or-later.
 */
(function (root) {
'use strict';

const FLASH_SIZE = 0x1000000, SECTOR = 0x1000, BLOCK64 = 0x10000;
const BAUD = 460800;
const FIRST_USER = 0x111000;   // write order starts here
// PAU1 commands
const CLOCK_READ = 14, CLOCK_SET = 15, RESET_CONTROL = 16;
const DISPLAY_PROGRESS = 17;
const DISPLAY_PHASE = { read: 0, compare: 1, write: 2, check: 3 };
const DISPLAY_SAMPLE_BATTERY = 1, BATTERY_SAMPLE_INTERVAL_MS = 3000;
const HELLO = 1, READ = 5, CRC = 6, WRITE_TEST = 8, WRITE_BEGIN = 9, WRITE_DATA = 10, WRITE_COMMIT = 11, WRITE_FINISH = 12, WRITE_STATE = 13;
const WRITE_SECTOR = 18, COMPARE_SECTORS = 19, FAST_WRITE_CAPABILITY = 64;
const STAGE_BLOCK = 20, STAGE_BLOCK_SECTOR = 21, COMMIT_BLOCK = 22, BLOCK_WRITE_CAPABILITY = 128;
const RESTART_DEVICE = 23, REMOTE_RESTART_CAPABILITY = 256;
const RELOAD_FLASH_TOOL = 24, FLASH_TOOL_RELOAD_CAPABILITY = 512;
const RESTART_COUNTDOWN = 25, RESTART_COUNTDOWN_CAPABILITY = 1024;
const SECTORS_PER_BLOCK = BLOCK64 / SECTOR, BLOCK_WRITE_THRESHOLD = 11;
const WRITE_ALLOW_LOW_BATTERY = 1;
// App loading: constants of the device's download protocol (needed to load our
// own flash app, the same values as in the Paradise Flash Tool).
/* link values of the Paradise (chunk key, download file token and mask), kept as two mixed tables (1.6.9 test35) */
const LV_A = [3, 175, 246, 44, 204, 25, 45, 199, 29, 242, 14, 63, 238, 148, 219, 113, 91, 21, 50, 246, 127, 248];
const LV_B = [11, 238, 128, 40, 225, 137, 250, 116, 146, 111, 247, 251, 126, 100, 255, 4, 18, 238, 64, 95, 162, 62];
const LV = (() => { const o = new Uint8Array(LV_A.length + LV_B.length); let s = 0x2C1B3C6D;
  for (let i = 0; i < o.length; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; o[i] = (i & 1 ? LV_B : LV_A)[i >> 1] ^ ((s >>> 16) & 255); }
  return o; })();
const LINK_KEY = String.fromCharCode(...LV.subarray(0, 32)), PDLO_TOKEN = String.fromCharCode(...LV.subarray(32, 40));
const PDLO_XOR = (LV[40] | LV[41] << 8 | LV[42] << 16 | LV[43] << 24) >>> 0;
const IMAGE_SIZE = 0x10000, CHUNK = 0x1000;
const EDITIONS = { 1: 'Land', 2: 'Water', 3: 'Sky', 4: 'Jade Forest', 5: 'Tropical', 6: 'Glacier', 7: 'Tropical/Glacier', 8: 'Neon Planets' };
const MY_LAB_ON_PARADISE = 0xFD;
// Keep the native game data and the Garden editor's staging and journal together.
const myLabSaveSector = off =>
  (off >= 0xA6C000 && off < 0xC64000) || off === 0xC65000 ||
  (off >= 0xCA1000 && off < 0xE00000) || (off >= 0xFD0000 && off < 0xFEC000);

// ------------------------------------------------------------------ messages
// English texts; every error and note carries .code and .p so the page can show
// its own translation (keys "fl_<code>" in app.js).
const MSG = {
  timeout: 'no answer from the device ({c} {a})',
  noAck: 'the device does not answer. Is it on the download screen?',
  repeats: 'too many repeats while loading',
  devCancel: 'the device cancelled loading',
  unexpected: 'unexpected answer: {r}',
  hello: 'unexpected HELLO answer',
  notReady: 'flash not ready',
  lowBattery: 'Battery too low to write ({v} V). Replace the batteries, then try again.',
  lowBatteryLegacy: 'The installed My Lab Flash Tool reported low battery ({v} V). Start the UART tool from a newer My Lab update package, then reconnect.',
  readErr: 'read error at {a}',
  noCrc: 'no checksum at {a}',
  quickReadSource: 'Quick Read requires a 16 MB ROM from the same product series as the connected firmware.',
  cancelled: 'cancelled',
  size: 'the image must be exactly 16 MB',
  notParadise: 'not a Paradise image (SONIXDEV missing)',
  cancelledWrite: 'cancelled. Keep the device switched on and write again',
  notAccepted: 'sector {a} not accepted. Keep the device switched on and write again',
  differs: 'sector {a} differs after writing. Keep the device switched on and write again',
  checkFail: 'check failed at {a}. Keep the device switched on and write again',
  rescueBusy: 'the rescue area (0xFF0000) is in use',
  rescueFail: 'the rescue start was not written correctly',
  noRescue: 'no rescue start: 0xFF0000 is in use',
  noRescueRoom: 'no room for the write protection (rescue start, top 64 KB of the flash). Nothing was written. Remove a program from the start device and write again',
  rescueMode: 'the last write was cut off. The device waits in the flash screen: write again',
  noAnswer: 'no answer. Put the device on the download screen and try again',
  noData: 'no answer, no data comes in from the adapter. Put the device on the download screen and try again. Still nothing: check the cable and the adapter driver',
  garbled: 'data comes in, but it is not readable ({n} bytes: {h}). Check the cable (TX and RX) and the adapter driver',
  lost: 'the device stopped answering before writing. Nothing was written. Switch the Paradise off and on, put it on the download screen, connect again and write again',
  appSilent: 'the flash app was sent but does not answer. Try again',
  unknownEd: 'unknown edition in the new ROM, untick "keep saves"',
  otherEd: 'the device is {d}, the new ROM is {r}. Untick "keep saves" to switch the edition',
  slotMigration: 'Keep Saves could not verify the contents of slot {f}. Nothing was written.',
  slotLayout: 'Keep Saves cannot map slot {f} to a unique slot in the new ROM. Nothing was written.',
  slotSpace: 'The new ROM does not have enough save space to preserve slot {f}. Nothing was written.',
  slotResidentBankSpace: 'The separate field resident banks leave too little save space to preserve slot {f}. Nothing was written.',
  slotResidentBanksRequired: 'This device already uses separate field resident storage. Use a ROM with the same resident storage to keep its saves. Nothing was written.',
  slotMenuRequired: 'Keep Saves cannot preserve stored slots without a save menu. The write was cancelled before any flash changes.',
  noteMoved: 'field {f} moved to the new slot',
  noteEdKept: 'the device is {d}, the new ROM is {r}: same firmware, the device keeps its save and its field ({d})',
  noteSaveMoved: 'save of {n} taken along',
  noteEmu: 'TamaEmu firmware chosen again, the emulator starts fresh. For an update just open the ROM and save it',
};
function fill(m, p) { if (p) for (const k of Object.keys(p)) m = m.split('{' + k + '}').join(p[k]); return m; }
function fe(code, p) { const e = new Error(fill(MSG[code], p)); e.code = code; e.p = p; return e; }
function checkWriteBattery(reply) {
  if (reply.status === 3 && reply.payload.length === 4)
    throw fe('lowBattery', { v: (u32(reply.payload, 0) / 1000).toFixed(2) });
}
function note(code, p) { return { code, p, text: fill(MSG[code], p) }; }
const hex = (v) => '0x' + v.toString(16);

// ------------------------------------------------------------------ helpers
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function w32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function sleep(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function b64(s) {
  if (typeof atob === 'function') { const t = atob(s); const o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i); return o; }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

const CRC_TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d, a = 0, n = d.length - a) { let c = 0xFFFFFFFF; for (let i = a; i < a + n; i++) c = (c >>> 8) ^ CRC_TAB[(c ^ d[i]) & 255]; return (c ^ 0xFFFFFFFF) >>> 0; }
function crc16(d) { let c = 0; for (const b of d) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xA001 : c >>> 1; } return c; }
async function sha256(d) { return new Uint8Array(await root.crypto.subtle.digest('SHA-256', d)); }

function cobsEncode(d) {
  const o = new Uint8Array(d.length + Math.ceil(d.length / 254) + 3);
  let n = 1, ci = 1, code = 1; o[0] = 0;   // leading delimiter
  o[n++] = 0;
  for (const b of d) {
    if (b !== 0) { o[n++] = b; code++; if (code === 255) { o[ci] = code; ci = n; o[n++] = 0; code = 1; } }
    else { o[ci] = code; ci = n; o[n++] = 0; code = 1; }
  }
  o[ci] = code; o[n++] = 0;
  return o.subarray(0, n);
}
function cobsDecode(f, len) {
  const o = new Uint8Array(len); let n = 0, i = 0;
  while (i < len) {
    const code = f[i++]; if (code === 0) continue;
    for (let k = 1; k < code && i < len; k++) o[n++] = f[i++];
    if (code !== 255 && i < len) o[n++] = 0;
  }
  return o.subarray(0, n);
}

// ------------------------------------------------------------------ link
/** One serial line: PAU1 frames and text lines are parsed from the same bytes. */
class Link {
  constructor(io, opts = {}) {
    this.io = io; this.scale = opts.timeScale || 1;
    this.signal = opts.signal;
    this.session = (Math.random() * 0x7FFFFFFF | 0) + 1; this.seq = 0;
    this.asm = new Uint8Array(0x10000); this.an = 0;
    this.line = []; this.lines = []; this.frames = []; this.wake = null;
    io.onData = (d) => this.feed(d);
  }
  feed(d) {
    for (let i = 0; i < d.length; i++) {
      const b = d[i];
      if (b === 0) { if (this.an) { const f = this.parse(cobsDecode(this.asm, this.an)); if (f) this.frames.push(f); } this.an = 0; }
      else if (this.an < this.asm.length) this.asm[this.an++] = b; else this.an = 0;
      if (b === 10) { const s = String.fromCharCode(...this.line).trim(); this.line = []; if (s) this.lines.push(s); }
      else if (b !== 13) { if (this.line.length < 200 && b >= 32 && b < 127) this.line.push(b); else if (this.line.length >= 200 || b < 32 || b >= 127) this.line = []; }
    }
    if (this.wake) { const w = this.wake; this.wake = null; w(); }
  }
  parse(d) {
    if (d.length < 28 || d[0] !== 0x50 || d[1] !== 0x41 || d[2] !== 0x55 || d[3] !== 0x31) return null;
    const plen = d[20] | (d[21] << 8);
    if (d.length < 28 + plen || u32(d, 24 + plen) !== crc32(d, 0, 24 + plen)) return null;
    return { type: d[6], seq: u32(d, 12), off: u32(d, 16), status: d[22] | (d[23] << 8), payload: d.slice(24, 24 + plen) };
  }
  async until(test, ms, what) {
    const end = Date.now() + ms * this.scale;
    for (;;) {
      this.signal?.throwIfAborted();
      const r = test(); if (r) return r;
      const left = end - Date.now(); if (left <= 0) throw new TimeoutError(what);
      await new Promise(resolve => {
        const wake = () => {
          clearTimeout(timer);
          this.signal?.removeEventListener('abort', wake);
          this.wake = null;
          resolve();
        };
        const timer = setTimeout(wake, Math.min(left, 500));
        this.wake = wake;
        this.signal?.addEventListener('abort', wake, { once: true });
      });
    }
  }
  clear() { this.lines = []; this.frames = []; this.line = []; this.an = 0; }
  async write(bytes) { this.signal?.throwIfAborted(); await this.io.write(bytes); }
  async writeLine(s) { await this.write(ascii(s + '\r\n')); }
  waitLine(ms) { return this.until(() => this.lines.shift(), ms, { c: 'line', a: '' }); }
  frame(type, seq, off, payload, flags = 0) {
    const d = new Uint8Array(28 + payload.length);
    d.set([0x50, 0x41, 0x55, 0x31, 1, 1, type, flags]);
    w32(d, 8, this.session); w32(d, 12, seq); w32(d, 16, off);
    d[20] = payload.length & 255; d[21] = payload.length >> 8;
    d.set(payload, 24); w32(d, 24 + payload.length, crc32(d, 0, 24 + payload.length));
    return cobsEncode(d);
  }
  /** Send one PAU1 request and wait for the matching reply. */
  async request(type, off, payload = new Uint8Array(0), ms = 6000, flags = 0) {
    const seq = ++this.seq;
    await this.write(this.frame(type, seq, off >>> 0, payload, flags));
    return this.until(() => {
      while (this.frames.length) { const f = this.frames.shift(); if (f.type === type && f.seq === seq && f.off === off >>> 0) return f; }
      return null;
    }, ms, { c: type, a: hex(off >>> 0) });
  }
}
class TimeoutError extends Error { constructor(what) { super(fill(MSG.timeout, what)); this.code = 'timeout'; this.p = what; } }

// ------------------------------------------------------------------ app loading
/** Make a PDLO file from a raw image (up to 64 KB, runs from PRAM 0). */
function buildPdlo(img) {
  const head = new Uint8Array(16); head.set(ascii('PDLO')); w32(head, 4, IMAGE_SIZE / 4); head.set(ascii(PDLO_TOKEN), 8);
  const body = new Uint8Array(IMAGE_SIZE); body.set(img.subarray(0, IMAGE_SIZE));
  const f = new Uint8Array(16 + IMAGE_SIZE); f.set(head); f.set(body, 16);
  for (let i = 0; i < f.length; i += 4) w32(f, i, u32(f, i) ^ PDLO_XOR);
  return f;
}
let keystream = null;
async function chunk(idx, payload) {
  const nonce = new Uint8Array([1, 0, 0, 0]);
  if (!keystream) { const s = new Uint8Array(4 + 32); s.set(nonce); s.set(ascii(LINK_KEY), 4); keystream = await sha256(s); }
  const body = new Uint8Array(12 + payload.length);
  body.set(ascii('TCP'), 4); body[7] = 3; body[8] = idx & 255; body[9] = 255 - (idx & 255);
  const c = crc16(payload); body[10] = c & 255; body[11] = c >> 8;
  body.set(payload, 12);
  const k = keystream.slice();
  for (let i = 0; i < body.length; i++) { const j = i % 32; body[i] ^= k[j]; k[j] = (k[j] * 2 + 1) & 255; }
  const out = new Uint8Array(4 + body.length); out.set(nonce); out.set(body, 4);
  return out;
}
/** Is the device on the download screen? */
/* 1.7.2 PROBE_RETRY: some adapters (PL2303) lose or garble the first bytes after opening, and the hello frame before
 * has no line end: the line is ended first, three tries, any line before the answer is skipped */
const PROBE_RETRY = true;
async function probe(link) {
  if (!PROBE_RETRY) { link.clear(); await link.writeLine('ECHO REQ'); try { return (await link.waitLine(2000)).startsWith('ECHO REP'); } catch (e) { if (!(e instanceof TimeoutError)) throw e; return false; } }
  for (let t = 0; t < 3; t++) {
    await link.write(ascii('\r\n')); await sleep(150 * link.scale, link.signal); link.clear();
    await link.writeLine('ECHO REQ');
    const end = Date.now() + 2000 * link.scale;
    for (;;) {
      const left = end - Date.now(); if (left <= 0) break;
      let l = ''; try { l = await link.waitLine(left / link.scale); } catch (e) { if (!(e instanceof TimeoutError)) throw e; break; }
      if (l.indexOf('ECHO REP') >= 0) return true;
    }
  }
  return false;
}
/** Load an image into the device (download screen) and start it. */
async function loadApp(link, img, progress) {
  const file = buildPdlo(img);
  link.clear(); await link.writeLine('PKT ' + file.length);
  const a = await link.waitLine(4000).catch(e => { if (!(e instanceof TimeoutError)) throw e; return ''; });
  if (!a.startsWith('ACK')) throw fe('noAck');
  let idx = 0, guard = 0;
  while (idx * CHUNK < file.length) {
    if (++guard > 200) throw fe('repeats');
    const off = idx * CHUNK, n = Math.min(CHUNK, file.length - off);
    await link.write(await chunk(idx, file.subarray(off, off + n)));
    const r = await link.waitLine(6000);
    if (r.startsWith('ACK')) { idx++; if (progress) progress(Math.min(idx * CHUNK, file.length), file.length); }
    else if (r.startsWith('ENQ')) { const e = parseInt(r.slice(3), 10); if (!isNaN(e)) idx = e; }
    else if (r.startsWith('NAK')) { /* same chunk again */ }
    else if (r.startsWith('CAN')) throw fe('devCancel');
    else throw fe('unexpected', { r });
  }
}

// ------------------------------------------------------------------ rescue start
/*
 * 1.6.13 test13 (PARA_RESCUE): a second load table at 0xFFE000 starts our flash app from 0xFF0000 (not encrypted,
 * CRC-32 of 0xE000 bytes) when the device's own table or firmware does not check out. A device whose own table or firmware is broken (write cut off) then shows the flash screen and
 * can be written again from the Studio, without the download screen.
 * RESCUE_FIRST: before writing, the device's own table is cleared once the rescue start is in place, so the device
 * comes up in the flash app whenever the write is cut off; the table is written back last. Only after the test
 * on the device (rescueTest) showed that the ROM takes the second table.
 */
const PARA_RESCUE = true, RESCUE_FIRST = true, SECTOR_RETRY = true;   // SECTOR_RETRY: test16, see putSector   // test15: RESCUE_FIRST on (test13 on the device: the ROM took the second table)
const RESCUE_OFF = 0xFF0000, RESCUE_TAB = 0xFFE000, RESCUE_CODE = 0xE000;
const MY_LAB_TOOL_OFF = 0xFC0000, TOOL_MARKER_OFF = 0xF000;
/* test23 BAT_PIC: the Paradise's "battery empty" picture in the last sector of the rescue block (0xFFF000), for the
 * emulators to show before they switch off on empty batteries: "BAT1", byte count, 16 colours (RGB565), then one byte
 * per run (colour << 4 | length - 1), 128 x 128 row by row. The sprite's number differs by edition. */
const BAT_PIC = true, BATPIC_OFF = 0xFFF000, BATPIC_IDX = { 'Land': 53, 'Water': 53, 'Sky': 53, 'Jade Forest': 54, 'Tropical': 56, 'Glacier': 56 };
function batPic(img) {
  const C = root.ParamixCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  if (!BAT_PIC || !C) return null;
  try {
    const ctx = C.openRom(img), i = BATPIC_IDX[ctx.edition];
    if (i === undefined || !ctx.entries[i]) return null;
    const s = C.spriteDecode(ctx.entries[i]).subs[0];
    if (s.w !== 128 || s.h !== 128) return null;
    const pal = [], px = new Uint8Array(128 * 128);
    for (let k = 0; k < px.length; k++) {
      const d = s.data, c = d[4 * k + 3] ? ((((d[4 * k] * 31 + 127) / 255) | 0) << 11) | ((((d[4 * k + 1] * 63 + 127) / 255) | 0) << 5) | (((d[4 * k + 2] * 31 + 127) / 255) | 0) : 0xFFFF;
      let j = pal.indexOf(c); if (j < 0) { if (pal.length >= 16) return null; j = pal.push(c) - 1; }
      px[k] = j;
    }
    const out = new Uint8Array(SECTOR).fill(0xFF); let n = 0;
    for (let k = 0; k < px.length; ) {
      let r = 1; while (r < 16 && k + r < px.length && px[k + r] === px[k]) r++;
      if (40 + n >= SECTOR) return null;
      out[40 + n++] = (px[k] << 4) | (r - 1); k += r;
    }
    w32(out, 0, 0x31544142); w32(out, 4, n);
    for (let j = 0; j < 16; j++) { const c = pal[j] || 0; out[8 + 2 * j] = c & 255; out[9 + 2 * j] = c >> 8; }
    return out;
  } catch (e) { return null; }
}
/* 1.7.2: a ROM without the Paradise has no picture of its own: the same sector with our text instead (white on black,
 * "BATTERY EMPTY, SHUTTING DOWN", own 5 x 7 letters at twice the size) */
const BAT_FONT = { A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110', M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001',
  O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  W: '10001100011000110101101011010101010', Y: '10001100010101000100001000010000100' };
function batText() {
  const px = new Uint8Array(128 * 128), lines = ['BATTERY', 'EMPTY', 'SHUTTING', 'DOWN'];
  lines.forEach((ln, li) => {
    const w = ln.length * 12 - 2, x0 = (128 - w) >> 1, y0 = 22 + li * 22;
    for (let c = 0; c < ln.length; c++) {
      const g = BAT_FONT[ln[c]]; if (!g) continue;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y * 5 + x] === '1')
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) px[(y0 + 2 * y + dy) * 128 + x0 + c * 12 + 2 * x + dx] = li < 2 ? 1 : 2;
    }
  });
  const out = new Uint8Array(SECTOR).fill(0xFF); let n = 0;
  for (let k = 0; k < px.length; ) {
    let r = 1; while (r < 16 && k + r < px.length && px[k + r] === px[k]) r++;
    out[40 + n++] = (px[k] << 4) | (r - 1); k += r;
  }
  w32(out, 0, 0x31544142); w32(out, 4, n);
  const pal = [0x0000, 0xFFFF, 0xA514];
  for (let j = 0; j < 16; j++) { const c = pal[j] || 0; out[8 + 2 * j] = c & 255; out[9 + 2 * j] = c >> 8; }
  return out;
}
function rescueBlock(app, hdr, pic) {
  if (!app || app.length > RESCUE_CODE || !hdr || hdr.length < SECTOR || String.fromCharCode(...hdr.subarray(0, 8)) !== 'SONIXDEV') return null;
  const b = new Uint8Array(BLOCK64).fill(0xFF);
  b.set(app, 0);
  if (pic && pic.length === SECTOR) b.set(pic, BATPIC_OFF - RESCUE_OFF);   // test23: not part of the start (CRC_CHK_SUM covers the code only)
  const t = new Uint8Array(hdr.subarray(0, SECTOR));
  w32(t, 0x08, u32(t, 0x08) & ~1);                        // LOAD_CFG: not encrypted (CRC check stays on)
  w32(t, 0x10, 0x60000000 + RESCUE_OFF);                  // ADDR_USERCODE
  w32(t, 0x14, RESCUE_CODE);                              // SIZE_USERCODE
  w32(t, 0x24, crc32(b, 0, RESCUE_CODE));                 // CRC_CHK_SUM
  t.fill(0, 0x80, 0x84);                                  // encrypter mark off
  b.set(t, RESCUE_TAB - RESCUE_OFF);
  return b;
}
const allFF = (d, a, n) => { for (let i = a; i < a + n; i++) if (d[i] !== 0xFF) return false; return true; };
/* test18 RESCUE_OLD: a rescue start of an earlier Studio (other flash app) is ours too and is renewed. Before, an image
 * read from such a device counted 0xFF0000 as taken and the Studio refused to write at all ("no room"). */
const RESCUE_OLD = true;
function isRescue(d, base = 0) {
  const t = base + RESCUE_TAB - RESCUE_OFF;
  return String.fromCharCode(...d.subarray(t, t + 8)) === 'SONIXDEV' && u32(d, t + 0x10) === 0x60000000 + RESCUE_OFF && u32(d, t + 0x14) === RESCUE_CODE;
}
function hasFlashToolTable(block, base) {
  const table = RESCUE_CODE;
  return block.length === BLOCK64 &&
    String.fromCharCode(...block.subarray(table, table + 8)) === 'SONIXDEV' &&
    !(u32(block, table + 8) & 1) && u32(block, table + 0x10) === 0x60000000 + base &&
    u32(block, table + 0x14) === RESCUE_CODE;
}
function validFlashTool(block, base) {
  const sp = u32(block, 0), pc = u32(block, 4);
  return hasFlashToolTable(block, base) && u32(block, RESCUE_CODE + 0x24) === crc32(block, 0, RESCUE_CODE) &&
    sp >= 0x18000000 && sp <= 0x18020000 && !(sp & 7) && (pc & 1) && pc < RESCUE_CODE;
}
function hasMyLabToolMarker(block) {
  return String.fromCharCode(...block.subarray(TOOL_MARKER_OFF, TOOL_MARKER_OFF + 8)) === 'PXMLFT01';
}
function validMyLabToolSlot(block) {
  return hasMyLabToolMarker(block) && u32(block, RESCUE_CODE + 8) === 0x12 &&
    String.fromCharCode(...block.subarray(8, 16)) === 'PXMLSD01' &&
    validFlashTool(block, MY_LAB_TOOL_OFF);
}
function flashToolRevision(app) {
  if (app.length > RESCUE_CODE) return 0;
  const tag = ascii('PXMLVER1');
  for (let off = app.indexOf(tag[0]); off >= 0 && off + 12 <= app.length; off = app.indexOf(tag[0], off + 1)) {
    if (!tag.every((byte, i) => app[off + i] === byte)) continue;
    const revision = u32(app, off + 8);
    if (revision && revision <= 0xFFFFFF) return revision;
  }
  return 0;
}
function bootTableSum(table) {
  let sum = 0;
  for (let off = 0; off < 0x1fc; off += 4) sum = (sum + u32(table, off)) >>> 0;
  return sum;
}
/** The image with the rescue start, or null when 0xFF0000 holds something else. */
/* CLEAN_ROM: a ROM without the Paradise has no battery picture of its own, it shows a short text */
function batFor(img) {
  const F = root.ParamixFeld || (typeof require !== 'undefined' ? require('./feld.js') : null);
  return F && F.isClean && F.isClean(img) ? batText() : batPic(img);
}
function withRescue(img, app) {
  const F = root.ParamixFeld || (typeof require !== 'undefined' ? require('./feld.js') : null);
  const rb = rescueBlock(app, img.subarray(0, SECTOR), batFor(img));
  if (!rb) return null;
  let same = true; for (let i = 0; i < BLOCK64; i++) if (img[RESCUE_OFF + i] !== rb[i]) { same = false; break; }
  if (same) return img;
  if (!allFF(img, RESCUE_OFF, BLOCK64) && !(RESCUE_OLD && isRescue(img, RESCUE_OFF))) return null;
  const out = new Uint8Array(img); out.set(rb, RESCUE_OFF); return out;
}

/*
 * test15: T18Emu installed before test13 with its hot window has a firmware block at 0xFF0000. That block's guest
 * moves into the hot slot of the least used one (0xF0 up), that one's guest into T18Emu's last spare (which must be
 * unused), and the spare list gets one shorter: 0xFF0000 is free, the save stays. Only guest blocks the game never
 * wrote (stored map = settings map) move; the stored map ("T8MP" in its save area) is patched after the save was
 * taken from the device. moves: [{ c, so, ns, list: [{ g, from, to }] }]
 */
const T18M = 0x38584D50, T8MP = 0x504D3854, T8SS = 0x53533854, T8_SOFF = 4 + 256 + 64;
const rd16 = (b, o) => b[o] | (b[o + 1] << 8);
const wr16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
function t18Relocate(image, bases) {
  const moves = [];
  for (const base of bases || []) {
    const c = base + 0x140; if (u32(image, c) !== T18M) continue;
    const ns = Math.min(u32(image, c + 12), 64), so = u32(image, c + 8);
    const mapIdx = (b) => { for (let i = 0; i < 128; i++) if (rd16(image, c + 16 + 2 * i) === b) return i; return -1; };
    let sp0 = false; for (let i = 0; i < ns; i++) if (rd16(image, c + 272 + 2 * i) === 0xFF) sp0 = true;
    const top = mapIdx(0xFF);
    if (top < 0 && !sp0) continue;
    if (sp0 || ns < 2) return null;
    const S = rd16(image, c + 272 + 2 * (ns - 1)), list = [];
    let L = -1, gl = -1;
    if (image[c + 400] & 4) for (let b = 0xF0; b <= 0xFC; b++) { const g = mapIdx(b); if (g >= 0) { L = b; gl = g; break; } }
    const mv = (from, to, g) => { image.copyWithin(to << 16, from << 16, (from + 1) << 16); wr16(image, c + 16 + 2 * g, to); list.push({ g, from, to }); };
    if (L >= 0) { mv(L, S, gl); mv(0xFF, L, top); } else mv(0xFF, S, top);
    image.fill(0xFF, 0xFF0000, 0x1000000);
    w32(image, c + 12, ns - 1); wr16(image, c + 272 + 2 * (ns - 1), 0xFFFF);
    moves.push({ c, so, ns, S, list });
  }
  return moves;
}
/* the device's settings block (d at dc) as it reads after the moves of the T18Emu at c (for comparing) */
function t18Moved(d, dc, moves, c) {
  const m = moves && moves.find((x) => x.c === c); if (!m) return { d, dc };
  const t = new Uint8Array(d.subarray(dc, dc + 0x200));
  for (const { g, from, to } of m.list) if (rd16(t, 16 + 2 * g) === from) wr16(t, 16 + 2 * g, to);
  if (u32(t, 12) === m.ns && rd16(t, 272 + 2 * (m.ns - 1)) === m.S) { w32(t, 12, m.ns - 1); wr16(t, 272 + 2 * (m.ns - 1), 0xFFFF); }
  return { d: t, dc: 0 };
}
/* after the save was taken over: the moved guests must be unwritten and the last spare unused; patch the stored map */
function t18MovesFinish(image, moves) {
  const secs = new Set();
  for (const m of moves) {
    const t8 = u32(image, m.so) === T8MP;
    if (t8) {
      if (image[m.so + 4 + 256 + m.ns - 1]) return null;   // the spare is in use
      if (u32(image, m.so + T8_SOFF) === T8SS) for (let r = 0; r < 19; r++) for (let j = 0; j < 16; j++) { const v = image[m.so + T8_SOFF + 132 + 16 * r + j]; if (v && ((v - 1) >> 4) === m.ns - 1) return null; }
      for (const { g, from, to } of m.list) { const v = rd16(image, m.so + 4 + 2 * g); if (v !== from && v !== to) return null; }   // the game wrote that block (to: moved before)
      for (const { g, to } of m.list) wr16(image, m.so + 4 + 2 * g, to);
      secs.add(m.so);
    }
    secs.add(m.c & ~0xFFF);
    for (const { to } of m.list) for (let s = to << 16; s < (to + 1) << 16; s += SECTOR) secs.add(s);
  }
  for (let s = 0xFF0000; s < 0x1000000; s += SECTOR) secs.add(s);
  return secs;
}

// ------------------------------------------------------------------ device
class Paradise {
  constructor(link) { this.link = link; this.info = null; }
  get block() { const b = this.info.maxBlock; return b === 1024 || b === 2048 || b === 4096 ? b : 1024; }
  updateBattery(millivolts, percent) {
    if (!millivolts || millivolts > 6000 || percent > 100) return;
    const previous = this.info.battery;
    if (previous?.millivolts === millivolts && previous.percent === percent) return;
    this.info.battery = { millivolts, percent };
    this.onBatteryChange?.();
  }
  async hello(ms = 6000) {
    const r = await this.link.request(HELLO, 0, undefined, ms);
    const p = r.payload; if (p.length !== 44) throw fe('hello');
    const capabilities = u32(p, 40);
    this.info = { revision: u32(p, 0), edition: p[8], wave: p[9], maxBlock: p[10] | (p[11] << 8), jedec: u32(p, 24), capacity: u32(p, 32), flashError: u32(p, 36),
      resetControl: !!(capabilities & 1), readOnly: !!(capabilities & 2), rescueBootstrap: !!(capabilities & 4),
      batteryOverride: !!(capabilities & 8), displayProgress: !!(capabilities & 16), batteryStatus: !!(capabilities & 32),
      fastWrite: !!(capabilities & FAST_WRITE_CAPABILITY), blockWrite: !!(capabilities & BLOCK_WRITE_CAPABILITY),
      remoteRestart: !!(capabilities & REMOTE_RESTART_CAPABILITY),
      restartCountdown: !!(capabilities & RESTART_COUNTDOWN_CAPABILITY),
      flashToolReload: !!(capabilities & FLASH_TOOL_RELOAD_CAPABILITY) };
    if (this.info.batteryStatus) {
      this.updateBattery(u32(p, 12), u32(p, 20));
      this.batterySampleAt = performance.now();
    }
    if (this.info.edition === 0xFE || this.info.edition === MY_LAB_ON_PARADISE) {
      this.info.name = this.info.edition === MY_LAB_ON_PARADISE ? 'My Lab on Paradise' : 'My Lab';
      return this.info;
    }
    this.info.editionIdentified = false;
    // The flash app always reports 1 (Land). The real edition is the ID page in the flash
    // (0xD49000, Tropical/Glacier 0xD29000, Neon Planets 0xD85000).
    try {
      // 1.7.3 test11: Tropical/Glacier first, with the page's footer (C minus ID, inverse): a Glacier was taken for Land
      // (its save data at 0xD49000 can begin with 1..6)
      const C = [0, 0x70169E2C, 0x70169E2C, 0x70169E2C, 0x849633DB, 0x96CB83B8, 0x96CB83B8, 0x99431749];
      const ok = async (p, ids) => { const a = await this.read(p, 4), v = u32(a, 0); if (!ids.includes(v)) return 0;
        const f = await this.read(p + 0xFF8, 8), k = u32(f, 0); const footer = (k + v) >>> 0, valid = u32(f, 4) === (~k >>> 0);
        if (valid && v === 4 && (p === 0xD29000 || p === 0xEFD000) && footer === C[5]) return 7;
        if (p === 0xD29000 && v === 4) return 0;
        return valid && footer === C[v] ? (v === 7 ? 8 : v) : -v; };
      const n = await ok(0xD85000, [7]), g = n > 0 ? 0 : await ok(0xD29000, [4, 5, 6]);
      const l = n > 0 || g > 0 ? 0 : await ok(0xD49000, [1, 2, 3, 4]);
      const c = n > 0 || g > 0 || l > 0 ? 0 : await ok(0xEFD000, [1, 2, 3, 4, 5, 6, 7]);
      const v = n > 0 ? n : g > 0 ? g : l > 0 ? l : c > 0 ? c : l < 0 ? -l : g < 0 ? -g : 0;
      if (v) {
        this.info.edition = v;
        this.info.editionIdentified = true;
      }
    } catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    this.info.name = EDITIONS[this.info.edition] || 'Edition ' + this.info.edition;
    return this.info;
  }
  ready() { if (!this.info || this.info.capacity !== FLASH_SIZE || this.info.flashError) throw fe('notReady'); }
  async restart() {
    if (!this.info?.remoteRestart || this.resetDepth) return false;
    // The device may already be resetting if its acknowledgement is lost.
    const reply = await this.link.request(RESTART_DEVICE, 0, undefined, 3000);
    return reply.status === 0;
  }
  async restartWithCountdown() {
    if (!this.info?.restartCountdown || this.resetDepth) return null;
    const { status } = await this.link.request(RESTART_COUNTDOWN, 0, undefined, 6000);
    return status === 0 ? 'restarting' : status === 2 ? 'cancelled' : null;
  }
  async reloadFlashTool(plan) {
    if (!this.info?.flashToolReload || this.resetDepth) return false;
    const reply = await this.link.request(RELOAD_FLASH_TOOL, 0, u32le(plan.codeCRC), 5000);
    return reply.status === 0;
  }
  /** The device also keeps its own incomplete-write latch; IDLE can be refused. */
  async resetIdle(idle) {
    if (!this.info || !this.info.resetControl) return false;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.link.request(RESET_CONTROL, 0, u32le(idle ? 1 : 0), 3000);
        return r.status === 0;
      } catch (e) { if (!(e instanceof TimeoutError) || attempt >= 2) throw e; }
    }
  }
  /** Hold the reset lock across a complete operation, including nested checks. */
  async resetTask(fn) {
    if (!this.resetDepth) this.resetFailed = false;
    this.resetDepth = (this.resetDepth || 0) + 1;
    let complete = false;
    try {
      if (this.resetDepth === 1 && this.info && this.info.resetControl && !await this.resetIdle(false))
        throw new Error('The device could not lock reset');
      const result = await fn();
      complete = true;
      return result;
    } finally {
      if (!complete) this.resetFailed = true;
      this.resetDepth--;
      if (!this.resetDepth && !this.resetFailed) {
        // Failed operations stay locked. A lost IDLE reply never masks the completed result.
        try { await this.resetIdle(true); } catch (_) {}
      }
    }
  }

  async read(off, len, progress) {
    const out = new Uint8Array(len), blk = this.block;
    progress?.(0, len);
    for (let o = 0; o < len; o += blk) {
      let r = null;
      for (let t = 0; t < 5 && !r; t++) {
        try { const x = await this.link.request(READ, off + o, u32le(blk)); if (x.payload.length === blk && !x.status) r = x; }
        catch (e) { if (!(e instanceof TimeoutError)) throw e; }
      }
      if (!r) throw fe('readErr', { a: hex(off + o) });
      out.set(r.payload.subarray(0, Math.min(blk, len - o)), o);
      progress?.(Math.min(o + blk, len), len);
    }
    return out;
  }
  async crc(off, len) {
    for (let t = 0; t < 4; t++) {
      try { const c = await this.link.request(CRC, off, u32le(len), 15000); if (c.payload.length === 4 && !c.status) return u32(c.payload, 0); }
      catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    }
    throw fe('noCrc', { a: hex(off) });
  }
  async compareSectors(img, off) {
    const count = BLOCK64 / SECTOR;
    const expected = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) w32(expected, i * 4, crc32(img, off + i * SECTOR, SECTOR));
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const reply = await this.link.request(COMPARE_SECTORS, off, expected, 15000);
        if (!reply.status && reply.payload.length === 2) return reply.payload[0] | (reply.payload[1] << 8);
      } catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    }
    throw fe('noCrc', { a: hex(off) });
  }
  async reportProgress(phase, done, total, notify) {
    notify?.(phase, done, total);
    if (!this.info?.displayProgress || !total) return;
    const step = Math.floor(done * 24 / total);
    const now = performance.now();
    const sample = phase === 'read' && this.info.batteryStatus && now - this.batterySampleAt >= BATTERY_SAMPLE_INTERVAL_MS;
    if (done && this.displayPhase === phase && this.displayStep === step && !sample) return;
    this.displayPhase = phase;
    this.displayStep = step;
    const data = new Uint8Array(8);
    w32(data, 0, done);
    w32(data, 4, total);
    try {
      if (sample) this.batterySampleAt = now;
      const reply = await this.link.request(DISPLAY_PROGRESS, DISPLAY_PHASE[phase], data, 1200, sample ? DISPLAY_SAMPLE_BATTERY : 0);
      if (sample && !reply.status && reply.payload.length === 8)
        this.updateBattery(u32(reply.payload, 0), u32(reply.payload, 4));
    }
    catch (e) { if (!(e instanceof TimeoutError)) throw e; }
  }
  /** Seconds counter of the Paradise (1.3.0 flash app). null if the app is older. */
  async clockRead() {
    try { const r = await this.link.request(CLOCK_READ, 0, undefined, 2500); if (!r.status && r.payload.length === 8) return { counter: u32(r.payload, 0), ctrl: u32(r.payload, 4) }; }
    catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    return null;
  }
  /** Set the seconds counter. Returns true if the device took it. */
  async clockSet(v) {
    if (!Number.isInteger(v) || v < 0 || v > 0xFFFFFFFF) return false;
    try {
      const reply = await this.link.request(CLOCK_SET, 0, u32le(v), 2500);
      if (reply.status || reply.payload.length !== 4) return false;
      // An unchanged counter below the requested value is not a successful write.
      return ((u32(reply.payload, 0) - v) >>> 0) < 5;
    }
    catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    return false;
  }
  /** Identify non-erased sectors by CRC, one block at a time. */
  async *usedSectorBlocks(from, to, cancel) {
    const ff = new Uint8Array(BLOCK64).fill(0xFF);
    const blockCrc = crc32(ff), sectorCrc = crc32(ff, 0, SECTOR);
    for (let off = from & ~(BLOCK64 - 1); off < to; off += BLOCK64) {
      if (cancel?.()) throw fe('cancelled');
      const addresses = [], end = Math.min(off + BLOCK64, to);
      if (await this.crc(off, BLOCK64) !== blockCrc) {
        for (let sector = off; sector < end; sector += SECTOR) {
          if (sector < from) continue;
          if (cancel?.()) throw fe('cancelled');
          if (await this.crc(sector, SECTOR) !== sectorCrc) addresses.push(sector);
        }
      }
      yield { addresses, end };
    }
  }

  /** Which 4 KB sectors in [from, to) are not empty (0xFF)? Uses the CRC, reads nothing. */
  async usedSectors(from, to, progress, cancel) {
    const out = [];
    await this.reportProgress('compare', 0, to - from, progress);
    for await (const { addresses, end } of this.usedSectorBlocks(from, to, cancel)) {
      out.push(...addresses);
      await this.reportProgress('compare', end - from, to - from, progress);
    }
    return out;
  }

  /** Read a sector-aligned region, skipping erased sectors and reporting coverage. */
  async readSparse(from, to, progress, cancel) {
    this.ready();
    const image = new Uint8Array(to - from).fill(0xFF);
    await this.reportProgress('read', 0, image.length, progress);
    for await (const { addresses, end } of this.usedSectorBlocks(from, to, cancel)) {
      for (const address of addresses) {
        if (cancel?.()) throw fe('cancelled');
        image.set(await this.read(address, SECTOR), address - from);
      }
      if (cancel?.()) throw fe('cancelled');
      await this.reportProgress('read', end - from, image.length, progress);
    }
    return image;
  }
  /** Writer state; asked again a few times, then a ping (1.5.6: a lost answer here broke the write). */
  async writeState() {
    for (let t = 0; t < 3; t++) {
      try { return await this.link.request(WRITE_STATE, 0, undefined, 6000); }
      catch (e) { if (!(e instanceof TimeoutError)) throw e; }
      try { await this.link.request(HELLO, 0, undefined, 3000); } catch (e) { if (!(e instanceof TimeoutError)) throw e; }
    }
    throw fe('lost');
  }
  async beginWrite(data) {
    let reply = await this.link.request(WRITE_BEGIN, 0, data, 15000);
    if (reply.status === 3 && reply.payload.length === 4) {
      const mv = u32(reply.payload, 0);
      if (this.info.batteryOverride && this.confirmLowBattery) {
        if (!await this.confirmLowBattery(mv)) throw fe('cancelled');
        reply = await this.link.request(WRITE_BEGIN, 0, data, 15000, WRITE_ALLOW_LOW_BATTERY);
      } else if (!this.info.batteryOverride && this.info.edition === 0xFE) {
        throw fe('lowBatteryLegacy', { v: (mv / 1000).toFixed(2) });
      }
    }
    checkWriteBattery(reply);
    if (reply.status) throw fe('notReady');
    return reply;
  }
  /** Write and verify 4 KB sectors. Publish referenced data before its settings. */
  async writeSectors(map, progress, cancel, guard, finishCheck, publishLast, myLabSlot = false) {
    this.ready();
    if (this.info.readOnly) throw new Error('The connected Flash Tool is read-only');
    const myLabSave = this.info.edition === 0xFE || this.info.edition === MY_LAB_ON_PARADISE;
    let jobs = [...map.keys()].sort((a, b) =>
      (Number(publishLast?.has(a) ?? false) - Number(publishLast?.has(b) ?? false)) || a - b)
      .map((s) => [s, map.get(s)]), extra = 0;
    if (myLabSave) {
      const ML = root.ParamixMyLab || require('./mylab.js');
      const from = myLabSlot ? ML.menuSaveBank(0) : ML.DEVICE_SAVE_FIRST;
      const end = myLabSlot ? ML.MENU_SLOT_CONTROL : ML.DEVICE_SAVE_END;
      if (jobs.some(([s, data]) => !Number.isInteger(s) || s % SECTOR || s < from ||
          s >= end || data.length !== SECTOR)) throw new Error('Invalid My Lab save sector');
      if (myLabSlot && jobs.length && (!publishLast?.size || publishLast.size !== 1 ||
          ![0, 1, 2].some(index => {
            const bank = ML.menuSaveBank(index);
            return publishLast.has(bank) && map.has(bank) &&
              jobs.every(([address]) => address >= bank && address < bank + ML.MENU_BANK_SIZE);
          }))) throw new Error('Invalid My Lab save slot write');
    }
    // test15: with the rescue start on the device, its own table is off while the pages are written, back last
    if (!myLabSave && guard && PARA_RESCUE && RESCUE_FIRST && !map.has(0)) {
      const hdr = await this.read(0, SECTOR), rb = rescueBlock(guard, hdr, BAT_PIC ? new Uint8Array(await this.read(BATPIC_OFF, SECTOR)) : null);   // test23: the picture there as it is
      if (rb && await this.crc(RESCUE_OFF, BLOCK64) === crc32(rb)) { jobs = [[0, new Uint8Array(SECTOR).fill(0xFF)]].concat(jobs, [[0, hdr]]); extra = 2; }
    }
    return this.#writeSectorJobs(jobs, progress, cancel, finishCheck, extra);
  }
  async #writeSectorJobs(jobs, progress, cancel, finishCheck, extra = 0) {
    const myLab = this.info.edition === 0xFE || this.info.edition === MY_LAB_ON_PARADISE;
    const st = await this.writeState();
    if (!(st.payload.length >= 16 && u32(st.payload, 12))) await this.link.request(WRITE_TEST, 0, undefined, 15000);
    const begin = new Uint8Array(myLab ? 40 : 36);
    if (myLab) w32(begin, 36, jobs.length);
    await this.beginWrite(begin);
    await this.reportProgress('write', 0, jobs.length, progress);
    let n = 0;
    for (let q = 0; q < jobs.length; q++) {
      if (cancel && cancel()) {   // the table always comes back
        if (!extra || n === jobs.length - 1) throw fe('cancelledWrite');
        if (n) { jobs = jobs.slice(0, n).concat([jobs[jobs.length - 1]]); cancel = null; }
        else throw fe('cancelledWrite');
      }
      const [s, d] = jobs[q];
      await this.putSector(s, d);
      await this.reportProgress('write', ++n, jobs.length, progress);
    }
    // Final read-back checks must pass before the device clears its incomplete-write latch.
    if (finishCheck) {
      await this.reportProgress('check', 0, 1, progress);
      await finishCheck();
      await this.reportProgress('check', 1, 1, progress);
    }
    await this.link.request(WRITE_FINISH, 0, undefined, 15000);
    return n - extra;
  }
  /** The steps that move T18Emu's block from 0xFF0000 on the device (see write), as [address, 4 KB] in order. */
  async t18Pre(image, moves) {
    const out = [];
    for (const m of moves) {
      const cs = m.c & ~(SECTOR - 1), co = m.c - cs, dc = new Uint8Array(await this.read(cs, SECTOR));
      if (u32(dc, co) !== T18M || u32(dc, co + 12) !== m.ns || rd16(dc, co + 272 + 2 * (m.ns - 1)) !== m.S) continue;   // another T18Emu on the device
      if (!m.list.every(({ g, from }) => rd16(dc, co + 16 + 2 * g) === from)) continue;
      const dt = new Uint8Array(await this.read(m.so, SECTOR)), t8 = u32(dt, 0) === T8MP;
      const blk = (b) => { for (let a = b << 16; a < (b + 1) << 16; a += SECTOR) out.push([a, image.slice(a, a + SECTOR)]); };
      // with a stored map that map is what T18Emu follows: only it changes here, the settings block (in the sector with
      // the program's start) comes later with the rest, after the rescue start is in place and the table is off
      const step = (k) => {
        const { g, to } = m.list[k];
        blk(to);
        if (t8) { wr16(dt, 4 + 2 * g, to); out.push([m.so, dt.slice()]); return; }
        if (k === 0) { w32(dc, co + 12, m.ns - 1); wr16(dc, co + 272 + 2 * (m.ns - 1), 0xFFFF); }
        wr16(dc, co + 16 + 2 * g, to); out.push([cs, dc.slice()]);
      };
      for (let k = 0; k < m.list.length; k++) step(k);
    }
    return out;
  }
  /**
   * One 4 KB sector: data packets, then the commit with the sector's CRC-32; the device erases, programs, reads back
   * and compares. test16 (SECTOR_RETRY): a lost answer is asked again (both steps can be repeated without harm), and a
   * flash app that checks the buffer first (status 2: the buffer does not match, nothing written) gets the sector again.
   */
  async putSector(s, d, fastWrite = false) {
    const blk = this.block, want = crc32(d, 0, SECTOR);
    const ask = async (type, off, pl, ms) => {
      for (let t = 0; ; t++) {
        try { return await this.link.request(type, off, pl, ms); }
        catch (e) { if (!(SECTOR_RETRY && e instanceof TimeoutError && t < 2)) throw e; }
      }
    };
    if (fastWrite && this.info.fastWrite) {
      const c = await ask(WRITE_SECTOR, s, d, 15000);
      checkWriteBattery(c);
      if (c.status || c.payload.length !== 8) throw fe('notAccepted', { a: hex(s) });
      if (u32(c.payload, 4) || u32(c.payload, 0) !== want) throw fe('differs', { a: hex(s) });
      return;
    }
    for (let t = 0; t < (SECTOR_RETRY ? 3 : 1); t++) {
      for (let o = 0; o < SECTOR; o += blk) await ask(WRITE_DATA, s + o, d.subarray(o, o + blk), SECTOR_RETRY ? 5000 : 15000);
      const c = await ask(WRITE_COMMIT, s, u32le(want), 15000);
      checkWriteBattery(c);
      if (c.payload.length !== 8) throw fe('notAccepted', { a: hex(s) });
      const st = u32(c.payload, 4);
      if (st === 2 && SECTOR_RETRY) continue;   // the device's buffer did not match: send again
      if (st || u32(c.payload, 0) !== want) throw fe('differs', { a: hex(s) });
      return;
    }
    throw fe('differs', { a: hex(s) });
  }
  async putBlock(addr, mask, image, cancel) {
    const expected = crc32(image, addr, BLOCK64);
    // Flash Tool snapshots the block before receiving changes. The commit must
    // verify the entire staged image before erasing and verify the flash after.
    const stage = new Uint8Array(8);
    w32(stage, 0, mask);
    w32(stage, 4, expected);
    const ask = async (type, off, payload) => {
      if (cancel?.()) throw fe('cancelledWrite');
      const reply = await this.link.request(type, off, payload, 15000);
      checkWriteBattery(reply);
      if (reply.status) throw fe('notAccepted', { a: hex(off) });
      return reply.payload;
    };
    await ask(STAGE_BLOCK, addr, stage);
    for (let i = 0; i < SECTORS_PER_BLOCK; i++) {
      if (!(mask & (1 << i))) continue;
      const off = addr + i * SECTOR;
      await ask(STAGE_BLOCK_SECTOR, off, image.subarray(off, off + SECTOR));
    }
    // A lost commit reply does not trigger an automatic replay of the erase.
    const result = await ask(COMMIT_BLOCK, addr, u32le(expected));
    if (result.length !== 8 || u32(result, 4) || u32(result, 0) !== expected)
      throw fe('differs', { a: hex(addr) });
  }
  /** Rescue start in place on the device? 'ok', 'free' (0xFF0000 empty) or 'busy'. */
  async rescueState(block) {
    if (await this.crc(RESCUE_OFF, BLOCK64) === crc32(block)) return 'ok';
    if (RESCUE_OLD && isRescue(new Uint8Array(await this.read(RESCUE_TAB, SECTOR)), RESCUE_OFF - RESCUE_TAB)) return 'free';   // an older one: renewed
    return (await this.usedSectors(RESCUE_OFF, FLASH_SIZE)).length ? 'busy' : 'free';
  }
  async rescueInstall(block, progress, cancel) {
    const m = new Map(); for (let s = 0; s < BLOCK64; s += SECTOR) m.set(RESCUE_OFF + s, block.subarray(s, s + SECTOR));
    await this.writeSectors(m, progress, cancel, null, async () => {
      if (await this.crc(RESCUE_OFF, BLOCK64) !== crc32(block)) throw fe('rescueFail');
    });
  }
  /** Updates the installed Menu's tool. Return null if the loader or slot is unsuitable. */
  async planFlashToolUpdate(app, stub, progress) {
    this.ready();
    if (this.info.readOnly || !app?.length || app.length > RESCUE_CODE) return null;
    const readStage = (phase, off, len) => {
      progress?.(phase, 0, len);
      return this.read(off, len, (done, total) => { if (done) progress?.(phase, done, total); });
    };
    progress?.('flashInspectBoot');
    const header = await this.read(0, SECTOR);
    const source = u32(header, 0x10) - 0x60000000, length = u32(header, 0x14);
    const flags = u32(header, 8);
    if (String.fromCharCode(...header.subarray(0, 8)) !== 'SONIXDEV' ||
        (flags !== 0x13 && flags !== 0x12) || source < SECTOR || (source & 3) ||
        !length || length > BLOCK64 || (length & 3) || source + length > RESCUE_OFF) return null;
    if (flags === 0x12 && await this.crc(source, length) !== u32(header, 0x24)) return null;

    const native = this.info.edition === 0xFE, ported = this.info.edition === MY_LAB_ON_PARADISE;
    if (native || ported) {
      progress?.('flashFindMenu');
      const hook = await this.read(0x19D100, 16);
      const marker = String.fromCharCode(...hook.subarray(0, 8));
      if (native ? (marker !== 'PXMLAB02' || source !== SECTOR || flags !== 0x13) :
          (marker !== 'PXMLABP1' || source !== 0x37000 || flags !== 0x12)) return null;
      const stubEntry = await this.read(0x3600c, 4);
      if (u32(stubEntry, 0) !== 0x4604B672) return null;
      if (native) {
        const menuLength = u32(hook, 8);
        if (!menuLength || menuLength > RESCUE_CODE || menuLength % SECTOR) return null;
        const menu = await readStage('flashFindMenu', 0x37000, menuLength);
        // Recognize the fork's native Menu, which already checks the separate
        // update slot. Older builds place the version tag near the end.
        if (crc32(menu) !== u32(hook, 12) || u32(menu, 0x140) !== 0x444c4546 || u32(menu, 0x160) !== 0x36000 ||
            !/PMXVER:(?:0\.\d+\.\d+\0|1\.7\.6-plus\.\d+\0)/.test(new TextDecoder().decode(menu))) return null;
      }
    } else {
      if (!stub) return null;
      const F = root.ParamixFeld || require('./feld.js');
      const view = new Uint8Array(0x110000);
      view.set(await readStage('flashFindMenu', 0x90000, 0x80000), 0x90000);
      const menu = F.feldFind(view, stub);
      if (!menu || menu.version < 5 || u32(view, menu.stubOff + 0x0c) !== 0x4604B672) return null;
      const appSource = F.feldApps(view, stub).dl;
      if (appSource && appSource !== 0x10000000 + RESCUE_OFF - 0x11000) return null;
    }

    const rescue = await readStage('flashReadStored', RESCUE_OFF, BLOCK64);
    // The existing table identifies the installed tool even when a canceled
    // update left its code incomplete. Native My Lab needs a working fallback.
    if (!hasFlashToolTable(rescue, RESCUE_OFF) || (native && !validFlashTool(rescue, RESCUE_OFF))) return null;
    const base = native ? MY_LAB_TOOL_OFF : RESCUE_OFF;
    const before = native ? await readStage('flashReadUpdateSlot', base, BLOCK64) : rescue;
    progress?.('flashCompareTool');
    const updateMarker = ascii('PXMLFT01');
    const nativeSlotMarked = native && hasMyLabToolMarker(before);
    const boot = crc32(header);
    if (native && allFF(before, 0, BLOCK64) && crc32(rescue, 0, app.length) === crc32(app) &&
        allFF(rescue, app.length, RESCUE_CODE - app.length)) {
      return { base, jobs: [], boot };
    }
    // Keep the existing table's device fields, battery picture and pairing
    // record. Native My Lab publishes its selection marker after the table.
    const next = rescueBlock(app, rescue.subarray(RESCUE_CODE, RESCUE_CODE + SECTOR));
    next.set(before.subarray(TOOL_MARKER_OFF), TOOL_MARKER_OFF);
    if (native) next.set(updateMarker, TOOL_MARKER_OFF);
    const table = next.subarray(RESCUE_CODE, RESCUE_CODE + SECTOR);
    w32(table, 0x10, 0x60000000 + base);
    w32(table, 0x1fc, bootTableSum(table));
    if (native && !nativeSlotMarked) {
      if (!allFF(before, TOOL_MARKER_OFF, SECTOR)) return null;
      for (let off = 0; off < TOOL_MARKER_OFF; off += SECTOR)
        if (!allFF(before, off, SECTOR) &&
            before.subarray(off, off + SECTOR).some((byte, i) => byte !== next[off + i])) return null;
    }
    if (!validFlashTool(next, base)) return null;
    const jobs = [];
    for (let off = 0; off < BLOCK64; off += SECTOR) {
      const bytes = next.subarray(off, off + SECTOR);
      if (bytes.some((byte, i) => byte !== before[off + i])) jobs.push([base + off, bytes]);
    }
    return { base, jobs, previous: crc32(before), expected: crc32(next), boot, codeCRC: u32(table, 0x24) };
  }
  async writeFlashToolUpdate(plan, progress, cancel) {
    this.ready();
    const base = this.info.edition === 0xFE ? MY_LAB_TOOL_OFF : RESCUE_OFF;
    const last = base + (base === MY_LAB_TOOL_OFF ? TOOL_MARKER_OFF : RESCUE_CODE);
    if (!plan.jobs.length || cancel?.()) return 0;
    if (this.info.readOnly || plan.base !== base ||
        plan.jobs.some(([off, data]) => !Number.isInteger(off) || off % SECTOR || off < base ||
          off > last || data.length !== SECTOR) || await this.crc(0, SECTOR) !== plan.boot ||
        await this.crc(plan.base, BLOCK64) !== plan.previous) throw fe('checkFail', { a: hex(plan.base) });
    return this.#writeSectorJobs(plan.jobs, progress, cancel, async () => {
      if (await this.crc(plan.base, BLOCK64) !== plan.expected) throw fe('checkFail', { a: hex(plan.base) });
    });
  }
  async planMyLabRescue(image) {
    if (this.info.edition !== 0xFE || !this.info.rescueBootstrap || this.info.readOnly)
      throw new Error('A writable My Lab UART bootstrap is required');
    const target = image.subarray(RESCUE_OFF, FLASH_SIZE);
    if (await this.crc(0, SECTOR) !== crc32(image, 0, SECTOR))
      throw new Error('The My Lab boot header does not match this device');
    const existing = await this.read(RESCUE_OFF, BLOCK64);
    if (existing.some((byte, i) => (byte | target[i]) !== byte))
      throw new Error('The My Lab rescue area contains unrelated data');
    const table = target.subarray(RESCUE_TAB - RESCUE_OFF, RESCUE_TAB - RESCUE_OFF + SECTOR);
    if (String.fromCharCode(...target.subarray(8, 16)) !== 'PXMLSD01' ||
        String.fromCharCode(...table.subarray(0, 8)) !== 'SONIXDEV' ||
        u32(table, 0x10) !== 0x60000000 + RESCUE_OFF ||
        u32(table, 0x14) !== RESCUE_CODE ||
        u32(table, 0x24) !== crc32(target, 0, RESCUE_CODE))
      throw new Error('Invalid My Lab rescue image');
    const body = [];
    const differs = off => image.subarray(off, off + SECTOR)
      .some((byte, index) => byte !== existing[off - RESCUE_OFF + index]);
    for (let off = RESCUE_OFF; off < FLASH_SIZE; off += SECTOR)
      if (off !== RESCUE_TAB && differs(off)) body.push(off);
    return { body, writeTable: differs(RESCUE_TAB), target, table };
  }

  /** Write and verify the rescue body before publishing its load table. */
  async bootstrapMyLabRescue(image, progress, cancel, plan) {
    const { body, writeTable, target, table } = plan || await this.planMyLabRescue(image);
    const total = body.length + Number(writeTable);
    if (!total) return;
    const st = await this.writeState();
    if (!(st.payload.length >= 16 && u32(st.payload, 12)))
      await this.link.request(WRITE_TEST, 0, undefined, 15000);
    const begin = new Uint8Array(40);
    begin.set(await sha256(image));
    w32(begin, 32, crc32(image));
    w32(begin, 36, total);
    if (cancel?.()) throw fe('cancelled');
    await this.beginWrite(begin);
    await this.reportProgress('write', 0, total, progress);
    let done = 0;
    for (const off of body) {
      if (cancel?.()) throw fe('cancelledWrite');
      await this.putSector(off, image.subarray(off, off + SECTOR));
      await this.reportProgress('write', ++done, total, progress);
    }
    if (await this.crc(RESCUE_OFF, RESCUE_CODE) !== u32(table, 0x24)) throw fe('rescueFail');
    if (cancel?.()) throw fe('cancelledWrite');
    if (writeTable) {
      await this.putSector(RESCUE_TAB, table);
      await this.reportProgress('write', ++done, total, progress);
    }
    await this.reportProgress('check', 0, 1, progress);
    if (await this.crc(RESCUE_OFF, BLOCK64) !== crc32(target)) throw fe('rescueFail');
    await this.reportProgress('check', 1, 1, progress);
    await this.link.request(WRITE_FINISH, 0, undefined, 15000);
  }
  /**
   * Test on the device (1.6.13 test13): rescue start in place, then the device's own table (sector 0) cleared.
   * Returns the cleared sector 0, to be written back with rescueRestore after the restart.
   */
  async rescueTest(app, progress, cancel) {
    this.ready();
    const hdr = await this.read(0, SECTOR), block = rescueBlock(app, hdr);
    if (!block) throw fe('notParadise');
    const st = await this.rescueState(block);
    if (st === 'busy') throw fe('rescueBusy');
    if (st === 'free') await this.rescueInstall(block, progress, cancel);
    await this.writeSectors(new Map([[0, new Uint8Array(SECTOR).fill(0xFF)]]), progress, cancel);
    return hdr;
  }
  async rescueRestore(hdr, progress, cancel) {
    this.ready();
    if (String.fromCharCode(...hdr.subarray(0, 8)) !== 'SONIXDEV') throw fe('notParadise');
    await this.writeSectors(new Map([[0, hdr.subarray(0, SECTOR)]]), progress, cancel, null, async () => {
      if (await this.crc(0, SECTOR) !== crc32(hdr, 0, SECTOR)) throw fe('checkFail', { a: hex(0) });
    });
  }
  /** Whole flash (16 MB). */
  async dump(progress, cancel) {
    this.ready();
    const img = new Uint8Array(FLASH_SIZE);
    await this.reportProgress('read', 0, FLASH_SIZE, progress);
    for (let off = 0; off < FLASH_SIZE; off += BLOCK64) {
      if (cancel && cancel()) throw fe('cancelled');
      img.set(await this.read(off, BLOCK64), off);
      await this.reportProgress('read', off + BLOCK64, FLASH_SIZE, progress);
    }
    return img;
  }
  canQuickDump(base) {
    const info = this.info;
    if (!info || info.capacity !== FLASH_SIZE || info.flashError ||
        info.editionIdentified === false || base?.length !== FLASH_SIZE) return false;
    const ML = root.ParamixMyLab || (typeof require !== 'undefined' ? require('./mylab.js') : null);
    const F = root.ParamixFeld || (typeof require !== 'undefined' ? require('./feld.js') : null);
    if (ML?.hasParadisePortMarker(base))
      return info.edition === MY_LAB_ON_PARADISE && ML.isParadiseFlashImage(base, { crc32 });
    if (ML?.isMyLab(base) || ML?.isFlashImage(base, { crc32 })) return info.edition === 0xFE;
    return !!EDITIONS[info.edition] && !!F?.edition(base);
  }
  /** Reconstruct all flash bytes against the on-device checksums. */
  async quickDump(base, progress, cancel) {
    if (!this.canQuickDump(base)) throw fe('quickReadSource');
    const img = new Uint8Array(base);
    const checkCancel = () => { if (cancel?.()) throw fe('cancelled'); };
    await this.reportProgress('read', 0, FLASH_SIZE, progress);
    for (let off = 0; off < FLASH_SIZE; off += BLOCK64) {
      checkCancel();
      const expected = await this.crc(off, BLOCK64);
      if (expected !== crc32(img, off, BLOCK64)) {
        for (let sector = off; sector < off + BLOCK64; sector += SECTOR) {
          checkCancel();
          if (await this.crc(sector, SECTOR) !== crc32(img, sector, SECTOR)) {
            checkCancel();
            img.set(await this.read(sector, SECTOR), sector);
          }
        }
        if (expected !== crc32(img, off, BLOCK64)) throw fe('checkFail', { a: hex(off) });
      }
      await this.reportProgress('read', off + BLOCK64, FLASH_SIZE, progress);
    }
    checkCancel();
    return img;
  }
  /** Sectors (4 KB offsets) where the device differs from img, in [from, to). */
  async changed(img, progress, cancel, from = 0, to = FLASH_SIZE, phase = 'compare', fastWrite = false) {
    const out = new Set();
    await this.reportProgress(phase, 0, to - from, progress);
    for (let off = from; off < to; off += BLOCK64) {
      if (cancel && cancel()) throw fe('cancelled');
      if (await this.crc(off, BLOCK64) !== crc32(img, off, BLOCK64)) {
        if (fastWrite && this.info.fastWrite && off % BLOCK64 === 0 && off + BLOCK64 <= to) {
          const mask = await this.compareSectors(img, off);
          for (let i = 0; i < BLOCK64 / SECTOR; i++) if (mask & (1 << i)) out.add(off + i * SECTOR);
        } else {
          for (let s = off; s < off + BLOCK64; s += SECTOR) if (await this.crc(s, SECTOR) !== crc32(img, s, SECTOR)) out.add(s);
        }
      }
      await this.reportProgress(phase, Math.min(off + BLOCK64, to) - from, to - from, progress);
    }
    return out;
  }
  /**
   * Write img. confirmWrite(count, { small, large }) reviews the plan before writing.
   * Counts and progress use 4 KiB equivalents. committed includes temporary boot-sector writes.
   */
  async write(img, opts, progress, cancel) {
    if (img.length !== FLASH_SIZE) throw fe('size');
    if (String.fromCharCode(...img.subarray(0, 8)) !== 'SONIXDEV') throw fe('notParadise');
    this.ready();
    let image = img, notes = [], kept = 0, changed = null, rescue = false, moves = null, bootstrapRescue = false;
    if (this.info.readOnly) throw new Error('The connected Flash Tool is read-only');
    const myLab = this.info.edition === 0xFE;
    const paradiseBridge = this.info.edition === MY_LAB_ON_PARADISE;
    const ML = root.ParamixMyLab || (typeof require !== 'undefined' ? require('./mylab.js') : null);
    const bridgeImage = ML?.isParadiseFlashImage(img, { crc32 });
    if (ML?.hasParadisePortMarker(img) && !bridgeImage) throw new Error('Invalid My Lab on Paradise image');
    const installBridge = !myLab && bridgeImage;
    const restoreParadise = paradiseBridge && !installBridge;
    const portUpdate = paradiseBridge && installBridge;
    const keepMyLabSaves = (myLab || portUpdate) && opts.keepMyLabSaves;
    const canBlockWrite = opts.fastWrite && this.info.fastWrite && this.info.blockWrite &&
      !myLab && !installBridge && !restoreParadise;
    let keepPortSlotMarker = false, keepLcdColor = false;
    let keepInstalledPortTool = false, keepInstalledMyLabTool = false;
    if (myLab) {
      const menuInstalled = ML?.isFlashImage(img, { crc32 }) && !bridgeImage;
      const stockWrite = !menuInstalled && opts.stockMyLabRescueApp && ML?.isMyLab(img) && u32(img, 8) === 0x13;
      if (!menuInstalled && !stockWrite) {
        throw new Error('Choose a My Lab image with Menu and Flash Tool installed for My Lab hardware');
      }
      if (stockWrite) {
        const existing = await this.read(RESCUE_OFF, BLOCK64);
        const header = img.subarray(0, SECTOR);
        const existingWritable = validFlashTool(existing, RESCUE_OFF) &&
          String.fromCharCode(...existing.subarray(8, 16)) === 'PXMLSD01';
        if (!existingWritable && !this.info.rescueBootstrap)
          throw new Error('The image must retain the My Lab rescue region installed on the device');
        const rescueBlockImage = rescueBlock(existingWritable ? existing.subarray(0, RESCUE_CODE) : opts.stockMyLabRescueApp, header);
        if (!rescueBlockImage) throw new Error('Invalid My Lab rescue image');
        const table = rescueBlockImage.subarray(RESCUE_CODE, RESCUE_CODE + SECTOR);
        w32(table, 0x1FC, bootTableSum(table));
        if (existingWritable &&
            table.some((byte, i) => byte !== existing[RESCUE_CODE + i]))
          throw new Error('The My Lab boot header does not match this device');
        const target = existingWritable ? existing : rescueBlockImage;
        if (!allFF(img, RESCUE_OFF, BLOCK64) && target.some((byte, i) => byte !== img[RESCUE_OFF + i]))
          throw new Error('The My Lab rescue area contains unrelated data');
        image = new Uint8Array(img);
        image.set(target, RESCUE_OFF);
        bootstrapRescue = !existingWritable;
      } else if (await this.crc(RESCUE_OFF, BLOCK64) !== crc32(img, RESCUE_OFF, BLOCK64)) {
        if (!this.info.rescueBootstrap) throw new Error('The image must retain the My Lab rescue region installed on the device');
        bootstrapRescue = true;
      }
      if (menuInstalled) {
        const installed = await this.read(MY_LAB_TOOL_OFF, BLOCK64);
        if (validMyLabToolSlot(installed)) {
          const incoming = img.subarray(MY_LAB_TOOL_OFF, MY_LAB_TOOL_OFF + BLOCK64);
          if (!hasMyLabToolMarker(incoming) && !allFF(incoming, 0, BLOCK64))
            throw new Error('The My Lab Flash Tool update would overwrite occupied flash');
          if (!validMyLabToolSlot(incoming) ||
              flashToolRevision(installed.subarray(0, RESCUE_CODE)) >= flashToolRevision(incoming.subarray(0, RESCUE_CODE))) {
            image = new Uint8Array(img);
            image.set(installed, MY_LAB_TOOL_OFF);
            keepInstalledMyLabTool = true;
          }
        }
      }
      opts = { ...opts, onlyChanged: opts.onlyChanged !== false, keep: null, rescueFirst: true };
      rescue = true;
    } else if (installBridge || restoreParadise) {
      const matches = (a, b) => a.every((byte, index) => byte === b[index]);
      const recordOffset = ML.PARADISE_BACKUP_OFFSET, recordLength = ML.PARADISE_BACKUP_LENGTH;
      // The pairing record is in the last flash sector. Start host progress
      // before reading it so Flash Tool does not display the end-of-dump screen.
      if (paradiseBridge) await this.reportProgress('compare', 0, FLASH_SIZE, progress);
      const installed = paradiseBridge && ML.paradiseBackupRecord(await this.read(recordOffset, recordLength));
      const target = installBridge && ML.paradiseBackupRecord(img.subarray(recordOffset, recordOffset + recordLength));
      const editionPage = target?.editionOffset;
      if (target && (editionPage % SECTOR || editionPage < SECTOR || editionPage >= RESCUE_OFF))
        throw new Error('Invalid My Lab on Paradise image');
      if (installBridge && installed && (!target || !matches(installed.sha256, target.sha256))) {
        if (!target || !opts.confirmParadiseBackupReplacement)
          throw new Error('Use a port built with the Paradise backup paired with this device');
        if (!await opts.confirmParadiseBackupReplacement())
          return { written: 0, kept: 0, notes, image, rescue: false, cancelled: true };
      }
      if (installBridge && !paradiseBridge) {
        if (opts.chooseParadiseBackup) {
          const choice = await opts.chooseParadiseBackup();
          if (!choice || cancel?.())
            return { written: 0, kept: 0, notes, image, rescue: false, cancelled: true };
          image = Uint8Array.from(img);
          if (choice === 'backup') {
            const backup = await this.dump(progress, cancel);
            const menu = root.ParamixMyLabMenu || (typeof require !== 'undefined' ? require('./mylab_menu.js') : null);
            await menu.pairParadiseBackup(image, backup);
            if (cancel?.() || !await opts.saveParadiseBackup(backup) || cancel?.())
              return { written: 0, kept: 0, notes, image, rescue: false, cancelled: true };
          } else if (choice === 'skip') {
            image.fill(0xFF, recordOffset, recordOffset + recordLength);
          } else {
            throw new Error('Invalid Paradise backup choice');
          }
        } else if (target && (await this.crc(0, SECTOR) !== target.bootCrc ||
            await this.crc(editionPage, SECTOR) !== target.editionCrc)) {
          throw new Error('The connected Paradise does not match the boot and edition records in the selected backup');
        }
      }
      if (restoreParadise) {
        const F = root.ParamixFeld || (typeof require !== 'undefined' ? require('./feld.js') : null);
        const C = root.ParamixCore || (typeof require !== 'undefined' ? require('./core.js') : null);
        if (!F?.edition(img) || F.isClean(img) || ML?.isMyLab(img) || ML?.isFlashImage(img, { crc32 })) {
          throw new Error('Choose an original Paradise ROM backup from this device');
        }
        C.openRom(img);
        if (installed && !matches(installed.sha256, await sha256(img)))
          throw new Error('Choose the exact Paradise ROM backup paired with this port');
        const rescueTable = await this.read(RESCUE_TAB, 0x28);
        if (String.fromCharCode(...rescueTable.subarray(0, 8)) !== 'SONIXDEV' ||
            u32(rescueTable, 0x10) !== 0x60000000 + RESCUE_OFF ||
            u32(rescueTable, 0x14) !== RESCUE_CODE ||
            await this.crc(RESCUE_OFF, RESCUE_CODE) !== u32(rescueTable, 0x24)) {
          // A previous restore can have already verified the primary image and
          // started removing the temporary rescue. Do not invalidate it again.
          for (let off = 0; off < RESCUE_OFF; off += BLOCK64) {
            if (await this.crc(off, BLOCK64) !== crc32(image, off, BLOCK64)) throw fe('rescueFail');
          }
        }
      }
      if (portUpdate && keepMyLabSaves) {
        const header = await this.read(0, 0x18);
        const marker = await this.read(ML.PARADISE_PORT_MARKER_OFFSET, 8);
        if (!ML.hasParadisePortBoot(header, marker)) throw new Error('portSaveWrongRom');
        const slotMarker = await this.read(0xC64000, 8);
        keepPortSlotMarker = String.fromCharCode(...slotMarker) === 'PXMLSV01';
        keepLcdColor = ML.hasLcdColorRecord(await this.read(ML.LCD_COLOR_OFFSET, 12));
      }
      if (installBridge) {
        const incoming = image.subarray(RESCUE_OFF, RESCUE_TAB);
        const incomingRevision = flashToolRevision(incoming);
        let tool = opts.portFlashTool;
        let revision = tool ? flashToolRevision(tool) : 0;
        if (portUpdate) {
          const installed = await this.read(RESCUE_OFF, BLOCK64);
          const code = installed.subarray(0, RESCUE_CODE);
          const installedRevision = validFlashTool(installed, RESCUE_OFF) ? flashToolRevision(code) : 0;
          if (installedRevision > incomingRevision && installedRevision >= revision) {
            tool = code;
            revision = installedRevision;
            keepInstalledPortTool = true;
          }
        }
        if (revision > incomingRevision) {
          // Keep the ROM's table fields, battery picture and backup pairing.
          if (image === img) image = new Uint8Array(img);
          image.fill(0xFF, RESCUE_OFF, RESCUE_TAB);
          image.set(tool, RESCUE_OFF);
          const table = image.subarray(RESCUE_TAB, RESCUE_TAB + SECTOR);
          w32(table, 0x24, crc32(image, RESCUE_OFF, RESCUE_CODE));
          w32(table, 0x1FC, bootTableSum(table));
        }
      }
      opts = { ...opts, onlyChanged: !portUpdate || opts.onlyChanged !== false, keep: null, rescueFirst: true };
      rescue = true;
    } else if (ML?.isMyLab(img) || ML?.isFlashImage(img, { crc32 })) {
      throw new Error('A My Lab image requires a My Lab Flash Tool connection');
    } else if (PARA_RESCUE && opts.rescueApp) {   // test13: the rescue start goes along (first), when 0xFF0000 is free
      let r = withRescue(image, opts.rescueApp);
      if (!r) {   // test15: an old T18Emu layout gives 0xFF0000 up
        const w = new Uint8Array(image); moves = t18Relocate(w, opts.t18Bases);
        if (moves && moves.length) r = withRescue(w, opts.rescueApp);
        if (!r) moves = null;
      }
      if (r) { image = r; rescue = true; }
      else if (opts.rescueNeeded !== false) throw fe('noRescueRoom');
      else notes.push(note('noRescue'));
    }
    const compareForStandardWrite = opts.onlyChanged || opts.keep || rescue;
    if (compareForStandardWrite || canBlockWrite)
      changed = await this.changed(image, progress, cancel, 0, FLASH_SIZE, 'compare', opts.fastWrite);
    const keepSaveSector = s => keepMyLabSaves && (myLabSaveSector(s) ||
      (keepPortSlotMarker && s === 0xC64000) || (keepLcdColor && s === ML.LCD_COLOR_OFFSET));
    if (keepMyLabSaves) {
      const saves = [...changed].filter(keepSaveSector);
      if (saves.length) progress?.('copySaves', 0, saves.length);
      for (const s of saves) {
        if (cancel && cancel()) throw fe('cancelled');
        if (image === img) image = new Uint8Array(img);
        image.set(await this.read(s, SECTOR), s);
        changed.delete(s);
        kept++;
        progress?.('copySaves', kept, saves.length);
      }
    }
    let protectedSectors = [];
    if (opts.keep) {
      progress?.('keepSaves', 0, 0);
      const k = await opts.keep(this, image, changed, moves, progress, cancel);
      image = k.image; notes = k.notes; kept = k.kept;
      protectedSectors = k.protectedSectors;
      for (const s of protectedSectors) changed.delete(s);
    }
    progress?.('plan', 0, 0);
    if (moves) {
      if (image === img) image = new Uint8Array(image);
      const secs = t18MovesFinish(image, moves);
      if (!secs) throw fe('noRescueRoom');
      for (const x of secs) if (await this.crc(x, SECTOR) !== crc32(image, x, SECTOR)) changed.add(x); else changed.delete(x);
    }
    if (rescue && !myLab && !installBridge && !restoreParadise) {   // "keep saves" can extend to the end of the flash
      const rb = rescueBlock(opts.rescueApp, image.subarray(0, SECTOR), batFor(image));
      if (image === img) image = new Uint8Array(image);
      image.set(rb, RESCUE_OFF);
      const total = BLOCK64 / SECTOR;
      progress?.('checkRescue', 0, total);
      for (let s = RESCUE_OFF; s < FLASH_SIZE; s += SECTOR) {
        if (cancel?.()) throw fe('cancelled');
        if (await this.crc(s, SECTOR) !== crc32(image, s, SECTOR)) changed.add(s);
        else changed.delete(s);
        progress?.('checkRescue', (s - RESCUE_OFF) / SECTOR + 1, total);
      }
      progress?.('plan', 0, 0);
    }
    if (myLab && !bootstrapRescue) {
      for (let off = RESCUE_OFF; off < FLASH_SIZE; off += SECTOR) {
        if (changed.has(off)) throw new Error('My Lab rescue changed during preflight');
      }
    }
    let order = sectorOrder().filter(s => !keepSaveSector(s) &&
      !(keepInstalledMyLabTool && s >= MY_LAB_TOOL_OFF && s < MY_LAB_TOOL_OFF + BLOCK64) &&
      !(keepInstalledPortTool && s >= RESCUE_OFF && s <= RESCUE_TAB && !changed.has(s)));
    if (restoreParadise) {
      // Keep the working rescue until the primary ROM and its boot table have
      // been restored. Erase the rescue table after all other tail sectors.
      order = order.filter(s => s < RESCUE_OFF).concat(order.filter(s => s >= RESCUE_OFF && s !== RESCUE_TAB), RESCUE_TAB);
    } else if (myLab) {
      order = order.filter(s => s < RESCUE_OFF);
    } else if (rescue) order = order.filter((s) => s >= RESCUE_OFF).concat(order.filter((s) => s < RESCUE_OFF));
    if (opts.onlyChanged) {
      order = order.filter((s) => changed.has(s));
    } else if (compareForStandardWrite && !portUpdate) order = order.filter((s) => s >= 0x11000 || s === 0 || changed.has(s));   // test15: the firmware at 0x1000 only when it differs
    // RESCUE_FIRST: the device's table off while the rest is written (the ROM starts the rescue then), back at the end
    const clear0 = (opts.rescueFirst !== undefined ? opts.rescueFirst : RESCUE_FIRST) && rescue && order.some((s) => s && s < RESCUE_OFF);
    if (clear0 && !order.includes(0)) {
      const tail = restoreParadise ? order.findIndex(s => s >= RESCUE_OFF) : -1;
      if (tail < 0) order.push(0);
      else order.splice(tail, 0, 0);
    }
    // test15: a moved T18Emu block goes to its new place before the rescue start overwrites 0xFF0000, in steps that
    // each leave the device's T18Emu whole (cut anywhere: it still finds every block): new copy, settings, stored map
    const pre = moves ? await this.t18Pre(image, moves) : [];
    const preDone = new Set(); { const last = new Map(); for (const [a, d] of pre) last.set(a, d); for (const [a, d] of last) if (crc32(d) === crc32(image, a, SECTOR)) preDone.add(a); }
    order = order.filter((s) => !preDone.has(s));
    const bootstrap = bootstrapRescue ? await this.planMyLabRescue(image) : null;
    const rescueWrites = bootstrap ? bootstrap.body.length + Number(bootstrap.writeTable) : 0;
    // Only combine complete blocks inside both asset archives. Boot, recovery,
    // save areas, and blocks with ordered or protected writes stay in 4 KiB mode.
    let blocks = new Map();
    const targetEnd = canBlockWrite ? assetArchiveEnd(image.subarray(FIRST_USER, FIRST_USER + 16)) : 0;
    if (targetEnd && !cancel?.()) {
      const deviceEnd = assetArchiveEnd(await this.read(FIRST_USER, 16));
      const excluded = new Set([...pre.map(([addr]) => addr), ...protectedSectors].map(addr => addr & ~(BLOCK64 - 1)));
      blocks = planBlockWrites(order, changed, Math.min(targetEnd, deviceEnd), excluded);
    }
    let extraSectors = 0;
    for (const block of blocks.values()) extraSectors += SECTORS_PER_BLOCK - block.count;
    const total = rescueWrites + pre.length + order.length + Number(clear0) + extraSectors;
    const writePlan = { small: total - blocks.size * SECTORS_PER_BLOCK, large: blocks.size };
    const cancelled = { written: 0, kept, notes, image, rescue, cancelled: true };
    if (cancel?.()) return cancelled;
    if (total && opts.confirmWrite) {
      progress?.('confirmWrite', 0, 0);
      if (!await opts.confirmWrite(total, writePlan) || cancel?.()) return cancelled;
    }
    progress?.('prepare', 0, 0);
    if (rescueWrites) {
      if (opts.onImage) await opts.onImage(image);
      await this.bootstrapMyLabRescue(image, progress, cancel, bootstrap);
    }
    if (!order.length && !pre.length) {
      if (!rescueWrites) await this.link.request(WRITE_FINISH, 0, undefined, 15000);
      return { written: rescueWrites, committed: rescueWrites, kept, notes, image, rescue };
    }
    const st = await this.writeState();
    if (!(st.payload.length >= 16 && u32(st.payload, 12))) await this.link.request(WRITE_TEST, 0, undefined, 15000);
    const nRes = order.filter((s) => s >= RESCUE_OFF).length;
    const begin = new Uint8Array(myLab ? 40 : 36);
    begin.set(await sha256(image));
    w32(begin, 32, crc32(image));
    if (myLab) w32(begin, 36, order.length + Number(clear0));
    if (cancel?.()) {
      if (rescueWrites) throw fe('cancelledWrite');
      return cancelled;
    }
    const pos = await this.beginWrite(begin);
    if (!rescueWrites && opts.onImage) await opts.onImage(image);
    // A confirmed full write uses the reviewed order from the first sector.
    let start = !blocks.size && !opts.confirmWrite && !myLab && !opts.onlyChanged && pos.payload.length >= 4 ? u32(pos.payload, 0) : 0;
    if (start >= order.length) start = 0;
    const writeTotal = total - rescueWrites - start;
    let completedWrites = 0;
    await this.reportProgress('write', completedWrites, writeTotal, progress);
    let written = rescueWrites;
    for (const [a, d] of pre) {
      if (cancel && cancel()) throw fe('cancelledWrite');
      await this.putSector(a, d);
      written++;
      await this.reportProgress('write', ++completedWrites, writeTotal, progress);
    }
    let restoreBodyChecked = false;
    for (let i = start; i < order.length; i++) {
      if (cancel && cancel()) throw fe('cancelledWrite');
      const s = order[i];
      if (clear0 && i === (restoreParadise ? start : Math.max(start, nRes))) {
        if (!restoreParadise && await this.crc(RESCUE_OFF, BLOCK64) !== crc32(image, RESCUE_OFF, BLOCK64)) throw fe('rescueFail');
        const ff = new Uint8Array(SECTOR).fill(0xFF);
        await this.putSector(0, ff);
        await this.reportProgress('write', ++completedWrites, writeTotal, progress);
      }
      if (restoreParadise && s >= RESCUE_OFF && !restoreBodyChecked) {
        for (let off = 0; off < RESCUE_OFF; off += BLOCK64) {
          if (await this.crc(off, BLOCK64) !== crc32(image, off, BLOCK64)) throw fe('checkFail', { a: hex(off) });
        }
        restoreBodyChecked = true;
      }
      const block = blocks.get(i);
      if (block) {
        await this.putBlock(block.addr, block.mask, image, cancel);
        i += block.count - 1;
      } else {
        await this.putSector(s, image.subarray(s, s + SECTOR), opts.fastWrite && s !== 0 && s < RESCUE_OFF);
      }
      const sectors = block ? SECTORS_PER_BLOCK : 1;
      written += sectors;
      completedWrites += sectors;
      await this.reportProgress('write', completedWrites, writeTotal, progress);
    }
    await this.reportProgress('check', 0, FLASH_SIZE, progress);
    for (let off = 0; off < FLASH_SIZE; off += BLOCK64) {
      if (await this.crc(off, BLOCK64) !== crc32(image, off, BLOCK64)) throw fe('checkFail', { a: hex(off) });
      await this.reportProgress('check', off + BLOCK64, FLASH_SIZE, progress);
    }
    await this.link.request(WRITE_FINISH, 0, undefined, 15000);
    return { written, committed: rescueWrites + completedWrites, kept, notes, image, rescue };
  }
}
const u32le = (v) => { const b = new Uint8Array(4); w32(b, 0, v); return b; };
function assetArchiveEnd(header) {
  const end = FIRST_USER + 16 + u32(header, 8);
  return header.length === 16 && u32(header, 0) === 0x32435241 && end <= RESCUE_OFF ? end : 0;
}
function planBlockWrites(order, changed, assetEnd, excluded) {
  const blocks = new Map();
  for (let i = 0; i < order.length;) {
    const start = i, addr = order[i] & ~(BLOCK64 - 1);
    let mask = 0, count = 0;
    while (i < order.length && (order[i] & ~(BLOCK64 - 1)) === addr) {
      if (changed.has(order[i])) {
        mask |= 1 << ((order[i] - addr) / SECTOR);
        count++;
      }
      i++;
    }
    if (addr >= FIRST_USER && addr + BLOCK64 <= assetEnd && count >= BLOCK_WRITE_THRESHOLD && !excluded.has(addr))
      blocks.set(start, { addr, mask, count: i - start });
  }
  return blocks;
}
function sectorOrder() {
  const l = [];
  for (let s = FIRST_USER; s < FLASH_SIZE; s += SECTOR) l.push(s);
  for (let s = SECTOR; s < FIRST_USER; s += SECTOR) l.push(s);
  l.push(0);
  return l;
}

/** Open the device: talk to the flash app, or load it first from the download screen. */
async function connect(io, appImage, opts = {}, status) {
  const link = new Link(io, opts), dev = new Paradise(link);
  if (opts.minimumRevision) {
    for (let attempt = 0; attempt < 5; attempt++) {
      status?.('waitTool', attempt, 5);
      try {
        if ((await dev.hello(1600)).revision >= opts.minimumRevision) return { dev, loaded: false };
      } catch (e) { if (!(e instanceof TimeoutError)) throw e; }
      if (attempt < 4) await sleep(250, link.signal);
    }
    throw new Error('flashUpgradeStillOld');
  }
  try { await dev.hello(2500); return { dev, loaded: false }; }
  catch (e) { if (!(e instanceof TimeoutError)) throw e; }
  if (!(await probe(link))) {
    /* 1.7.3 CONN_DIAG: say whether anything came in at all (driver or cable) or only unreadable bytes */
    if (CONN_DIAG && io.rx !== undefined) throw fe(io.rx === 0 ? 'noData' : 'garbled', { n: io.rx, h: io.rxHead });
    throw fe('noAnswer');
  }
  if (status) status('load', 0, 1);
  await loadApp(link, appImage, (d, t) => status && status('load', d, t));
  await sleep(1200 * link.scale, link.signal);
  link.clear();
  for (let t = 0; t < 4; t++) {
    try { await dev.hello(4000); return { dev, loaded: true }; }
    catch (e) { if (!(e instanceof TimeoutError)) throw e; }
  }
  throw fe('appSilent');
}

// ------------------------------------------------------------------ keep saves
/*
 * Which sectors of the new image hold game progress, and is the device's copy
 * of them still valid for the new image? Ranges (taken from the device):
 *   - Paradise save data: from the page after the edition ID page to the end of
 *     the flash (same edition only, otherwise keeping makes no sense),
 *   - field slots of the Paramix menu, when the device has the same slot layout
 *     (a different layout: the stored fields are copied into the new slots),
 *   - TamaEmu: run state and the guest firmware (holds the guest's own save),
 *     when the device runs the same guest with the same packing and the guest
 *     was not changed in the Studio,
 *   - DOOM: its save sectors, when the device runs DOOM too.
 * F and E are the feld.js and emu.js modules, menu = { stub } of the menu (or
 * null); opts.emuChanged = guest replaced in the Studio.
 */
/* T18Emu's settings on the device (d at dc) and in the new image (n at nc) describe the same save: same save place,
 * block map and spares, where the new one may have more spares behind (test29: spares added keep the save). */
function t18SameGrown(d, dc, n, nc) {
  const eq = (a, len) => { for (let i = 0; i < len; i++) if (d[dc + a + i] !== n[nc + a + i]) return false; return true; };
  const nd = u32(d, dc + 12), nn = u32(n, nc + 12);
  if (nd > 64 || nn > 64 || nn < nd) return false;
  return eq(8, 4) && eq(16, 256) && eq(272, 2 * nd) && (nn === nd ? eq(272, 128) : true);
}
const NEON_HI = true;
function keepPlan(F, E, menu, opts = {}) {
  return async (dev, img, changed, moves, progress, cancel) => {
    const ed = F.edition(img);
    if (!ed) throw fe('unknownEd');
    // 1.6.6: Land/Water/Sky and Tropical/Glacier are the same firmware; the edition ID page only follows the
    // active field. Within such a family the device's ID page and save stay (so the device keeps its field).
    const fam = (id) => (F.familyOf ? F.familyOf(id) : null);
    const sameFam = dev.info.edition !== ed.id && fam(dev.info.edition) && fam(dev.info.edition) === fam(ed.id);
    const notes = [];
    if (dev.info.edition !== ed.id) {
      const editions = { d: dev.info.name, r: EDITIONS[ed.id] || ed.id, deviceEdition: dev.info.edition, romEdition: ed.id };
      if (!sameFam) throw fe('otherEd', editions);
      notes.push(note('noteEdKept', editions));
    }
    const image = new Uint8Array(img);
    // the device's program area (stub, menu, apps), only the sectors that differ
    const view = new Uint8Array(img);
    for (const s of changed) if (s === 0 || (s >= 0x90000 && s < 0x110000)) view.set(await dev.read(s, SECTOR), s);
    // CLEAN_ROM: without the Paradise there is no save of it and no main program at 0x0A0000 (any program may sit
    // there); the menu's clock stays when the device is clean too
    const clean = !!(F.isClean && F.isClean(img)), dclean = !!(F.isClean && F.isClean(view)), mainOk = !clean && !dclean;
    const neon = root.ParamixNeonTransplant;
    const importNeonItems = mainOk && ed.profile.name === 'gen3' && neon?.itemsInstalled(img) && !neon.itemsInstalled(view);
    // six fields keep pictures from 0xF00000; a start device (1.6.8) may have programs there (the Paradise never writes there)
    const launchImg = !!(menu && F.isLaunch && F.isLaunch(img, menu.stub));
    const ranges = mainOk ? [[ed.profile.idPage + (sameFam ? 0 : SECTOR), (F.isSix && F.isSix(img)) || launchImg || (NEON_HI && ed.profile.ring) ? 0xF00000 : FLASH_SIZE]] : [];   // NEON_HI: Neon's save ends at 0xF00000, programs may follow
    const residentBanks = root.ParamixResidentBanks;
    const targetResidents = mainOk && residentBanks?.inspect(img);
    if (mainOk && residentBanks) for (const s of residentBanks.hookPages) {
      if (s < 0x90000 && changed.has(s)) view.set(await dev.read(s, SECTOR), s);
    }
    const sourceResidents = mainOk && residentBanks?.inspect(view);
    if (sourceResidents && !targetResidents) throw fe('slotResidentBanksRequired');
    if (sourceResidents) ranges.push(...targetResidents.ranges);
    if (clean && dclean) { const ci = F.cleanInfo(img), cd = F.cleanInfo(view); if (ci && cd && ci.clock === cd.clock) ranges.push([ci.clock, ci.clock + SECTOR]); }
    // field slots
    const fi = menu && F.feldFind(img, menu.stub), fd = menu && F.feldFind(view, menu.stub);
    if (fd && (fd.flags & 1)) {
      const at = (f, i) => (F.slotAddr ? F.slotAddr(f, i) : f.slotOff + i * f.slotSize);
      const slotRanges = f => F.slotRanges ? F.slotRanges(f) : Array.from({length:f.nslots},(_,i)=>[at(f,i),at(f,i)+f.slotSize]);
      if (!importNeonItems && fi && (fi.flags & 1) && fi.slotOff === fd.slotOff && fi.slotSize === fd.slotSize && fi.nslots === fd.nslots && (fi.slotOff2 || 0) === (fd.slotOff2 || 0) && (fi.slotN1 || 0) === (fd.slotN1 || 0) && (fi.poolExtraOff || 0) === (fd.poolExtraOff || 0) && (fi.poolExtraPages || 0) === (fd.poolExtraPages || 0)) {
        ranges.push(...slotRanges(fd));
      }
      else if (fi && (fi.flags & 1) && F.slotReadAsync) {
        // other layout: copy every stored field into the new slots (shared pool, 1.2.12)
        const slots = [];
        for (let i = 0; i < fd.nslots; i++) {
          let s;
          try {
            s = await F.slotReadAsync((a, n) => dev.read(a, n), fd, i);
            if (s) F.slotPages(s);
          } catch (error) {
            if (error.code) throw error;
            throw fe('slotMigration', { f: i + 1 });
          }
          if (!s) continue;
          const idx = fd.version >= 3 ? s.field - 1 : i;
          if (idx < 0 || idx >= fi.nslots || slots.some(([j]) => j === idx))
            throw fe('slotLayout', { f: i + 1 });
          slots.push([idx, s]);
        }
        // the device's saves replace whatever the new image carries in the slots
        for (const [a,b] of slotRanges(fi)) image.fill(0xFF,a,b);
        const used = new Set();
        for (const [idx, s] of slots) {
          try {
            const migrated = importNeonItems ? neon.clearItemSaveSlots([{ ...s, index: idx }])[0] : s;
            F.slotPlace(image, fi, idx, migrated, used);
            notes.push(note('noteMoved', { f: s.field }));
          }
          catch (error) {
            if (error.code !== 'slotPoolFull') throw fe('slotMigration', { f: s.field });
            const canDefer = targetResidents && !sourceResidents && residentBanks.needsInstall(view);
            throw fe(canDefer ? 'slotResidentBankSpace' : 'slotSpace', { f: s.field });
          }
        }
        for (const [from,to] of slotRanges(fi)) for (let a=from;a<to;a+=SECTOR) if (crc32(image,a,SECTOR)!==crc32(img,a,SECTOR)) changed.add(a);
      } else {
        for (let i = 0; i < fd.nslots; i++) {
          const head = await dev.read(at(fd, i), SECTOR);
          if (u32(head, 0) === 0x544C5346) throw fe('slotMenuRequired');
        }
      }
    }
    const guestR = [];   // 1.6.8: TamaEmu firmware areas; sectors the Studio changed there (download items) come from the image
    const mine = opts.mine || null;
    const mineIn = (a, b) => { if (!mine) return false; for (let x = a & ~(SECTOR - 1); x < b; x += SECTOR) if (mine.has(x)) return true; return false; };
    // TamaEmu: settings block at 0x0A0140 (guest size and block map decide the layout)
    const kind = mainOk ? F.appKind(img) : 0, dkind = mainOk ? F.appKind(view) : 0;
    const T7 = 0x37584D50, t7i = mainOk && u32(img, 0xA0140) === T7, t7d = mainOk && u32(view, 0xA0140) === T7;
    const T18 = 0x38584D50, t18i = mainOk && u32(img, 0xA0140) === T18, t18d = !dclean && u32(view, 0xA0140) === T18, PMXC_ = 0x43584D50, t18keepX = [];
    if (t7i && t7d) {
      // T7Emu (1.4.0): the pet's EEPROM stays as long as the V7 ROM is the same, the session also needs the same figures
      const ro = u32(img, 0xA0148), rl = u32(img, 0xA014C);
      let sameRom = ro === u32(view, 0xA0148) && rl === u32(view, 0xA014C);
      for (let a = ro & ~0xFFF; sameRom && a < ro + rl; a += SECTOR) if (changed.has(a)) sameRom = false;
      if (sameRom && opts.t7Save) ranges.push([0xC5000, 0xC6000]);   // an imported save.bin replaces the pet, the settings stay
      else if (sameRom) {
        ranges.push([0xC1000, 0xC6000]);   // EEPROM slots and the settings
        if (view.subarray(0xA0148, 0xA0140 + 24 + 16 * 24).every((v, i) => v === img[0xA0148 + i])) ranges.push([0xC0000, 0xC1000]);
      } else notes.push(note('noteEmu'));
    } else if (mainOk && u32(img, 0xA0140) === 0x31584D50 && u32(view, 0xA0140) === 0x31584D50) {
      // V1Emu as the main program (1.6.8): session and settings stay with the same ROM at the same place
      const ro = u32(img, 0xA0148), rl = u32(img, 0xA014C), so = u32(img, 0xA0150);
      let same = [0x148, 0x14C, 0x150].every((k) => u32(view, 0xA0000 + k) === u32(img, 0xA0000 + k));
      for (let x = ro & ~0xFFF; same && x < ro + rl; x += SECTOR) if (changed.has(x)) same = false;
      if (same) ranges.push([so, so + 0x2000]); else { ranges.push([so + 0x1000, so + 0x2000]); notes.push(note('noteEmu')); }
    } else if (kind === 2 && dkind === 2 && !t7i && !t7d && !t18i && !t18d && u32(img, 0xA0140) !== 0x31584D50 && u32(view, 0xA0140) !== 0x31584D50) {
      // same firmware layout (offset, size, save area, device, block map); the program version may differ
      const same = view.subarray(0xA0148, 0xA0140 + 24 + 128).every((v, i) => v === img[0xA0148 + i]);
      if (!same && opts.emuSess && u32(view, 0xA0150) === u32(img, 0xA0150) && u32(view, 0xA0154) === u32(img, 0xA0154)) {
        // 1.7.6 DLC_KEEP: the guest with the device's save is in the new image (other layout); the run state stays
        const so = u32(img, 0xA0150); ranges.push([so, so + 0x50000]);
      } else if (same && !opts.emuChanged) {
        const gOff = u32(img, 0xA0148), gLen = u32(img, 0xA014C);
        // with the packed firmware also the spare pages behind it (item stores, since v0.9.2)
        const end = u32(img, 0xA0144) >= 3 ? Math.min(u32(img, 0xA0140 + 152), 0xD48000) : gOff + gLen;
        ranges.push([0xC0000, 0x110000], [gOff, Math.max((gOff + gLen + 0xFFF) & ~0xFFF, end)]);
        guestR.push([gOff, Math.max((gOff + gLen + 0xFFF) & ~0xFFF, end)]);
      } else notes.push(note('noteEmu'));
    }
    if (kind === 1 && dkind === 1) ranges.push([0x10E000, 0x110000]);
    // more programs of the menu (1.6.0): a save stays when the device has the same program at the same
    // place with the same ROM
    const xT18 = [];   // T18Emu as a further program (start device, 1.6.8): its blocks, like the main one's below
    if (menu && F.feldApps) {
      const ai = F.feldApps(img, menu.stub).apps, ad = F.feldApps(view, menu.stub).apps;
      for (const [ix, a] of ai.entries()) {
        const off = a.src - 0x10000000 + 0x11000;
        const mag = u32(img, off + 0x140);
        if (mag === T18) {
          const c = off + 0x140, ns = Math.min(u32(img, c + 12), 64), bl = [];
          for (let i = 0; i < 128; i++) { const b = img[c + 16 + 2 * i] | (img[c + 17 + 2 * i] << 8); if (b !== 0xFFFF) bl.push(b); }
          const nMap = bl.length;
          for (let i = 0; i < ns; i++) bl.push(img[c + 272 + 2 * i] | (img[c + 273 + 2 * i] << 8));
          if (img[c + 400] & 4) bl.push(0xFD, 0xFE);
          xT18.push(...bl);
          if (!ad.some((d) => d.src === a.src)) continue;
          const dv = changed.has(off) ? await dev.read(off, SECTOR) : img.subarray(off, off + SECTOR);
          const fwMine = !!opts.t18Imp && bl.slice(0, nMap).some((b) => b < 0x100 && mineIn(b << 16, (b + 1) << 16));   // 1.6.11 test2: an imported firmware with its save
          const mvd = t18Moved(dv, 0x140, moves, c);
          if (u32(dv, 0x140) === T18 && t18SameGrown(mvd.d, mvd.dc, img, c) && !opts.emuChanged && !fwMine) {
            const so = u32(img, c + 8); ranges.push([so, so + 0x24000]);
            for (let i = 0; i < ns; i++) { const b = img[c + 272 + 2 * i] | (img[c + 273 + 2 * i] << 8); t18keepX.push([b << 16, (b + 1) << 16]); }
          } else notes.push(note('noteEmu'));
          continue;
        }
        if (!ad.some((d) => d.src === a.src)) continue;
        const dv = changed.has(off) ? await dev.read(off, SECTOR) : img.subarray(off, off + SECTOR);
        { const di = E && E.doomCfg ? E.doomCfg(img, off) : null;   // DOOM_FREE (1.7.2 test3): DOOM in the menu, its save and level data stay with the same WAD at the same place
          if (di) {
            const pi = di.cfg - off, same = u32(dv, 0x140) === PMXC_ && u32(dv, pi) === 0x434D4450 && [8, 12, 16, 20, 24, 28].every((k) => u32(dv, pi + k) === u32(img, di.cfg + k));
            let sameW = same; for (let x = di.romOff & ~0xFFF; sameW && x < di.romOff + di.romLen; x += SECTOR) if (changed.has(x)) sameW = false;
            if (sameW) ranges.push([di.saveOff, di.saveOff + 0x2000], [di.regionOff, di.regionOff + di.regionLen]); else if (same) notes.push(note('noteEmu'));
            continue;
          } }
        if (mag === PMXC_ && u32(img, off + 0x144) >= 3) {
          // TamaEmu as a further program: run state and spare pages stay with the same firmware layout
          const same = u32(dv, 0x140) === PMXC_ && dv.subarray(0x148, 0x140 + 156).every((v, i) => v === img[off + 0x148 + i]);   // the flags (+156: clock, NFC) may change
          const gOff = u32(img, off + 0x148), gLen = u32(img, off + 0x14C), so = u32(img, off + 0x150), se = u32(img, off + 0x140 + 152);
          let sameFw = same;
          if (mine && same) {
            // 1.6.8: the same firmware when its code blocks (reset vector) are untouched by the Studio; the rest of
            // its flash (its own writes) stays from the device, except what the Studio changed (download items)
            const rv = u32(img, off + 0x140 + 20) === 0 ? 0 : 0x40;
            for (const b of [rv, rv + 1]) { const k = img[off + 0x140 + 24 + b]; if (k === 0xFF) continue; const kk = k === 0xFE ? b : k; for (let x = gOff + (kk << 16); sameFw && x < gOff + ((kk + 1) << 16); x += SECTOR) if (mine.has(x) && changed.has(x)) sameFw = false; }
            if (sameFw) { ranges.push([gOff, gOff + gLen]); guestR.push([gOff, gOff + gLen]); }
          } else for (let x = gOff; sameFw && x < gOff + gLen; x += SECTOR) if (changed.has(x)) sameFw = false;
          if (sameFw) ranges.push([so, so + 0x50000], [(gOff + gLen + 0xFFF) & ~0xFFF, se]); else notes.push(note('noteEmu'));
          continue;
        }
        if (mag === 0x47584D50 || mag === 0x53584D50) {   // GBEmu (1.6.9 test36), SMSEmu (1.6.10 test2): settings and cartridge RAM stay with the same game at the same place
          const sameG = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k));
          const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
          let sameRom = sameG; for (let x = ro & ~0xFFF; sameRom && x < ro + rl; x += SECTOR) if (changed.has(x)) sameRom = false;
          const sl = mag === 0x47584D50 && (u32(img, off + 0x140 + 20) & 8) ? 0x18000 : 0x10000;   // 1.7.2: GBCEmu keeps 96 KB
          if (sameRom && !mineIn(so, so + sl)) ranges.push([so, so + sl]); else if (!sameRom) notes.push(note('noteEmu'));   // 1.6.11 test2: with the state behind the cartridge RAM; an imported save (changed by the Studio) wins
          continue;
        }
        if (mag === 0x50584241) {   // ArduboyEmu (1.7.3): settings, EEPROM and state stay with the same game at the same place
          const sameP = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k));
          const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
          let sameRom = sameP; for (let x = ro & ~0xFFF; sameRom && x < ro + rl; x += SECTOR) if (changed.has(x)) sameRom = false;
          if (sameRom && !mineIn(so, so + 0x4000)) ranges.push([so, so + 0x4000]); else if (!sameRom) notes.push(note('noteEmu'));
          continue;
        }
        if (mag === 0x50584D50) {   // PokeMiniEmu (1.7.3): settings, EEPROM and state stay with the same game at the same place (not the BIOS behind them)
          const sameP = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k));
          const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
          let sameRom = sameP; for (let x = ro & ~0xFFF; sameRom && x < ro + rl; x += SECTOR) if (changed.has(x)) sameRom = false;
          if (sameRom && !mineIn(so, so + 0xC000)) ranges.push([so, so + 0xC000]); else if (!sameRom) notes.push(note('noteEmu'));
          continue;
        }
        if (mag === 0x57584D50) {   // Wolf3D (1.6.10 test1): settings and the saved game stay with the same pack at the same place
          const sameW = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k));
          const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
          let samePack = sameW; for (let x = ro & ~0xFFF; samePack && x < ro + rl; x += SECTOR) if (changed.has(x)) samePack = false;
          if (samePack && !mineIn(so, so + 0x10000)) ranges.push([so, so + 0x10000]); else if (!samePack) notes.push(note('noteEmu'));
          continue;
        }
        if (mag === 0x31584D50) {   // V1Emu (1.6.8): the session stays with the same ROM at the same place
          const sameV = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k));
          const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
          let sameRom = sameV; for (let x = ro & ~0xFFF; sameRom && x < ro + rl; x += SECTOR) if (changed.has(x)) sameRom = false;
          if (sameRom) ranges.push([so, so + 0x2000]); else { ranges.push([so + 0x1000, so + 0x2000]); notes.push(note('noteEmu')); }   // session, settings
          continue;
        }
        const same = [0x140, 0x148, 0x14C, 0x150].every((k) => u32(dv, k) === u32(img, off + k)) && u32(img, off + 0x140) === T7;
        if (!same) continue;
        const ro = u32(img, off + 0x148), rl = u32(img, off + 0x14C), so = u32(img, off + 0x150);
        let sameRom = true;
        for (let x = ro & ~0xFFF; sameRom && x < ro + rl; x += SECTOR) if (changed.has(x)) sameRom = false;
        if (sameRom && opts.t7SaveX === ix) ranges.push([so + 0x5000, so + 0x6000]);   // an imported save.bin replaces the pet, the settings stay
        else if (sameRom) ranges.push([so, so + 0x6000]); else notes.push(note('noteEmu'));
      }
    }
    // T18Emu (1.5.0): firmware blocks come from the image (they may lie in areas that are kept
    // otherwise); its save (map, clock note, session at 0x0C0000 and the spare blocks the firmware
    // wrote) stays when the block map is the same
    const t18blocks = xT18.slice(), t18keep = t18keepX;
    if (t18i) {
      const c = 0xA0140, ns = Math.min(u32(img, c + 12), 64);
      for (let i = 0; i < 128; i++) { const b = img[c + 16 + 2 * i] | (img[c + 17 + 2 * i] << 8); if (b !== 0xFFFF) t18blocks.push(b); }
      // spares must be empty unless the save that uses them is kept (they may lie in the Paradise save range)
      for (let i = 0; i < ns; i++) t18blocks.push(img[c + 272 + 2 * i] | (img[c + 273 + 2 * i] << 8));
      if (img[c + 400] & 4) t18blocks.push(0xFD, 0xFE);   // hot window (1.6.6): second copy of the flash part
      const mvd = t18Moved(view, c, moves, c), same = t18d && t18SameGrown(mvd.d, mvd.dc, img, c);
      if (same && !opts.emuChanged) {
        ranges.push([0xC0000, 0xC0000 + 0x24000]);   // map, clock note, session (the program's flash part at 0x0F0000 comes from the image)
        for (let i = 0; i < ns; i++) { const b = img[c + 272 + 2 * i] | (img[c + 273 + 2 * i] << 8); t18keep.push([b << 16, (b + 1) << 16]); }
      } else if (t18d) notes.push(note('noteEmu'));
    }
    // T18Emu leaves the device or gets other blocks (1.5.6): its old firmware blocks and spares are no
    // save of the Paradise; they take what the new image has there (mostly empty) instead of being kept
    const t18old = [];
    if (t18d && !t18keep.length) {
      const c = 0xA0140, ns = Math.min(u32(view, c + 12), 64);
      for (let i = 0; i < 128; i++) { const b = view[c + 16 + 2 * i] | (view[c + 17 + 2 * i] << 8); if (b !== 0xFFFF && b < 0x100) t18old.push(b); }
      for (let i = 0; i < ns; i++) { const b = view[c + 272 + 2 * i] | (view[c + 273 + 2 * i] << 8); if (b < 0x100) t18old.push(b); }
      if (view[c + 400] & 4) t18old.push(0xFD, 0xFE);
    }
    // 1.6.8: saves that moved (main program <-> menu, other place in the menu): T7Emu and V1Emu by their ROM.
    // The device's save of the same ROM is copied to the program's new save area.
    if (menu && F.feldApps && opts.moveSaves !== false) {
      const T7M = 0x37584D50, V1M = 0x31584D50;
      const progs = async (b, rd, apps) => {
        const out = [], one = async (base, cfgOf) => {
          const c = await cfgOf(base); const m = u32(c, 0x140);
          // 1.7.6 DLC_KEEP: a TamaEmu whose firmware came along from the device (saveCarry: moved or other layout)
          // takes its run state along (it does not depend on the layout)
          if (m === PMXC_ && u32(c, 0x144) >= 3 && opts.carried) {
            const tama = u32(c, 0x154), guest = u32(c, 0x148);
            const resetBlock = tama === 0 ? 0 : 0x40;
            const code = [resetBlock, resetBlock + 1].map(block => {
              const mapped = c[0x158 + block];
              return mapped === 0xFF ? -1 : guest + ((mapped === 0xFE ? block : mapped) << 16);
            });
            out.push({ kind: m, tama, code, saveOff: u32(c, 0x150), saveLen: 0x50000, base });
            return;
          }
          if (m !== T7M && m !== V1M) return;
          const isMain = base === 0xA0000, so = u32(c, 0x150);
          out.push({ kind: m, romOff: u32(c, 0x148), romLen: u32(c, 0x14C), saveOff: so, saveLen: m === V1M ? 0x2000 : (isMain ? 0x6000 : 0x6000), base });
        };
        if (b === img ? !clean : !dclean) await one(0xA0000, async (o) => rd(o, SECTOR));
        for (const a of apps) await one(a.src - 0x10000000 + 0x11000, async (o) => rd(o, SECTOR));
        return out;
      };
      const imgRd = async (o, n) => img.subarray(o, o + n);
      const devRd = async (o, n) => (changed.has(o) ? dev.read(o, n) : img.subarray(o, o + n));
      try {
        const ip = await progs(img, imgRd, F.feldApps(img, menu.stub).apps), dp = await progs(view, devRd, F.feldApps(view, menu.stub).apps);
        const covered = (a) => ranges.some(([x, y]) => a >= x && a < y);
        for (const p of ip) {
          if (covered(p.saveOff)) continue;
          if (p.tama !== undefined) {
            const matches = [];
            for (const d of dp) {
              if (d.tama !== p.tama || !opts.carried.has(d.base) ||
                  p.code.some((at, i) => at < 0 || d.code[i] < 0 || at + BLOCK64 > img.length || d.code[i] + BLOCK64 > img.length)) continue;
              let same = true;
              for (const [i, at] of p.code.entries()) {
                const dc = dev.crc ? await dev.crc(d.code[i], BLOCK64) : crc32(await dev.read(d.code[i], BLOCK64));
                if (dc !== crc32(img, at, BLOCK64)) { same = false; break; }
              }
              if (same) matches.push(d);
            }
            if (matches.length === 1) {
              const data = await dev.read(matches[0].saveOff, p.saveLen);
              image.set(data, p.saveOff);
              for (let s = p.saveOff; s < p.saveOff + p.saveLen; s += SECTOR) changed.add(s);
            }
            continue;
          }
          const want = crc32(img, p.romOff, p.romLen);
          for (const d of dp) {
            if (d.kind !== p.kind || d.romLen !== p.romLen || (d.base === p.base && d.saveOff === p.saveOff)) continue;
            const dc = dev.crc ? await dev.crc(d.romOff, d.romLen) : crc32(await dev.read(d.romOff, d.romLen), 0, d.romLen);
            if (dc !== want) continue;
            const len = Math.min(p.saveLen, d.saveLen), data = await dev.read(d.saveOff, len);
            image.set(data, p.saveOff);
            for (let s = p.saveOff; s < p.saveOff + len; s += SECTOR) changed.add(s);
            notes.push(note('noteSaveMoved', { n: p.kind === V1M ? 'V1Emu' : 'T7Emu' }));
            break;
          }
        }
      } catch (e) { /* only an extra; the normal plan stands */ }
    }
    // take the device's copy of every protected sector that differs
    const prot = new Set();
    for (const [a, b] of ranges) for (let s = a & ~0xFFF; s < b; s += SECTOR) prot.add(s);
    for (const b of t18blocks.concat(t18old)) for (let s = b << 16; s < (b + 1) << 16; s += SECTOR) prot.delete(s);
    for (const [a, b] of t18keep) for (let s = a; s < b; s += SECTOR) prot.add(s);
    if (mine) for (const [a, b] of guestR) for (let s = a & ~0xFFF; s < b; s += SECTOR) if (mine.has(s)) prot.delete(s);
    for (const [a, b] of opts.fresh || []) for (let s = a & ~0xFFF; s < b; s += SECTOR) prot.delete(s);   // 1.6.8: imported saves
    let kept = 0;
    const saves = [...prot].filter(s => changed.has(s));
    if (saves.length) progress?.('copySaves', 0, saves.length);
    for (const s of saves) {
      if (cancel?.()) throw fe('cancelled');
      image.set(await dev.read(s, SECTOR), s);
      progress?.('copySaves', ++kept, saves.length);
    }
    if (targetResidents && !sourceResidents || opts.after) progress?.('keepSaves', 0, 0);
    if (importNeonItems) {
      for (const s of [0xEFE000, 0xEFF000]) {
        if (!prot.has(s) || !neon.clearPlaceholderCounts(image.subarray(s, s + SECTOR))) continue;
        changed.add(s);
        prot.delete(s);
      }
    }
    if (targetResidents && !sourceResidents) {
      // The old device may have stored menu-pool data in these addresses.
      // The new geometry gets its saves using the migration above, then the
      // secondary residents are seeded from the live native save we kept.
      const source = new Uint8Array(image);
      for (const [from, to] of targetResidents.ranges) source.fill(0xFF, from, to);
      const migrated = residentBanks.migrate(source);
      for (const [from, to] of targetResidents.ranges) {
        image.set(migrated.subarray(from, to), from);
        for (let s = from; s < to; s += SECTOR) {
          const before = dev.crc ? await dev.crc(s, SECTOR) : crc32(await dev.read(s, SECTOR));
          if (before === crc32(image, s, SECTOR)) changed.delete(s);
          else changed.add(s);
        }
      }
    }
    if (opts.after) { const before = image.slice(); await opts.after(image); for (let s = 0; s < image.length; s += SECTOR) { if (changed.has(s)) continue; for (let i = s; i < s + SECTOR; i++) if (image[i] !== before[i]) { changed.add(s); break; } } }
    const protectedSectors = [...prot].filter((s) => changed.has(s));
    return { image, notes, kept, protectedSectors };
  };
}

const FLASH_APP_B64 = '__FLASH_APP_B64__';
function embedded() { return FLASH_APP_B64.startsWith('__') ? null : b64(FLASH_APP_B64); }

const CONN_DIAG = true;
function rxCount(io, v) {
  for (let i = 0; i < v.length && io.rxHead.length < 48; i++) io.rxHead += (io.rxHead ? ' ' : '') + v[i].toString(16).padStart(2, '0');
  io.rx += v.length;
}
/** Web Serial transport (Chrome, Edge). */
async function serialOpen(port) {
  await port.open({ baudRate: BAUD, bufferSize: 1 << 16 });
  const writer = port.writable.getWriter();
  const io = { onData: null, closed: false, rx: 0, rxHead: '' };
  let reader = null, stop = false;
  (async () => {
    // a buffer overrun, framing or parity error ends the reader but not the port: take a new one (1.5.6)
    while (!stop && port.readable) {
      reader = port.readable.getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (value) rxCount(io, value); if (value && io.onData) io.onData(value); } }
      catch (e) { io.errors = (io.errors || 0) + 1; }
      try { reader.releaseLock(); } catch (e) {}
      if (stop) break;
    }
    io.closed = true;
    if (!stop) io.onClose?.();
  })();
  io.write = (d) => writer.write(d);
  io.close = async () => { stop = true; try { await reader.cancel(); } catch (e) {} try { reader.releaseLock(); } catch (e) {} try { writer.releaseLock(); } catch (e) {} try { await port.close(); } catch (e) {} };
  return io;
}

root.ParamixFlash = { linkKey: LINK_KEY, rescueBlock, withRescue, batPic, batText, batFor, t18Relocate, RESCUE_OFF, PARA_RESCUE, connect, keepPlan, Link, Paradise, serialOpen, embedded, buildPdlo, crc32, sectorOrder, EDITIONS, MY_LAB_ON_PARADISE, FLASH_SIZE, BAUD, TimeoutError };
if (typeof module !== 'undefined') module.exports = root.ParamixFlash;
})(typeof window !== 'undefined' ? window : globalThis);
