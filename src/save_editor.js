/* Save Editor coordinates the existing Workspace and Device Console services. */
const saveEditor = { session: null, source: null, preview: null, running: false, reading: false, status: null };
const EDITOR_PAGE = 0x1000;
const EDITOR_LIVE = 'live';
const editorResidents = window.ParamixResidents;

function saveEditorStatus(key, params) {
  saveEditor.status = key ? () => t(key, params) : null;
  renderSaveEditorStatus();
}
function renderSaveEditorStatus() {
  const status = $('editSaveStatus');
  const target = $(saveEditor.session && !saveEditor.reading ? 'editSaveFooterStatus' : 'editSaveSourceStatus');
  if (status.parentElement !== target) target.append(status);
  status.textContent = saveEditor.status?.() || '';
}
function saveEditorError(error) {
  saveEditorStatus('devErr', { e: flMsg(error) });
}
function saveEditorEdition(ed) {
  return ed === FL.MY_LAB_ON_PARADISE ? t('myLabPortDevice') :
    I18n.edition(romEditionKey(ed)) || FL.EDITIONS[ed] || t('Unknown');
}
function saveEditorSlotLabel(source, slot) {
  if (slot === EDITOR_LIVE) return t('Active Save');
  if (source.slots?.f && !source.slots.saves)
    return fieldName(source.rom, F.fieldNames(source.rom)[slot]) || t('Slot {v1}', { v1: slot + 1 });
  return t('Slot {v1}', { v1: slot + 1 });
}
function saveEditorSlotGroups(select, source, slots) {
  const group = (name, entries) => {
    const options = document.createElement('optgroup');
    options.label = t(name);
    options.append(...entries.map(slot => residentOption(slot, saveEditorSlotLabel(source, slot))));
    return options;
  };
  select.replaceChildren(group('Game Data', [EDITOR_LIVE]));
  if (slots.length) select.append(group('ParaLab Menu Slots', slots));
}
function saveEditorDataGroup(holder, label, kind) {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = t(label);
  title.id = 'editSaveData-' + kind;
  section.setAttribute('aria-labelledby', title.id);
  section.className = 'save-editor-data save-editor-data-' + kind;
  section.append(title);
  holder.append(section);
  return section;
}
function saveEditorButtons() {
  const { session, source, running } = saveEditor, device = dv.d;
  const busy = running || dv.run;
  $('editSaveDevice').disabled = busy || !device;
  $('editSaveDevice').hidden = !device;
  $('editSaveConnect').hidden = !!device;
  const hasRom = !!(state.ctx || myLabRom);
  $('editSaveRom').disabled = busy || !hasRom;
  $('editSaveRom').hidden = !hasRom;
  $('editSaveOpenRom').hidden = hasRom;
  $('editSaveOpenRom').disabled = busy;
  $('editSaveRomName').textContent = myLabRom?.name || state.name || '';
  $('editSaveRomName').hidden = !hasRom;
  $('editSaveDeviceName').textContent = device ? connectedEdition(device) : '';
  $('editSaveDeviceName').hidden = !device;
  $('editSaveOpen').disabled = $('editSaveSlot').disabled = busy;
  $('editSaveOpen').classList.toggle('primary', !session);
  $('editSaveEdition').disabled = busy || saveEditorDirty(session);
  $('editSaveLoadPreview').disabled = busy;
  $('editSaveNavigation').inert = $('editSaveMobileJump').inert = busy;
  $('editSaveFields').inert = busy;
  $('editSaveUnsaved').hidden = !saveEditorDirty(session) || (session.downloaded === session.working && !session.changes.size);
  $('editSaveDeviceControls').hidden = !running || !dv.run;
  $('editSaveStop').disabled = dv.cancel;
  $('editSaveRestart').hidden = !device || !dv.restartReason || busy;
  $('editSaveApply').hidden = source?.kind !== 'rom';
  $('editSaveApply').disabled = busy || !session?.working || !saveEditorDirty(session) ||
    (source?.lab ? myLabRom !== source?.context : state.ctx !== source?.context);
  $('editSaveWrite').disabled = busy || !session?.working || !device || device.info.readOnly ||
    (source?.kind === 'device' && (source.device !== device || session.written || !saveEditorDirty(session))) ||
    (source?.lab ? !usesMyLabDeviceSave(device) : !session?.working.edition || !FL.EDITIONS[device.info.edition] ||
      SV.family(device.info.edition) !== SV.family(session.working.edition));
  $('editSaveWrite').hidden = source?.kind === 'rom' || !device;
  $('editSaveDownload').disabled = busy || !session?.working || (!source?.lab && !session.working.edition);
  $('editSaveOriginal').disabled = busy || !session?.original;
  const applyPrimary = source?.kind === 'rom' && !$('editSaveApply').disabled;
  const writePrimary = source?.kind === 'device' && !$('editSaveWrite').disabled;
  $('editSaveApply').classList.toggle('primary', applyPrimary);
  $('editSaveWrite').classList.toggle('primary', writePrimary);
  $('editSaveDownload').classList.toggle('primary', !applyPrimary && !writePrimary);
}
function saveEditorDirty(session) {
  return !!session && (session.changes.size > 0 || session.working !== session.baseline);
}
function saveEditorRecord(session, key, value, initial) {
  if (value === initial) session.changes.delete(key);
  else session.changes.set(key, value);
  saveEditorButtons();
}
function saveEditorCompatible(context, lab, edition) {
  if (!context) return false;
  if (lab) return !!context.characters;
  return !!FL.EDITIONS[edition] && !!FL.EDITIONS[context.editionId] && !context.characters &&
    SV.family(context.editionId) === SV.family(edition);
}
function saveEditorPreview(session = saveEditor.session) {
  if (!session) return null;
  const { lab, context } = session.source, edition = session.working?.edition;
  return [context, session.preview, lab ? myLabRom : state.ctx, saveEditor.preview]
    .find(ctx => saveEditorCompatible(ctx, lab, edition)) || null;
}
function matchSaveEditorPreview(session, context) {
  if (!session.source.lab && !session.working.edition && session.source.candidates?.includes(context?.editionId))
    session.working = session.baseline = { ...session.working, edition: context.editionId };
  return saveEditorCompatible(context, session.source.lab, session.working.edition);
}
function syncSaveEditorRomPreview() {
  const session = saveEditor.session;
  if (!session || session.source.kind === 'rom') return;
  const context = myLabRom || state.ctx;
  if (!matchSaveEditorPreview(session, context)) return;
  session.preview = context;
  $('editSavePreviewDialog').close();
  refreshSaveEditor();
}
function saveEditorGeometry(source, session) {
  if (source.lab || !session.working?.edition) return null;
  const ed = session.working.edition, context = saveEditorPreview(session), rom = source.rom || context?.rom;
  const names = rom ? F.fieldNames(rom) : ed === 8 ? ['Cosmic Planet', 'New Tamagotchi Planet', 'Tamagotchi Planet'] :
    ed === 4 ? ['Land', 'Water', 'Forest'] : ed >= 5 && ed <= 7 ? ['Tropical', 'Glacier', 'Forest'] : ['Land', 'Water', 'Sky'];
  const menu = rom && F.embedded() && F.feldFind(rom, F.embedded().stub);
  const options = rom ? F.careOptions(rom, menu) : 0;
  const split = rom && names.length > 3 && !!(rom[0x10F020] & 8);
  const inferred = SV.paradiseEditorDefaultConfig(session.working);
  const cellIds = inferred?.ids || (split ? names.length === 4 ? [0, 1, 2, 4] : [0, 1, 2, 3, 4, 5] : [0, 1, 2]);
  const legacyCare = rom && F.careUsesLegacyStorage(rom, menu);
  const careBookOverlap = !!(inferred?.split || (rom && F.careBookOverlap(rom, menu)));
  const careNeedsUpdate = !!(options & F.CARE_AUTOPILOT_PATCH) && legacyCare && careBookOverlap;
  const assetSource = context?.rom || null;
  if (session.rosterROM !== rom || session.rosterAssets !== assetSource || !session.roster) {
    session.roster = F.saveEditorRoster(rom, ed, menu, names, assetSource);
    session.rosterROM = rom;
    session.rosterAssets = assetSource;
  }
  return {
    ids: cellIds, split: split || inferred?.split, names, legacyCare, careBookOverlap, careNeedsUpdate,
    autopilot: !!(options & F.CARE_AUTOPILOT_PATCH) && !careNeedsUpdate,
    infiniteFuel: !!(options & F.CARE_FUEL_PATCH), itemLimits: context?.itemLimits, catalog: context?.saveEditorItems,
    awake: !!(menu?.flags & F.F_KEEP_AWAKE),
    planetTravel: ed === 8 && !!(menu?.flags & F.F_NEON_TRAVEL),
    appearance: SV.paradiseEditorAppearance(ed, rom), characters: context?.saveEditorCharacters, roster: session.roster,
  };
}
function saveEditorGuess(save) {
  if (save.edition) return [save.edition];
  const start = SV.region(8)[0];
  if (save.regs.some(([first]) => first === start || first * EDITOR_PAGE === start) ||
      SV.NEON_SETTINGS.every(at => save.pages.has(at)) && SV.neonSettings(save.pages)) return [8];
  return [1, 2, 3, 4, 5, 6, 7].filter(ed => !SV.paraCheck(save, ed).errors.length);
}
function saveEditorNew(source, slot, working, original = null, snapshot = null) {
  return { source, slot, working, baseline: working, original, snapshot, changes: new Map() };
}
async function saveEditorSwitchAllowed() {
  const session = saveEditor.session;
  if (!saveEditorDirty(session) || (session.downloaded === session.working && !session.changes.size)) return true;
  const result = await deviceDialog(t('Save your changes before opening another save?'), t('Unsaved Changes'),
    t('Download Edited Save'), false, null, t('Discard Changes'));
  if (result === 'accept') return saveEditorDownload(false);
  return result === 'alternate';
}
function saveEditorSection(parent, label, open = false, values) {
  const details = document.createElement('details');
  details.className = 'save-editor-section';
  details.dataset.section = label;
  details.open = open;
  const summary = document.createElement('summary');
  summary.textContent = t(label, values);
  const fields = document.createElement('div');
  fields.className = 'save-editor-controls';
  details.append(summary, fields);
  parent.append(details);
  return fields;
}
function saveEditorGroup(parent, name) {
  const group = document.createElement('fieldset'), legend = document.createElement('legend');
  legend.textContent = t(name);
  group.className = 'save-editor-controls save-editor-wide save-editor-group';
  group.append(legend);
  parent.append(group);
  return group;
}
function saveEditorActions(parent) {
  const row = document.createElement('div');
  row.className = 'save-editor-wide save-editor-inline-actions';
  parent.append(row);
  return row;
}
function saveEditorLabeled(parent, name, input) {
  const label = document.createElement('label'), title = document.createElement('span');
  title.textContent = t(name);
  label.append(title, input);
  parent.append(label);
  return label;
}
function saveEditorFieldName(context, name) {
  if (!name) return '';
  const label = t(name);
  return label === name ? fieldName(context?.rom, name) : label;
}
function saveEditorRecordHeading(fields, picture, name) {
  const summary = fields.previousElementSibling, title = document.createElement('span');
  title.textContent = name;
  summary.classList.add('save-editor-record-heading');
  const row = document.createElement('span');
  row.className = 'save-editor-record-title';
  if (picture) row.append(imgToCanvas(picture, 2));
  row.append(title);
  summary.append(row);
}
function saveEditorPortrait(context, id, bytes, memorial = false) {
  if (!context) return null;
  const visitor = context?.saveEditorVisitors?.get(id) || context?.characters?.get(id);
  try {
    if (bytes) {
      const ghost = editorResidents.preview(bytes, visitor, C, memorial);
      return ghost ? gardenPortrait(ghost) : null;
    }
  } catch (_) { return null; }
  if (!visitor) return null;
  try {
    const picture = gardenPortrait(VIS.buildRomGhost(visitor, C));
    if (picture) return picture;
  } catch (_) { /* Use an individual sprite when the complete pose exceeds preview limits. */ }
  try { return C.spriteDecode(visitor.entries[visitor.sprites[0]]).subs[0]; }
  catch (_) { return null; }
}
function saveEditorAppearance(info, changes) {
  const [body, stage] = (changes.body || info.id + ':' + info.stage).split(':').map(Number);
  const [eyes, eyeStage] = (changes.eyes || (stage === info.stage ? info.eyeId : body) + ':' + stage).split(':').map(Number);
  return { body, eyes, stage, eyeStage, color: Number(changes.bodyColor ?? info.color) };
}
function saveEditorCarePortrait(context, { body, eyes, stage, eyeStage, color }) {
  if (!context || stage !== eyeStage) return null;
  const visitors = context.saveEditorVisitors;
  const visitor = visitors.get(body), eye = visitors.get(eyes);
  if (!visitor || !eye || visitor.character.stage !== stage || eye.character.stage !== stage) return null;
  try {
    let ghost = VIS.buildRomGhost(visitor, C);
    const swap = eyes === body ? null : {
      id: eyes, sprites: [1, 4].map(part => eye.entries[eye.sprites[part]]),
    };
    context.saveEditorPalette ??= C.characterPaletteVariants(context.entries)?.bytes || false;
    if (color !== 31 && !context.saveEditorPalette) return null;
    ghost = VIS.editGhostAppearance(ghost, {
      eyes: swap, color: color === 31 ? undefined : color, palette: context.saveEditorPalette,
    });
    return gardenPortrait(ghost);
  } catch (_) { return null; }
}
function saveEditorPreviewChoice(parent, input, context) {
  const thumbnail = document.createElement('span');
  thumbnail.className = 'save-editor-choice-portrait';
  parent.append(thumbnail);
  const redraw = () => {
    const picture = input.value && saveEditorPortrait(context, Number(input.value));
    thumbnail.hidden = !picture;
    thumbnail.replaceChildren(...(picture ? [imgToCanvas(picture)] : []));
  };
  input.addEventListener('change', redraw);
  redraw();
}
function saveEditorBookEntry(holder, session, context, key, id, slot, checked) {
  const input = saveEditorControl(holder, session, key,
    id ? saveEditorCharacterName(context, id) : t('Slot {v1}', { v1: slot }), checked, { check: true });
  if (!context || !id) return;
  const thumbnail = document.createElement('span');
  thumbnail.className = 'save-editor-book-portrait';
  const label = input.parentElement;
  label.classList.add('save-editor-book-entry');
  label.prepend(input, thumbnail);
  const draw = () => {
    const picture = saveEditorPortrait(context, id);
    if (picture) thumbnail.append(imgToCanvas(picture));
    else thumbnail.hidden = true;
  };
  if (typeof IntersectionObserver === 'undefined') { draw(); return; }
  const observer = session.bookPortraitObserver ||= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const paint = session.bookPortraitPaint.get(entry.target);
      session.bookPortraitPaint.delete(entry.target);
      paint?.();
    }
  });
  session.bookPortraitPaint.set(thumbnail, draw);
  observer.observe(thumbnail);
}
function saveEditorControl(parent, session, key, name, value, settings = {}) {
  const label = document.createElement('label'), title = document.createElement('span');
  title.textContent = t(name, settings.values);
  const input = document.createElement(settings.choices ? 'select' : 'input');
  input.dataset.saveField = key;
  input.disabled = !!settings.disabled;
  if (settings.choices) input.replaceChildren(...settings.choices.map(([id, text]) => residentOption(id, text)));
  else if (settings.check) {
    label.className = 'check';
    input.type = 'checkbox';
  } else {
    input.type = 'number';
    input.min = settings.min ?? 0;
    input.max = settings.max ?? 65535;
    input.step = '1';
    input.required = true;
  }
  const initial = session.changes.get(key) ?? value;
  if (settings.check) input.checked = initial;
  else input.value = String(initial);
  const update = () => {
    saveEditorRecord(session, key, settings.check ? input.checked :
      settings.choices ? input.value : input.valueAsNumber, settings.choices ? String(value) : value);
    saveEditorValidateField(input, session);
    settings.onChange?.(input);
  };
  input.addEventListener('input', update);
  label.append(title, input);
  parent.append(label);
  saveEditorValidateField(input, session);
  return input;
}
function saveEditorValidateField(input, session) {
  const changed = session.changes.has(input.dataset.saveField);
  let message = '';
  if (changed && !input.disabled && input.type === 'number') {
    const min = Number(input.min), max = Number(input.max), value = input.valueAsNumber;
    if (!Number.isInteger(value) || value < min || value > max) message = t('Whole number from {min} to {max}', { min, max });
  } else if (changed && !input.disabled && input.tagName === 'SELECT' && input.selectedIndex < 0) {
    message = t('Choose a valid option.');
  }
  input.setCustomValidity(message);
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  return !message;
}
function saveEditorCheckFields(session) {
  for (const input of $('editSaveForm').querySelectorAll('[data-save-field]')) {
    if (saveEditorValidateField(input, session)) continue;
    for (let parent = input.parentElement; parent; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS') parent.open = true;
    input.reportValidity();
    throw new Error(input.validationMessage);
  }
}
function saveEditorAction(parent, label, fn) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn small';
  button.textContent = t(label);
  button.onclick = fn;
  parent.append(button);
  return button;
}
function saveEditorPreviewRow(parent, picture, text) {
  const row = document.createElement('div');
  row.className = 'save-editor-wide save-editor-preview';
  if (picture) row.append(imgToCanvas(picture, 2));
  const label = document.createElement('span');
  label.textContent = text;
  row.append(label);
  parent.append(row);
  return row;
}
function saveEditorCharacterName(context, id) {
  const chr = context && (context.characters?.get(id) || context.saveEditorVisitors?.get(id));
  const name = chr && romDisplayName(context.rom, chr.character.name);
  return name || context?.saveEditorCharacters?.find(character => character.id === id)?.name ||
    t('Character #{v1}', { v1: id });
}
function saveEditorSnapshotName(context, record) {
  if (!record?.id) return t('Snapshot unreadable');
  if (context?.saveEditorVisitors?.has(record.id) || context?.characters?.has(record.id))
    return saveEditorCharacterName(context, record.id);
  return (record.bytes && visGhostDisplayName(visView(record.bytes), 0x12, context?.rom)) ||
    saveEditorCharacterName(context, record.id);
}
function saveEditorCatalog(context, lab) {
  if (!context) return [];
  if (!context.saveEditorItems) {
    context.saveEditorItems = lab ? ML.editorCatalog(context.rom, C) : F.itemCatalog(context.rom);
    context.itemLimits = new Map(context.saveEditorItems.map(item => [item.id, item.max]));
  }
  return context.saveEditorItems;
}
function saveEditorItemName(context, item, id = item?.id) {
  return (item && context && romDisplayName(context.rom, item.text)) ||
    item?.name || t('Item #{v1}', { v1: id });
}
function saveEditorItemPicture(context, item) {
  if (!context || !item?.pic) return null;
  try {
    const entry = item.at ? context.rom.subarray(item.at.addr, item.at.addr + item.at.len) :
      context.archives?.[1]?.[item.pic - 1] || context.entries?.[item.pic];
    return entry && C.spriteDecode(entry).subs[0];
  } catch (_) { return null; }
}
function saveEditorItemFields(holder, session, info, context) {
  const items = saveEditorSection(holder, 'Items');
  const catalog = saveEditorCatalog(context, saveEditor.source.lab);
  const byId = new Map(catalog.map(item => [item.id, item]));
  const max = saveEditor.source.lab ? 10 : session.working.edition === 8 ? null : 15;
  const list = document.createElement('div');
  list.className = 'save-editor-controls save-editor-wide save-editor-records';
  if (!info.items.length) saveEditorPreviewRow(list, null, t('Empty'));
  for (const item of info.items) {
    const asset = byId.get(item.id);
    const input = saveEditorControl(list, session, 'item:' + item.slot,
      saveEditorItemName(context, asset, item.id), item.count, { max: max ?? Math.max(0, (asset?.max ?? (item.count + item.reserved)) - item.reserved) });
    const picture = saveEditorItemPicture(context, asset);
    const preview = document.createElement('span');
    preview.className = 'save-editor-item-preview';
    if (picture) preview.append(imgToCanvas(picture));
    else preview.hidden = !context;
    input.parentElement.prepend(preview);
  }
  items.append(list);
  if (info.items.length) {
    const bulk = document.createElement('input');
    bulk.type = 'number'; bulk.min = '0'; bulk.max = String(max ?? 10); bulk.value = '1';
    const actions = saveEditorActions(items);
    saveEditorLabeled(actions, 'Quantity', bulk);
    saveEditorAction(actions, 'Set Owned Counts', () => {
      if (!bulk.reportValidity()) return;
      for (const input of list.querySelectorAll('input')) {
        input.value = String(Math.min(Number(input.max), bulk.valueAsNumber));
        input.dispatchEvent(new Event('input'));
      }
    });
  }
  const available = catalog.filter(item => !item.fixed && !item.decoration);
  if (available.length) {
    const select = document.createElement('select');
    select.replaceChildren(...available.map(item => residentOption(item.id, saveEditorItemName(context, item))));
    const actions = saveEditorActions(items);
    saveEditorLabeled(actions, 'Items', select);
    const thumbnail = document.createElement('span');
    thumbnail.className = 'save-editor-item-preview';
    actions.append(thumbnail);
    const drawThumbnail = () => {
      const picture = saveEditorItemPicture(context, byId.get(Number(select.value)));
      thumbnail.hidden = !picture;
      thumbnail.replaceChildren(...(picture ? [imgToCanvas(picture)] : []));
    };
    select.addEventListener('change', drawThumbnail);
    drawThumbnail();
    saveEditorAction(actions, 'Add Item', () => runSaveEditor(() =>
      saveEditorTransform(session, { addItems: [[Number(select.value), 1]] })));
    saveEditorAction(actions, 'Add All Missing', () => runSaveEditor(() =>
      saveEditorTransform(session, { addItems: available.filter(item => !info.items.some(owned => owned.id === item.id))
        .map(item => [item.id, 1]) })));
  }
}
function saveEditorParadiseFields(holder, extensions, session, info, config, context) {
  const progress = saveEditorSection(holder, 'Progress', true);
  saveEditorControl(progress, session, 'points', 'Tamapoints', info.points, { max: 99999 });
  saveEditorControl(progress, session, 'level', session.working.edition === 8 ? 'Galaxy Level' : 'petLevel', info.level, { max: 10 });
  if (info.planet !== null) {
    const names = ['Cosmic Planet', 'New Tamagotchi Planet', 'Tamagotchi Planet'].map(name => saveEditorFieldName(context, name));
    const access = saveEditorGroup(progress, 'Planet Access');
    saveEditorControl(access, session, 'planet', 'Current Planet', info.planet,
      { choices: names.map((name, i) => [i, name]) });
    names.forEach((name, i) => saveEditorControl(access, session, 'planetAccess:' + i, name,
      !!(info.planets & (1 << i)), { check: true }));
    saveEditorAction(saveEditorActions(access), 'Unlock All', () => {
      for (const input of access.querySelectorAll('input[data-save-field^="planetAccess:"]')) {
        input.checked = true;
        input.dispatchEvent(new Event('input'));
      }
    });
  }
  const care = saveEditorSection(holder, 'Care', true);
  const portrait = saveEditorPreviewRow(care, null, t('No current Tama'));
  if (info.alive) {
    const image = document.createElement('span'), name = portrait.firstElementChild;
    portrait.prepend(image);
    const redraw = () => {
      const looks = saveEditorAppearance(info, Object.fromEntries(session.changes));
      const picture = saveEditorCarePortrait(context, looks);
      image.replaceChildren(...(picture ? [imgToCanvas(picture, 2)] : []));
      image.hidden = !picture;
      name.textContent = saveEditorCharacterName(context, looks.body);
    };
    redraw();
    const condition = saveEditorGroup(care, 'Health and Care');
    for (const [key, label, max] of [['age', 'Age (Days)', 999], ['hunger', 'Hunger', 6], ['happy', 'Happiness', 20],
      ['cleanliness', 'Cleanliness', 3]]) saveEditorControl(condition, session, key, label, info[key], { max });
    saveEditorControl(condition, session, 'sick', 'Illness', !!info.sick, { check: true });
    saveEditorControl(condition, session, 'vitamin', 'Vitamin', info.vitamin, { check: true });
    const counters = saveEditorGroup(care, 'Care Counters');
    for (const [key, label, max] of [['meals', 'Full Meals', 99], ['happinessCount', 'Full Happiness', 99],
      ['mistakes', 'Care Mistakes', 255]]) saveEditorControl(counters, session, key, label, info[key], { max });
    const appearance = saveEditorGroup(care, 'Appearance');
    saveEditorPreviewRow(appearance, null, t('Eyes') + ' · ' + saveEditorCharacterName(context, info.eyeId));
    const characters = context?.saveEditorCharacters || [];
    if (config.appearance) {
      const choice = (chr) => [chr.id + ':' + chr.stage, saveEditorCharacterName(context, chr.id)];
      if (characters.length) {
        const current = [[info.id + ':' + info.stage, saveEditorCharacterName(context, info.id)]];
        saveEditorControl(appearance, session, 'body', 'Body', info.id + ':' + info.stage, {
          choices: [...new Map([...current, ...characters.map(choice)])], onChange: redraw,
        });
        saveEditorControl(appearance, session, 'eyes', 'Eyes', info.eyeId + ':' + info.stage, {
          choices: [...new Map([[info.eyeId + ':' + info.stage, saveEditorCharacterName(context, info.eyeId)], ...characters.map(choice)])],
          onChange: redraw,
        });
      }
      const colors = [...paletteNames().slice(0, 16).map((name, index) => [index, name]), [31, t('visOriginalPalette')]];
      if (!colors.some(([id]) => id === info.color)) colors.unshift([info.color, t('Unknown') + ' (' + info.color + ')']);
      saveEditorControl(appearance, session, 'bodyColor', 'Body Color', info.color, { choices: colors, onChange: redraw });
    }
    saveEditorAction(saveEditorActions(condition), 'Full Care', () => {
      for (const [key, value] of [['hunger', 6], ['happy', 20], ['cleanliness', 3], ['sick', false]]) {
        const input = care.querySelector('[data-save-field="' + key + '"]');
        if (typeof value === 'boolean') input.checked = value;
        else input.value = String(value);
        input.dispatchEvent(new Event('input'));
      }
    });
  }
  if (!config?.infiniteFuel) saveEditorControl(care, session, 'fuel', 'Travel Fuel', info.fuel, { max: 60 });
  saveEditorControl(care, session, 'clearPoop', 'Clear All Poop ({v1})', false, { check: true, values: { v1: info.poop } });
  if (config.autopilot || info.autopilotStored || config.careNeedsUpdate) {
    const auto = saveEditorSection(extensions, 'Autopilot', true);
    if (config.careNeedsUpdate) saveEditorPreviewRow(auto, null, t('ParaLab Menu Update Available'));
    for (const [bit, label] of [[1, 'Keep Full'], [2, 'Max Happiness'], [4, 'Prevent Illness'], [8, 'Auto Clean Poop'],
      [16, 'No Poop'], [32, 'Keep Clean']]) saveEditorControl(auto, session, 'auto:' + bit, label, !!(info.autopilot & bit), { check: true, disabled: !config.autopilot });
  }
  if (config.awake || config.planetTravel || info.awake || info.planetTravel) {
    const mods = saveEditorSection(extensions, 'ParaLab Menu Options', true);
    for (const [key, name] of [['awake', 'keepAwakePatch'], ['planetTravel', 'Planet Travel']]) {
      if (config[key] || info[key]) saveEditorControl(mods, session, key, name, info[key], { check: true, disabled: !config[key] });
    }
  }
  if (info.alive && info.cells?.length) {
    const defaults = session.working.edition === 4 ? ['Land', 'Water', 'Forest', 'Sky'] : session.working.edition >= 5 && session.working.edition <= 7 ?
      ['Tropical', 'Glacier', 'Forest', 'Land', 'Water', 'Sky'] : session.working.edition === 8 ? ['Cosmic Planet', 'New Tamagotchi Planet', 'Tamagotchi Planet'] : ['Land', 'Water', 'Sky'];
    const nativeCells = saveEditorSection(holder, 'Cell');
    const extraCells = info.cells.some(cell => cell.id > 2) ? saveEditorSection(extensions, 'Cell') : null;
    info.cells.forEach(({ id, count }, i) => saveEditorControl(id > 2 ? extraCells : nativeCells, session, 'cell:' + id,
      saveEditorFieldName(context, config.names?.[i] || defaults[i]) || 'Cell', count, { max: 11 }));
  }
  const missions = saveEditorSection(holder, 'Missions');
  saveEditorAction(missions, 'Complete All', () => {
    for (const input of missions.querySelectorAll('input')) {
      input.checked = true;
      input.dispatchEvent(new Event('input'));
    }
  });
  info.missions.forEach((mission, i) => saveEditorControl(missions, session, 'mission:' + i,
    mission.name, mission.complete, { check: true }));
  for (const [parent, entries] of [[holder, info.book.filter(entry => !entry.extension)],
    [extensions, info.book.filter(entry => entry.extension)]]) {
    if (!entries.length) continue;
    const book = saveEditorSection(parent, 'Tama File');
    saveEditorAction(book, 'Unlock All', () => {
      for (const input of book.querySelectorAll('input')) {
        input.checked = true;
        input.dispatchEvent(new Event('input'));
      }
    });
    for (const field of new Set(entries.map(entry => entry.field))) {
      const roster = entries.filter(entry => entry.field === field);
      const records = saveEditorSection(book, saveEditorFieldName(context, roster[0].title) || t('Field'));
      records.parentElement.classList.add('save-editor-wide');
      for (const entry of roster) saveEditorBookEntry(records, session, context, 'book:' + entry.bit, entry.id, entry.index + 1, entry.unlocked);
    }
  }
  const stars = saveEditorSection(holder, 'Past Tamas');
  const image = saveEditorResidentImage(session, session.working, context);
  const adults = [...(context?.saveEditorVisitors?.values() || [])].filter(visitor => visitor.character.stage === 5);
  for (const star of info.stars) {
    const row = saveEditorSection(stars, 'Slot {v1}', false, { v1: star.slot + 1 });
    row.parentElement.classList.add('save-editor-wide');
    const current = image && editorResidents.memorial(image, star.slot);
    const descriptive = !star.used ? t('Empty') : saveEditorSnapshotName(context, current);
    saveEditorRecordHeading(row, star.used && saveEditorPortrait(context, current?.id, current?.bytes, true), descriptive);
    const choices = [[1, t('Tama Sick')], [2, t('Unknown') + ' (2)'], [3, t('Hunger')], [4, t('Unknown') + ' (4)']];
    if (star.used || (current && adults.length)) {
      saveEditorControl(row, session, 'starAge:' + star.slot, 'Age (Days)', star.age, {
        max: session.working.edition === 8 ? 1023 : 255,
      });
      if (star.used && !choices.some(([id]) => id === star.cause))
        choices.unshift([star.cause, t('Unknown') + ' (' + star.cause + ')']);
      saveEditorControl(row, session, 'starCause:' + star.slot, 'Cause of Death', star.used ? star.cause : 1, { choices });
    }
    const actions = saveEditorActions(row);
    if (star.used) saveEditorAction(actions, 'Delete Star', () => runSaveEditor(() =>
      saveEditorTransform(session, { stars: new Map([[star.slot, { remove: true }]]) })));
    if (!current || !adults.length) continue;
    const body = document.createElement('select');
    body.replaceChildren(...(star.used ? [residentOption('', t('petKeep'))] : []),
      ...adults.map(visitor => residentOption(visitor.character.id, saveEditorCharacterName(context, visitor.character.id))));
    saveEditorLabeled(actions, 'Body', body);
    saveEditorPreviewChoice(actions, body, context);
    saveEditorAction(actions, star.used ? 'Apply Changes' : 'Add Past Tama', () => runSaveEditor(() => {
      if (star.used && !body.value) { saveEditorTransform(session); return; }
      const appearance = editorResidents.build(context.saveEditorVisitors.get(Number(body.value)), C);
      const record = editorResidents.memorial(image, star.slot, appearance.bytes);
      const edits = star.used ? {} : { stars: new Map([[star.slot, { create: true, age: 0, cause: 1 }]]) };
      const next = saveEditorWorking(session, edits), pages = new Map(next.pages);
      for (let i = 0; i < record.record.length; i += EDITOR_PAGE)
        pages.set(record.address + i, record.record.subarray(i, i + EDITOR_PAGE));
      session.working = { ...next, pages };
      session.changes.clear();
      refreshSaveEditor(true);
    }));
  }
  saveEditorItemFields(holder, session, info, context);
  if (image) {
    const residents = editorResidents.inspect(image, session.working);
    saveEditorResidentFields(holder, session, context, residents);
  }
}
function saveEditorLabFields(holder, session, info, context) {
  const progress = saveEditorSection(holder, 'Progress', true);
  saveEditorControl(progress, session, 'points', 'Tamapoints', info.points, { max: 99999 });
  saveEditorControl(progress, session, 'level', 'Researcher Level', info.level, { min: 1, max: 5 });
  const catalog = saveEditorCatalog(context, true);
  const decorations = catalog.filter(item => item.decoration);
  if (decorations.length) saveEditorControl(progress, session, 'decoration', 'Lab Decorations', info.decoration, {
    choices: [...new Map([[info.decoration, t('Item #{v1}', { v1: info.decoration })],
      ...decorations.map(item => [item.id, saveEditorItemName(context, item)])])],
  });
  else saveEditorPreviewRow(progress, null, t('Lab Decorations') + ' · ' + t('Item #{v1}', { v1: info.decoration }));
  if (context && session.working.dataStart === ML.DEVICE_SAVE_FIRST)
    saveEditorAction(progress, 'Add All Planet Decorations', () => runSaveEditor(() => {
      const edited = saveEditorWorking(session);
      const next = ML.editorPlanetDecorations(edited, context.rom, C);
      if (edited === next) { saveEditorStatus('petNothing'); return; }
      session.working = next;
      session.changes.clear();
      refreshSaveEditor(true);
      saveEditorStatus('Save changes are ready.');
    }));
  const treasures = saveEditorSection(holder, 'Treasures');
  saveEditorAction(treasures, 'Unlock All', () => {
    for (const input of treasures.querySelectorAll('input')) {
      input.checked = true;
      input.dispatchEvent(new Event('input'));
    }
  });
  for (let i = 0; i < 30; i++) saveEditorControl(treasures, session, 'treasure:' + i,
    t('Slot {v1}', { v1: i + 1 }), !!(info.treasures & (1 << i)), { check: true });
  const roster = saveEditorSection(holder, 'Tama File');
  const records = document.createElement('div');
  records.className = 'save-editor-controls save-editor-wide save-editor-records';
  roster.append(records);
  saveEditorAction(roster, 'Unlock All', () => {
    for (const input of records.querySelectorAll('input')) {
      input.checked = true;
      input.dispatchEvent(new Event('input'));
    }
  });
  info.roster.forEach((value, i) => {
    const id = context && rd16(context.rom, 0x17A91C + i * 8);
    saveEditorBookEntry(records, session, context, 'roster:' + i, id, i + 1, value);
  });
  saveEditorItemFields(holder, session, info, context);
  const garden = saveEditorSection(holder, 'Garden');
  const slots = ML.editorGarden(session.working, VIS);
  if (!slots.length) saveEditorPreviewRow(garden, null, t('This save does not contain Garden data.'));
  for (const slot of slots) {
    const row = saveEditorSection(garden, t('Slot {v1}', { v1: slot.slot + 1 }));
    row.parentElement.classList.add('save-editor-wide');
    if (!slot.bytes) { saveEditorPreviewRow(row, null, t(slot.status === 'empty' ? 'Empty' : 'Snapshot unreadable')); continue; }
    saveEditorRecordHeading(row, saveEditorPortrait(context, slot.id, slot.bytes), saveEditorSnapshotName(context, slot));
    saveEditorPreviewRow(row, null, t('Eyes') + ' · ' + saveEditorCharacterName(context, visView(slot.bytes).getUint16(0x0E, true)));
    const adults = context ? [...context.characters.values()].filter(entry => entry.character.stage === 5) : [];
    const body = document.createElement('select'), eyes = document.createElement('select'), color = document.createElement('select');
    const palette = context && C.characterPaletteVariants(context.archives[1])?.bytes;
    saveEditorLabeled(row, 'Body', body);
    saveEditorLabeled(row, 'Eyes', eyes);
    saveEditorLabeled(row, 'Body Color', color);
    body.replaceChildren(residentOption('', t('petKeep')), ...adults.map(entry =>
      residentOption(entry.character.id, saveEditorCharacterName(context, entry.character.id))));
    body.disabled = !adults.length;
    const refreshEyes = () => {
      const selected = context?.characters.get(Number(body.value));
      const target = VIS.ghostAppearanceOptions(selected ? VIS.buildRomGhost(selected, C) : slot.bytes, C).eyes;
      eyes.replaceChildren(residentOption('', t('petKeep')), ...adults.flatMap(entry => {
        const eye = VIS.romEyes(entry, target, C);
        return eye ? [residentOption(eye.id, saveEditorCharacterName(context, entry.character.id))] : [];
      }));
      eyes.disabled = eyes.options.length <= 1;
    };
    refreshEyes();
    body.onchange = refreshEyes;
    color.replaceChildren(residentOption('', t('petKeep')), residentOption(255, t('visOriginalPalette')),
      ...(palette ? paletteNames().map((name, i) => residentOption(i, name)) : []));
    saveEditorAction(saveEditorActions(row), 'Apply Changes', () => runSaveEditor(() => {
      const appearance = context?.characters.get(Number(body.value));
      const base = appearance ? VIS.buildRomGhost(appearance, C) : slot.bytes;
      const eye = eyes.value ? VIS.romEyes(context.characters.get(Number(eyes.value)), VIS.ghostAppearanceOptions(base, C).eyes, C) : null;
      const tone = color.value ? Number(color.value) : null;
      if ((body.value && !appearance) || (eyes.value && !eye) ||
          (tone !== null && tone !== 255 && (!palette || !Number.isInteger(tone) || tone < 0 || tone > 15)))
        throw new Error(t('Choose a valid option.'));
      const bytes = ML.gardenAppearance(slot.bytes, appearance, eye, tone, palette, C, VIS);
      session.working = ML.editorSetGarden(saveEditorWorking(session), slot.slot, bytes, VIS);
      session.changes.clear();
      refreshSaveEditor(true);
    }));
  }
}

function saveEditorResidentImage(session, save, context) {
  const rom = session.source.rom || context?.rom;
  if (!rom && !(SV.family(save.edition) === 'gen3' && SV.paradiseEditorDefaultConfig(save))) return null;
  const image = rom ? new Uint8Array(rom) : new Uint8Array(0x1000000).fill(255);
  if (rom) for (const [a, b] of SV.paraRanges(rom, save.edition)) image.fill(255, a, b);
  for (const [at, page] of save.pages) if (page.length === EDITOR_PAGE && at + EDITOR_PAGE <= image.length) image.set(page, at);
  return image;
}
function saveEditorResidentFields(holder, session, context, data) {
  const { fields, readOnly } = data;
  if (!fields.length) return;
  const residents = saveEditorSection(holder, session.working.edition === 8 ? 'Planet Residents' : 'Field Residents');
  const select = document.createElement('select'), list = document.createElement('div');
  select.setAttribute('aria-label', t('Field'));
  const options = fields.map(field => residentOption(field.id, saveEditorFieldName(context, field.name)));
  if (fields.some(field => field.bank)) {
    for (const [bank, name] of [[0, 'Game Data'], [1, 'ParaLab Extensions']]) {
      const group = document.createElement('optgroup');
      group.label = t(name);
      group.append(...options.filter((_, i) => fields[i].bank === bank));
      select.append(group);
    }
  } else select.append(...options);
  list.className = 'save-editor-controls save-editor-wide save-editor-records';
  saveEditorLabeled(residents, 'Field', select);
  if (readOnly) saveEditorAction(saveEditorActions(residents), 'Load Matching ROM…', () => $('editSaveLoadPreview').click());
  residents.append(list);
  const selected = fields.find(field => field.id === session.field) ||
    fields.find(field => field.id === data.currentField && field.slots.some(slot => slot.occupied)) ||
    fields.find(field => field.slots.some(slot => slot.occupied)) ||
    fields.find(field => field.id === data.currentField) || fields[0];
  select.value = String(selected.id);
  const apply = (change) => runSaveEditor(() => {
    const save = saveEditorWorking(session), input = saveEditorResidentImage(session, save, context);
    const result = editorResidents.apply(input, change), pages = new Map(save.pages);
    for (const [a, b] of result.ranges) for (let at = a; at < b; at += EDITOR_PAGE) pages.set(at, result.rom.slice(at, at + EDITOR_PAGE));
    session.working = { ...save, pages };
    session.changes.clear();
    session.field = change.type === 'move' ? change.toField : change.field;
    refreshSaveEditor(true);
  });
  select.onchange = event => {
    list.replaceChildren();
    const field = data.fields[Number(select.value)];
    if (!field) return;
    if (event) session.field = field.id;
    for (const slot of field.slots) {
      const row = saveEditorSection(list, residentSlotName(slot));
      row.parentElement.classList.add('save-editor-wide');
      const name = slot.occupied ? saveEditorSnapshotName(context, slot) :
        t(slot.blocked ? 'Used by another field' : 'Empty');
      saveEditorRecordHeading(row, slot.occupied && saveEditorPortrait(context, slot.id, slot.bytes), name);
      if (!readOnly && slot.occupied && field.available) {
        const actions = saveEditorActions(row);
        const destinations = data.fields.flatMap(to => to.slots.filter(target => to.available && !target.occupied &&
          (!target.blocked || target.address === slot.address)).map(target =>
          residentOption(to.id + ':' + target.slot, saveEditorFieldName(context, to.name) + ' · ' + residentSlotName(target))));
        if (destinations.length && slot.bytes) {
          const to = document.createElement('select');
          to.setAttribute('aria-label', t('Destination'));
          to.append(...destinations);
          saveEditorLabeled(actions, 'Destination', to);
          saveEditorAction(actions, 'Move Resident', () => {
            const [toField, toSlot] = to.value.split(':').map(Number);
            apply({ type: 'move', field: field.id, slot: slot.slot, toField, toSlot });
          });
        }
        saveEditorAction(actions, 'Remove Resident', () => apply({ type: 'remove', field: field.id, slot: slot.slot }));
      }
      if (!readOnly && !slot.blocked && field.available && context?.saveEditorVisitors?.size) {
        const adults = [...context.saveEditorVisitors.values()].filter(visitor => visitor.character.stage === 5);
        if (!adults.length) continue;
        const body = document.createElement('select');
        body.setAttribute('aria-label', t('Adult Tama'));
        body.append(...adults.map(visitor => residentOption(visitor.character.id, saveEditorCharacterName(context, visitor.character.id))));
        const actions = saveEditorActions(row);
        saveEditorLabeled(actions, 'Body', body);
        saveEditorPreviewChoice(actions, body, context);
        saveEditorAction(actions, 'Save Resident', () => {
          const visitor = context.saveEditorVisitors.get(Number(body.value));
          apply({ type: 'put', field: field.id, slot: slot.slot, bytes: editorResidents.build(visitor, C).bytes });
        });
      }
    }
  };
  select.onchange();
}

function saveEditorOccupiedSlots(source) {
  return (source.lab ? source.slots?.slots.flatMap((bank, slot) => bank && !bank.cleared ? [slot] : []) :
    source.slots?.list.flatMap(entry => entry.used && entry.i !== source.slots.live ? [entry.i] : [])) || [];
}
function jumpToSaveEditorSection(id) {
  const section = $(id);
  if (!section) return;
  saveEditor.session.section = id;
  const links = $('editSaveSectionLinks');
  links.querySelector('[aria-current]')?.removeAttribute('aria-current');
  links.querySelector('a[href="#' + id + '"]')?.setAttribute('aria-current', 'location');
  section.open = true;
  section.firstElementChild.focus({ preventScroll: true });
  section.scrollIntoView({ block: 'start' });
}
function renderSaveEditorNavigation(holder) {
  const select = $('editSaveJump'), links = $('editSaveSectionLinks');
  select.replaceChildren(residentOption('', t('Jump to section')));
  links.replaceChildren();
  for (const group of holder.children) {
    const title = group.firstElementChild.textContent;
    const options = document.createElement('optgroup'), heading = document.createElement('h3');
    const list = document.createElement('ul');
    options.label = heading.textContent = title;
    for (const section of group.querySelectorAll(':scope > details')) {
      const summary = section.firstElementChild;
      section.id = group.firstElementChild.id + '-' + section.dataset.section.toLowerCase().replace(/\W+/g, '-');
      options.append(residentOption(section.id, summary.textContent));
      const item = document.createElement('li'), link = document.createElement('a');
      link.href = '#' + section.id;
      link.textContent = summary.textContent;
      if (saveEditor.session.section === section.id) link.setAttribute('aria-current', 'location');
      link.onclick = event => {
        event.preventDefault();
        jumpToSaveEditorSection(section.id);
      };
      item.append(link);
      list.append(item);
    }
    select.append(options);
    links.append(heading, list);
  }
  $('editSaveNavigation').hidden = $('editSaveMobileJump').hidden = select.options.length < 2;
}
function refreshSaveEditor(redraw = false) {
  const { source, session } = saveEditor;
  saveEditorButtons();
  renderSaveEditorStatus();
  $('saveEditor').dataset.source = source?.kind || '';
  if (!source || !session) {
    $('editSaveDocument').hidden = $('editSaveSlots').hidden = $('editSaveNavigation').hidden = $('editSaveMobileJump').hidden = true;
    return;
  }
  $('editSaveDocument').hidden = false;
  const context = saveEditorPreview();
  const device = source.kind === 'device' ? source.device : null;
  const edition = device ? device.info.edition : source.lab ? (source.edition || 0xFE) : session.working.edition;
  const editionName = device ? connectedEdition(device) : edition ? saveEditorEdition(edition) : t('Choose the save edition');
  const key = device?.info.editionIdentified === false ? null : romEditionKey(edition);
  const slotName = source.kind === 'file' ? '' : saveEditorSlotLabel(source, session.slot);
  $('editSaveSource').textContent = source.name || slotName || editionName;
  renderSourceEdition('editSaveSourceEdition', { name: editionName, key });
  $('editSaveSourceSlot').textContent = source.name ? slotName : '';
  $('editSavePreviewNotice').hidden = !!context;
  $('editSaveLoadPreview').hidden = source.kind !== 'file' && !!context;
  if (source.kind !== 'file') {
    const slots = saveEditorOccupiedSlots(source), select = $('editSaveSlot');
    saveEditorSlotGroups(select, source, slots);
    select.value = String(session.slot);
    $('editSaveSlots').hidden = select.options.length < 2;
  } else $('editSaveSlots').hidden = true;
  $('editSaveEditionRow').hidden = !(source.candidates?.length > 1);
  if (!$('editSaveEditionRow').hidden) {
    const select = $('editSaveEdition');
    select.replaceChildren(residentOption('', t('Choose the save edition')), ...source.candidates.map(ed => {
      const option = residentOption(ed, saveEditorEdition(ed));
      option.dataset.edition = romEditionKey(ed);
      return option;
    }));
    select.value = session.working.edition || '';
    if (key) select.dataset.edition = key;
    else delete select.dataset.edition;
  }
  const holder = $('editSaveFields');
  if (!redraw && holder.dataset.session === String(session.serial) &&
      session.renderedPreview === context && session.renderedPreviewRom === context?.rom) return;
  session.renderedPreview = context;
  session.renderedPreviewRom = context?.rom;
  const open = holder.dataset.session === String(session.serial)
    ? new Map(Array.from(holder.querySelectorAll('.save-editor-data > details'), node => [node.id, node.open]))
    : new Map();
  session.bookPortraitObserver?.disconnect();
  session.bookPortraitPaint = new Map();
  holder.replaceChildren();
  $('editSaveNavigation').hidden = $('editSaveMobileJump').hidden = true;
  holder.dataset.session = session.serial;
  if (!source.lab && !session.working.edition) return;
  if (context && !source.lab && !context.saveEditorVisitors) {
    context.saveEditorVisitors = new Map(VIS.collectRomVisitors(context, C, { nativeAnimationFallback: true }).map(visitor => [visitor.character.id, visitor]));
    context.saveEditorCharacters = F.characters(context.rom);
  }
  saveEditorCatalog(context, source.lab);
  const config = saveEditorGeometry(source, session);
  const info = source.lab ? ML.editorInfo(session.working) : SV.paradiseEditorInfo(session.working, config);
  if (!info) { saveEditorStatus('petNoSet'); return; }
  const native = saveEditorDataGroup(holder, 'Game Data', 'native');
  if (source.lab) saveEditorLabFields(native, session, info, context);
  else {
    const extensions = saveEditorDataGroup(holder, 'ParaLab Extensions', 'extensions');
    saveEditorParadiseFields(native, extensions, session, info, config, context);
    if (extensions.children.length === 1) extensions.remove();
  }
  renderSaveEditorNavigation(holder);
  for (const node of holder.querySelectorAll('.save-editor-data > details'))
    if (open.has(node.id)) node.open = open.get(node.id);
}
function saveEditorWorking(session, extras = {}) {
  if (!session?.working || (!session.source.lab && !session.working.edition)) throw new Error(t('Choose the save edition'));
  saveEditorCheckFields(session);
  const config = saveEditorGeometry(session.source, session);
  const lab = session.source.lab, save = session.working;
  const info = lab ? ML.editorInfo(save) : SV.paradiseEditorInfo(save, config);
  const changes = { items: [], cells: [], missions: [], book: [], roster: [], treasures: [], stars: new Map(), ...extras };
  for (const [key, value] of session.changes) {
    const [name, index] = key.split(':');
    if (index === undefined) { changes[name] = value; continue; }
    const i = Number(index);
    if (name === 'item') changes.items.push([i, value]);
    if (name === 'cell') changes.cells.push([i, value]);
    if (name === 'mission') changes.missions.push([i, value]);
    if (name === 'book') changes.book.push([i, value]);
    if (name === 'roster') changes.roster.push([i, value]);
    if (name === 'treasure') changes.treasures.push([i, value]);
    if (name === 'auto') changes.autopilot = value ? (changes.autopilot ?? info.autopilot) | i : (changes.autopilot ?? info.autopilot) & ~i;
    if (name === 'planetAccess') changes.planets = value ? (changes.planets ?? info.planets) | (1 << i) : (changes.planets ?? info.planets) & ~(1 << i);
    if ((name === 'starAge' || name === 'starCause') && (info.stars[i]?.used || changes.stars.has(i))) {
      const edit = changes.stars.get(i) || {};
      edit[name === 'starAge' ? 'age' : 'cause'] = Number(value);
      changes.stars.set(i, edit);
    }
  }
  for (const key of ['planet', 'decoration']) {
    if (changes[key] === undefined) continue;
    if (!/^\d+$/.test(changes[key])) throw new Error(t('Choose a valid option.'));
    changes[key] = Number(changes[key]);
  }
  if (!lab && (changes.body || changes.eyes || changes.bodyColor !== undefined)) {
    const { eyeStage, ...appearance } = saveEditorAppearance(info, changes);
    const { stage } = appearance;
    if (eyeStage !== stage) throw new Error(t('Choose eyes from the same growth stage.'));
    changes.appearance = appearance;
  }
  if (lab) return ML.editorSet(save, changes, VIS, saveEditorCatalog(saveEditorPreview(session), true));
  if (!changes.cells.length) delete changes.cells;
  return SV.paradiseEditorSet(save, changes, config);
}
function saveEditorTransform(session, changes) {
  session.working = saveEditorWorking(session, changes);
  session.changes.clear();
  refreshSaveEditor(true);
}
let saveEditorSerial = 0;
function openSaveEditorDocument(session) {
  saveEditor.session?.bookPortraitObserver?.disconnect();
  saveEditor.session?.bookPortraitPaint?.clear();
  session.serial = ++saveEditorSerial;
  saveEditor.session = session;
  saveEditor.source = session.source;
  $('editSaveSourcePicker').open = false;
  saveEditorStatus();
  refreshSaveEditor();
  $('editSaveSource').focus();
}
async function runSaveEditor(fn) {
  try { return await fn(); }
  catch (error) { saveEditorError(error); return false; }
}
function saveEditorFileName(session, suffix) {
  const base = session.source.name || (session.source.lab ? 'my-lab' : edSlug(session.working.edition));
  return base.replace(/\.(?:tamasave|tamastate|mylabsave|sav|bin)$/i, '') + suffix + TAMA_SAVE_EXT;
}
function saveEditorExport(session, save, original) {
  const lab = session.source.lab;
  const standalone = !lab && session.slot !== EDITOR_LIVE && session.snapshot?.head ?
    { ...save, pages: F.slotExportPages(save.pages, session.snapshot.head) } : save;
  const bytes = original || (lab ? ML.editorBackup(save, C, VIS) : SV.paraWrite(standalone, standalone.edition));
  const suffix = original ? '-original' : '-edited-' + stamp();
  const name = saveEditorFileName(session, suffix);
  download(bytes, name);
  return name;
}
function saveEditorDownload(original) {
  const session = saveEditor.session;
  try {
    const next = original ? session.working : saveEditorWorking(session);
    const name = saveEditorExport(session, next, original ? session.original : null);
    if (!original) {
      session.working = session.downloaded = next;
      if (session.source.kind === 'file') session.baseline = next;
      session.changes.clear();
      refreshSaveEditor(true);
    }
    saveEditorStatus('saveDone', { n: name });
    return true;
  } catch (error) { saveEditorError(error); return false; }
}
function saveEditorLabSlots(rom) {
  const control = rom.subarray(ML.MENU_SLOT_CONTROL, ML.MENU_SLOT_CONTROL + 2 * EDITOR_PAGE);
  if (ML.saveRecoveryPending(control, rom.subarray(0xFEB000, 0xFEC000), VIS)) throw new Error(t('myLabSaveRecovery'));
  return ML.menuSaveSlots(control, [0, 1, 2].map(index => {
    const at = ML.menuSaveBank(index);
    return rom.subarray(at, at + EDITOR_PAGE);
  }), VIS);
}
function saveEditorParadiseSlots(rom) {
  const slots = F.embedded() && F.saveSlots(rom, F.embedded().stub);
  if (slots?.f.flags & F.F_NEON_SAVES && (slots.live < 0 || F.neonSwitchPending(rom, slots.f)))
    throw new Error(t('paraClearPending'));
  return slots;
}
function saveEditorRomSource() {
  const lab = !!myLabRom, context = myLabRom || state.ctx;
  if (!context) return null;
  const rom = lab ? myLabRomWithSave(context.rom) : context.rom;
  const edition = lab ? (context.menu.mode === 'paradise' ? FL.MY_LAB_ON_PARADISE : 0xFE) : context.editionId;
  if (!lab && !edition) return null;
  return {
    kind: 'rom', lab, context, rom, baseRom: context.rom, edition, name: lab ? context.name : state.name,
    slots: lab ? saveEditorLabSlots(rom) : saveEditorParadiseSlots(rom),
  };
}
function saveEditorLabRegion(region, clock) {
  return ML.readDeviceSaveBackup(ML.deviceSaveBackup(region, clock, C, VIS), C, VIS);
}
function saveEditorStoredPages(stored, edition, rom) {
  const pages = F.slotPages(stored, false);
  const ranges = SV.paraRanges(rom, edition);
  const template = new Uint8Array(EDITOR_PAGE).fill(255);
  for (const [a, b] of ranges) for (let at = a; at < b; at += EDITOR_PAGE) {
    if (!pages.has(at)) pages.set(at, template);
  }
  return SV.paraDecode(SV.paraEncode(pages, edition, null));
}
async function openSaveEditorRomSlot(source, slot) {
  let save, storage;
  const { rom, edition, lab } = source;
  if (lab) {
    if (slot === EDITOR_LIVE) {
      const view = myLabSaveView();
      storage = view.data;
      if (view.latest) save = saveEditorLabRegion(storage, null);
    } else {
      const bank = source.slots?.slots[slot];
      if (!bank || bank.cleared) throw new Error(t('slotNone'));
      const at = ML.menuSaveBank(bank.index);
      save = ML.readMenuSave(bank, rom.subarray(at + EDITOR_PAGE, at + ML.MENU_BANK_SIZE), C, VIS);
    }
  } else if (slot === EDITOR_LIVE) {
    save = SV.paraDecode(SV.paraEncode(SV.paraFromImage(rom, edition), edition, null));
  } else {
    storage = await F.slotReadAsync((a, n) => rom.subarray(a, a + n), source.slots.f, slot);
    if (storage) save = saveEditorStoredPages(storage, edition, rom);
  }
  if (!save || (!lab && !SV.paradiseEditorInfo(save))) {
    const other = slot === EDITOR_LIVE && saveEditorOccupiedSlots(source)[0];
    if (other !== false && other !== undefined) return openSaveEditorRomSlot(source, other);
    throw new Error(t('slotNone'));
  }
  const original = lab ? ML.editorBackup(save, C, VIS) : SV.paraWrite(storage?.head ?
    { ...save, pages: F.slotExportPages(save.pages, storage.head) } : save, edition);
  openSaveEditorDocument(saveEditorNew(source, slot, save, original, storage));
}
function saveEditorDeviceProgress(phase, done = 0, total = 0, slot = '') {
  const label = t('ph' + phase) + (slot ? ' · ' + slot : '');
  const size = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
  $('editSavePhase').textContent = label;
  $('editSaveAmount').textContent = total ? size.format(done / 1024) + ' / ' + size.format(total / 1024) + ' KiB' : '';
  transferProgress('editSave', done, total, label);
}
async function saveEditorReadRanges(device, ranges, consume, progress) {
  let previous = 0;
  const total = ranges.reduce((sum, [a, b]) => sum + b - a, 0);
  for (const [a, b] of ranges) {
    const data = await device.readSparse(a, b, (_, done) => progress(previous + done, total), () => dv.cancel);
    consume(a, b, data);
    previous += b - a;
  }
}
async function readSaveEditorDeviceSource(device, showProgress = false) {
  if (device !== dv.d) throw new Error(t('Reconnect the device and read its save again.'));
  const edition = device.info.edition, lab = usesMyLabDeviceSave(device);
  if (!lab && !FL.EDITIONS[edition]) throw new Error(t('Unknown'));
  const source = { kind: 'device', lab, device, edition };
  if (lab) {
    await checkMyLabSaveRecovery(device);
    const control = await device.read(ML.MENU_SLOT_CONTROL, EDITOR_PAGE);
    if (String.fromCharCode(...control.subarray(0, 8)) === 'PXMLSV01') {
      const headers = [];
      for (let i = 0; i < 3; i++) headers.push(await device.read(ML.menuSaveBank(i), EDITOR_PAGE));
      source.slots = ML.menuSaveSlots(control, headers, VIS);
    }
  } else {
    const rom = new Uint8Array(0x1000000).fill(255);
    const ranges = [[0x90000, 0x110000], [SV.idPage(edition), SV.idPage(edition) + EDITOR_PAGE],
      [SV.SET_A, SV.SET_B + EDITOR_PAGE], [0x11000, 0x12000]];
    await saveEditorReadRanges(device, ranges, (a, _, data) => rom.set(data, a),
      (done, total) => showProgress ? saveEditorDeviceProgress('prepare', done, total) : devProg('read', done, total));
    if (showProgress) saveEditorDeviceProgress('prepare');
    source.extra = await connectedResidentRanges(device);
    if (source.extra.length) {
      for (const at of RB.hookPages) if (at < 0x90000) rom.set(await device.read(at, EDITOR_PAGE), at);
    }
    if (edition === 8) {
      rom.set(await device.read(0x22000, EDITOR_PAGE), 0x22000);
      const [at] = F.neonSlotRange();
      rom.set(await device.read(at, 2 * EDITOR_PAGE), at);
    }
    const menu = F.embedded() && F.feldFind(rom, F.embedded().stub);
    if (menu && menu.nslots > 0 && menu.nslots <= 6 && menu.slotSize >= EDITOR_PAGE && menu.slotSize % EDITOR_PAGE === 0) {
      for (let i = 0; i < menu.nslots; i++) {
        const at = F.slotAddr(menu, i);
        // Multi-field Menus can store slots directly behind the program, before the asset archive.
        if (at < 0x90000 || at + menu.slotSize > SV.idPage(edition) || at % EDITOR_PAGE) throw new Error(t('slotDevOther'));
        rom.set(await device.read(at, EDITOR_PAGE), at);
      }
      source.slots = saveEditorParadiseSlots(rom);
    }
    source.rom = rom;
  }
  return source;
}
async function openSaveEditorDeviceSlot(source, slot) {
  const { device: d, lab, edition } = source;
  if (d !== dv.d) throw new Error(t('Reconnect the device and read its save again.'));
  const label = saveEditorSlotLabel(source, slot);
  const report = (done, total) => saveEditorDeviceProgress('read', done, total, label);
  const progress = (_, done, total) => report(done, total);
  report(0, 0);
  let save, snapshot;
  if (lab) {
    if (slot === EDITOR_LIVE) {
      await checkMyLabSaveRecovery(d);
      const region = await d.readSparse(ML.DEVICE_SAVE_FIRST, ML.DEVICE_SAVE_END, progress, () => dv.cancel);
      saveEditorDeviceProgress('check', 0, 0, label);
      const clock = await d.clockRead();
      const data = region.subarray(ML.APPDATA_FIRST - ML.DEVICE_SAVE_FIRST);
      if (ML.activeDeviceSave(data, VIS)) save = saveEditorLabRegion(region, clock?.ctrl & 0x80 ? clock.counter : null);
      snapshot = region.subarray(ML.APPDATA_FIRST - ML.DEVICE_SAVE_FIRST);
    } else {
      const bank = source.slots?.slots[slot];
      if (!bank || bank.cleared) throw new Error(t('slotNone'));
      const at = ML.menuSaveBank(bank.index);
      const region = await d.readSparse(at + EDITOR_PAGE, at + ML.MENU_BANK_SIZE, progress, () => dv.cancel);
      saveEditorDeviceProgress('check', 0, 0, label);
      save = ML.readMenuSave(bank, region, C, VIS);
    }
  } else if (slot === EDITOR_LIVE) {
    const pages = new Map();
    await saveEditorReadRanges(d, [SV.region(edition), ...source.extra], (a, b, data) => {
      for (let at = a; at < b; at += EDITOR_PAGE) pages.set(at, data.subarray(at - a, at - a + EDITOR_PAGE));
    }, report);
    saveEditorDeviceProgress('check', 0, 0, label);
    const clock = await d.clockRead();
    save = SV.paraDecode(SV.paraEncode(pages, edition, clock?.ctrl & 0x80 ? clock : null));
  } else {
    if (!source.slots?.list[slot]?.used || source.slots.live === slot) throw new Error(t('slotNone'));
    snapshot = await F.slotReadAsync((a, n, tick) => {
      if (dv.cancel) throw new Error('Cancelled');
      return d.read(a, n, done => {
        if (dv.cancel) throw new Error('Cancelled');
        tick?.(done);
      });
    }, source.slots.f, slot, report);
    saveEditorDeviceProgress('check', 0, 0, label);
    if (snapshot) save = saveEditorStoredPages(snapshot, edition, source.rom);
  }
  if (dv.cancel) throw new Error('Cancelled');
  if (!save || (!lab && !SV.paradiseEditorInfo(save))) {
    const other = slot === EDITOR_LIVE && saveEditorOccupiedSlots(source)[0];
    if (other !== false && other !== undefined) return openSaveEditorDeviceSlot(source, other);
    throw new Error(t('slotNone'));
  }
  const original = lab ? ML.editorBackup(save, C, VIS) : SV.paraWrite(snapshot?.head ?
    { ...save, pages: F.slotExportPages(save.pages, snapshot.head) } : save, edition);
  openSaveEditorDocument(saveEditorNew(source, slot, save, original, snapshot));
}
async function runSaveEditorDevice(fn, write = false) {
  if (saveEditor.running || dv.run || !dv.d) return;
  saveEditor.running = true;
  saveEditor.reading = !write;
  $(write ? 'editSaveFooterTransfer' : 'editSaveSourceTransfer').append($('editSaveDeviceControls'));
  saveEditorStatus(write ? 'Checking Save Changes…' : null);
  $('editSaveReadProgress').hidden = write;
  if (!write) saveEditorDeviceProgress('prepare');
  try {
    const operation = write ? devWriteTask : devTask;
    await operation(async () => {
      try { await fn(); }
      catch (error) {
        if (dv.cancel) saveEditorStatus('devCancelled');
        else saveEditorError(error);
        throw error;
      }
    });
  } finally {
    saveEditor.running = false;
    saveEditor.reading = false;
    $('editSaveReadProgress').hidden = true;
    $('editSaveSourceTransfer').append($('editSaveDeviceControls'));
    renderSaveEditorStatus();
    saveEditorButtons();
  }
}
function saveEditorApplyWorkspace() {
  const session = saveEditor.session, source = session.source;
  if (source.kind !== 'rom') return;
  const next = saveEditorWorking(session);
  if (next === session.baseline) return;
  if (source.lab) {
    if (myLabRom !== source.context || myLabRom.rom !== source.baseRom ||
        (session.slot === EDITOR_LIVE && myLabSaveView().data !== session.snapshot))
      throw new Error(t('The source save changed. Read it again.'));
    if (session.slot === EDITOR_LIVE) {
      myLabSetSaveDraft(ML.editActiveRomSave(myLabSaveView().data, next, VIS));
      session.snapshot = myLabSaveView().data;
    } else {
      const plan = ML.planMenuSave(source.slots, session.slot, next, C, VIS);
      myLabRom.editorSlotWrites ??= new Map();
      for (let offset = 0; offset < plan.data.length; offset += EDITOR_PAGE)
        myLabRom.editorSlotWrites.set(plan.address + EDITOR_PAGE + offset, plan.data.subarray(offset, offset + EDITOR_PAGE));
      myLabRom.editorSlotWrites.set(plan.address, plan.head);
      source.rom = myLabRomWithSave(myLabRom.rom);
      source.slots = saveEditorLabSlots(source.rom);
      renderMyLabChangeStatus();
    }
  } else {
    if (state.ctx !== source.context || state.ctx.rom !== source.rom) throw new Error(t('The source save changed. Read it again.'));
    const out = new Uint8Array(source.rom);
    if (session.slot === EDITOR_LIVE) {
      for (const [at, page] of next.pages) if (page !== session.baseline.pages.get(at)) out.set(page, at);
    } else {
      const f = source.slots.f, [a, b] = SV.region(source.edition);
      const heads = source.slots.list.map(({ i }) => out.subarray(F.slotAddr(f, i), F.slotAddr(f, i) + EDITOR_PAGE));
      const stored = F.slotBuild(next.pages, session.slot, a, b, session.snapshot?.head, SV.residentRanges(out));
      F.slotPlace(out, f, session.slot, stored, F.poolUsed(f, heads));
    }
    source.rom = state.ctx.rom = out;
    state.petDirty = true;
    renderPlan();
  }
  session.baseline = session.working = next;
  session.changes.clear();
  refreshSaveEditor(true);
  saveEditorStatus(source.lab ? 'myLabSaveDirty' : 'petRomDone');
}
function saveEditorChangedBytes(a, b) {
  return !a || !b || a.length !== b.length || !a.every((byte, i) => byte === b[i]);
}
async function saveEditorCompare(d, expected) {
  for (const [at, page] of expected) {
    if (dv.cancel) throw new Error('Cancelled');
    if (await d.crc(at, page.length) !== FL.crc32(page)) throw new Error(t('The source save changed. Read it again.'));
  }
}
async function saveEditorPlanDevice(session, next, device, destination) {
  const source = session.source, expected = new Map(), pages = new Map(), last = new Set();
  const original = source.kind === 'device' ? session.original : null;
  const slot = destination.slot;
  if (source.lab) {
    if (!usesMyLabDeviceSave(device)) throw new Error(t('slotDevOther'));
    await checkMyLabSaveRecovery(device);
    if (slot !== EDITOR_LIVE) {
      const control = await device.read(ML.MENU_SLOT_CONTROL, 2 * EDITOR_PAGE);
      const headers = [];
      for (let i = 0; i < 3; i++) {
        const at = ML.menuSaveBank(i), header = await device.read(at, EDITOR_PAGE);
        expected.set(at, header);
        headers.push(header);
      }
      expected.set(ML.MENU_SLOT_CONTROL, control);
      const slots = ML.menuSaveSlots(control, headers, VIS);
      const bank = slots?.slots[slot], baseline = destination.source.slots.slots[slot];
      if (!slots || bank?.sequence !== baseline?.sequence || bank?.crc !== baseline?.crc)
        throw new Error(t('The source save changed. Read it again.'));
      const plan = ML.planMenuSave(slots, slot, next, C, VIS);
      for (let i = 0; i < plan.data.length; i += EDITOR_PAGE) {
        const at = plan.address + EDITOR_PAGE + i, data = plan.data.subarray(i, i + EDITOR_PAGE);
        if (await device.crc(at, EDITOR_PAGE) !== FL.crc32(data)) pages.set(at, data);
        if (dv.cancel) throw new Error('Cancelled');
      }
      pages.set(plan.address, plan.head);
      last.add(plan.address);
      return { expected, pages, last, slot, myLabSlot: true };
    }
    const length = ML.DEVICE_SAVE_END - ML.APPDATA_FIRST;
    const ring = await device.read(ML.APPDATA_FIRST, length);
    if (session.snapshot && original && saveEditorChangedBytes(ring, session.snapshot))
      throw new Error(t('The source save changed. Read it again.'));
    expected.set(ML.APPDATA_FIRST, ring);
    const plan = ML.planDeviceSavePage(next.page, ring, VIS);
    if (plan) { pages.set(plan.off, plan.bytes); last.add(plan.off); }
    if (next.data && (original ? next.data !== session.baseline.data : true)) {
      const first = next.dataStart;
      for (let offset = 0; offset < next.data.length; offset += EDITOR_PAGE) {
        if (dv.cancel) throw new Error('Cancelled');
        const before = original ? session.baseline.data.subarray(offset, offset + EDITOR_PAGE) : null;
        const after = next.data.subarray(offset, offset + EDITOR_PAGE), at = first + offset;
        if (!original && await device.crc(at, EDITOR_PAGE) === FL.crc32(after)) continue;
        if (before && !saveEditorChangedBytes(before, after)) continue;
        expected.set(at, before || await device.read(at, EDITOR_PAGE));
        pages.set(at, after);
      }
    }
  } else {
    const ed = device.info.edition, extra = await connectedResidentRanges(device), checked = SV.paraCheck(next, ed, extra);
    if (checked.errors.length || (extra.length && (!checked.supplemental || !checked.complete)))
      throw new Error(checked.errors.length ? checked.errors.map(saveMsg).join(listSeparator()) : t('fl_saveIncomplete'));
    if (slot !== EDITOR_LIVE) {
      const fresh = await readSaveEditorDeviceSource(device), f = fresh.slots?.f;
      if (!f || fresh.slots.live === slot || fresh.edition !== destination.source.edition) throw new Error(t('slotDevOther'));
      const stored = await F.slotReadAsync((a, n) => device.read(a, n), f, slot);
      if (original && (!stored || saveEditorChangedBytes(stored.head, session.snapshot?.head) ||
          saveEditorChangedBytes(stored.stream, session.snapshot?.stream)))
        throw new Error(t('The source save changed. Read it again.'));
      const heads = fresh.slots.list.map(({ i }) => {
        const at = F.slotAddr(f, i), page = fresh.rom.subarray(at, at + EDITOR_PAGE);
        expected.set(at, page);
        return page;
      });
      const used = F.poolUsed(f, heads);
      const [a, b] = SV.region(ed);
      if (!fresh.slots.saves && F.fieldOfSettings(fresh.rom, checked.pages.get(SV.SET_A)) !== slot)
        throw new Error(t('slotDevOther'));
      if ((f.flags & F.F_NEON_SAVES) && !checked.complete) throw new Error(t('neonSaveFull'));
      const packed = F.slotBuild(checked.pages, slot, a, b, original ? stored.head : null, extra);
      for (const entry of used) {
        const at = F.poolAddr(f, entry);
        fresh.rom.set(await device.read(at, EDITOR_PAGE), at);
      }
      const written = F.slotPlace(fresh.rom, f, slot, packed, used);
      for (const at of written) {
        const page = fresh.rom.subarray(at, at + EDITOR_PAGE);
        pages.set(at, page);
      }
      last.add(written[0]);
    } else {
      const settings = ed === 8 ? SV.NEON_SETTINGS : [SV.SET_A, SV.SET_B];
      if (original) for (const at of settings) expected.set(at, session.baseline.pages.get(at));
      for (const [at, page] of checked.pages) {
        if (dv.cancel) throw new Error('Cancelled');
        const before = original ? session.baseline.pages.get(at) : null;
        if (before && !saveEditorChangedBytes(page, before)) continue;
        if (!original && await device.crc(at, EDITOR_PAGE) === FL.crc32(page)) continue;
        if (!expected.has(at)) expected.set(at, before || await device.read(at, EDITOR_PAGE));
        pages.set(at, page);
        if (settings.includes(at)) last.add(at);
      }
    }
  }
  return { expected, pages, last, slot };
}
async function saveEditorChooseDestination(session, device) {
  if (session.source.kind === 'device') return { source: session.source, slot: session.slot };
  const source = await readSaveEditorDeviceSource(device);
  const available = source.lab ? (session.working.data && source.slots ? [0, 1] : []) :
    source.slots?.list.filter(entry => entry.i !== source.slots.live).map(entry => entry.i) || [];
  if (!available.length) return { source, slot: EDITOR_LIVE };
  const select = document.createElement('select'), label = document.createElement('label');
  saveEditorSlotGroups(select, source, available);
  label.append(t('saveSlotL') + ' ', select);
  if (!await deviceDialog(label, t('Choose a Save Slot'), t('Continue'))) return null;
  return { source, slot: select.value === EDITOR_LIVE ? EDITOR_LIVE : Number(select.value) };
}
async function saveEditorWrite() {
  const session = saveEditor.session, device = dv.d;
  if (!device || $('editSaveWrite').disabled) return;
  const next = saveEditorWorking(session);
  await runSaveEditorDevice(async () => {
    const destination = await saveEditorChooseDestination(session, device);
    if (!destination || dv.cancel) { saveEditorStatus('devCancelled'); return; }
    const { pages, expected, last, slot, myLabSlot } = await saveEditorPlanDevice(session, next, device, destination);
    if (!pages.size) { saveEditorStatus('devSame'); return; }
    await saveEditorCompare(device, expected);
    const confirmation = [connectedEdition(device) + ' · ' + saveEditorSlotLabel(destination.source, slot),
      t('Write {count} flash blocks of 4 KiB each?', { count: pages.size })].join('\n\n');
    if (!await confirmFlashOperation(confirmation) || dv.cancel) { saveEditorStatus('devCancelled'); return; }
    await saveEditorCompare(device, expected);
    const count = await device.writeSectors(pages, devProg, () => dv.cancel, null, null, last, myLabSlot);
    dv.restartReason = 'save';
    session.baseline = session.working = next;
    session.changes.clear();
    if (session.source.kind === 'device') session.written = true;
    refreshSaveEditor(true);
    saveEditorStatus('Saved {count} blocks to the device.', { count });
  }, true);
}
$('editSaveForm').onsubmit = event => event.preventDefault();
$('editSaveJump').onchange = event => {
  jumpToSaveEditorSection(event.target.value);
  event.target.value = '';
};
$('editSaveOriginal').onclick = () => saveEditorDownload(true);
$('editSaveDownload').onclick = () => saveEditorDownload(false);
$('editSaveApply').onclick = () => runSaveEditor(saveEditorApplyWorkspace);
$('editSaveWrite').onclick = () => runSaveEditor(saveEditorWrite);
$('editSaveStop').onclick = () => { dv.cancel = true; saveEditorButtons(); };
$('editSaveRestart').onclick = restartDevice;
$('editSaveRom').onclick = () => runSaveEditor(async () => {
  if (saveEditor.running || dv.run || !await saveEditorSwitchAllowed()) return;
  const source = saveEditorRomSource();
  if (source) await openSaveEditorRomSlot(source, EDITOR_LIVE);
});
$('editSaveDevice').onclick = () => runSaveEditor(async () => {
  const device = dv.d;
  if (!device || saveEditor.running || dv.run || !await saveEditorSwitchAllowed()) return;
  await runSaveEditorDevice(async () => openSaveEditorDeviceSlot(await readSaveEditorDeviceSource(device, true), EDITOR_LIVE));
});
$('editSaveSlot').onchange = () => runSaveEditor(async () => {
  const { source, session } = saveEditor, input = $('editSaveSlot');
  const slot = input.value === EDITOR_LIVE ? EDITOR_LIVE : Number(input.value);
  input.value = String(session.slot);
  if (slot === session.slot || !await saveEditorSwitchAllowed()) return;
  if (source.kind === 'device') await runSaveEditorDevice(async () => openSaveEditorDeviceSlot(await readSaveEditorDeviceSource(source.device, true), slot));
  else await openSaveEditorRomSlot(source, slot);
});
$('editSaveOpen').onclick = () => $('editSaveFile').click();
$('editSaveFile').onchange = event => runSaveEditor(async () => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !await saveEditorSwitchAllowed()) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lab = String.fromCharCode(...bytes.subarray(0, 8)) === 'PXMLSAVE';
  const source = { kind: 'file', name: file.name, lab };
  let save;
  if (lab) save = ML.readDeviceSaveBackup(bytes, C, VIS);
  else {
    save = SV.paraDecode(bytes);
    source.candidates = saveEditorGuess(save);
    if (!source.candidates.length) throw new Error(t('Unknown save layout'));
    if (save.edition && SV.paraCheck(save, save.edition).errors.length) throw new Error(t('petNoSet'));
    if (source.candidates.length === 1) save.edition = source.candidates[0];
  }
  const session = saveEditorNew(source, EDITOR_LIVE, save, bytes);
  if (!saveEditorPreview(session))
    matchSaveEditorPreview(session, (lab ? myLabRom : state.ctx) || saveEditor.preview);
  openSaveEditorDocument(session);
  if (!saveEditorPreview(session)) $('editSavePreviewDialog').showModal();
});
$('editSaveEdition').onchange = event => {
  const { session, source } = saveEditor, edition = Number(event.target.value);
  if (!edition || !source.candidates.includes(edition) || saveEditorDirty(session)) {
    event.target.value = session.working.edition || '';
    return;
  }
  session.working = session.baseline = { ...session.working, edition };
  refreshSaveEditor(true);
};
const savePreviewFile = document.createElement('input');
savePreviewFile.type = 'file';
savePreviewFile.accept = '.bin,.rom';
savePreviewFile.hidden = true;
$('saveEditor').append(savePreviewFile);
$('editSaveOpenRom').onclick = () => $('fileRom').click();
$('editSaveLoadPreview').onclick = () => savePreviewFile.click();
$('editSavePreviewDialogOpen').onclick = () => {
  $('editSavePreviewDialog').close();
  savePreviewFile.click();
};
savePreviewFile.onchange = () => runSaveEditor(async () => {
  const file = savePreviewFile.files[0], session = saveEditor.session;
  savePreviewFile.value = '';
  if (!file || !session) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const context = ML.openRom(bytes, C, VIS) || C.openRom(bytes);
  if (session !== saveEditor.session) return;
  if (!matchSaveEditorPreview(session, context)) throw new Error(t('petOther'));
  session.preview = saveEditor.preview = context;
  saveEditorStatus();
  refreshSaveEditor(true);
});
for (const id of ['editSaveWorkspaceLink', 'editSaveLabLink']) $(id).onclick = () => {
  showDestination('save-editor');
  if (!$('saveEditor').hidden) $('editSaveRom').click();
};
$('editSaveDeviceLink').onclick = () => {
  showDestination('save-editor');
  if (!$('saveEditor').hidden && dv.d) $('editSaveDevice').click();
};
window.addEventListener('beforeunload', event => {
  if (!saveEditorDirty(saveEditor.session)) return;
  event.preventDefault();
  event.returnValue = true;
});
