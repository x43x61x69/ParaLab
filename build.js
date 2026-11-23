// Builds a single HTML file: dist/ParaLab.html (runs offline).
// Usage: node build.js [--web] [output.html]
const fs = require('fs');
const path = require('node:path');
const v = fs.readFileSync(__dirname + '/VERSION', 'utf8').trim();
const brandIcon = fs.readFileSync(path.join(__dirname, 'src/paralab-icon.svg'), 'utf8').trim();
let html = fs.readFileSync(__dirname + '/src/index.html', 'utf8')
  .replaceAll('__BRAND_ICON__', 'data:image/svg+xml,' + encodeURIComponent(brandIcon))
  .replace('__STUDIO_LAYOUT__', () => fs.readFileSync(__dirname + '/src/studio.css', 'utf8'));
html = html.replace(/__DEVICE_ART_([a-z-]+)__/g, (_, model) => {
  const data = fs.readFileSync(path.join(__dirname, 'src/art', model + '.webp'));
  return 'data:image/webp;base64,' + data.toString('base64');
});
const translationLicenses = ['LICENSE-zh-patcher-MIT.txt', 'LICENSE-OpenCC-Apache-2.0.txt', 'OFL-Cubic11.txt', 'OFL-FusionPixel.txt'];
html = html.replace('__ZH_LICENSES__', () => translationLicenses.map(file => {
  const notice = fs.readFileSync(path.join(__dirname, 'third_party/zh_js', file), 'utf8');
  return '<pre>' + notice.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '</pre>';
}).join(''));
const core = fs.readFileSync(__dirname + '/src/core.js', 'utf8');
const labItems = fs.readFileSync(__dirname + '/src/lab_items.js', 'utf8');
const settings = fs.readFileSync(__dirname + '/src/settings.js', 'utf8');
const homeMenu = fs.readFileSync(__dirname + '/src/home_menu.js', 'utf8');
const myLab = fs.readFileSync(__dirname + '/src/mylab.js', 'utf8');
const myLabScreenScripts = ['mylab_grid_fit.js', 'mylab_item_fit.js', 'mylab_games_fit.js',
  'mylab_bubble_fit.js', 'mylab_puzzle_fit.js', 'mylab_egg_fit.js', 'mylab_text_fit.js', 'mylab_card_fit.js',
  'mylab_panel_fit.js', 'mylab_generator_fit.js', 'mylab_page_hints.js',
  'mylab_simulation_fit.js', 'mylab_food_fit.js', 'mylab_lab_pan.js',
  'mylab_letter_wrap.js', 'mylab_craft_wrap.js', 'mylab_record_badge.js', 'mylab_dialog_wrap.js',
  'mylab_tutorial_fit.js', 'mylab_screen_support.js'];
let myLabMenu = [...myLabScreenScripts, 'mylab_menu.js']
  .map(name => fs.readFileSync(path.join(__dirname, 'src', name), 'utf8')).join('\n');
for (const [name, file] of Object.entries({
  MENU: 'feld/feld-mylab.bin', HOOK: 'feld/feld-mylab-hook.bin',
  STUB: 'feld/stub_feld_tpl.bin', FLASH: 'flash/flashapp-mylab.bin',
  UART_ENTRY: 'feld/my-lab-uart-entry.bin', UART_WRITE_APP: 'flash/flashapp-mylab-bootstrap.bin',
  SETTINGS_LAYOUT: 'feld/my-lab-settings-layout.bin',
  PARADISE_MENU: 'feld/feld-mylab-paradise.bin', PARADISE_HOOK: 'feld/feld-mylab-paradise-hook.bin',
  PARADISE_FLASH: 'flash/flashapp-mylab-paradise.bin', PARADISE_GAME: 'feld/my-lab-paradise-game.bin',
})) {
  const binary = fs.readFileSync(path.join(__dirname, file));
  if ((name === 'MENU' || name.endsWith('_MENU')) && !binary.includes(Buffer.from('PMXVER:' + v + '\0')))
    throw new Error(file + ' does not match VERSION; rebuild the menu binary');
  myLabMenu = myLabMenu.replaceAll('__MYLAB_' + name + '_B64__', binary.toString('base64'));
}
const labRelease = fs.readFileSync(__dirname + '/src/lab_release.js', 'utf8')
  .replace("'__LAB_RELEASE_HELPER__'", () => fs.readFileSync(__dirname + '/six/my-lab/helper.json', 'utf8').trim());
const specialFood = fs.readFileSync(__dirname + '/src/special_food.js', 'utf8')
  .replace("'__SPECIAL_FOOD_HELPER__'", () => fs.readFileSync(__dirname + '/six/special-food/helper.json', 'utf8').trim())
  .replace("'__SPECIAL_FOOD_RELEASE__'", () => fs.readFileSync(__dirname + '/six/my-lab/helper.json', 'utf8').trim());
const args = process.argv.slice(2);
const web = args.includes('--web');
const analyticsCard = `<section class="analytics-card" id="analyticsCard" aria-labelledby="analyticsTitle" hidden>
  <h2 id="analyticsTitle" tabindex="-1">
    <span id="analyticsPromptTitle" data-t="Would you share usage statistics?">Would you share usage statistics?</span>
    <span id="analyticsSettingsTitle" data-t="Usage Statistics Settings" hidden>Usage Statistics Settings</span>
  </h2>
  <p data-t="Sharing which features you use helps us decide what to improve in ParaLab."></p>
  <p data-t="If you agree, Google Analytics 4 receives feature activity, ROM editions and built-in item IDs."></p>
  <div class="analytics-actions">
    <button class="btn" id="analyticsDecline" type="button" data-t="Do Not Share">Do Not Share</button>
    <button class="btn" id="analyticsAccept" type="button" data-t="Agree to Share">Agree to Share</button>
  </div>
  <details id="analyticsDetails">
    <summary data-t="Data and Settings">Data and Settings</summary>
    <p data-t="Usage statistics exclude ROM files, save data and filenames. Google Analytics 4 may use cookies to distinguish browsers and visits."></p>
    <p data-t="You can change your choice anytime in Usage Statistics Settings at the bottom of the page."></p>
  </details>
  <button class="btn small" id="analyticsClose" type="button" data-t="Close" hidden>Close</button>
</section>`;
const analyticsSettings = '<button id="analyticsSettings" class="analytics-settings" type="button" aria-controls="analyticsCard" aria-expanded="false" data-t="Usage Statistics Settings">Usage Statistics Settings</button>';
html = html.replace('__ANALYTICS_CARD__', web ? analyticsCard : '')
  .replace('__ANALYTICS_SETTINGS__', web ? analyticsSettings : '')
  .replace('__ANALYTICS_SCRIPT__', () => web
    ? '<script>' + fs.readFileSync(path.join(__dirname, 'src/analytics.js'), 'utf8') + '</script>' : '');
const outputArg = args.find(arg => arg !== '--web');
const output = outputArg ? path.resolve(outputArg) : path.join(__dirname, web ? 'dist/web/index.html' : 'dist/ParaLab.html');
html = html.replace(/__GUIDE_([a-z.-]+)__/g, (_, file) => {
  const source = path.join(__dirname, 'src/art/guide', file);
  if (web) {
    const directory = path.join(path.dirname(output), 'guide');
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(source, path.join(directory, file));
    return 'guide/' + file;
  }
  const mime = file.endsWith('.gif') ? 'image/gif' : 'image/png';
  return 'data:' + mime + ';base64,' + fs.readFileSync(source).toString('base64');
});
const webDirectory = web ? 'catalog-v' + v : null;
const { config: catalogConfig, assets: catalogAssets } = require('./tools/build_catalog.js').buildCatalog(__dirname, webDirectory);
const app = fs.readFileSync(__dirname + '/src/app.js', 'utf8')
  .replace('__FOOD_ARCHIVE__', fs.readFileSync(__dirname + '/six/special-food/food-item.arc2').toString('base64'))
  .replace('/*__COLLECTION_REFERENCE__*/ {}', () => JSON.stringify(require('./src/collection_reference.json')))
  .replace('/*__CATALOG_CONFIG__*/ {}', () => JSON.stringify(catalogConfig).replaceAll('<', '\\u003c'));
const zhSources = {
  __ZH_OPENCC__: 'third_party/zh_js/opencc_data.js',
  __ZH_CUBIC__: 'third_party/zh_js/glyphs_cubic11.js',
  __ZH_FUSION__: 'third_party/zh_js/glyphs_fusion12.js',
  __ZH_CONVERTER__: 'src/zh_converter.js',
};
for (const [marker, file] of Object.entries(zhSources)) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  if (source.includes('</script')) throw new Error(file + ' contains a script end tag');
  new (require('vm').Script)(source, { filename: file });
  html = html.replace(marker, () => source);
}
const localeDirectory = path.join(__dirname, 'src/locales');
const dictionaries = Object.fromEntries(fs.readdirSync(localeDirectory)
  .filter(file => file.endsWith('.json')).sort().map(file => [
    path.basename(file, '.json'), JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8')),
  ]));
const editionLabels = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/edition_labels.json'), 'utf8'));
const gameTerms = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/game_terms.json'), 'utf8'));
const localeSources = {
  __ROM_LOCALE__: fs.readFileSync(path.join(__dirname, 'src/rom_locale.js'), 'utf8')
    .replace('/*__GAME_TERMS__*/ {}', () => JSON.stringify(gameTerms).replaceAll('<', '\\u003c')),
  __I18N__: fs.readFileSync(path.join(__dirname, 'src/i18n.js'), 'utf8')
    .replace('/*__LOCALE_DICTIONARIES__*/ {}', () => JSON.stringify(dictionaries).replaceAll('<', '\\u003c'))
    .replace('/*__EDITION_LABELS__*/ {}', () => JSON.stringify(editionLabels).replaceAll('<', '\\u003c')),
};
for (const [marker, source] of Object.entries(localeSources)) {
  if (/<\/script/i.test(source)) throw new Error(marker + ' contains a script end tag');
  new (require('vm').Script)(source, { filename: marker });
  html = html.replace(marker, () => source);
}
// Preserve ROM compatibility inspection without shipping extra emulator programs.
// No emulator, game, or WAD binary is embedded in ParaLab.
const emu = fs.readFileSync(__dirname + '/src/emu.js', 'utf8');
// Field switch: program and stub template
let feld = fs.readFileSync(__dirname + '/src/feld.js', 'utf8');
{
  const d = (f) => fs.readFileSync(__dirname + '/feld/' + f).toString('base64');
  for (const f of ['feld.bin', 'stub_feld_tpl.bin']) if (!fs.existsSync(__dirname + '/feld/' + f)) throw new Error('feld/' + f + ' is missing');
  for (const name of ['feld.bin', 'feldc.bin']) {
    if (!fs.readFileSync(__dirname + '/feld/' + name).includes(Buffer.from('PMXVER:' + v + '\0')))
      throw new Error('ParaLab menu version does not match VERSION; run sh feld/src/feld/build.sh first');
  }
  feld = feld.replace('__FELD_B64__', d('feld.bin')).replace('__FELD_STUB_B64__', d('stub_feld_tpl.bin'));
  if (fs.existsSync(__dirname + '/feld/feldc.bin')) feld = feld.replace('__FELDC_B64__', d('feldc.bin'));   // 1.7.2 CLEAN_ROM: menu for ROMs without the Paradise
}
// Six fields: helper page (source in six/src)
let six = fs.readFileSync(__dirname + '/src/six.js', 'utf8');
{
  const binary = (name) => fs.readFileSync(__dirname + '/six/' + name + '.bin').toString('base64');
  six = six.replace('__SIX_B64__', binary('six')).replace('__BOOK_B64__', binary('book'))
    .replace('__BOOK_GEN1_B64__', binary('book-gen1')).replace('__BOOK_JADE_B64__', binary('book-jade'));
}
if (six.includes('</script')) throw new Error('script end tag inside source');
const lz4 = fs.readFileSync(__dirname + '/six/experimental-lz4/patch.js', 'utf8')
  .replace("'__LEGACY_LZ4_B64__'", JSON.stringify(fs.readFileSync(__dirname + '/six/experimental-lz4/helper.bin').toString('base64')))
  .replace("'__LEGACY_LZ4_GEN1_B64__'", JSON.stringify(fs.readFileSync(__dirname + '/six/experimental-lz4/helper-gen1.bin').toString('base64')))
  .replace("'__LEGACY_LZ4_JADE_B64__'", JSON.stringify(fs.readFileSync(__dirname + '/six/experimental-lz4/helper-jade.bin').toString('base64')));
const growth = (suffix = '') => fs.readFileSync(__dirname + '/six/experimental-neon/growth' + suffix + '.bin').toString('base64');
const neon = fs.readFileSync(__dirname + '/six/experimental-neon/transplant.js', 'utf8')
  .replace("'__NEON_GROWTH_B64__'", JSON.stringify(growth()))
  .replace("'__NEON_GROWTH_GEN1_B64__'", JSON.stringify(growth('-gen1')))
  .replace("'__NEON_GROWTH_JADE_B64__'", JSON.stringify(growth('-jade')));
for (const [name, source] of [['legacy LZ4', lz4], ['Neon transplant', neon]]) {
  if (source.includes('</script')) throw new Error('script end tag inside ' + name);
  new Function(source);
}
// Flash app for the device tab (our own code, source in flash/src)
let flash = fs.readFileSync(__dirname + '/src/flash.js', 'utf8');
{
  const f = __dirname + '/flash/flashapp.bin';
  if (!fs.existsSync(f)) throw new Error('flash/flashapp.bin is missing');
  flash = flash.replace('__FLASH_APP_B64__', fs.readFileSync(f).toString('base64'));
}
// every script must parse (a stray quote in a text broke the whole page once)
{
  const vm = require('vm');
  for (const [n, src] of [['core.js', core], ['lab_items.js', labItems], ['settings.js', settings], ['home_menu.js', homeMenu], ['app.js', app], ['emu.js', emu], ['feld.js', feld], ['six.js', six], ['flash.js', flash], ['saves.js', fs.readFileSync(__dirname + '/src/saves.js', 'utf8')]]) {
    try { new vm.Script(src, { filename: n }); } catch (e) { throw new Error(n + ': ' + e.message); }
  }
}
const saves = fs.readFileSync(__dirname + '/src/saves.js', 'utf8');
const visit = fs.readFileSync(__dirname + '/src/visit.js', 'utf8');
if (visit.includes('</script')) throw new Error('script end tag inside source');
new (require('vm').Script)(visit, { filename: 'visit.js' });
new (require('vm').Script)(myLab, { filename: 'mylab.js' });
new (require('vm').Script)(myLabMenu, { filename: 'mylab_menu.js' });
if (myLab.includes('</script') || myLabMenu.includes('</script')) throw new Error('script end tag inside source');
if (saves.includes('</script')) throw new Error('script end tag inside source');
if (flash.includes('</script')) throw new Error('script end tag inside source');
if (feld.includes('</script')) throw new Error('script end tag inside source');
if (core.includes('</script') || app.includes('</script') || emu.includes('</script')) throw new Error('script end tag inside source');
if (labItems.includes('</script')) throw new Error('lab_items.js contains a script end tag');
const publicRef = process.env.PARALAB_PUBLIC_SHA || 'main';
if (publicRef !== 'main' && !/^[a-f0-9]{40}$/.test(publicRef)) throw new Error('Invalid public source revision');
html = html.replace('__PUBLIC_REF__', publicRef);
html = html.replace('__LAB_ITEMS__', () => labItems);
html = html.replace('__CORE__', () => core).replace('__SETTINGS__', () => settings).replace('__HOME_MENU__', () => homeMenu).replace('__LAB_RELEASE__', () => labRelease).replace('__EMU__', () => emu).replace('__FELD__', () => feld).replace('__SIX__', () => six).replace('__LEGACY_LZ4__', () => lz4).replace('__NEON_TRANSPLANT__', () => neon).replace('__SPECIAL_FOOD__', () => specialFood).replace('__FLASH__', () => flash).replace('__SAVES__', () => saves).replace('__VISIT__', () => visit).replace('__MYLAB__', () => myLab).replace('__MYLAB_MENU__', () => myLabMenu).replace('__APP__', () => app).split('__VERSION__').join('v' + v);
fs.mkdirSync(path.dirname(output), { recursive: true });
if (web) {
  const directory = path.join(path.dirname(output), webDirectory);
  fs.mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of catalogAssets) fs.writeFileSync(path.join(directory, filename), bytes);
}
// Preserve the file timestamp when the source and embedded assets have not changed.
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== html) fs.writeFileSync(output, html);
console.log(output, Buffer.byteLength(html), 'bytes, version', v);
