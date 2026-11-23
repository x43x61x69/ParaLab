/* The "How to play" banner shares this tiled artwork across the minigames. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const assets = 0x211000, sprite = 1598, stockCRC = 0xAB25A60F;
const kept = [0,1,3,4,5,6,8,9];
const order = [];
for (let y = 0; y < 3; y++) for (const x of kept) order.push(10*y + x);
// Keep removed descriptors after the 24 used tiles, so disabling is lossless.
for (let y = 0; y < 3; y++) order.push(10*y + 2,10*y + 7);
function artwork(image) {
  const d = new DataView(image.buffer,image.byteOffset,image.byteLength);
  const pack = assets + d.getUint32(assets+36,true);
  const start = pack + d.getUint32(pack + sprite*4,true);
  const end = pack + d.getUint32(pack + (sprite+1)*4,true);
  if (end-start !== 844 || end > image.length) return null;
  return image.subarray(start,end);
}
function reorder(data,on) {
  const out = Uint8Array.from(data);
  const table = 56, stride = 8;
  order.forEach((oldTile,newTile) => {
    const from = table+(on ? oldTile : newTile)*stride;
    const to = table+(on ? newTile : oldTile)*stride;
    out.set(data.subarray(from,from+stride),to);
  });
  out[6] = on ? 24 : 30;
  out[12] = on ? 8 : 10;
  return out;
}
function artworkState(data) {
  if (!data) return null;
  if (C.crc32(data) === stockCRC) return false;
  if (data[6] === 24 && data[12] === 8 && C.crc32(reorder(data,false)) === stockCRC) return true;
  return null;
}
// These cards are centred by the game. Move only existing spaces and breaks;
// the text tables keep their native lengths and their original glyphs.
const breakGlyph = 0xF000;
const extraGlyphs = { '-':317, 'É':407, 'Ü':422 };
function encode(text) {
  return Array.from(text, letter => letter === '|' ? breakGlyph : (C.TXT_ENC[letter] ?? extraGlyphs[letter]));
}
const cards = [
  [2,573,"QU'EN DIS-TU?||DEMANDONS.","QU'EN|DIS-TU?||DEMANDONS."],
  [3,573,"WIE FÜHLT SICH|DAS AN? FRAGEN|WIR NACH.","WIE FÜHLT|SICH DAS AN?|FRAGEN WIR|NACH."],
  [1,582,"YOU CAN LET|THE VARIOUS|TAMAS|IN THE GARDEN|PLAY WITH THE|PARADISE|DEVICE|TAMAS.",
         "YOU CAN LET|THE VARIOUS|TAMAS IN THE|GARDEN PLAY|WITH THE|PARADISE|DEVICE|TAMAS."],
  [2,582,"TU PEUX|LAISSER LES|TAMAGOTCHIS|DU JARDIN|JOUER AVEC LES|APPAREILS|TAMAGOTCHIS|PARADISE.",
         "TU PEUX|LAISSER LES|TAMAGOTCHIS|DU JARDIN|JOUER AVEC|LES APPAREILS|TAMAGOTCHIS|PARADISE."],
  [2,584,"CHOISIS LE|TAMAGOTCHI|AVEC LEQUEL|TU VEUX JOUER.","CHOISIS LE|TAMAGOTCHI|AVEC LEQUEL|TU VEUX|JOUER."],
  [5,584,"ELIGE CON QUÉ|TAMAGOTCHI|QUIERES JUGAR.","ELIGE|CON QUÉ|TAMAGOTCHI|QUIERES|JUGAR."],
  [6,584,"SCEGLI CON|QUALE|TAMAGOTCHI|VUOI GIOCARE.","SCEGLI CON|QUALE|TAMAGOTCHI|VUOI|GIOCARE."],
].map(([language,id,before,after]) => ({language,id,original:encode(before),fitted:encode(after)}));
function matchingCards(image) {
  const d = new DataView(image.buffer,image.byteOffset,image.byteLength);
  const result = [];
  for (const card of cards) {
    const entry = C.nativeTextEntry(image,assets,card.language,card.id);
    if (!entry || entry.end-entry.start !== (card.original.length+1)*2) continue;
    const matches = words => words.every((w,i) => d.getUint16(entry.start+2*i,true) === w);
    const fitted = matches(card.fitted);
    if (fitted || matches(card.original)) result.push({card,entry,fitted});
  }
  return result;
}
function has(image) {
  const art = artworkState(artwork(image)), entries = matchingCards(image);
  return art !== false && (art === true || entries.length > 0) && entries.every(item=>item.fitted);
}
function enabled(image) {
  return artworkState(artwork(image)) === true || matchingCards(image).some(item=>item.fitted);
}
function applicable(image) {
  return artworkState(artwork(image)) !== null || matchingCards(image).length > 0;
}
function apply(image,on) {
  const data = artwork(image), fitted = artworkState(data);
  const entries = matchingCards(image);
  const d = new DataView(image.buffer,image.byteOffset,image.byteLength);
  if (fitted !== null && fitted !== on) data.set(reorder(data,on));
  for (const {card,entry,fitted} of entries) {
    if (fitted === on) continue;
    const words = on ? card.fitted : card.original;
    let delta = 0;
    words.forEach((word,i) => {
      const at = entry.start+2*i;
      if (d.getUint16(at,true) === word) return;
      delta -= image[at]+image[at+1];
      d.setUint16(at,word,true);
      delta += image[at]+image[at+1];
    });
    d.setUint32(entry.strings+4,d.getUint32(entry.strings+4,true)+delta,true);
  }
  return image;
}
root.ParamixMyLabTutorialFit = {apply,has,enabled,applicable};
if (typeof module !== 'undefined') module.exports = root.ParamixMyLabTutorialFit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
