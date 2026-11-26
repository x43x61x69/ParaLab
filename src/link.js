// ESP32-S3 ROM loader. Use the native USB download port, without installing a RAM stub.
{
  const release = /*__LINK_RELEASE__*/ {};
  $('linkSource').href = release.source;
  $('linkSource').download = release.sourceName;
  const mode = $('linkMode'), connect = $('linkConnect'), progress = $('linkProgress');
  const boot = {usbVendorId:0x303a, usbProductId:0x1001};
  const runtime = {usbVendorId:0x303a, usbProductId:0x0002};
  const incompatible = 'This device does not match the selected H717 update.';
  const failed = 'Update interrupted. Check the cable, enter download mode and retry.';
  const nextPort = 'Download mode requested. Click Connect again and select the USB download port.';
  const checking = 'Checking H717 and firmware…';
  const writing = 'Writing and verifying. Keep USB connected.';
  const verified = 'Write verified. Press RESET on the H717 and check the version on its screen.';
  function status(message) {
    const output = $('linkStatus');
    output.dataset.t = message;
    output.textContent = t(message);
  }
  if (!navigator.serial || !window.isSecureContext) {
    connect.disabled = true;
    status('Open ParaLab in desktop Chrome or Edge with Web Serial enabled.');
  }
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
    return async (op, payload, checksum = 0, timeout = 8000) => {
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
          return frame.slice(8, -4);
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

  connect.onclick = async () => {
    let port, opened = false, reader, writer;
    const factory = mode.value === 'factory';
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    mode.disabled = connect.disabled = true;
    progress.hidden = true;
    try {
      port = await navigator.serial.requestPort({filters:[boot, runtime]});
      if (port.getInfo().usbProductId === runtime.usbProductId) {
        await port.open({baudRate:1200});
        opened = true;
        await new Promise(resolve => setTimeout(resolve, 180));
        status(nextPort);
        return;
      }
      const prompt = factory ? 'Erase all firmware, settings and favorites on this 16 MiB H717?' :
        'Update the firmware and assets on this H717 and keep its settings and favorites?';
      if (!await deviceDialog(t(prompt), 'ParaLab Link v' + release.version, t('Continue'))) {
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
      await command(0x0b, words(0, 0x1000000, 0x10000, 0x1000, 0x100, 0xffff));
      if (!factory && await digestOnChip(command, release.layout) !== release.layout.md5)
        throw new Error(incompatible);
      const images = await Promise.all((factory ? [release.factory] : [release['firmware.bin'], release['assets.bin']]).map(download));
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
      status(error.name === 'NotFoundError' ? 'Cancelled' : error.message === incompatible ? incompatible : failed);
    } finally {
      try { if (reader) await reader.cancel(); } catch (_) {}
      reader?.releaseLock();
      writer?.releaseLock();
      try { if (opened) await port.close(); } catch (_) {}
      window.removeEventListener('beforeunload', guard);
      mode.disabled = connect.disabled = false;
    }
  };
}
