// ESP32-S3 ROM loader. Use the native USB download port, without installing a RAM stub.
{
  const releases = /*__LINK_RELEASE__*/ {};
  const board = $('linkBoard'), versions = $('linkVersions');
  const mode = $('linkMode'), connect = $('linkConnect'), progress = $('linkProgress');
  const boot = {usbVendorId:0x303a, usbProductId:0x1001};
  const runtime = {usbVendorId:0x303a, usbProductId:0x0002};
  const incompatible = 'This device does not match the selected ParaLink hardware.';
  const otaVerified = 'Write verified. ParaLink will restart into the new version.';
  const failed = 'Update interrupted. Check the cable, enter download mode and retry.';
  const nextPort = 'Download mode requested. Click Connect again and select the USB download port.';
  const checking = 'Checking hardware and firmware…';
  const writing = 'Writing and verifying. Keep USB connected.';
  const verified = 'Write verified. Press RESET on ParaLink and check its title bar.';
  function status(message) {
    const output = $('linkStatus');
    output.dataset.t = message;
    output.textContent = t(message);
  }
  if (!navigator.serial || !window.isSecureContext) {
    connect.disabled = true;
    status('Open ParaLab in desktop Chrome or Edge with Web Serial enabled.');
  }
  function showVersions(previous) {
    const release = releases[board.value];
    if (previous) {
      versions.textContent = release.board + ' · v' + previous + ' → v' + release.version;
      return;
    }
    const label = document.createElement('span');
    label.dataset.t = 'Target version';
    label.textContent = t(label.dataset.t);
    versions.replaceChildren(release.board + ' · ', label, ' v' + release.version);
  }
  board.onchange = () => showVersions();
  if (releases[board.value]) showVersions();
  const buttons = [...$('linkScreenButtons').children];
  buttons.forEach((button, selected) => button.onclick = () => {
    buttons.forEach((entry, index) => {
      entry.setAttribute('aria-pressed', String(index === selected));
      $('linkScreens').children[index].hidden = index !== selected;
    });
  });

  function words(...values) {
    const result = new Uint8Array(values.length * 4);
    const view = new DataView(result.buffer);
    values.forEach((value, index) => view.setUint32(index * 4, value, true));
    return result;
  }

  // Preserve partial frames and extra SYNC replies across USB reads.
  async function* responses(reader) {
    let frame = [], escaped = false, started = false;
    for (;;) {
      const {value, done} = await reader.read();
      if (done) throw new Error(failed);
      for (const byte of value) {
        if (byte === 0xc0) {
          if (started && frame.length && !escaped) yield Uint8Array.from(frame);
          started = true;
          escaped = false;
          frame = [];
        } else if (started) {
          if (escaped) {
            if (byte !== 0xdc && byte !== 0xdd) throw new Error(failed);
            frame.push(byte === 0xdc ? 0xc0 : 0xdb);
            escaped = false;
          } else if (byte === 0xdb) escaped = true;
          else frame.push(byte);
          if (frame.length > 65544) throw new Error(failed);
        }
      }
    }
  }

  function romCommands(reader, writer) {
    const stream = responses(reader);
    return async (op, payload, checksum = 0, timeout = 8000, returnValue = false) => {
      const header = [0, op, payload.length & 255, payload.length >> 8, checksum, 0, 0, 0];
      const slip = [0xc0];
      for (const byte of [...header, ...payload]) {
        if (byte === 0xc0 || byte === 0xdb) slip.push(0xdb, byte === 0xc0 ? 0xdc : 0xdd);
        else slip.push(byte);
      }
      slip.push(0xc0);
      // Cancel the outstanding read on timeout so the port can be opened again.
      const timer = setTimeout(() => { reader.cancel().catch(() => {}); }, timeout);
      try {
        await writer.write(Uint8Array.from(slip));
        for (;;) {
          const {value:frame, done} = await stream.next();
          if (done) throw new Error(failed);
          if (frame[0] !== 1 || frame[1] !== op) continue;
          if (frame.length < 12 || frame.length !== 8 + frame[2] + 256 * frame[3] ||
              frame[frame.length - 4] !== 0) throw new Error(failed);
          return returnValue ? new DataView(frame.buffer, frame.byteOffset).getUint32(4, true) : frame.slice(8, -4);
        }
      } finally { clearTimeout(timer); }
    };
  }

  async function digestOnChip(command, part) {
    const bytes = await command(0x13, words(part.address, part.size, 0, 0), 0, 120000);
    return new TextDecoder().decode(bytes).toLowerCase();
  }
  async function download(part) {
    const response = await fetch(part.source);
    if (!response.ok) throw new Error(failed);
    const compressed = new Uint8Array(await response.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', compressed));
    if (Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') !== part.sha256)
      throw new Error(failed);
    return {part, compressed};
  }

  async function writePart(command, {part, compressed}, report) {
    const block = 1024, count = Math.ceil(compressed.length / block);
    await command(0x10, words(Math.ceil(part.size / block) * block, count, block, part.address, 0), 0, 480000);
    for (let index = 0; index < count; index++) {
      const chunk = compressed.subarray(index * block, (index + 1) * block);
      const packet = new Uint8Array(16 + chunk.length);
      packet.set(words(chunk.length, index, 0, 0));
      packet.set(chunk, 16);
      await command(0x11, packet, chunk.reduce((sum, byte) => sum ^ byte, 0xef), 60000);
      report(chunk.length);
    }
    if (await digestOnChip(command, part) !== part.md5) throw new Error(failed);
  }

  // Follow the ESP32-S3 ROM loader's SPI RDID sequence. The high JEDEC byte is the capacity exponent.
  async function flashBytes(command) {
    const base = 0x60002000;
    const read = offset => command(0x0a, words(base + offset), 0, 8000, true);
    const write = (offset, value) => command(0x09, words(base + offset, value, 0xffffffff, 0));
    const usr = await read(0x18), usr2 = await read(0x20), miso = await read(0x28);
    try {
      await write(0x28, 23);
      await write(0x18, 0x90000000);
      await write(0x20, 0x7000009f);
      await write(0x58, 0);
      await write(0, 1 << 18);
      for (let retry = 0; retry < 10; retry++) {
        if (!(await read(0) & (1 << 18))) return 2 ** ((await read(0x58) >>> 16) & 0xff);
      }
      throw new Error(incompatible);
    } finally {
      await write(0x18, usr);
      await write(0x20, usr2);
      await write(0x28, miso);
    }
  }

  function otaFrame(offset, chunk) {
    const header = words(offset, window.ParamixCore.crc32(chunk));
    const frame = [0xc0];
    for (const data of [header, chunk]) for (const byte of data) {
      if (byte === 0xc0 || byte === 0xdb) frame.push(0xdb, byte === 0xc0 ? 0xdc : 0xdd);
      else frame.push(byte);
    }
    frame.push(0xc0);
    return new Uint8Array(frame);
  }

  async function runOta(reader, writer, release, payload) {
    let pending = '', reading;
    async function readLine() {
      while (!pending.includes('\n')) {
        const {value, done} = await reader.read();
        if (done) throw new Error('No USB OTA response. Install the latest firmware in ROM mode first.');
        pending += new TextDecoder().decode(value);
        if (pending.length > 512) throw new Error(failed);
      }
      const split = pending.indexOf('\n');
      const line = pending.slice(0, split).trim();
      pending = pending.slice(split + 1);
      return line;
    }
    async function nextLine(timeout) {
      let timer;
      try {
        reading ||= readLine();
        const line = await Promise.race([reading, new Promise(resolve => {timer=setTimeout(resolve,timeout,null);})]);
        if (line !== null) reading = null;
        if (line?.startsWith('ERROR')) throw new Error(line.slice(5).trim() || failed);
        return line;
      } finally { clearTimeout(timer); }
    }
    const hello = /^PARALINK (OTA2?) (\w+) (\d+\.\d+\.\d+)$/.exec((await nextLine(6000)) || '');
    if (!hello) throw new Error('No USB OTA response. Install the latest firmware in ROM mode first.');
    if (hello[2] !== release.board) throw new Error(incompatible);
    const framed = hello[1] === 'OTA2';
    showVersions(hello[3]);
    const firmware = release['firmware.bin'];
    const assets = release['assets.bin'];
    const header = 'UPDATE ' + release.board + ' ' + release.version + ' ' + payload.length + ' ' +
      assets.size + ' ' + release.assetCrc + ' ' + firmware.rawSha256 + '\n';
    await writer.write(new TextEncoder().encode(header));
    if (await nextLine(20000) !== (framed ? 'OK 0' : 'OK')) throw new Error(failed);
    status(writing);
    transferProgress('link', 0, payload.length, t(writing));
    let verifiedByLastBlock = false;
    for (let offset = 0; offset < payload.length; offset += 1024) {
      const chunk = payload.subarray(offset, offset + 1024);
      const end = offset + chunk.length;
      if (framed) {
        const frame = otaFrame(offset, chunk);
        let received = false;
        for (let attempt = 0; attempt < 7 && !received; attempt++) {
          await writer.write(frame);
          const deadline = Date.now() + 1200;
          while (Date.now() < deadline) {
            const line = await nextLine(deadline - Date.now());
            if (line === 'DONE' && end === payload.length) verifiedByLastBlock = true;
            if (line === 'OK ' + end || verifiedByLastBlock) { received = true; break; }
          }
        }
        if (!received) throw new Error(failed);
      } else {
        await writer.write(chunk);
        if (await nextLine(15000) !== 'OK') throw new Error(failed);
      }
      transferProgress('link', Math.min(end, Math.floor(payload.length * 0.99)), payload.length, t(writing));
    }
    status('Verifying firmware…');
    if (!verifiedByLastBlock && await nextLine(15000) !== 'DONE') throw new Error(failed);
    transferProgress('link', payload.length, payload.length, t(otaVerified));
    status(otaVerified);
  }

  connect.onclick = async () => {
    let port, opened = false, reader, writer;
    const factory = mode.value === 'factory', ota = mode.value === 'ota';
    const release = releases[board.value];
    showVersions();
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    mode.disabled = board.disabled = connect.disabled = true;
    progress.hidden = true;
    try {
      port = await navigator.serial.requestPort({filters:[boot, runtime]});
      const runtimePort = port.getInfo().usbProductId === runtime.usbProductId;
      if (ota) {
        if (!runtimePort) throw new Error('Select the running ParaLink in the USB list for OTA.');
        if (!await deviceDialog(t('Install the selected firmware and keep settings and favorites?'),
          'ParaLink ' + release.board + ' v' + release.version, t('Continue'))) { status('Cancelled'); return; }
        window.addEventListener('beforeunload', guard);
        status(checking);
        const {compressed} = await download(release['firmware.bin']);
        const payload = new Uint8Array(await new Response(
          new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
        if (payload.length !== release['firmware.bin'].size) throw new Error(failed);
        // Force a line-coding change even when the OS remembers the previous OTA rate.
        await port.open({baudRate:460800});
        await port.close();
        await port.open({baudRate:2400});
        opened = true;
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        await runOta(reader, writer, release, payload);
        return;
      }
      if (runtimePort) {
        await port.open({baudRate:1200});
        opened = true;
        await new Promise(resolve => setTimeout(resolve, 180));
        status(nextPort);
        return;
      }
      const prompt = factory ? 'Erase all firmware, settings and favorites on the selected ParaLink?' :
        'Update firmware and assets while keeping settings and favorites?';
      if (!await deviceDialog(t(prompt), 'ParaLink ' + release.board + ' v' + release.version, t('Continue'))) {
        status('Cancelled');
        return;
      }
      window.addEventListener('beforeunload', guard);
      status(checking);
      transferProgress('link', 0, 0, t(checking));
      await port.open({baudRate:460800});
      opened = true;
      reader = port.readable.getReader();
      writer = port.writable.getWriter();
      const command = romCommands(reader, writer);
      await command(0x08, Uint8Array.from([7, 7, 18, 32, ...Array(32).fill(0x55)]));
      const security = await command(0x14, new Uint8Array());
      if (security.length < 16 || new DataView(security.buffer).getUint32(12, true) !== 9 ||
          (security[0] & 5) || security[4] !== 0) throw new Error(incompatible);
      await command(0x0d, words(0, 0));
      if (await flashBytes(command) !== release.flashBytes) throw new Error(incompatible);
      await command(0x0b, words(0, release.flashBytes, 0x10000, 0x1000, 0x100, 0xffff));
      if (!factory && await digestOnChip(command, release.layout) !== release.layout.md5)
        throw new Error(incompatible);
      const images = await Promise.all((factory ? [release.factory] : [release['firmware.bin'], {...release['firmware.bin'], address:0x1a0000}, release['assets.bin']]).map(download));
      const total = images.reduce((sum, {compressed}) => sum + compressed.length, 0);
      let written = 0;
      status(writing);
      transferProgress('link', written, total, t(writing));
      for (const image of images) await writePart(command, image, bytes => {
        written += bytes;
        // Reserve 100% for successful on-device verification.
        transferProgress('link', Math.min(written, Math.floor(total * 0.99)), total, t(writing));
      });
      transferProgress('link', total, total, t(verified));
      status(verified);
    } catch (error) {
      progress.hidden = true;
      status(error.name === 'NotFoundError' ? 'Cancelled' : error.message || failed);
    } finally {
      try { if (reader) await reader.cancel(); } catch (_) {}
      reader?.releaseLock();
      writer?.releaseLock();
      try { if (opened) await port.close(); } catch (_) {}
      window.removeEventListener('beforeunload', guard);
      mode.disabled = board.disabled = connect.disabled = false;
    }
  };
}
