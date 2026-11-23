// Draw the adjacent-pair cursor for My Lab's sorting puzzle at Paradise pixel size.
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const assets = 0x211000, sector = 0x1AA000, hook = 0x111000 + 0x48FC4;
const magic = 0x315A5550; // PUZ1
const codeAt = 32, backupAt = 64;
// The native callback passes its visual tween target as (pair index << 21).
// Convert only this target to camera-aligned positions, then tail-call the
// native tween. The index and both puzzle-piece positions keep stock values.
// lsrs r3,#21; adr r12,offsets; ldrb r3,[r12,r3]; lsls r3,#16; b.w tween
const program = [0x5B,0x0D,0x0F,0xF2,0x0C,0x0C,0x1C,0xF8,0x03,0x30,0x1B,0x04,0xA8,0xF7,0x8C,0xBE,0,30,65,95];
const before = [0xF8,0xF7,0xC0,0xFE], after = [0x50,0xF0,0x2C,0xF8];
const view = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
const matches = (b,at,expected) => expected.every((v,i)=>b[at+i]===v);

function has(image) {
  return image.length >= sector + 4096 && view(image).getUint32(sector,true) === magic;
}

function cursorPixels() {
  const width = 48, height = 96, fill = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.min(x, width - 1 - x), dy = Math.min(y, height - 1 - y);
      const corner = dx >= 2 && dy >= 2 && (dx <= 4 && dy <= 12 || dy <= 4 && dx <= 12);
      const head = dx >= 10 && dx <= 16 && Math.abs(y - 13) <= dx - 10;
      const shaft = dx >= 16 && Math.abs(y - 13) <= 1;
      if (corner || head || shaft) fill[y * width + x] = 3;
    }
  }
  // Give every visible stroke one native blue pixel and one outer white
  // pixel. Eight-neighbour dilation keeps the diagonals closed.
  function outline(input, index) {
    const out = Uint8Array.from(input);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (input[y * width + x]) continue;
      for (let yy=Math.max(0,y-1); yy<Math.min(height,y+2); yy++)
        for (let xx=Math.max(0,x-1); xx<Math.min(width,x+2); xx++)
          if (input[yy*width+xx]) out[y*width+x]=index;
    }
    return out;
  }
  return outline(outline(fill,1),2);
}

function fittedEntry(entry) {
  const {header, subs, palettes} = C.spriteDecode(entry,0,true);
  if (header.flags !== 0xA7 || header.iw!==3 || header.ih!==3 || header.sw!==32 ||
      header.sh!==32 || header.bpp!==1 || header.numPal!==1 || header.transp!==0 ||
      subs.length!==1 || subs[0].w!==96 || subs[0].h!==96)
    throw new Error('Unexpected My Lab puzzle cursor');
  const colors = palettes[0].map(v => [Math.round((v >> 11)*255/31), Math.round(((v >> 5)&63)*255/63), Math.round((v&31)*255/31)]);
  const target = cursorPixels(), image = subs[0].data;
  image.fill(0);
  for (let y=0; y<96; y++) for (let x=0; x<96; x++) {
    // First pair is centred at source x=32 (sprite starts at -16).
    // Expanding the designed pixels before the 160-to-128 presenter makes
    // the glyph match the panel grid at all four settled pair positions.
    const tx = Math.round((x-16)*127/159)-26+24;
    const index = tx>=0 && tx<48 ? target[y*48+tx] : 0;
    if (index) image.set([...colors[index],255],4*(y*96+x));
  }
  return C.spriteEncode(entry,subs,{keepPalette:true,preservePaletteIndices:true});
}

function apply(image,enabled) {
  const fitted = has(image);
  if (fitted===enabled) return image;
  const d=view(image), read=at=>d.getUint32(at,true), start=assets+read(assets+36);
  const index=1725, at=start+read(start+4*index), end=start+read(start+4*(index+1));
  if (end<=at || end>image.length || !matches(image,hook,fitted?after:before))
    throw new Error('Unexpected My Lab puzzle cursor or motion callback');
  const entry=image.subarray(at,end), slot=image.subarray(sector,sector+4096);
  if (enabled) {
    const changed=fittedEntry(entry);
    if (changed.length>entry.length || backupAt+entry.length>slot.length ||
        !slot.every(b=>b===0xFF)) throw new Error('No space to preserve the My Lab puzzle cursor');
    d.setUint32(sector,magic,true);
    d.setUint32(sector+4,entry.length,true);
    d.setUint32(sector+8,C.crc32(entry),true);
    slot.set(program,codeAt);
    slot.set(entry,backupAt);
    entry.set(changed);
    d.setUint32(sector+12,C.crc32(entry),true);
  } else {
    const saved=slot.subarray(backupAt,backupAt+entry.length);
    if (read(sector+4)!==entry.length || read(sector+8)!==C.crc32(saved) ||
        read(sector+12)!==C.crc32(entry) || !matches(slot,codeAt,program))
      throw new Error('Invalid My Lab puzzle cursor backup');
    entry.set(saved);slot.fill(0xFF,0,backupAt+entry.length);
  }
  image.set(enabled?after:before,hook);
  return image;
}

root.ParamixMyLabPuzzleFit={has,apply};
if (typeof module!=='undefined') module.exports=root.ParamixMyLabPuzzleFit;
})(typeof window!=='undefined'?window:globalThis);
