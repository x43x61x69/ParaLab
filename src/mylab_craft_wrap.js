/* Toys and accessories share the same insufficient-materials message. */
(function (root) {
'use strict';
const C = root.ParamixCore || (typeof require === 'function' ? require('./core') : null);
const STRING_ID = 0x26d;
const extraGlyphs = {
  '\n': 0xf000, '-': 317, À: 400, Á: 401, Ã: 403, Ä: 404, É: 407, È: 408, Ê: 409,
  も: 49, っ: 66, て: 33, い: 16, る: 55, か: 20, ず: 77, が: 70,
  た: 30, り: 54, な: 35, よ: 52, ち: 31, う: 17, '　': 1, そ: 29,
  ざ: 75, を: 59, え: 18, ら: 53, ぶ: 87, シ: 106, ョ: 149, ッ: 146,
  ピ: 171, ン: 140, グ: 152, で: 83, ね: 38
};
function encode(text) {
  return Array.from(text, ch => extraGlyphs[ch] ?? C.TXT_ENC[ch]);
}
const warnings = [
  [0, 'もっているかずが\nたりないよ\nちがう　そざいを\nえらぶか\nショッピングでかってね',
      'もっているかずが\nたりないよ\nちがうそざいを\nえらぶか\nショッピングで\nかってね'],
  [1, "YOU DON'T HAVE\nENOUGH. PICK\nA DIFFERENT\nMATERIAL OR\nGO SHOPPING.",
      "YOU DON'T\nHAVE ENOUGH.\nPICK A\nDIFFERENT\nMATERIAL OR\nGO SHOPPING."],
  [2, 'QUANTITÉ\nINSUFFISANTE.\nCHOISIS UN\nAUTRE MATÉRIAU\nOU ACHÈTE-LE.',
      'QUANTITÉ\nINSUFFISANTE.\nCHOISIS UN\nAUTRE\nMATÉRIAU OU\nACHÈTE-LE.'],
  [3, 'DU HAST NICHT\nGENUG. WÄHLE\nEIN ANDERES\nMATERIAL\nODER GEHE\nEINKAUFEN.',
      'DU HAST\nNICHT GENUG.\nWÄHLE EIN\nANDERES\nMATERIAL\nODER GEHE\nEINKAUFEN.'],
  [4, 'VOCÊ NÃO TEM\nO SUFICIENTE.\nESCOLHA\nUM MATERIAL\nDIFERENTE\nOU VÁ À LOJA.',
      'VOCÊ NÃO\nTEM O\nSUFICIENTE.\nESCOLHA UM\nMATERIAL\nDIFERENTE OU\nVÁ À LOJA.']
].map(([language, stock, fit]) => ({ language, original: encode(stock), fitted: encode(fit) }));

function entries(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const known = [];
  for (const warning of warnings) {
    const entry = C.nativeTextEntry(image, 0x211000, warning.language, STRING_ID);
    if (!entry || entry.end - entry.start !== 2 * (warning.original.length + 1)) continue;
    const matches = words => words.every((word, i) => view.getUint16(entry.start + i * 2, true) === word);
    const fitted = matches(warning.fitted);
    if (fitted || matches(warning.original)) known.push({ entry, warning, fitted });
  }
  return known;
}

function apply(image, enabled) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  for (const item of entries(image)) {
    if (item.fitted === enabled) continue;
    const { strings, start } = item.entry;
    const target = enabled ? item.warning.fitted : item.warning.original;
    let delta = 0;
    for (let i = 0; i < target.length; i++) {
      const at = start + 2 * i;
      if (view.getUint16(at, true) === target[i]) continue;
      delta -= image[at] + image[at + 1];
      view.setUint16(at, target[i], true);
      delta += image[at] + image[at + 1];
    }
    view.setUint32(strings + 4, view.getUint32(strings + 4, true) + delta, true);
  }
  return image;
}
const api = {
  has(image) { const known = entries(image); return known.length > 0 && known.every(item => item.fitted); },
  enabled: image => entries(image).some(item => item.fitted),
  applicable: image => entries(image).length > 0,
  apply
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ParamixMyLabCraftWrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
