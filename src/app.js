/* ParaLab UI. Everything stays in this browser tab: the ROM is read with
 * FileReader and the new ROM is offered as a download. Author: mameise */
(function () {
'use strict';
const C = window.ParamixCore;
const LI = window.ParaLabItems;
const E = window.ParamixEmu;
const D = { embedded: () => null };
const F = window.ParamixFeld;
const S6 = window.ParamixSix;
const LZ = window.ParamixLegacyLz4;
const NT = window.ParamixNeonTransplant;
const LR = window.ParamixLabRelease;
const SF = window.ParamixSpecialFood;
const ML = window.ParamixMyLab;
const MLM = window.ParamixMyLabMenu;
const ZH = window.ParaLabZh;
const RL = window.ParaLabRomLocale;
const I18n = window.ParaLabI18n;
const $ = (id) => document.getElementById(id);

// Keep navigation with this browser history entry, including the source File.
const navigation = { ...history.state?.paralab };
let restoringNavigation = true;
function rememberNavigation(change) {
  if (restoringNavigation) return;
  Object.assign(navigation, change);
  try {
    history.replaceState({ ...history.state, paralab: navigation }, '');
  } catch {
    // Some browsers limit the size of history entries. Still remember the page.
    const { file, ...locationOnly } = navigation;
    try { history.replaceState({ ...history.state, paralab: locationOnly }, ''); } catch {}
  }
}
function restoreTab(tabs, id) {
  const tab = tabs.find(item => item.id === id && !item.hidden && !item.hasAttribute('data-legacy'));
  if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
}

const romName = $('romname');
const nameMeasure = document.createElement('canvas').getContext('2d');
function fitRomName() {
  const name = romName.title;
  if (!name || !romName.clientWidth) return;
  const style = getComputedStyle(romName);
  nameMeasure.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
  nameMeasure.letterSpacing = style.letterSpacing;
  const letters = Array.from(name);
  const fits = text => nameMeasure.measureText(text).width <= romName.clientWidth;
  let display = name;
  if (letters.length > 36 || !fits(name)) {
    for (let keep = Math.min(33, letters.length - 1); keep >= 0; keep--) {
      const end = Math.ceil(keep / 2);
      display = letters.slice(0, keep - end).join('') + '...' + letters.slice(letters.length - end).join('');
      if (fits(display)) break;
    }
  }
  romName.firstElementChild.textContent = display;
}
function setRomName(name) {
  romName.title = name;
  romName.setAttribute('aria-label', name);
  fitRomName();
  renderSourceEdition('headerRomEdition', sourceEdition());
}
new ResizeObserver(fitRomName).observe(romName);
document.fonts.ready.then(fitRomName);

// New/legacy ROMs start unchecked; retain an actually installed shortcut.
function paramixShortcutOf(rom, menu) {
  if (!menu || (menu.flags & F.F_NO_SHORTCUT)) return false;
  try {
    const home = window.ParamixHomeMenu.inspect(rom), settings = window.ParamixSettings.inspect(rom);
    return !!((home && !home.original) || (settings && (settings.flags & 2)));
  } catch (_) { return false; } // malformed helpers are refused by the ROM rebuild
}


// ------------------------------------------------------------------ texts
const T = {
  en: {
    myLabMenuTitle: 'Menu', myLabStock: 'Stock My Lab', myLabComputer: 'Computer → ParaLab',
    myLabMenuDraft: 'ParaLab menu staged',
    myLabInstallHint: 'Choose the device key to add ParaLab to the Computer menu.',
    myLabRefreshHint: 'Update the ParaLab menu in the exported ROM and keep its save.',
    myLabMenuChecking: 'Checking for an update…', myLabMenuCurrent: 'Up to date',
    myLabMenuAvailable: 'Update available',
    myLabFlashUsage: '{pct}% used · {used} of {total} in programmed flash blocks',
    myLabSettings: 'Settings → ParaLab', myLabBoot: 'ParaLab at startup', myLabParadise: 'ParaLab at startup ({editionParadise})',
    myLabExperimental: 'Experimental', myLabPortTab: 'Porting',
    myLabPortTitle: 'Port {editionMyLab} to {editionParadise}',
    myLabPortDevice: '{editionMyLab} on {editionParadise}',
    myLabPortHelp: 'Use the loaded {editionMyLab} ROM and a full ROM backup from the target {editionParadise}. Keep that backup for UART restoration.',
    myLabPortBackup: 'Target {editionParadise} ROM backup', myLabPortKey: 'Matching {editionMyLab} .key',
    myLabScreenFit: 'Screen correction',
    myLabScreenFitHint: 'Adjusts the layout of some game screens so less content is cut off on {editionParadise}.',
    myLabScreenFitUnsupported: 'Screen correction is unavailable for this ROM. It requires compatible My Lab v1.0.00 firmware and screen resources.',
    myLabPortStage: 'Include Port in Write and Export',
    myLabPortDone: 'Port ready. Review a device write or export the ROM from Workspace.',
    myLabPortPreparing: 'Preparing Ported ROM',
    myLabPortLoadedBackup: 'Loaded {editionParadise} backup',
    myLabPortReplacePairingTitle: 'Replace Paired ROM Backup?',
    myLabPortReplacePairingHelp: 'This port was built with a different {editionParadise} ROM backup. Continue only if the new backup came from this device before it was ported. After writing, keep the new backup for restoring the original firmware.',
    myLabPortReplacePairingWrite: 'Replace Pairing and Write',
    myLabPortUnsupported: 'Open a supported {editionMyLab} ROM to build a port.',
    myLabMenuInstalled: 'ParaLab menu: {n} KiB · {crc}', myLabCrcOk: 'Checksum valid', myLabCrcBad: 'Checksum invalid',
    myLabField: 'Field', myLabAllFields: 'All fields',
    myLabPage: 'Save page', myLabPageNumber: 'Page {n}', myLabCurrent: 'Current', myLabSequence: 'Sequence {n}', myLabSaveNone: 'No valid save in this ROM.',
    myLabSaveInfo: '{n} of 5 save pages valid · current sequence {seq}',
    myLabSaveBackup: 'Export Save Page', myLabSaveExport: 'Export Active Save',
    myLabSaveReplace: 'Replace ROM Save', myLabSaveDeleteAsk: 'Delete the active My Lab save in this ROM, including the Garden and crafted items?',
    myLabSaveReplaceFull: 'Replace the active save, including the Garden and crafted items, with this backup?',
    myLabSaveReplaceGarden: 'Replace the game progress and Garden with this backup?',
    myLabSaveReplacePage: 'Replace game progress with this save page? The Garden will be kept.',
    myLabSaveDirty: 'Save change ready. Use Save ROM to export a new file.',
    myLabSaveHint: 'Replace the save in this ROM with a My Lab backup (.tamastate, .mylabsave, or .SAV). To apply the change when writing to a device, turn off Keep saves.',
    deviceSaveFormats: '{editionParadise} (.tamasave) · {editionMyLab} (.tamastate)',
    portSaveBackup: 'Back up the active game, Garden, crafted items, and clock when available (.tamastate).',
    portSaveWrongRom: 'The device no longer contains a compatible ported ROM. Reconnect using the Flash Tool for the installed firmware.',
    myLabDeviceSaveHint: 'Back up or restore the active {editionMyLab} game, Garden, crafted items, and clock (.tamastate).',
    myLabSaveRecovery: 'Open the My Lab ParaLab menu to finish the pending save recovery first.',
    devReadOnly: 'Read-only',
    myLabSaveSummary: '{p} points · researcher level {l} · {n} Tamas encountered',
    myLabZoom: 'Size', myLabPose: 'Pose', myLabNoCharacters: 'No matching adult Tamas.',
    myLabDirty: 'Menu change ready. Use Save ROM to export a new file.',
    myLabExported: 'Saved {name}.',
    myLabGarden: 'Garden', myLabSlot: 'Slot {n}', myLabEmpty: 'Empty', myLabUnreadable: 'Unreadable',
    myLabExport: 'Export Ghost', myLabArchive: 'Archive', myLabMainArchive: 'Main', myLabBootArchive: 'Boot',
    myLabSprite: 'Sprite', myLabFrame: 'Frame', myLabSpriteInfo: '{w} × {h} pixels · {n} frames',
    myLabSpriteZipImport: 'Import Sprite ZIP…',
    myLabSpriteZipHint: 'The ZIP contains PNG sheets for both archives. Keep their paths and dimensions when editing, then use Save ROM to export the changes.',
    myLabSpriteZipNoMatch: 'No matching My Lab sprite sheets. Use the paths from a My Lab sprite ZIP.',
    myLabSpriteZipUnchanged: 'Unchanged: {n}',
    myLabSpriteEdits: 'Edited sprite sheets',
    myLabSpriteDirty: 'Sprite sheet changes are ready to export.',
    myLabUpdateHeading: 'Update File', myLabUpdateOpen: 'Choose Update File…',
    myLabUartCreate: 'Choose Key and Create Update…',
    myLabUpdatePatch: 'Choose Key and Patch Update…',
    myLabUartReady: 'Authenticated writable UART update saved as MLTUPD.BIN.',
    myLabUartBad: 'Could not create UART update: {error}',
    myLabUpdatePatchReady: 'Patched and authenticated writable UART update saved as MLTUPD.BIN.',
    myLabUpdatePatchBad: 'Could not patch update: {error}',
    myLabUpdateReady: 'Package structure and header checksum passed. The device checks authentication.',
    myLabUpdateBad: 'Invalid update package: {error}',
    neonBagUnavailable: 'This Neon Planets firmware uses an unrecognized item save layout.',
    paraClear: 'Clear Active ROM Save', paraClearAsk: 'Clear the active Paradise save in the loaded ROM?', paraClearDone: 'Active save cleared. Save the ROM as a new file.', paraClearPending: 'Finish recovering the saved game in the ParaLab menu first.',
    specialFoodOn: 'Special Food in game', specialFoodHint: 'Adds SPECIALFOOD and RELEASE under CONNECTION. Choose a Neon Planets ROM.',
    labReleaseOn: 'Send to My Lab in game', labReleaseHint: 'Adds RELEASE under CONNECTION. Choose a Neon Planets ROM for the in-game text.', labReleaseInstalled: 'RELEASE is already installed.', labReleaseUpgrade: 'RELEASE will be updated on export.', labReleaseFail: 'Could not add Lab Invite: {e}',
    neonDonorPick: 'Choose Neon Planets ROM', neonDonorHint: 'Add 86 Tama and 59 items from Neon Planets.', neonDonorReady: 'Neon source: {name}', neonDonorBad: 'Choose a supported Neon Planets ROM.', neonDonorFail: 'Could not add Neon content: {e}', neonDonorOn: 'Neon content', neonItemsHint: 'Add 59 items from Neon Planets.', neonLocalizeHint: 'Update Tama Files with the original planet names in all languages.',
    appsOnlyOn: 'Programs menu', appsOnlyHint: 'Open ParaLab alongside the Neon Planets game to use programs and the Flash Tool.', neonSaves: 'Three Neon save slots', neonSaveFields: 'New saves use the game’s setup. The game unlocks fields with progress.', neonSaveFull: 'Writing a Neon menu slot requires a complete .tamasave backup.',
    neonTamaOn: 'Tama in Programs menu (care, appearance, age)', petPoints: 'Tamapoints', petMission: 'Mission', petMissionAction: 'Completion', petMissionComplete: 'Mark complete', petMissionReset: 'Reset completion',
    open: 'Open ROM', save: 'Save New ROM',
    startTitle: 'Make your ROM your own',
    startText: 'Open a {editionParadise} or {editionMyLab} ROM to inspect, customize, back up, and prepare device updates. Everything runs locally in your browser.',
    featHead: 'Tools for your device',
    g3t: 'All fields', g3: 'All six fields in one ROM, with pictures, special characters, the matching planet and the field\'s lab games.',
    g4t: 'Menu on the device', g4: 'Switch fields, put items in the bag, set Tamapoints, change the Tama and keep several saves, right on the Paradise.',
    g5t: 'Read and write the device', g5: 'Back up the ROM and write the new one with a USB UART dongle. Saves are kept, only changes are written. A write protection helps when writing is cut off.',
    g6t: 'Your own characters', g6: 'Every character as an image sheet to edit, Digimon from DIM cards too. Colours and eyes are fitted automatically.',
    g9t: 'Saves and visits', g9: 'Back up, restore and edit saves, add download content. Visits between two Paradise through the plug at the top, or a simulated visit over the dongle.',
    dropTitle: 'Open a ROM to begin',
    dropText: 'Drop your .bin file here, or click to browse.',
    f1t: 'Stays on your computer', f1: 'The ROM is never uploaded. Everything runs in this browser tab, even offline.',
    f2t: 'Bring your own ROM', f2: 'ParaLab includes tools and custom firmware components. Game ROMs, device keys, and saves come from your own device.',
    f3t: 'Checked', f3: 'Checksums are recalculated, changed images are read back before saving and every sector written to the device is verified.',
    planTitle: 'ROM Overview', planFig: 'Characters', planEmu: 'Emulator', planEmus: 'Emulators', planDoom: 'DOOM', planWolf: 'Wolfenstein 3D', planGb: 'Game Boy', planSms: 'Master System / Game Gear', planPm: 'Pokémon mini', planMenu: 'Menu', planApps: 'More emulators',
    stNone: 'not included', stNew: 'new', stDel: 'will be removed', stChanged: '{n} changed', stSame: 'unchanged',
    segFw: 'Firmware and characters', segEmu: 'Emulator', segDoom: 'DOOM', segWolf: 'Wolfenstein 3D', segGb: 'Game Boy', segSms: 'Master System / Game Gear', segPm: 'Pokémon mini', segSlots: 'Field saves', segSave: 'Save', segFree: 'free', segResv: 'reserved',
    ruleBoth: 'Emulator or DOOM: only one of the two fits into the ROM. The menu works with both.',
    ruleNoRoom: 'This edition has no room for emulator and DOOM (its character data is larger). The menu works.',
    emuVsDoom: 'Note: DOOM is chosen or built in. Choosing a firmware here drops DOOM.',
    doomVsEmu: 'Note: an emulator is chosen or built in. Choosing a WAD here drops the emulator.',
    noRoomApp: 'This edition has no room for it.', a0Menu: 'This edition has no room for a main program at 0x0A0000: every program goes to the menu. The star chooses what starts when switched on.', a0MenuN: 'This edition has no room for a main program at 0x0A0000. Tama-Go, Friends, the old Tamas and the V3 go to the menu (A and C; switch on field switch or items in the Menu tab). Colour Tamas and TG18 work here in a start device only.', a0NoMain: '{f}: colour Tamas and TG18 work in this edition in a start device only (Menu tab).', doomA0: 'In this edition DOOM works in a start device only (Menu tab).',
    doomHas: 'This ROM contains DOOM.', doomOff: 'Remove DOOM', doomGone: 'DOOM is removed on save.',
    keysTitle: 'Buttons', kFire: 'Fire', kFwd: 'Forward', kBack: 'Back', kUse: 'Use', kMod: 'Change weapon: hold + wheel',
    kWheel: 'Wheel press', kRun: 'Run with 2x forward', kInv: 'Wheel reversed', kFixed: 'Always the same: A+C menu, B+C map. Sound on/off: hold the "Change weapon" key and press the wheel briefly. Back: as set in the Menu tab under "Back from programs".',
    kOld: 'This DOOM is older and has no own button layout yet. Build it in again with the WAD.',
    device: 'Device', devTitle: 'Device over UART',
    devConnect: 'Connect', devDump: 'Read ROM', devWrite: 'Write new ROM to the device', devOnly: 'Only write changes', devKeep: 'Keep saves', devStop: 'Cancel',
    devNoSerial: 'This browser cannot talk to the dongle. Please use Chrome or Edge on a computer.', devNone: 'Not connected',
    fl_noRescueRoom: 'No room for the write protection (rescue start, top 64 KB of the flash). Nothing was written. Remove a program from the start device and write again.', plHint: 'Prolific adapter (PL2303): newer Windows drivers block older and copied PL2303 chips, then no data gets through. Fix: pick the older Prolific driver 3.3.2.x in the Device Manager, or use an adapter with CH340 or CP2102.', resOn: 'Write protection on: if a write is cut off, the device starts in the flash screen.', resModeGo: 'The last write was cut off. The device is in the flash screen and waits. Press "Continue writing".', resModeRom: 'The last write was cut off. The device is in the flash screen and waits. Open the ROM again (or your backup) and write it to the device.', resResume: 'Continue Writing', resHalf: 'The last write did not finish. Press "Continue writing" so everything fits together again.', resResumed: 'Write complete. {w} sectors written.', resTest: 'Test Rescue Start', resBack: 'Write Header Back', resSure: 'Test: the rescue start goes to 0xFF0000, then the device header (sector 0) is cleared. Then switch the Paradise off and on. If the flash screen appears, connect here and "Write header back". If it does not, the device will not start without your own flash tool. Go on?', resCleared: 'Header cleared. Switch the Paradise off and on. Flash screen there? Then connect and "Write header back".', resBackDone: 'Header written back. Switch the Paradise off and on: it starts normally again.', resNoHdr: 'No header kept.', devOn: 'Connected: {ed}, {mb} MB{l}', devLoaded: ', flash app loaded', devReady: 'Ready', devNeedRom: 'To write, open a ROM first (or read one).',
    visTitle: 'Playdate', visStart: 'Start Playdate', visStop: 'Stop',
    visModel: 'Model', visCapture: 'Download Incoming UART',
    visCharacter: 'Visitor', visMirror: 'Return received character', visImport: 'Load Character File…',
    labCharacter: 'Tama to Send', labChoose: 'Choose an adult Tama',

    visImported: 'Imported',
    visRomCharacters: 'ROM characters', visRomVisitorError: 'Could not prepare visitor ({reason}).',
    visVisitorColor: 'Body color', visKeepColor: 'Keep color', visKeepEyes: 'Keep eyes',
    visPaletteNames: 'Red|Pink|Magenta|Purple|Blue|Cyan|Green|Yellow|Orange|Rose|Lavender|Sky blue|Lime|Cream|White|Gray',
    visVisitorExport: 'Export Visitor (.bin)', visAppearanceNeedsRom: 'Load a {editionParadise} ROM to choose colors and eyes.',
    visPeerTitle: 'Received Playdate Character',
    visPeerExport: 'Export Received Character (.bin)', visNoImage: 'No preview image available.',
    visUnknownModel: 'Unknown model', visUnnamed: 'Unnamed character',
    visRomInfo: '{model} (ROM type {rom} / {hex})', visSourceDevice: 'Source device',
    visCharacterInfo: 'Character ID {chara} · Stage {stage}',
    visCharacterPreview: 'Character', visPlanetPreview: 'Planet screenshot', visParameters: 'Character and Packet Details',
    visTamaZoom: 'Tama view', visFieldZoom: 'Field view',
    visAnimationView: 'View', visAnimationLayer: 'Layer', visAllLayers: 'Full character',
    visPlayFrames: 'Play', visPauseFrames: 'Pause', visFrameCount: 'Frame {index} / {total}',
    visBody: 'Body', visEyes: 'Eyes', visMouth: 'Mouth',
    visField: 'Native field', visEyeId: 'Eye character ID', visOriginalId: 'Original character ID', visRank: 'Species rank',
    visColor: 'Color index', visOriginalPalette: 'Original palette', visCharacterFlags: 'Character flags',
    visGhostType: 'Ghost package type', visGhostFlags: 'Ghost package flags', visGhostLength: 'Ghost package size (bytes)',
    visGhostChecksum: 'Ghost checksum', visBodyPalette: 'Body palette (RGB565)', visMouthPalette: 'Mouth palette (RGB565)',
    visPlanetSize: 'Planet screenshot size (bytes)', visPlanetChecksum: 'Planet screenshot checksum',
    visPlaydateEditor: 'Edit Playdate Details', visPlanetImageChoice: 'Planet image', visPlanetAuto: 'Automatic',
    visPlanetNeedsRom: 'Open a ROM to choose a planet image.',
    visNameSlot: 'Character name · {language}', visPlanetNameSlot: 'Planet name · {language}',
    visDeviceUid: 'Device UID', visCharacterUid: 'Character UID', visFriendship: 'Friendship',
    visPreviousResult: 'Previous result', visHunger: 'Hunger', visHappiness: 'Happiness', visLove: 'In love (0/1)',
    visGhostFormat: 'Invalid .ghost.png or Playdate package',
    labSend: 'Send to {editionMyLab}', labHint: 'Attach the USB-UART adapter to My Lab and select an adult Tama. On My Lab, open CONNECTION → LAB INVITE. If the garden is full, choose a Tama to replace on My Lab. Then click Send to My Lab here and select the adapter.',
    labRun: 'Sending the character to {editionMyLab}…', labWait: 'Character sent. Waiting for the connection to finish…',
    labDone: 'Transfer acknowledged. Check the garden in {editionMyLab} for the Tama.',
    labError: '{editionMyLab}: {e}. Check the garden before trying again.',
    foodTitle: 'Special Food', foodImport: 'Load {editionMyLab} Food File…', foodSend: 'Wait for {editionNeon}',
    foodHint: 'Load a decoded My Lab food file and attach the USB-UART adapter to Neon Planets. Start here, then select CONNECTION → SPECIAL FOOD → GET FOOD with an adult Tama. Accepting the transfer starts a new egg.',
    foodReady: 'Waiting for {editionNeon} to request food…', foodRun: '{editionNeon} connected…',
    foodConfirm: 'Food data sent. Confirm on {editionNeon}.',
    foodDone: '{editionNeon} confirmed the transfer.', foodDeclined: '{editionNeon} cancelled the transfer.',
    foodFormat: 'Open a decoded {editionMyLab} food file (.bin) containing complete food data.',
    visHint: 'Attach the USB-UART adapter to the Paradise while the game is running. Choose the model here, click Start Playdate and select the adapter. On the Paradise, open the planet menu, choose CONNECTION → PLAYDATE and press B. Return received character works without loading a file.',
    visWait: 'Ready to connect as {ed}. Select {menu} on {editionParadise}, then press B.', visRun: 'Connected. Exchanging data…', visPlay: 'The Tamas are playing together…',
    visDone: 'Visit done ({ed}). For the next one press B on {editionParadise} again.', visErr: 'Stopped: {e}. Press B on {editionParadise} again.', visBadKey: '{editionParadise} does not understand the data.',
    phload: 'Loading flash app', phread: 'Reading', phcompare: 'Comparing', phwrite: 'Writing', phcheck: 'Verifying', phprepare: 'Preparing',
    devDumped: 'ROM read and saved as {n}. It is now open in the Studio.',
    devSureFull: 'Without "Keep saves" the save on the device is replaced by the one in the ROM. Write anyway?',
    devMyLabReplace: 'Replace the save and Garden on the device with the data from the ROM?',
    carryUnknown: 'The device does not hold the loaded ROM. A program moves and its save on the device cannot be taken along. Read the ROM from the device first. Write anyway?', carryMiss: 'A program moves and its save on the device cannot be taken along. Back it up in the tab Save first. Write anyway?', devEmuLost: 'Main program on the device: {o}. In the new ROM: {n}. So the save of {o} as the main program starts anew. To keep it, back it up first under "Save". Write anyway?', devEmuNone: 'no emulator', devEmuNew: '{o} with a newly chosen firmware',
    devDone: 'Write verified. {w} sectors written{k}.', devKept: ', {k} save sectors kept',
    devSame: 'Nothing to write, the device already has this ROM.', devErr: 'Error: {e}', devCancelled: 'Cancelled.',
    cleanOn: 'Without the Paradise (clean ROM)', cleanClock: 'Set the clock at the start', cleanClockHint: 'When the clock is missing (new batteries), the menu asks for it when switched on. Without: set the clock in the menu under SETTINGS or in each emulator itself.', emuClockOff: 'Only with "Set the clock at the start" (tab Menu).', emuSess: 'Remember where you left off', emuSessHint: 'The next start continues right there. Without: the game starts anew and loads its own save, as the real device does.', ruleClean: 'Without the Paradise: all programs go to the menu, almost the whole flash is theirs.', cleanHint: 'No Paradise on the device any more, only the menu with your programs. Almost the whole 16 MB is free.', cleanUse: 'After switching on the menu comes up right away. On the first start you set the clock, later under SETTINGS. Leave a program as usual.', cleanWarn: 'The Paradise and its save are lost when writing. Make a backup first.', cleanNoDoom: 'DOOM does not work without the Paradise yet. Please remove DOOM.', doomOne: 'DOOM goes into the menu only once.', cleanSure: 'The device has the Paradise on it. It is deleted, with its save. Do you have a backup of the device? Go on?', cleanLoaded: 'ROM without the Paradise ({ed}) loaded: {n} programs.',
    launchOn: 'Start device for programs only', launchHint: 'The device opens its installed programs after setup.', launchUse: 'After switching on and setting the clock the menu comes up. Wheel selects, B starts. Leave a program as usual, then the menu comes up again.', launchOld: 'This ROM is a start device. Load the original ROM for a normal Paradise.', launchNeed: 'This startup mode requires an installed program.', launchSix: 'A start device does not go with six fields built in. Please load the original ROM.', planLaunch: 'Start device',
    tabFeld: 'Menu', feldOn: 'Multiple Save Slots', bagOn: 'Items and Tamapoints', tamaOn: 'Tama Editor', paramixShortcut: 'Add PARALAB at the end of the game menu', paramixShortcutHint: 'Optional. A + C on the home screen remains available.', gplayOn: 'Play time earns Tamapoints', gplayHint: 'DOOM, Wolfenstein, Game Boy, Master System, Pokémon mini and Arduboy: 10 Tamapoints per minute of play, when going back to the Paradise.', saveSlot: 'Save {n}',
    sixOn: 'All 6 fields', sixPick: 'Choose Land, Water or Sky ROM', sixHint: 'Adds Land, Water and Sky to Tropical and Glacier. The field pictures come from your own Land, Water or Sky ROM. All ten Lab games are available in every field.',
    sixNeed: 'All 6 fields still need a Land, Water or Sky ROM.', sixOk: 'Field pictures taken from {n}.', sixBad: '{n} is not a Land, Water or Sky ROM.', sixIn: 'All 6 fields are built in.', sixOff: 'Saving takes Land, Water and Sky out again. Several saves keep working.', sixOffJ: 'Saving takes Sky out again. Several saves keep working.', sixOffField: 'The device is on {f} now. First switch to {s} in the menu.', sixOffSlots: 'The saves stored in the menu are deleted. Continue?', sixFail: 'Fields not built in: {e}', sixNoFw: 'The firmware of this ROM is changed, more fields do not work here.', planSix: 'More fields', sixOnJ: 'Sky as 4th field', sixHintJ: 'Jade Forest already has the Sky pictures.', sixInJ: 'Sky is built in as the 4th field.', sixOld: 'All 6 fields are built in, but an older version. Choose your Land, Water or Sky ROM and everything is updated when you save.', sixOldJ: 'Sky is built in and is updated when you save.', sixPlanet: 'Planet to match the field', sixMenu: 'Game menu Fields: all fields from level 4', sixPlanetNeed: 'Changing this setting needs your Land, Water or Sky ROM again.', sixApp: 'the installed program uses storage required by the additional fields',
    exitKey: 'Back from programs', exitHint: 'How to get from all programs (emulators and games) back to the Paradise or the menu.', exit0: 'Hold the wheel', exit1: 'Hold wheel and A', exit2: 'Hold wheel and C', exit3: 'Hold the wheel 5 s', feldHint: 'Start a save in a field of your choice and switch between saves.',
    feldUse: 'Open: hold A and C together on the home screen. Wheel selects, B confirms, C goes back.',
    feldNo: 'Field switch works with Land, Water, Sky (among each other) and Tropical, Glacier (among each other).', feldMissing: 'This build does not contain the menu.',
    feldCur: 'Active field: {f}.', feldList: 'Selectable: {s}.', feldStored: 'Saved: {s}.', feldFail: 'Menu not built in: {e}', feldUnknown: 'Edition not recognised.',
    tabWolf: 'Wolf3D', wolfPick: 'Choose game files', wolfHint: 'Choose all files of Wolfenstein 3D together: shareware (.WL1), full version (.WL6) or Spear of Destiny (.SOD). The game goes into the Paramix menu.', wolfNone: 'No game files chosen yet.', wolfShare: 'Shareware', wolfFull: 'Full version', wolfEps: '{n} episodes', wolfEp1: '1 episode', wolfBad: 'Wolfenstein 3D: {e}', wolfNoMain: 'Wolfenstein 3D only in the menu', wolfTurn: 'Turn per wheel step', wolfFixed: 'Always the same: A+C menu. Back (the game is saved): as set in the Menu tab under "Back from programs".', wolfOne: 'There is only one Wolfenstein 3D and one Spear of Destiny in the menu, the new one replaces the old one.', wolfSodN: '21 floors',
    tabGb: 'Game Boy / Color', gbNoMain: 'Game Boy only in the menu', gbPick: 'Choose Games (.gb, .gbc)', gbHint: 'The games go into the Paramix menu. On the device: A+B+C together opens the settings (also Select and sound). Hold the wheel for 2 s to save and go back, the next start continues there. Two Paradise plugged together at the top work like a link cable, e.g. to trade Pokémon.', gbNone2: 'No game chosen yet.', gbKeysTitle: 'Keys', gbKeysDef: 'Default', gbKeysMiss: 'Not assigned: {n}', gbNone: '–', gbRight: 'Right', gbLeft: 'Left', gbUp: 'Up', gbDown: 'Down', gbInA: 'Key A', gbInB: 'Key B', gbInC: 'Key C', gbInWp: 'Wheel press', gbInWu: 'Wheel up', gbInWd: 'Wheel down', gbInAC: 'A + C', gbInBC: 'B + C', gbInAB: 'A + B', gbBad: '{f}: not a Game Boy game', gbColor: '{f}: Game Boy Color only, that does not work', gbNeedRom: 'Open a ROM first (or read it from the device).', t7Old: '{n}: old version, the save can be lost when the battery is changed. Write it again now with "Keep saves".', t18Broken: 'Tama Meets is damaged. Remove Tama Meets and add the firmware again, then write without "Keep saves".', t18Clash: 'the main program would need the room of Tama Meets. Remove Tama Meets first.', tabSms: 'Master System / Game Gear', tabPm: 'Pokémon mini', smsNoMain: 'Master System and Game Gear only in the menu', pmNoMain: 'Pokémon mini only in the menu', abNoMain: 'Arduboy only in the menu', planAb: 'Arduboy', segAb: 'Arduboy', tabAb: 'Arduboy', abPick: 'Choose Games (.hex, .zip)', abHint: 'The games go into the Paramix menu. On the device: A+B+C together opens the settings (also picture size and sound). Hold the wheel for 2 s to save and go back, the next start continues there.', abBad: '{f}: not an Arduboy game', abBig: '{f}: too big for the Arduboy', smsPick: 'Choose Games (.sms, .gg)', smsHint: 'The games go into the Paramix menu. On the device: A+B+C together opens the settings (also Pause and sound). Hold the wheel for 2 s to save and go back, the next start continues there.', smsBad: '{f}: not a Master System or Game Gear game', smsGG: '{f}: Game Gear game, that does not work', smsB1: 'Button 1', smsB2: 'Button 2', smsPause: 'Pause / Start', pmPick: 'Choose Games (.min, .zip)', pmHint: 'The games go into the Paramix menu. On the device: A+B+C together opens the settings (also Power and sound). Hold the wheel for 2 s to save and go back, the next start continues there.', pmBad: '{f}: not a Pokémon mini game', pmBig: '{f}: bigger than 1 MB, that does not work', pmBiosPick: 'Choose Own BIOS', pmBiosDel: 'Remove Own BIOS', pmBiosFree: 'Without an own BIOS the free BIOS of PokeMini runs. Some games run better with the real BIOS.', pmBiosOwn: 'Own BIOS chosen, it is used for all Pokémon mini games.', pmBiosBad: '{f}: not a Pokémon mini BIOS', pmA: 'A', pmB: 'B', pmC: 'C', pmPower: 'Power', pmShake: 'Shake',
    tabFigs: 'Characters', tabAll: 'All Sprites', tabDim: 'Character Card', tabEmu: 'Emulator', tabDoom: 'DOOM',
    doomPick: 'Choose DOOM.WAD', doomEp: 'Episode', doomMusic: 'Music',
    doomHint: 'Builds DOOM into the ROM. Bring your own WAD, it stays on your computer.',
    doomUse: 'Start: in the Paramix menu, with the Paradise also by holding A and C together on the home screen. Back: as set in the Menu tab under "Back from programs".',
    doomNone: 'No WAD chosen.', doomOk: 'WAD recognised ({eps}). DOOM is built in on save.', doomEpsHint: 'Without the Paradise: each ticked episode goes into the menu as its own entry (DOOM E1, DOOM E2 ...), with its own save.', doomWhole: 'Whole WAD as one entry', pwadPick: 'Choose extra WAD', pwadOff: 'Remove extra WADs', doomPwads: 'With: {n}.', pwadNeedD2: '{n} is for DOOM II: choose DOOM2.WAD first.', pwadNeedD1: '{n} is for DOOM or Ultimate DOOM: choose DOOM.WAD first.', doomPwadPara: 'Own episodes (like Sigil) only go without the Paradise.', doomPwadBig: '{n}: the maps {m} are probably too big for the Paradise\'s memory. DOOM then shows a line with a 9, holding the wheel 2 s goes back to the menu.', doomPwadHint: 'Own episodes (like Sigil) go into the menu as their own entry, tick them for that. Together with the whole WAD they are mostly too big.', doomD2Clean: 'DOOM II only goes into a ROM without the Paradise.', doomD2Hint: 'DOOM II goes into the menu as one entry. It needs almost all the room and only fits without music.', doomWholeHint: 'All episodes in one entry "DOOM", the episode is chosen in the game. Needs much less room than one by one.',
    doomBad: 'WAD not recognised: {e}', doomFail: 'DOOM not built in: {e}', doomMissing: 'This build does not contain the DOOM program.',
    doomBoth: 'Emulator and DOOM do not fit into one ROM together. Please choose only one.',
    doomBig: 'No episode of this WAD fits into the ROM.', doomNoMusic: 'This episode only fits without music.',
    emuPick: 'Choose Firmware or ROM', emuOff: 'Remove Emulator',
    emuHint: 'Colour tamas (TamaEmu), Tama-Go and Friends (T7Emu), Meets and On (T18Emu), first Tamagotchis and Digimon (V1Emu), Connection V3 (V3Emu). The first is the main program, every further one goes to the menu. The filled star marks the main program, a click on an empty star makes another one the main program. Bring your own files.', t7Ok: 'V7 ROM recognised (T7Emu). It is built in on save.', t7OkFr: 'Tamagotchi Friends recognised (T7Emu, test). It is built in on save. There are no figures for it.', t7Has: 'This ROM contains T7Emu.', t7HasFr: 'This ROM contains T7Emu with Tamagotchi Friends.', t7Use: 'Start: hold A and C together on the home screen. Back: hold the wheel (saves). Wheel short: settings and figure. If T7Emu hangs: start with A and C, release them and press the wheel within the first 3 seconds and confirm with A.', t7FigPick: 'Add Figures', t7FigNone: 'No figures yet.', t7FigBad: '{f}: not a figure.', t7FigFull: 'No room left for {f}.', t7FigMax: 'No room for more figures.', t7FigDup: '{f} is already in.', appPick: 'Add Another Emulator', appHint: 'One more Tama-Go or Friends ROM (T7Emu). Started from the menu (A and C), so something in the Menu tab must be switched on.', appNone: 'No other emulators.', appBad: '{f}: not a Tama-Go or Friends ROM.', appBadL: '{f}: neither a Tama-Go or Friends ROM nor a colour Tama or TG18 firmware.', appT18One: 'T18Emu goes only once per ROM.', appHintL: 'In a start device: Tama-Go or Friends ROM, colour Tama firmware (TamaEmu) or TG18 firmware (T18Emu, once only).', ruleLaunch: 'Start device: emulators and DOOM fit together as long as there is room.', appMax: 'At most 12 more emulators.', appNeedMenu: 'More emulators start from the menu: switch on the field switch or items in the Menu tab.', appFail: 'More emulators: {e}', appSix: 'Six fields do not go together with more emulators.', t7SaveBtn: 'T7Emu save (.bin)', saveFor: 'Program', saveMain: 'Main emulator', v1SaveBtn: 'V1Emu save (.bin)', saveT18No: 'T18Emu: backing up its save is not possible here yet.', saveNoBatt: 'This game keeps no save on its cartridge.', saveNone: 'No save yet.', saveWrongFile: 'This file does not fit {n}.', saveCartIn: 'Save for {n} taken over. Now save the ROM or write it to the device. A kept game state is dropped.', t7SaveXDone: 'Save for {n} taken over. Now save the ROM or write it to the device.', t7NoSave: 'The Tama has no save yet.', t7SaveInDone: 'T7Emu save taken over. Now save the ROM or write it to the device.', t7SaveNeed: 'This save requires a ROM with matching Tama-Go support.', saveT18Need: 'This save requires a ROM with matching TG18 support.', saveEmuAny: 'Emulator save (.sav / .bin)',
    emuUse: 'Start: hold A and C together on the home screen. Back: hold the wheel (saves). If TamaEmu hangs: start with A and C, release them and press the wheel within the first 3 seconds and confirm with A. It then starts over from the save the Tama keeps itself.',
    emuNone: 'No emulator chosen.', petT: 'Change save', feldNeon: 'Neon Planets: the game switches its planets itself. Items, Tamapoints, Tama and programs work.', neonSave: 'Neon Planets: the Studio cannot edit its saves yet.', petOpen: 'Open Paradise Save', petRom: 'Save in the ROM', petClose: 'Close', petRomDone: 'Changed in the ROM. Now save the ROM or write it to the device (without "Keep saves", otherwise the device keeps its save).', petLevel: 'Level', petChar: 'Tama', petCare: 'Fed, happy, healthy', petSave: 'Save Changed Save', petKeep: 'unchanged', petKid: 'Kid', petYoung: 'Teen', petAdult: 'Adult', petNow: 'In the save: level {l}, Tama {c}, hunger {h}/6, happiness {j}/20{s}.', petSick: ', sick', petOther: 'The save is for another edition than the loaded ROM.', petNoSet: 'The settings block is missing in the save.', petDone: '{n} saved. Send it with "Save to device".', petNothing: 'Nothing changed.', tabSave: 'Save', tabNames: 'Names', cardNoChars: 'no characters on this card', noRoomFrag: 'The ROM has enough free space in total, but the selected content needs a larger contiguous block.', noRoomKB: 'Not enough room: about {k} KB missing. Remove a program. (The top 64 KB stay free for the write protection.)', noRoomAdd: 'No room left for {n}: about {k} KB missing. (The top 64 KB stay free for the write protection.)', eyeMvT: 'Move the eyes', mouthMvT: 'Move the mouth', poseNr: 'Pose {i} of {n}', faceBig: 'Big', faceSmall: 'Small', poseOnly: 'This pose only', poseOnlyHint: 'The arrows move eyes or mouth only in the pose shown. For your own figures where single poses do not fit.', eyeMvHint: 'Applies on the field to Tamas that hatch or grow after writing. The small figure moves half as far.', planEyes: 'Eyes and mouth', namesHint: 'Change names: capitals, digits, space and . & \' ! ? /. Applies to every language with Latin letters on the device.', namesFields: 'Fields', namesChars: 'Tamas', namesItems: 'Items', namesFind: 'Search', namesUndo: 'Reset All', planNames: 'Names', planNamesN: '{n} changed', saveParaOut: 'Paradise save (.tamasave)', saveEmuOut: 'TamaEmu save (.sav)', saveInfo: 'Export takes the saves out of this ROM. An emulator save (TamaEmu .sav or T7Emu .bin) goes into the ROM, then save the ROM or write it to the device. A Paradise save goes straight to the device, connect it above for that.', saveOutT: 'Export', saveInT: 'Import', saveSecProg: 'Programs', saveSecPara: 'Paradise', saveParaOutB: 'Export (.tamasave)', saveParaInB: 'Write to Device (.tamasave)', saveProgInfo: 'Export takes the save of the chosen program out of this ROM. Import puts it into the ROM, then save the ROM or write it to the device.', saveParaInfo: 'Export takes the Paradise save out of this ROM. Write to device goes straight to the device, connect it above for that. Slot: which save.', saveSlotL: 'Slot', slotLive: '{n} (active)', slotEmpty: '{n} (empty)', slotNone: 'There is no save in this slot.', slotField: 'The save is for {a}, the slot for {b}.', slotDevOther: 'The menu on the device does not match the loaded ROM. Load the ROM from the device first.', slotSure: 'The save goes into {n} on the device and replaces the one there. Continue?', slotDone: 'Done: {n} replaced on the device.', slotClearB: 'Clear Slot', slotClearSure: '{n} is deleted on the device. A new game starts there afterwards, the field can be chosen. Continue?', slotClearDone: 'Done: {n} is empty.', saveNoProg: 'No matching program save was found in this ROM.', saveBtnOut: 'Export ({f})', saveBtnIn: 'Import ({f})', saveEmuInDone: 'TamaEmu save taken over ({d}). Now save the ROM or write it to the device.', saveEmuOther: 'The ROM has TamaEmu for {a}, the save is for {b}. Take it anyway?', saveNoRoom: 'This ROM has no room for TamaEmu.', saveEmuBad: 'This is not a fitting save for this program.', saveNoEmu: 'This ROM has no emulator.', saveDone: '{n} saved.', saveNoClock: '{n} saved. The clock is not included, set it in the app if needed.', devSaveRead: 'Back Up Save', devSaveWrite: 'Save to Device', devSaveHint: 'Back up your {editionParadise} save to a .tamasave file, or restore a backup to the connected device. The backup includes the device clock when available.', devSaveSure: 'The save is written to the device ({ed}) and replaces the current one. Continue?', devSaveDone: 'Done: {w} pages written. {c} The device can be restarted.', devSaveClock: 'Clock taken over.', devSaveClockNo: 'Please set the clock on the device.', devSaveGot: 'Backed up: {n}.', fl_saveOtherEd: 'the save is from another edition ({s}), the device is {d}', fl_saveFamily: 'the save does not fit this edition', fl_saveNoSettings: 'the settings block is missing, this is not a complete Paradise save', fl_saveOutside: '{n} pages lie outside the save and are not written', fl_saveIncomplete: 'the save does not hold every page, missing ones stay as on the device', emuUndo: 'Undo Choice', progMain: 'Starts with A and C', progMainL: 'First entry of the menu', progMenu: 'Starts from the menu', progGone: 'will be removed', progUndo: 'Undo', progDel: 'Remove', progNone: 'No emulator yet. Choose firmware or ROM, every further one goes to the menu.', appBadMain: '{f}: colour Tama and TG18 firmware go as a further program only in a start device. Otherwise remove the emulator above with × first.', emuInList: 'In the ROM as further programs: {n}. No need to choose them again.', doomLinkLess: ', {m} MB less with DOOM', emuPack: 'Pack the firmware', emuPackHint: 'Saves room (about 1 MB for an iD L), but the game runs slower.', packWarn: 'Note: the firmware of {n} gets packed so it fits. Packed, the game runs slower. For full speed put fewer programs into the ROM and switch off "Pack the firmware".\n\nContinue anyway?', savePackAsk: 'With this save the firmware only fits packed. Packed, the game runs slower. Switch on "Pack the firmware" and take it?', packNeed: 'This firmware only fits here packed: switch on "Pack the firmware" in the row of TamaEmu.', packFew: 'As the main program the firmware only fits partly packed. At some places the game can run slower because of that. Fully unpacked it runs in a start device as a program in the menu.', packTip: ' Tip: "Pack the firmware" for TamaEmu saves room.', emuNfc: '4U: emulate the NFC chip', emuNfcHint: 'The menu reacts to one press. Unticked it works as before.', emuClock: 'Take the clock from the Paradise at the start', emuClockHint: 'At every start the Paradise\'s time applies. The time in between is not played through.', emuAuto: 'Start when switched on', emuAutoHint: 'Hold the wheel: back to the Paradise, it stays there. Back into the emulator: A and C, or the reset button.', autoHintL: 'Starts at switching on instead of the menu. Hold B while switching on: menu.', emuHas: 'This ROM contains an emulator.', emuBig: 'This firmware is big: the field switch of the menu has no room next to it.', emuUp: 'Saving puts in the new emulator version. With "Keep saves" the save stays.',
    emuOk: 'Firmware recognised ({size}). It is built in on save.', emuBad: 'Firmware not recognised: {e}', t18Ok: 'TG18 firmware recognised (T18Emu, Meets/On). It is built in on save.', t18Has: 'This ROM contains T18Emu.', t18Use: 'Start: hold A and C together on the home screen. Back: hold the wheel (saves). If T18Emu hangs: start with A and C, release them, press the wheel within the first 3 seconds and confirm with A. The firmware then starts over from its own save. Experimental: the Tama still runs slower than the real one.',
    emuGone: 'The emulator is removed on save.', emuMissing: 'This build does not contain the emulator program.',
    emuFail: 'Emulator not built in: {e}', savedEmu: 'Saved: {name}',
    t18Pics: 'Pictures for grow up', t18PicsPick: 'Choose Pictures', t18PicsDel: 'Remove Pictures', t18PicsOk: '{n} pictures taken.', t18PicsUnknown: '{f}: unknown name', t18PicsHint: 'On the device grow up then shows the picture of the choice. PNG files, name = character (e.g. Mametchi.png, Kuchipatchi.png) or its number (16.png). The folder erwachsen of the Android T18Emu works too: choose all files with erwachsen.json. Any size, scaled to 64x64.', t18Items: 'Items', t18ItemsPick: 'Choose MyMeets Files', t18ItemsNoSave: 'Items work once the game has run (read the ROM from the device).', t18ItemsHint: 'Items, room and Tamapoints go into the game\'s save. When written it replaces T18Emu\'s save on the device, even with "Keep saves". The Tama stays, the running state starts anew.', t18ItemsNone: 'No items found in the files.', t18ItemsOther: '{n} is for {m}, not for the Meets/On. It may not work there.', t18ItemsFull: 'no room left', mmTitle: 'MixingMeets (visit, marriage)', uartBusy: 'ParaLab is still connected to the dongle. The bridge does not work meanwhile.', uartFree: 'Release UART', uartFreed: 'Dongle released. Restart the Paradise so the game runs again.', uartRun: 'Wait until the device is done.', pairTitle: 'Connect two Paradise (visit, game)', pairHint: 'Plug both Paradise together at the top and start T18Emu on both. Then on both CONNECTION, TAMAGOTCHI and on as with two Tamas.', pairHintDigi: 'Plug both Paradise together at the top and start V1Emu with Digimon on both. Then choose and start the battle as with two real Digimon.', pairHintPs: 'Plug both Paradise together at the top and start TamaEmu (P\'s) on both. Then on both connection, たまごっちP\'s, あそぶ. On one あそびにいく, on the other ともだちをよぶ, ふたりで, a game, then B.', pairHintIdl: 'Plug both Paradise together at the top and start TamaEmu (iD L) on both. Then choose the connection in the game on both as with two real iD L.', pairHintV3: 'Plug both Paradise together at the top and start V3Emu on both. Then choose the connection in the game on both as with two real V3.', pairHintT7: 'Plug both Paradise together at the top and start T7Emu (Tama-Go) on both. Then on both connection, TAMA-GO, VISIT or GAME. Press B on the device that goes visiting.', mmLink: 'Paramix bridge', mmDrag: 'Drag it to the bookmarks bar, then click it on mixing-meets.com.', mmHint: '1. Drag the Paramix bridge button to the bookmarks bar once (Chrome or Edge).\n2. Disconnect ParaLab from the dongle (Release UART or close ParaLab). Dongle on the contacts as for flashing. On the Tama: CONNECTION, APP, VISIT (to bring it back: press A, GO BACK, YES).\n3. On mixing-meets.com open Connect or Return, click the bookmark, then Select Tamagotchi and choose the dongle.\nClick the bookmark again after every page change.', t7Gp: 'Gotchi Points', t7GpHint: 'Goes into the ROM like an imported save: the Tama stays, the running state starts anew (choose DOWNLOAD on the device).', t18KeepAsk: 'T18Emu: items or Tamapoints changed. Its save on the device is replaced by the one in the ROM (as read), even with "Keep saves". Go on?', t18ItemNo: 'No. {n}', t18ItemOk: '{n} is now in {k}.', t18Points: 'Tamapoints', t18A_food: 'Food', t18A_item: 'Items', t18A_acc: 'Accessories', t18A_room: 'Room', t18RoomBack: 'Remove Own Room', t18RoomBuiltin: 'built-in room', dlcPick: 'Add Download Content', dlcInfo: 'Show used slots', progMore: 'Settings and content', progMakeMain: 'Make it the main program', progIsMain: 'Main program', v1Ok: 'First Tamagotchi or Digimon recognised (V1Emu).', v3Ok: 'Tamagotchi Connection V3 recognised (V3Emu).', v3Use: 'Start: hold A and C together on the home screen. Wheel short: settings. Back: hold the wheel.', optVol: 'Volume', optVolN: 'normal', optVolQ: 'quiet', optVolL: 'loud', optOff: 'off', optDim: 'Brightness', optScr: 'Screen off after', optDev: 'Also on the device: press the wheel briefly. A change made there applies until you change it here again.', optScrToy: 'as on the Tama', v1Use: 'Start: hold A and C together on the home screen. Wheel short: settings. Turn the wheel: shake. Back: hold the wheel.', progNoMainDoom: 'DOOM is the main program. For another one remove DOOM first (×).', doomAutoHint: 'Hold the wheel for 2 s: back to the Paradise, it stays there.', progReplaced: '{n} is now the main program instead of {o}.', mainAuto: '{n} is now the first entry of the menu, only this way everything fits.', mainNoRoom: 'As the first entry about {k} KB of room are missing. It stays as it was.', appTwice: '{n} is already in.', progNoMainV1: 'V1Emu starts from the menu only', progNoMain: 'Only in a start device', progMainNow: '{n} is now the main program. The saves of the swapped programs start anew.', dlcLoading: 'Reading…', dlcNewArea: 'The memory of this emulator is laid out anew for it. Its save starts anew after writing.', dlcHint: 'Food, clothes, accessories, games etc. as .jpg download files or .zip. Several files at once work, on the P\'s always a whole VDP set.', dlcFreeN: '{n} free', dlcDel: 'remove', dlcK0: 'Meals', dlcK1: 'Snacks', dlcK2: 'Clothing', dlcK3: 'Accessories', dlcK4: 'Items', dlcK5: 'Daily items', dlcK6: 'Wallpapers', dlcK7: 'Games', dlcK8: 'Destinations', dlcK10: 'VDP recipes', dlcK15: 'Decorations', dlcK16: 'Coupons', dlcK17: 'Bingo', dlcK18: 'Gashapon', dlcK19: 'Characters', dlcOk: '{n} now sits in {k}, slot {s}.', dlcBad: '{f}: {e}', dlcGone: '{n} removed.',
    figField: 'Field:', figAll: 'All fields', zipField: 'Field as ZIP', fieldZipOk: '{f}: {n} characters and {s} pictures as ZIP.', fieldIn: 'Load Field from ZIP', fieldInBad: 'Not a field ZIP (field.json missing).', fieldInOk: '{src} applied to {dst}: {n} parts.', fieldInEyes: '{k} characters stay original, their eye images are too big here.', fieldInShared: 'Character group {n} has conflicting source images.',
    zipFigs: 'All Characters as ZIP', zipAll: 'All Sprites as ZIP', upload: 'Import Sheets…',
    numbers: 'Number Test ROM',
    figHint: 'A character is made of body, eyes and mouth, each large and small. Click a character for its sheet.',
    allHint: 'Backgrounds, menus, items, fonts.',
    moreColors: 'Allow more colours (up to 256)',
    dimLoad: 'Open Card File…', dimHint: 'Dump of a character card (4 MB) or a TamaSma card (1 or 2 MB). Card characters best replace adults. Baby, child and teen share their eyes and stay original.',
    dimPick: 'Card character', dimTarget: 'replaces character', dimApply: 'Insert', dimEgg: 'Insert the Card’s Egg',
    dimBaby: 'Baby', dimNone: 'Load a card to see its characters.',
    download: 'Download Sheet', uploadOne: 'Upload Sheet', reset: 'Restore Original', close: 'Close',
    dimNr: 'No.', stUpd: 'will be updated',
    disclaimer: 'Use at your own risk. Changing and writing the device can make it unusable or erase saves. Read a backup first and only use the tool if you know what you are doing. There is no warranty and no liability for damage to devices or data.',
    trademarks: 'Tamagotchi® and related marks and likenesses are properties of Bandai and its affiliates. Characters, artwork, and game content belong to their respective rights holders. Commercial use of protected third-party materials without rights-holder authorization is prohibited. ParaLab is independent and is not authorized or endorsed by Bandai. No original game ROMs or device keys are included.',
    licenseNotice: 'GPL-3.0-or-later. Intended for personal, non-commercial use. GPL software rights remain unchanged.',
    edition: 'Edition', sprites: 'Sprites', figures: 'Characters', changed: 'changed', space: 'Room for characters',
    figure: 'Character', sprite: 'Sprite',
    mSize: 'Cell {w}×{h}, {n} images, grid {iw}×{ih}', mColors: '{c}, palette sets: {p}',
    mDirect: 'Direct colour RGB565', mPal: '{n} colours', mKeep: 'Several palette sets (colour variants): uploads use the original colours.',
    mSheet: 'Sheet {w}×{h} px. Keep the size, otherwise the grid no longer fits.',
    mGroupRows: 'Rows: body (20), eyes (20), mouth (18), small body (24), small eyes (14), small mouth (14).',
    notRom: 'This is not a Paradise dump: {e}', loaded: '{ed} loaded: {s} sprites, {f} characters.',
    saved: 'Saved: {name}\n{n} sprites changed, {kb} KB still free.', nothing: 'Nothing changed yet.',
    tooBig: 'Too big for the free space. {e}',
    upOk: 'Applied: {n}', upSkip: 'Skipped: {list}', upNone: 'No matching files. Expected: figur_0237.png or sprite_0014.png.', sprSix: 'Field picture of the extra fields, cannot be changed.',
    wrongSize: '{f}: {e}', resetOk: 'Original restored.', dimOk: 'Card character {d} now sits in character {g}.', eggOk: 'Egg replaced.',
    numOk: 'Every character now shows its number. Save, flash, raise and note which number shows up at which stage.',
    notDim: 'Unknown card: {e}', leave: 'There are unsaved changes.',
    roleFallback: 'Fallback', roleBaby: 'Baby', roleAdult: 'first adult',
    eyeHint: 'Pink frame = eye. It moves into the eye layer so the character blinks and the cell has eyes. Wrong? Click on the eye.',
    eyeNone: 'Character has no visible eyes', dimEyesTooBig: 'The eyes were too detailed, the character keeps no eye layer.',
    roleFallbackText: 'appears when the game cannot load a character. Best left unchanged.',
    roleBabyText: 'hatches from the egg.', roleAdultText: 'from here on every character has its own eyes.',
    mEyes: 'Eyes keep their byte size, otherwise the fallback character hatches. Eyes that are too detailed are rejected.',
    mColorsFig: 'If all colours come from the original, the game keeps recolouring the character per tama. New colours become fixed (up to 8 colours plus outline).',
  },
};
function t(key, variables) {
  return I18n.message(key, Object.hasOwn(T.en, key) ? T.en[key] : key, variables);
}
const locale = () => I18n.locale;
const traditionalGameText = () => locale() === 'zh-Hant';
const gameLocale = () => traditionalGameText() ? 'zh-Hans' : locale();
const displayGameText = text => traditionalGameText() ? RL.taiwanText(text) : text;
const displayName = read => (traditionalGameText() && RL.taiwanText(read(false))) || read(true);
const activeRom = () => myLabRom?.rom || state.ctx?.rom;
const romText = (rom, row, options) => RL.text(rom, row, gameLocale(), options);
const romDisplayName = (rom, row) => displayName(fallback => romText(rom, row, { fallback }));
const romField = (rom, field, fallback) => displayGameText(RL.field(rom, field, gameLocale()) ||
  RL.referenceField(field, gameLocale())) || t(fallback || 'Unknown field');
const listSeparator = () => /^(zh-|ja$)/.test(locale()) ? '、' : ', ';
const labelSeparator = () => /^(zh-|ja$)/.test(locale()) ? '：' : ': ';
const nativeFieldTypes = new Map([
  ...Object.entries(C.FIELD_NAMES).map(([type, name]) => [name.toUpperCase(), Number(type)]),
  ['JADE FOREST', 4], ['TROPICS', 5], ['ICE', 6],
]);
function fieldName(rom, english) {
  if (!english) return '';
  const normal = english.trim().toUpperCase();
  const type = nativeFieldTypes.get(normal) || nativeFieldTypes.get(normal.replace(/ FIELD$/, ''));
  return romField(rom, type, english);
}
const itemDisplayName = item => displayName(fallback => RL.name(item?.names, gameLocale(), { fallback })) ||
  item?.name || item?.filename || '';
/* The legacy emulator patches accept their own firmware locale setting. */
const lang = 'en';
const SAVE_PACK_ASK = true;
function em(x) {
  const message = x && typeof x === 'object' ? (x.message || String(x)) : String(x || '');
  const pack = /^(.+) only fits packed$/.exec(message);
  return pack ? t('{name} only fits packed (big save): in the Emulator tab switch on "Pack the firmware" in its row, or remove another program', { name: pack[1] }) : t(message);
}

function activeRomProfile() {
  return myLabRom ? 'my-lab' : neonRom() ? 'neon' : 'paradise';
}

function gameMenuPath(terms, englishPath, profiles) {
  const active = activeRomProfile();
  const published = profiles?.split(' ');
  const profile = !published || published.includes(active) ? active : published[0];
  const rom = profile === active ? activeRom() : null;
  const translated = t(englishPath).split(' → ');
  return terms.map((key, i) => displayGameText(RL.term(rom, key, gameLocale()) ||
    RL.referenceTerm(profile, key, gameLocale())) || translated[i]).join(' → ');
}

const gameMenuFallback = new WeakMap();
function renderGameLabels() {
  for (const element of document.querySelectorAll('[data-rom-term]')) {
    if (!gameMenuFallback.has(element)) gameMenuFallback.set(element, element.textContent.trim());
    element.textContent = gameMenuPath(element.dataset.romTerm.split(' '),
      gameMenuFallback.get(element), element.dataset.romProfile);
  }
  const paradise = activeRomProfile() === 'paradise' ? activeRom() : null;
  for (const element of document.querySelectorAll('[data-rom-field]')) {
    element.textContent = romField(paradise, Number(element.dataset.romField));
  }
}

function applyLang() {
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  renderSourceEdition('headerRomEdition', sourceEdition());
  renderGameLabels();
  I18n.applyMarkup();
  refreshEditionOptions();
  for (const [key, tabs] of [['paradise', paradiseTabs], ['lab', myLabTabs]]) {
    updateToolLabels(key, tabs);
  }
  if (myLabRom) {
    renderMyLabMenu();
    renderMyLabPort();
    renderMyLabSave();
    renderMyLabCharacters();
    renderMyLabSlots();
    renderMyLabChangeStatus();
    if (!$('myLabSprites').hidden) renderMyLabSprite();
    if (!$('myLabZh').hidden) renderZhPanel(true);
  }
  if (state.ctx) {
    refreshCharacterNames();
    if (petSave && !$('petRow').hidden) refreshPetNames();
    renderInfo(); renderDim(true); renderFieldPick(); renderNames(); renderEmu(); renderDoom(); renderFeld(); renderSave();
    document.querySelectorAll('#gridFigs .tile').forEach(b => {
      const group = Number(b.dataset.idx);
      b.title = b.querySelector('.cap span').textContent = [state.charNames.get(group), groupRole(group)].filter(Boolean).join(' ');
    });
    if (!$('pane-lab-items').hidden) renderRomLabItems(false);
    if (!$('pane-zh').hidden) renderZhPanel(false);
    if (!$('pane-all').hidden) syncSpritePager('paradiseSprites', Number($('paradiseSpritesPage').value) * SPRITES_PER_PAGE, state.ctx.entries.length);
    if (state.open) openDrawer(state.open.kind, state.open.idx);
  }
  const deviceItems = $('deviceLabItems');
  if (!deviceItems.hidden) deviceItems.querySelector('input')?.oninput();
  if (deviceCatalogs.gift.data) renderGiftChoices();
  if (deviceCatalogs.lab.data || itemTransfer.files.length) renderLabItemCatalog();
  if (itemTransfer.item) renderTransferItemName(itemTransfer.namedItem || itemTransfer.item);
  for (const button of document.querySelectorAll('.lab-item-frame')) renderLabItemFrameLabel(button);
  if ($('visSavedStatus').dataset.message) savedVisitorStatus($('visSavedStatus').dataset.message);
  if (!importedFood) $('foodFile').textContent = t('No food file selected');
  refreshVisitorLabels();
  renderLabCodeReference();
  const activeDeviceTab = deviceTabs.find(tab => tab.getAttribute('aria-selected') === 'true');
  if (activeDeviceTab?.id === 'deviceTabLab' || activeDeviceTab?.id === 'deviceTabPlaydate')
    renderVisitorChoiceHint(activeDeviceTab.id === 'deviceTabLab');
  if (!dv.run) devRender();
  else {
    renderDeviceConnection();
    visRender();
  }
  visPeerLabels();
  visPlaybackLabel('visPeer');
  visPlaybackLabel('visVisitor');
  visAppearanceLabels();
  visRenderVisitor(false);
}

// ------------------------------------------------------------------ state
const state = { ctx: null, name: '', changed: new Map(), dim: null, open: null, zoom: 2, eyeOffsets: new Map(), eyeRects: new Map(), eyeLayer: false, fields: [], charNames: new Map(), paramixShortcut: false };
const decodedSprites = new Map();
const DECODED_SPRITE_BUDGET = 16 * 1024 * 1024;
let decodedSpriteBytes = 0;
let myLabRom = null;
const entry = (i) => state.changed.get(i) || (state.launch && state.launchMap && state.launchMap.get(i)) || state.ctx.entries[i];
/* 1.7.2 CLEAN_ROM: start device without any Paradise code (Menu tab); the menu starts right away, sets the clock
 * itself, and almost the whole flash is for programs */
const CLEAN_ROM = false;
const neonRom = () => state.ctx && state.ctx.editionId === 8 && !state.ctx.clean;
const menuWanted = () => !!(state.appsOnly || state.feld || state.bag || state.tama || state.gplay || state.launch ||
  (!state.clean && state.ctx && (state.neonDonor || NT?.installed(state.ctx.rom))));
/* launcher ROM (1.6.8): the small images, computed once per ROM */
function launchMapGet() { if (!state.launchMap) state.launchMap = C.launcherChanges(state.ctx); return state.launchMap; }
function clearDecodedSprites() {
  decodedSprites.clear();
  decodedSpriteBytes = 0;
}
function decode(i) {
  const e = entry(i);
  const cached = decodedSprites.get(i);
  if (cached) {
    decodedSprites.delete(i);
    if (cached.src === e) {
      decodedSprites.set(i, cached);
      return cached;
    }
    decodedSpriteBytes -= cached.bytes;
  }
  const { subs } = C.spriteDecode(e, 0, true);
  const bytes = subs.reduce((total, image) => total + image.data.byteLength + 128, 128);
  const sprite = { src: e, subs, bytes };
  if (bytes <= DECODED_SPRITE_BUDGET) {
    while (decodedSpriteBytes + bytes > DECODED_SPRITE_BUDGET) {
      const [oldest, old] = decodedSprites.entries().next().value;
      decodedSprites.delete(oldest);
      decodedSpriteBytes -= old.bytes;
    }
    decodedSprites.set(i, sprite);
    decodedSpriteBytes += bytes;
  }
  return sprite;
}
function spriteFrame(i, frame = 0) {
  const e = entry(i);
  const h = C.spriteHeader(e);
  const count = Math.floor(h.numSprites / (Math.max(1, h.iw) * Math.max(1, h.ih)));
  if (!count) return;
  const index = frame >= 0 && frame < count ? frame : 0;
  const cached = decodedSprites.get(i);
  return cached?.src === e ? cached.subs[index] : C.spriteDecode(e, 0, true, index).subs[0];
}

// ------------------------------------------------------------ helpers
function toast(msg, err) { if (toast.mute) { if (err) toast.mute.err = msg; return; } const el = $('toast'); el.textContent = msg; el.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => el.className = 'toast', err ? 9000 : 5000); }
const busyOperations = new Set();
const busyDialog = $('busy');
busyDialog.addEventListener('cancel', event => event.preventDefault());
function renderBusyDialog() {
  const current = Array.from(busyOperations).pop();
  if (!current) { busyDialog.close(); return; }
  $('busyTitle').textContent = current.title;
  if (!busyDialog.open) busyDialog.showModal();
}
async function busy(title, fn) {
  const operation = { title };
  busyOperations.add(operation);
  try {
    renderBusyDialog();
    await new Promise(resolve => setTimeout(resolve, 30));
    return await fn();
  } finally {
    busyOperations.delete(operation);
    renderBusyDialog();
  }
}
function imgToCanvas(img, scale = 1, cv) {
  cv = cv || document.createElement('canvas'); cv.width = img.w * scale; cv.height = img.h * scale;
  const pixels = new ImageData(img.data, img.w, img.h);
  const g = cv.getContext('2d');
  if (scale === 1) {
    g.putImageData(pixels, 0, 0);
    return cv;
  }
  const tmp = document.createElement('canvas'); tmp.width = img.w; tmp.height = img.h;
  tmp.getContext('2d').putImageData(pixels, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, cv.width, cv.height);
  tmp.width = tmp.height = 0;
  return cv;
}
function pngBlob(img) {
  return new Promise((resolve, reject) => {
    const canvas = imgToCanvas(img);
    canvas.toBlob(blob => {
      canvas.width = canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the image as PNG.'));
    }, 'image/png');
  });
}
async function pngBytes(img) { return new Uint8Array(await (await pngBlob(img)).arrayBuffer()); }
async function decodePng(blob, options = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) {
  const bmp = await createImageBitmap(blob, options);
  const cv = document.createElement('canvas');
  try {
    cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height);
    return { w: d.width, h: d.height, data: d.data };
  } finally {
    bmp.close();
    cv.width = cv.height = 0;
  }
}
function download(data, name, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function inflateRaw(bytes, size) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  if (size === undefined) return new Uint8Array(await new Response(stream).arrayBuffer());
  const output = new Uint8Array(size), reader = stream.getReader();
  let offset = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (offset + value.length > size) {
      await reader.cancel();
      throw new Error('Invalid ZIP entry.');
    }
    output.set(value, offset);
    offset += value.length;
  }
  return output.subarray(0, offset);
}
const pad4 = (n) => String(n).padStart(4, '0');
const baseName = () => state.name.replace(/\.[^.]+$/, '').replace(/(_paramix|_emu|_t7|_t18|_doom_E\d|_felder|_fields|_4fields|_6fields|_neon-tama|_neon-items|_my-lab|_items|_start|_clean)+$/, '');

// --------------------------------------------------------------- Lab Items
const labItemIcons = new WeakMap();
let labItemSelection;
const labItemAddress = address => '0x' + address.toString(16).toUpperCase();
const labItemName = item => itemDisplayName(item) || t('Lab Item at {address}', { address: labItemAddress(item.address) });
const matchingBytes = (image, item) => item.address + item.bytes.length <= image.length &&
  item.bytes.every((byte, i) => image[item.address + i] === byte);

function labItemThumbnail(holder, item) {
  if (!labItemIcons.has(item.entries)) {
    labItemIcons.set(item.entries, LI.thumbnail(item, C));
  }
  const picture = labItemIcons.get(item.entries);
  holder.replaceChildren(picture ? imgToCanvas(picture) : document.createTextNode('◇'));
  holder.setAttribute('aria-hidden', 'true');
}

function itemPreviewCard(title, subtitle, preview, choose) {
  const row = document.createElement('li'), button = document.createElement('button');
  const icon = document.createElement('span'), label = document.createElement('span');
  const name = document.createElement('strong'), detail = document.createElement('small');
  button.type = 'button';
  button.className = 'btn';
  icon.className = 'lab-item-icon';
  icon.setAttribute('aria-hidden', 'true');
  preview(icon);
  name.textContent = title;
  name.lang = locale();
  detail.textContent = subtitle;
  label.append(name, detail);
  button.append(icon, label);
  button.onclick = () => choose(button);
  row.append(button);
  return row;
}

function renderLabItems(holder, items, open, resetSearch = false, displayedItem = item => item) {
  if (!holder.firstElementChild) holder.append($('labItemsTemplate').content.cloneNode(true));
  const search = holder.querySelector('input'), count = holder.querySelector('[data-lab-items-count]');
  const grid = holder.querySelector('ul');
  if (resetSearch) search.value = '';
  search.hidden = !items.length;
  search.oninput = () => {
    search.placeholder = t('Find a Lab Item');
    search.setAttribute('aria-label', search.placeholder);
    grid.setAttribute('aria-label', t('Lab Items'));
    const query = search.value.trim().toLowerCase();
    const visible = items.filter(item => [labItemName(displayedItem(item)), labItemAddress(item.address), ...(displayedItem(item).names || [])]
      .some(text => text.toLowerCase().includes(query)));
    count.textContent = !items.length ? t('No downloaded Lab Items found.') : query ?
      t('{visible} of {total} Lab Items', { visible: visible.length, total: items.length }) :
      t(items.length === 1 ? '{count} Lab Item' : '{count} Lab Items', { count: items.length });
    grid.replaceChildren();
    for (const item of visible)
      grid.append(itemPreviewCard(labItemName(displayedItem(item)), labItemAddress(item.address),
        icon => labItemThumbnail(icon, item), button => open(item, button)));
  };
  search.oninput();
}

function renderLabItemFrameLabel(button) {
  const { entry, frame, multi } = button.dataset;
  button.lastElementChild.textContent = t(multi === 'true' ? 'Sprite {sprite} · Frame {frame}' : 'Sprite {sprite}', {
    sprite: Number(entry) + 1, frame: Number(frame) + 1,
  });
}

function renderLabItemPictures(gallery, item, replace, selectedEntry = 0, selectedFrame = 0) {
  gallery.replaceChildren();
  const pictures = [];
  for (const [entryIndex, entry] of item.entries.entries()) {
    const count = myLabSpriteCount(entry);
    for (let frame = 0; frame < count; frame++) {
      const image = LI.picture(entry, C, frame, true);
      if (!image) break;
      const figure = document.createElement('figure');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lab-item-frame';
      button.dataset.entry = String(entryIndex);
      button.dataset.frame = String(frame);
      button.dataset.multi = String(count > 1);
      button.setAttribute('aria-pressed', 'false');
      button.append(imgToCanvas(image), document.createElement('span'));
      renderLabItemFrameLabel(button);
      figure.append(button);
      pictures.push({ entryIndex, frame, image, button });
      gallery.append(figure);
    }
  }
  if (!pictures.length) { gallery.textContent = t('No decodable images.'); return; }
  const tools = document.createElement('div');
  tools.className = 'lab-item-image-tools';
  const save = document.createElement('button'), load = document.createElement('button');
  for (const [button, key] of [[save, 'Export PNG'], [load, 'Replace PNG…']]) {
    button.type = 'button';
    button.className = 'btn small';
    button.dataset.t = key;
    button.textContent = t(key);
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,.png';
  input.hidden = true;
  load.dataset.labItemPicture = '';
  load.onclick = () => input.click();
  let selected = pictures.find(picture => picture.entryIndex === selectedEntry && picture.frame === selectedFrame) || pictures[0];
  selected.button.setAttribute('aria-pressed', 'true');
  for (const picture of pictures) picture.button.onclick = () => {
    selected.button.setAttribute('aria-pressed', 'false');
    selected = picture;
    selected.button.setAttribute('aria-pressed', 'true');
  };
  save.onclick = async () => {
    const { image, entryIndex, frame } = selected;
    download(await pngBlob(image), `item-${item.id}-sprite-${entryIndex + 1}-frame-${frame + 1}.png`);
  };
  input.onchange = () => {
    const file = input.files[0];
    input.value = '';
    const { image, entryIndex, frame } = selected;
    if (file) replace(item, entryIndex, frame, image, file);
  };
  tools.append(save, load, input);
  gallery.prepend(tools);
}

async function readLabItemPicture(file, image) {
  const header = new DataView(await file.slice(0, 24).arrayBuffer());
  if (header.byteLength !== 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452)
    throw new Error(t('Choose a PNG image.'));
  if (header.getUint32(16) !== image.w || header.getUint32(20) !== image.h)
    throw new Error(t('The PNG must be {width} × {height} pixels.', { width: image.w, height: image.h }));
  try { return await decodePng(file); }
  catch (_) { throw new Error(t('Invalid PNG pixel data.')); }
}

async function replaceLabItemPicture(item, index, frame, image, file) {
  const selection = labItemSelection;
  try {
    const replacement = await readLabItemPicture(file, image);
    if (labItemSelection !== selection || selection.item !== item) return;
    selection.item = LI.withPicture(item, index, frame, replacement, C);
    renderLabItemPictures($('labItemPreview'), selection.item, replaceLabItemPicture, index, frame);
    $('labItemChecksum').textContent = labItemAddress(selection.item.checksum);
    $('labItemStatus').textContent = t('Image updated. Save edits or export an ARC2 copy.');
  } catch (error) {
    if (labItemSelection === selection) $('labItemStatus').textContent = em(error);
  }
}

function openLabItem(item, save, button) {
  labItemSelection = { item, save, button };
  $('labItemTitle').textContent = labItemName(item);
  renderItemNameInputs($('labItemNames'), item);
  renderLabItemPictures($('labItemPreview'), item, replaceLabItemPicture);
  $('labItemId').textContent = item.id;
  $('labItemAddress').textContent = labItemAddress(item.address);
  $('labItemSize').textContent = t("{v1} KiB", { v1: item.bytes.length / 1024 });
  $('labItemChecksum').textContent = labItemAddress(item.checksum);
  $('labItemEntryCount').textContent = item.entries.length;
  $('labItemBuy').value = item.buy;
  $('labItemSell').value = item.sell;
  $('labItemBuy').disabled = $('labItemSell').disabled = !item.editable;
  $('labItemStatus').textContent = item.editable ? '' : t("Price editing is unavailable for this Lab Item format.");
  $('labItemDialog').showModal();
}

function labItemFromForm() {
  const names = Array.from($('labItemNames').querySelectorAll('input'), input => input.value);
  const item = LI.withNames(labItemSelection.item, names, C);
  const buy = $('labItemBuy').valueAsNumber, sell = $('labItemSell').valueAsNumber;
  return buy === item.buy && sell === item.sell ? item : LI.withPrices(item, buy, sell, C);
}

$('labItemClose').onclick = () => $('labItemDialog').close();
$('labItemPreset').onclick = () => setLabItemPrices('labItemBuy', 'labItemSell', 0, 9999);
$('labItemDialog').onclose = () => {
  $('labItemPreview').replaceChildren();
  labItemSelection?.button.focus();
  labItemSelection = null;
};
$('labItemForm').onsubmit = event => {
  event.preventDefault();
  try {
    const updated = labItemFromForm();
    labItemSelection.save(updated);
    labItemSelection.item = updated;
    $('labItemChecksum').textContent = labItemAddress(updated.checksum);
    $('labItemTitle').textContent = labItemName(updated);
    labItemSelection.button.querySelector('strong').textContent = labItemName(updated);
    const icon = labItemSelection.button.querySelector('.lab-item-icon');
    if (icon) { icon.replaceChildren(); labItemThumbnail(icon, updated); }
    renderLabItemPictures($('labItemPreview'), updated, replaceLabItemPicture);
    $('labItemStatus').textContent = t("Item edits saved.");
  } catch (e) {
    $('labItemStatus').textContent = em(e);
  }
};
$('labItemExport').onclick = () => {
  if (!$('labItemForm').reportValidity()) return;
  let item;
  try { item = labItemFromForm(); } catch (error) { $('labItemStatus').textContent = em(error); return; }
  const name = (item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  download(item.bytes, (name || 'lab-item') + '-' + labItemAddress(item.address).toLowerCase() + '.arc2');
};

function renderRomLabItems(resetSearch) {
  const ctx = state.ctx;
  if (state.labItemScan?.rom !== ctx.rom) {
    const [start, end] = SV.region(ctx.editionId);
    state.labItemScan = { rom: ctx.rom, items: LI.scan(ctx.rom.subarray(start, end), start, C) };
  }
  const originals = state.labItemScan.items;
  renderLabItems($('romLabItems'), originals, (original, button) => {
    const current = state.labItemEdits.get(original.address)?.edited || original;
    openLabItem(current, edited => {
      if (state.ctx !== ctx || !matchingBytes(ctx.rom, original)) throw new Error('The ROM slot has changed. Reopen the item to edit it.');
      if (edited.bytes.every((value, i) => value === original.bytes[i])) state.labItemEdits.delete(edited.address);
      else state.labItemEdits.set(edited.address, { original, edited });
      if (!edited.bytes.every((value, i) => value === current.bytes[i]))
        measure('edit', 'rom_lab_item');
      devRender();
    }, button);
  }, resetSearch, original => state.labItemEdits.get(original.address)?.edited || original);
}

// ------------------------------------------------------------- loading
const myLabTabs = Array.from($('myLabTabs').querySelectorAll('[role="tab"]'));
function showMyLabTab(tab) {
  if (tab.getAttribute('aria-selected') !== 'true') {
    const tool = tab.id.slice('myLabTab'.length).toLowerCase();
    measure('feature_view', 'workspace_' + (tool === 'zh' ? 'translate' : tool));
  }
  for (const button of myLabTabs) {
    const active = button === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(button.getAttribute('aria-controls')).hidden = !active;
  }
  rememberNavigation({ lab: tab.id });
  $('labHeading').textContent = tab.textContent;
  $('labTool').value = tab.id;
  if (tab.id === 'myLabTabGarden') renderMyLabSlots();
  if (tab.id === 'myLabTabSprites') renderMyLabSprite();
  if (tab.id === 'myLabTabZh') renderZhPanel(true);
}
for (const tab of myLabTabs) tab.onclick = () => showMyLabTab(tab);

function renderZhPanel(lab) {
  const prefix = lab ? 'myLabZh' : 'zh';
  const rom = lab ? myLabRom?.rom : state.ctx?.rom;
  const text = $(prefix + 'Text'), menu = $(prefix + 'Menu'), run = $(prefix + 'Run');
  run.disabled = true;
  if (!rom) { text.textContent = t("Open a ROM first"); menu.textContent = '—'; return; }
  if (!ZH) { text.textContent = t("Converter unavailable"); menu.textContent = '—'; return; }
  const info = ZH.inspect(rom);
  if (!info.supported) {
    text.textContent = t("Unsupported ROM");
    menu.textContent = '—';
    $(prefix + 'Status').textContent = info.reason ? t(info.reason) : t("The Chinese text archive could not be checked.");
    return;
  }
  const distinct = info.archives.reduce((n, archive) => n + archive.simplifiedDistinct, 0);
  text.textContent = info.needsConversion ? t("Translation available · {v1} simplified glyphs", { v1: distinct }) :
    info.alreadyTraditional ? t("Traditional Chinese detected") : t("No Simplified Chinese text detected");
  if (lab) {
    menu.textContent = { installed: t("Already installed"), available: t("Will be added on export"), unsupported: t("Unsupported firmware layout") }[info.runtimeLanguage];
  } else {
    let entry;
    try { entry = window.ParamixSettings.inspect(rom); } catch (_) { entry = null; }
    menu.textContent = entry ? (entry.flags & 1 ? t("Already installed") : t("Not installed")) : t("Not available for this firmware");
  }
  run.disabled = !info.checksumsOk || !info.signatureOk;
  run.textContent = info.alreadyTraditional ? t("Refresh Translated ROM") : t("Create Translated ROM");
  $(prefix + 'Status').textContent = info.checksumsOk ? '' : t("Archive checksums are invalid. Conversion is unavailable.");
}

async function runZh(lab) {
  const prefix = lab ? 'myLabZh' : 'zh', rom = lab ? myLabRom?.rom : state.ctx?.rom;
  if (!rom || !ZH) return;
  const status = $(prefix + 'Status'), button = $(prefix + 'Run');
  button.disabled = true;
  status.textContent = t("Converting Chinese text and glyphs, then checking the new ROM…");
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    const variant = $(prefix + 'Variant').value, font = $(prefix + 'Font').value;
    const result = ZH.patch(rom, { variant, font });
    const issues = ZH.verify(rom, result.rom);
    if (issues.length) throw new Error('Output verification failed: ' + issues.join('; '));
    const name = romExportName(sourceEdition()?.key, [result.fileSuffix]);
    download(result.rom, name);
    measure('edit', 'translate_rom');
    const count = result.report.stats.stringsChanged;
    status.textContent = t("Verified {v1} · {v2} Chinese strings converted. Open the downloaded ROM in Workspace to inspect or write the translation. The current workspace still uses the original file.", { v1: name, v2: count });
  } catch (error) { status.textContent = em(error); }
  finally { button.disabled = false; }
}
$('zhRun').onclick = () => runZh(false);
$('myLabZhRun').onclick = () => runZh(true);

for (const link of document.querySelectorAll('a[href="#license"]')) {
  link.onclick = () => { $('creditsNotices').open = true; };
}

const myLabFields = { 1: 'Land', 2: 'Water', 3: 'Sky', 4: 'Forest', 5: 'Tropical', 6: 'Ice',
  7: 'Cosmic', 8: 'New Tamagotchi', 9: 'Tamagotchi' };
const myLabFlashImage = () => myLabRom?.menuDraft?.flashImage || myLabRom?.flashImage;
const MY_LAB_SAVE_EXT = '.tamastate';
const myLabSaveView = () => myLabRom.saveDraft || myLabRom;
const myLabFileBase = () => myLabRom.name.replace(/\.[^.]+$/, '');
function myLabRomWithSave(image) {
  if (!myLabRom.saveDraft) return image;
  const out = new Uint8Array(image);
  out.set(myLabRom.saveDraft.data, ML.DEVICE_SAVE_FIRST);
  return out;
}
function currentScreenFitSupport(ctx) {
  if (!ctx.screenFitSupport.supported) return ctx.screenFitSupport;
  return ctx.portDraft?.screenFitSupport || ctx.menuDraft?.screenFitSupport || ctx.screenFitSupport;
}
function selectedScreenFit(ctx) {
  return currentScreenFitSupport(ctx).supported ? ctx.screenFit : null;
}
function myLabScreenFitChanged() {
  return myLabRom.menu.mode === 'paradise' && MLM.screenFitChanged(myLabRom.rom, selectedScreenFit(myLabRom));
}
function myLabOutputImage(base, keepSave = false) {
  if (myLabRom.portDraft || myLabRom.menu.mode === 'paradise') {
    base = MLM.withScreenFit(base, selectedScreenFit(myLabRom));
  }
  const edited = ML.applySpriteChanges(base, myLabRom.spriteChanges[1], C, myLabRom.spriteChanges[0]);
  if (myLabRom.spriteChanges[1].size && ML.isFlashImage(edited, C)) MLM.installGarden(edited);
  return keepSave ? edited : myLabRomWithSave(edited);
}
function myLabName(character) {
  return romDisplayName(myLabRom.rom, character.name) || visHex(character.id);
}
function myLabChoices(id, choices, fallback) {
  const select = $(id), selected = select.value;
  select.replaceChildren();
  for (const [value, label] of choices) visAddChoice(select, String(value), label);
  if (Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  else if (fallback !== undefined) select.value = String(fallback);
}
function myLabFieldChoices(id, fields) {
  myLabChoices(id, [['', t('myLabAllFields')], ...Array.from(new Set(fields)).sort((a, b) => a - b)
    .map(field => [field, romField(myLabRom.rom, field, myLabFields[field])])]);
}
function myLabStatus(status) {
  return t(status === 'empty' ? 'myLabEmpty' : 'myLabUnreadable');
}
function myLabUsedFlash(rom) {
  let used = 0;
  for (let offset = 0; offset < rom.length; offset += 0x1000) {
    const sector = rom.subarray(offset, offset + 0x1000);
    if (sector.some(byte => byte !== 0xFF)) used += sector.length;
  }
  return used;
}
function renderMyLabOverview() {
  const { rom, menuDraft, menuBusy, menuCurrent, menuAction, portDraft, usedFlash } = myLabRom;
  const edition = sourceEdition();
  const details = $('myLabInfo');
  details.replaceChildren();
  for (const [label, value] of [
    ['Edition', edition.name],
    ['Sprites', String(myLabRom.archives[1].length)],
    ['Characters', String(myLabRom.characters.size)],
    ['Garden saves', String(myLabRom.slots.filter(slot => slot.bytes).length) + ' / ' + myLabRom.slots.length],
    ['Save pages', String(myLabRom.pages.filter(page => page.status === 'ready').length) + ' / ' + myLabRom.pages.length],
  ]) {
    const item = document.createElement('span');
    item.append(t(label) + ': ');
    const strong = document.createElement('b'); strong.textContent = value; item.append(strong);
    if (label === 'Edition') markEdition(strong, value, edition.key);
    details.append(item);
  }
  const status = menuDraft ? 'myLabMenuDraft' : menuBusy ? 'myLabMenuChecking' :
    menuCurrent ? 'myLabMenuCurrent' : menuAction === 'update' ? 'myLabMenuAvailable' : null;
  $('myLabMenuPlan').textContent = status ? t(status) : $('myLabMenuInfo').textContent;
  const updateAvailable = status === 'myLabMenuAvailable';
  $('myLabUpdateNotice').hidden = !updateAvailable;
  $('myLabMenuChip').parentElement.hidden = updateAvailable;
  $('myLabMenuChip').className = 'chip ' + (menuDraft ? 'new' : menuCurrent ? 'keep' : 'off');
  renderFlashLayout($('myLabLayoutBar'), $('myLabLayoutLegend'), [
    ['fw', t('Firmware and assets'), ML.DEVICE_SAVE_FIRST],
    ['slots', t('Device data and Garden'), ML.APPDATA_FIRST - ML.DEVICE_SAVE_FIRST],
    ['save', t('Save pages'), ML.DEVICE_SAVE_END - ML.APPDATA_FIRST],
    ['resv', t('Other flash'), rom.length - ML.DEVICE_SAVE_END],
  ], rom.length);
  const used = portDraft?.usedFlash ?? menuDraft?.usedFlash ?? usedFlash;
  const percent = used / rom.length * 100;
  $('myLabFlashUsed').style.setProperty('--end', percent.toFixed(2) + '%');
  $('myLabFlashMeter').setAttribute('aria-valuenow', percent.toFixed(2));
  $('myLabFlashUsage').textContent = t('myLabFlashUsage', {
    pct: formatNumber(percent, 1),
    used: MB(used), total: MB(rom.length),
  });
}
function renderMenuList(id, entries) {
  $(id).replaceChildren(...entries.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}
function selectComputerEntry(index) {
  const rows = Array.from($('myLabMenuEntries').children);
  if (!rows.length) return;
  const selected = (index + rows.length) % rows.length;
  myLabRom.computerEntry = selected;
  rows.forEach((row, i) => {
    row.hidden = Math.floor(i / 4) !== Math.floor(selected / 4);
    row.classList.toggle('current', selected === i);
    if (selected === i) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
}
$('computerPrev').onclick = () => selectComputerEntry(myLabRom.computerEntry - 1);
$('computerNext').onclick = () => selectComputerEntry(myLabRom.computerEntry + 1);
$('computerViewport').onkeydown = event => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  selectComputerEntry(myLabRom.computerEntry + (event.key === 'ArrowUp' ? -1 : 1));
};
$('myLabReviewUpdate').onclick = () => {
  showMyLabTab($('myLabTabMenu'));
  $('myLabMenuSwitch').focus();
  $('myLabMenuActions').scrollIntoView({ block: 'center' });
};
function renderMyLabMenu() {
  const { menu } = myLabRom.menuDraft || myLabRom;
  const action = myLabRom.menuAction;
  $('myLabMenuActions').hidden = !action || myLabRom.menuCurrent;
  const toggle = $('myLabMenuSwitch');
  toggle.checked = !!myLabRom.menuDraft;
  toggle.disabled = !!myLabRom.menuBusy;
  $('myLabMenuSwitchLabel').textContent = action === 'update' ? t("Include ParaLab Menu Update") : t("Include ParaLab Menu");
  $('myLabMenuHint').textContent = myLabRom.menuBusy ? t('myLabMenuChecking') :
    myLabRom.menuDraft ? t("Included in the next ROM export.") : t(action === 'update' ? 'myLabRefreshHint' : 'myLabInstallHint');
  const menuLabel = { stock: 'myLabStock', computer: 'myLabComputer',
    settings: 'myLabSettings', boot: 'myLabBoot', paradise: 'myLabParadise' }[menu.mode];
  const nativeLabel = ['computer', 'settings'].includes(menu.mode) && displayGameText(RL.term(myLabRom.rom, menu.mode, gameLocale()));
  $('myLabMenuInfo').textContent = nativeLabel ? nativeLabel + ' → ParaLab' : t(menuLabel);
  const labels = ['stock', 'computer', 'settings'].includes(menu.mode) && menu.rows.map(id => romDisplayName(myLabRom.rom, id + 1)).filter(Boolean);
  if (myLabRom.menuCurrent) $('myLabMenuInfo').textContent += ' · ' + t('myLabMenuCurrent');
  $('myLabMenuDetail').hidden = !menu.size;
  $('myLabMenuDetail').textContent = menu.size ? t('myLabMenuInstalled', { n: menu.size / 1024, crc: t(menu.valid ? 'myLabCrcOk' : 'myLabCrcBad') }) : '';
  $('myLabMenuStatusHeading').textContent = myLabRom.menuDraft ? t("Menu After Export") : t("Menu in Loaded ROM");
  $('myLabMenuContents').hidden = !labels?.length;
  $('myLabEntriesHeading').textContent = myLabRom.menuDraft ? t("Computer Menu After Export") : t("Computer Menu Entries");
  renderMenuList('myLabMenuEntries', labels || []);
  if (labels?.length) {
    selectComputerEntry(myLabRom.previewMenu === menu ? myLabRom.computerEntry : menu.mode === 'computer' ? labels.length - 1 : 0);
    myLabRom.previewMenu = menu;
  }
  renderMyLabOverview();
}
function renderMyLabSave() {
  const { latest, pages, data } = myLabSaveView();
  $('myLabSaveInfo').textContent = latest ? t('myLabSaveInfo', {
    n: pages.filter(page => page.status === 'ready').length, seq: latest.sequence,
  }) : t('myLabSaveNone');
  const choices = pages.map(page => [page.index, [
    t('myLabPageNumber', { n: page.index + 1 }),
    page === latest ? t('myLabCurrent') : page.status === 'ready' ? '' : myLabStatus(page.status),
  ].filter(Boolean).join(' · ')]);
  myLabChoices('myLabSavePage', choices, latest?.index ?? 0);
  $('myLabSaveExport').disabled = !latest;
  $('myLabSaveDelete').disabled = !data.some(byte => byte !== 0xFF);
  $('myLabSaveUndo').hidden = !myLabRom.saveDraft;
  renderMyLabSavePage();
}
function myLabSelectedPage() {
  const page = myLabSaveView().pages[Number($('myLabSavePage').value)];
  return page?.status === 'ready' ? page.bytes : null;
}
function renderMyLabSavePage() {
  const page = myLabSelectedPage();
  $('myLabSaveBackup').disabled = !page;
  const info = page && ML.saveInfo(page);
  const selected = myLabSaveView().pages[Number($('myLabSavePage').value)];
  $('myLabPageInfo').textContent = info ? [
    t('myLabSequence', { n: selected.sequence }),
    t('myLabSaveSummary', { p: info.points, l: info.level, n: info.count }),
  ].join(' · ') : '';
}
function renderMyLabChangeStatus() {
  const portReady = myLabScreenFitChanged() || myLabRom.portDraft || (myLabRom.menu.mode === 'paradise' && myLabRom.menuDraft);
  $('myLabChangeStatus').textContent = portReady ? t('myLabPortDone') : myLabRom.saveDraft ? t('myLabSaveDirty') :
    myLabRom.menuDraft ? t('myLabDirty') : myLabRom.spriteChanges.some(edits => edits.size) ? t('myLabSpriteDirty') : '';
}
let myLabCardObserver;
function renderMyLabCharacters(resetPose = false) {
  const characters = Array.from(myLabRom.characters.values(), ({ character }) => character);
  myLabFieldChoices('myLabCharacterField', characters.map(character => character.field));
  const field = Number($('myLabCharacterField').value), query = $('myLabCharacterSearch').value.trim().toLowerCase();
  const names = characters.filter(character => !field || character.field === field)
    .map(character => [character.id, myLabName(character)])
    .filter(([id, name]) => !query || [name, String(id), visHex(id)].some(value => value.toLowerCase().includes(query)))
    .sort((a, b) => a[1].localeCompare(b[1], locale()));
  const ctx = myLabRom, grid = $('myLabCharacterGrid');
  if (!names.some(([id]) => id === ctx.characterId)) ctx.characterId = names[0]?.[0];

  myLabCardObserver?.disconnect();
  myLabCardObserver = new IntersectionObserver((entries, observer) => {
    if (observer !== myLabCardObserver || ctx !== myLabRom) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      observer.unobserve(card);
      try {
        const bytes = VIS.buildRomGhost(ctx.characters.get(Number(card.dataset.character)), C);
        const [large, small] = visCharacterPoses(bytes, visSpriteSheets(bytes), true);
        const portrait = large[0] || small[0];
        if (portrait) card.querySelector('.stage').append(imgToCanvas(portrait, 2));
      } catch (_) {
        // Keep the named tile usable so the detail view can report the error.
      }
    }
  }, { rootMargin: '180px' });

  const cards = names.map(([id, name]) => {
    if (ctx.characterCards.has(id)) {
      const card = ctx.characterCards.get(id);
      const caption = card.querySelector('b');
      caption.lang = locale();
      card.title = caption.textContent = name;
      return card;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile';
    button.dataset.character = id;
    button.innerHTML = '<div class="stage" aria-hidden="true"></div><div class="cap"><b></b><br><span></span></div>';
    const caption = button.querySelector('b');
    caption.lang = locale();
    button.title = caption.textContent = name;
    button.querySelector('.cap span').textContent = visHex(id);
    button.onclick = () => {
      $('labSheetStatus').textContent = '';
      ctx.characterId = id;
      $('myLabCharacterPreview').showModal();
      renderMyLabCharacter(true);
    };
    ctx.characterCards.set(id, button);
    return button;
  });
  grid.replaceChildren(...cards);
  for (const card of cards) {
    if (!card.querySelector('canvas')) myLabCardObserver.observe(card);
    const selected = Number(card.dataset.character) === ctx.characterId;
    card.classList.toggle('sel', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  $('labSearchEmpty').hidden = cards.length > 0;
  if ($('myLabCharacterPreview').open) renderMyLabCharacter(resetPose);
}
function renderMyLabCharacter(resetPose = false) {
  const visitor = myLabRom.characters.get(myLabRom.characterId);
  for (const card of $('myLabCharacterGrid').children) {
    const selected = Number(card.dataset.character) === myLabRom.characterId;
    card.classList.toggle('sel', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  const zoom = Number($('myLabCharacterZoom').value), pose = $('myLabCharacterPose'), image = $('myLabCharacterImage');
  const cached = myLabRom.characterPreview;
  const prefix = 'myLabCharacter';
  const paused = visAnimations.get(prefix)?.paused ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  visStopAnimation(prefix);
  image.hidden = true;
  $('myLabCharacterPlayback').disabled = true;
  $('myLabCharacterFrame').textContent = '';
  try {
    if (visitor && cached?.visitor !== visitor) {
      const sheet = C.groupSheet(visitor.sprites.map(i => C.spriteDecode(visitor.entries[i]).subs));
      imgToCanvas(sheet, 1, $('labSheetCanvas'));
      const bytes = VIS.buildRomGhost(visitor, C);
      myLabRom.characterPreview = { visitor, bytes, sheet, poses: visCharacterPoses(bytes, visSpriteSheets(bytes)) };
      resetPose = true;
    }
    const frames = visitor ? myLabRom.characterPreview.poses[zoom] : [];
    if (!frames.length) throw new Error(t(visitor ? 'myLabUnreadable' : 'myLabNoCharacters'));
    pose.disabled = false;
    pose.max = frames.length;
    pose.value = resetPose ? 1 : Math.max(1, Math.min(frames.length, Math.trunc(pose.valueAsNumber) || 1));
    const playback = { canvas:image, timer:null, paused, frameInput:pose };
    visAnimations.set(prefix, playback);
    image.hidden = false;
    visUseFrames(prefix, playback, frames, Number(pose.value) - 1);
    // Enlarge the logical canvas without changing the size of the sprite frames.
    image.style.width = image.width * 3 + 'px';
    const { character } = visitor;
    $('myLabCharacterInfo').textContent = [myLabName(character), romField(myLabRom.rom, character.field, myLabFields[character.field]), visHex(character.id)].join(' · ');
  } catch (error) {
    pose.disabled = true;
    $('myLabCharacterInfo').textContent = em(error);
  }
  $('labSheetDownload').disabled = $('labSheetReplace').disabled = $('myLabCharacterExport').disabled = image.hidden;
}
function myLabSlotLabel(slot) {
  const label = t('myLabSlot', { n: slot.slot + 1 });
  if (slot.status !== 'ready') return label + ' · ' + myLabStatus(slot.status);
  return [label, visGhostDisplayName(visView(slot.bytes), 0x12, myLabRom.rom), visHex(slot.id)].filter(Boolean).join(' · ');
}
function gardenPortrait(bytes) {
  const poses = visCharacterPoses(bytes, visSpriteSheets(bytes), true);
  return poses[0][0] || poses[1][0];
}
function renderMyLabSlots() {
  if ($('myLabGarden').hidden) return;
  const { slots } = myLabSaveView();
  if (myLabRom.displayedSlots === slots && myLabRom.displayedSlotsLocale === locale()) return;
  myLabRom.displayedSlotsLocale = locale();
  myLabRom.displayedSlots = slots;
  const grid = $('myLabGardenSlots');
  grid.replaceChildren(...slots.map(slot => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tile';
    card.innerHTML = '<span class="stage"></span><span class="cap"><b></b><br><span></span></span>';
    card.querySelector('b').textContent = t('myLabSlot', { n: slot.slot + 1 });
    card.querySelector('.cap span').textContent = slot.bytes ?
      visGhostDisplayName(visView(slot.bytes), 0x12, myLabRom.rom) || visHex(slot.id) : myLabStatus(slot.status);
    card.disabled = !slot.bytes;
    if (slot.bytes) {
      const portrait = gardenPortrait(slot.bytes);
      if (portrait) card.querySelector('.stage').append(imgToCanvas(portrait, 2));
      card.onclick = () => openGardenSlot(slot);
    }
    return card;
  }));
}
function openGardenSlot(slot) {
  myLabRom.gardenSlot = slot;
  myLabRom.gardenDefaultPalette = null;
  myLabRom.gardenPalette ??= C.characterPaletteVariants(myLabRom.archives[1])?.bytes;
  const choices = [...myLabRom.characters.values()].filter(v => v.character.stage === 5)
    .map(v => [v.character.id, myLabName(v.character)]).sort((a,b) => a[1].localeCompare(b[1], locale()));
  const bodyName = choices.find(([id]) => id === slot.id)?.[1] || visHex(slot.id);
  const current = t('myLabCurrent') + ' · ';
  myLabChoices('gardenBody', [['', current + bodyName], ...choices]);
  const colors = paletteNames(), originalPalette = t('visOriginalPalette');
  myLabChoices('gardenColor', [['', current + (colors[slot.bytes[0x10]] || originalPalette)], [255, originalPalette],
    ...(myLabRom.gardenPalette ? colors.map((name, i) => [i, name]) : [])]);
  $('gardenEyes').replaceChildren();
  $('gardenColor').value = $('gardenBody').value = '';
  $('myLabPortraitLabel').textContent = myLabSlotLabel(slot);
  $('gardenEditor').showModal();
  updateGardenPreview(true);
}
function updateGardenPreview(bodyChanged) {
  const ctx = myLabRom, slot = ctx.gardenSlot;
  ctx.gardenPreview = null;
  $('gardenApply').disabled = $('myLabExport').disabled = true;
  const image = $('myLabPortrait');
  image.hidden = true;
  try {
    const body = ctx.characters.get(Number($('gardenBody').value));
    if (bodyChanged) {
      const base = body ? VIS.buildRomGhost(body, C) : slot.bytes;
      const target = VIS.ghostAppearanceOptions(base, C).eyes;
      ctx.gardenEyes = new Map();
      const options = [];
      for (const visitor of ctx.characters.values()) {
        const eyes = VIS.romEyes(visitor, target, C);
        if (!eyes) continue;
        ctx.gardenEyes.set(eyes.id, eyes);
        options.push([eyes.id, myLabName(visitor.character)]);
      }
      options.sort((a,b) => a[1].localeCompare(b[1], locale()));
      const selected = $('gardenEyes').value;
      const previousLabel = $('gardenEyes').selectedOptions[0]?.textContent;
      if (selected && !ctx.gardenEyes.has(Number(selected)))
        options.push([selected, previousLabel]);
      const eyeId = visView(slot.bytes).getUint16(0x0e, true);
      const currentEyes = ctx.characters.get(eyeId);
      myLabChoices('gardenEyes', [['', t('myLabCurrent') + ' · ' +
        (currentEyes ? myLabName(currentEyes.character) : visHex(eyeId))], ...options], '');
      $('gardenEyes').disabled = !options.length;
      $('gardenDefaultEyes').disabled = !ctx.characters.has(body?.character.id ?? slot.id);
    }
    const eyeChoice = $('gardenEyes').value;
    let eyes = ctx.gardenEyes.get(Number(eyeChoice));
    if (eyeChoice && !eyes) {
      const donor = ctx.characters.get(Number(eyeChoice));
      if (!donor || donor.character.id !== (body?.character.id ?? slot.id))
        throw new Error('These eyes do not fit this body. Choose compatible eyes or use the body default.');
      eyes = { id: donor.character.id, sprites: [1, 4].map(part => donor.entries[donor.sprites[part]]) };
    }
    const tint = $('gardenColor').value;
    const changed = !!(body || eyes || tint !== '');
    const bytes = changed ? ML.gardenAppearance(slot.bytes, body, eyes, tint === '' ? null : Number(tint),
      ctx.gardenPalette, C, VIS, ctx.gardenDefaultPalette) : slot.bytes;
    const portrait = gardenPortrait(bytes);
    if (!portrait) throw new Error('No readable portrait for this appearance.');
    imgToCanvas(portrait, 3, image);
    image.hidden = false;
    ctx.gardenPreview = bytes;
    $('myLabExport').disabled = false;
    $('gardenApply').disabled = !changed;
    $('gardenPreviewStatus').textContent = changed ? t("Preview · Apply to include this appearance in your next ROM export.") : '';
  } catch (error) {
    $('gardenPreviewStatus').textContent = em(error);
  }
}
$('gardenBody').onchange = () => updateGardenPreview(true);
$('gardenEyes').onchange = () => updateGardenPreview(false);
$('gardenDefaultEyes').onclick = () => {
  const select = $('gardenEyes'), slot = myLabRom.gardenSlot;
  const id = Number($('gardenBody').value) || slot.id;
  if (![...select.options].some(option => option.value === String(id)))
    visAddChoice(select, String(id), myLabName(myLabRom.characters.get(id).character));
  select.disabled = false;
  select.value = String(id);
  updateGardenPreview(false);
};
$('gardenColor').onchange = () => {
  const ctx = myLabRom, slot = ctx.gardenSlot;
  ctx.gardenDefaultPalette = null;
  if ($('gardenColor').value === '255') {
    const donor = ctx.characters.get(Number($('gardenBody').value) || slot.id);
    const bytes = donor ? VIS.buildRomGhost(donor, C) : slot.bytes;
    const palettes = new Uint8Array(64);
    for (const [i, part] of [0, 2].entries()) {
      const at = visView(bytes).getUint32(0x110 + 8 * part, true);
      const offset = at + visView(bytes).getUint16(at + 18, true);
      palettes.set(bytes.subarray(offset, offset + 32), i * 32);
    }
    ctx.gardenDefaultPalette = palettes;
    $('gardenColor').selectedOptions[0].textContent = t("Default · {v1}", { v1: (donor ? myLabName(donor.character) : visHex(slot.id)) });
  }
  updateGardenPreview(false);
};
$('gardenDefaultColor').onclick = () => {
  $('gardenColor').value = '255';
  $('gardenColor').onchange();
};
$('gardenApply').onclick = () => {
  const { gardenSlot, gardenPreview, rom } = myLabRom;
  if (!gardenPreview || myLabSaveView().slots[gardenSlot.slot] !== gardenSlot) return;
  try {
    const draft = ML.editGardenSlot(rom, myLabSaveView().data, gardenSlot.slot, gardenPreview, VIS);
    $('gardenEditor').close();
    myLabSetSaveDraft(draft);
    measure('edit', 'garden');
    devRender();
    $('myLabGardenSlots').children[gardenSlot.slot].focus();
  } catch (error) { $('gardenPreviewStatus').textContent = em(error); }
};
const SPRITES_PER_PAGE = 120;
function syncSpritePager(prefix, start, total) {
  const pages = Math.ceil(total / SPRITES_PER_PAGE), page = Math.floor(start / SPRITES_PER_PAGE);
  const select = $(prefix + 'Page');
  if (select.options.length !== pages) {
    select.replaceChildren();
    for (let i = 0; i < pages; i++) visAddChoice(select, String(i), (i + 1) + ' / ' + pages);
  }
  select.value = String(page);
  $(prefix + 'Prev').disabled = page === 0;
  $(prefix + 'Next').disabled = page + 1 >= pages;
  $(prefix + 'Range').textContent = total ? t("#{v1}–{v2} · {v3} sprites", { v1: start, v2: (Math.min(start + SPRITES_PER_PAGE, total) - 1), v3: total.toLocaleString(locale()) }) : t("0 sprites");
}
function bindSpritePager(prefix, changePage) {
  const select = $(prefix + 'Page');
  select.onchange = () => changePage(Number(select.value));
  $(prefix + 'Prev').onclick = () => changePage(Number(select.value) - 1);
  $(prefix + 'Next').onclick = () => changePage(Number(select.value) + 1);
}
let myLabSpriteObserver;
function myLabSpriteCount(entry) {
  const h = C.spriteHeader(entry);
  const cols = Math.max(1, h.iw), rows = Math.max(1, h.ih);
  if (!h.sw || !h.sh || h.sw * cols > 512 || h.sh * rows > 512) return 0;
  return Math.floor(h.numSprites / (cols * rows));
}
function spriteHasPixels(image) {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]) return true;
  return false;
}
function renderMyLabSprite(resetFrame = false) {
  const entries = myLabRom.archives[Number($('myLabArchive').value)];
  const sprite = $('myLabSprite'), frame = $('myLabFrame'), image = $('myLabSpriteImage');
  const index = Math.min(entries.length - 1, Math.max(0, Math.trunc(sprite.valueAsNumber) || 0));
  const start = index - index % SPRITES_PER_PAGE;
  const end = Math.min(start + SPRITES_PER_PAGE, entries.length);
  const grid = $('myLabSpriteGrid');
  if (myLabRom.spritePage !== entries[start]) {
    myLabSpriteObserver?.disconnect();
    grid.replaceChildren();
    myLabRom.spritePage = entries[start];
    function paint(button) {
      if (button.dataset.frame !== undefined) return;
      const entry = entries[Number(button.dataset.index)], stage = button.querySelector('.stage');
      button.dataset.frame = '0';
      try {
        const count = myLabSpriteCount(entry), samples = Math.min(count, 32);
        for (let j = 0; j < samples; j++) {
          const picture = C.spriteDecode(entry, 0, true, j).subs[0];
          if (!spriteHasPixels(picture)) continue;
          stage.append(imgToCanvas(picture));
          button.dataset.frame = String(j);
          return;
        }
        stage.dataset.spriteStatus = count && count === samples ? 'Transparent' : 'No preview';
      } catch (_) { stage.dataset.spriteStatus = 'myLabUnreadable'; }
      stage.textContent = t(stage.dataset.spriteStatus);
    }
    myLabSpriteObserver = new IntersectionObserver((items, obs) => {
      if (obs !== myLabSpriteObserver) return;
      for (const item of items) if (item.isIntersecting && item.target.isConnected) { paint(item.target); obs.unobserve(item.target); }
    }, { rootMargin: '300px' });
    const cards = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile';
      button.dataset.index = i;
      button.innerHTML = '<span class="stage"></span><span class="cap"><b></b></span>';
      button.querySelector('b').textContent = '#' + i;
      button.onclick = () => {
        paint(button);
        sprite.value = i;
        $('myLabSpritePreview').showModal();
        renderMyLabSprite(true);
      };
      cards.append(button);
      myLabSpriteObserver.observe(button);
    }
    grid.append(cards);
    resetFrame = true;
  }
  syncSpritePager('myLabSprites', start, entries.length);
  for (const stage of grid.querySelectorAll('[data-sprite-status]')) stage.textContent = t(stage.dataset.spriteStatus);
  Array.from(grid.children).forEach((button, i) => button.setAttribute('aria-pressed', String(i + start === index)));
  sprite.max = entries.length - 1;
  sprite.value = index;
  if (!$('myLabSpritePreview').open) return;
  $('myLabSpriteTitle').textContent = t("Sprite #{v1}", { v1: index });
  const entry = entries[index], count = myLabSpriteCount(entry);
  frame.disabled = count < 2;
  frame.max = Math.max(0, count - 1);
  frame.value = resetFrame ? grid.children[index - start].dataset.frame :
    Math.max(0, Math.min(Number(frame.max), Math.trunc(frame.valueAsNumber) || 0));
  try {
    if (!count) throw new Error(t('myLabUnreadable'));
    const picture = C.spriteDecode(entry, 0, true, Number(frame.value)).subs[0];
    imgToCanvas(picture, 2, image);
    image.hidden = false;
    $('myLabSpriteStatus').textContent = t('myLabSpriteInfo', { w: picture.w, h: picture.h, n: count }) +
      (spriteHasPixels(picture) ? '' : ' · ' + t('Transparent'));
  } catch (_) {
    image.hidden = true;
    $('myLabSpriteStatus').textContent = t('myLabUnreadable');
  }
}
bindSpritePager('myLabSprites', page => {
  $('myLabSprite').value = page * SPRITES_PER_PAGE;
  renderMyLabSprite(true);
});

const myLabSpriteFolders = ['boot', 'main'];
const myLabSpriteZipLimits = { bytes: 128 * 1024 ** 2, memberBytes: 32 * 1024 ** 2, entries: 4096 };
function myLabSheetLayout(entry) {
  const h = C.spriteHeader(entry);
  const cols = Math.max(1, h.iw), rows = Math.max(1, h.ih);
  const w = h.sw * cols, height = h.sh * rows, count = h.numSprites / (cols * rows);
  if (!w || !height || !count || !Number.isInteger(count) || w * height * count > 0x1000000) {
    throw new Error(t('myLabUnreadable'));
  }
  const layout = C.sheetLayout(w, height, count);
  return { w, height, count, sheetWidth: w * layout.cols, sheetHeight: height * layout.rows };
}

function commitMyLabSprites(ctx, edits) {
  const main = edits[1];
  for (const [archive, changes] of edits.entries()) {
    for (const [index, entry] of changes) {
      if (entry === ctx.originalSprites[archive][index]) ctx.spriteChanges[archive].delete(index);
      else ctx.spriteChanges[archive].set(index, entry);
      ctx.archives[archive][index] = entry;
    }
  }
  if (main.size) {
    ctx.characterPreview = null;
    for (const [id, character] of ctx.characters) {
      if (character.sprites.some(index => main.has(index))) ctx.characterCards.get(id)?.querySelector('canvas')?.remove();
    }
    renderMyLabCharacters(true);
  }
  ctx.spritePage = null;
  if (!$('myLabSprites').hidden) renderMyLabSprite();
  renderMyLabChangeStatus();
  devRender();
}

function transferMyLabSprites(title, transfer) {
  const ctx = myLabRom;
  if (!ctx || ctx.spriteTransfer) return;
  ctx.spriteTransfer = true;
  return busy(t(title), () => transfer(ctx)).catch(error => {
    if (ctx === myLabRom) toast(em(error), true);
  }).finally(() => { ctx.spriteTransfer = false; });
}

async function exportMyLabSprites(ctx) {
  const files = [], skipped = [];
  const canvas = document.createElement('canvas');
  try {
    for (const [archive, entries] of ctx.archives.entries()) {
      for (const [index, entry] of entries.entries()) {
        if (index % 32 === 0) await globalThis.scheduler?.yield?.();
        if (ctx !== myLabRom) return;
        const name = 'my-lab/' + myLabSpriteFolders[archive] + '/' + sheetName('spr', index);
        try {
          myLabSheetLayout(entry);
          const { subs } = C.spriteDecode(entry, 0, true);
          imgToCanvas(C.sheetFromSubs(subs), 1, canvas);
          // Canvas toBlob can defer each individual encode to an idle browser task.
          const url = canvas.toDataURL('image/png'), comma = url.indexOf(',');
          if (comma === url.length - 1) throw new Error('Could not encode the image as PNG.');
          const base64 = url.slice(comma + 1);
          const data = Uint8Array.fromBase64 ? Uint8Array.fromBase64(base64) : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          files.push({ name, data });
        } catch (error) { skipped.push(t('wrongSize', { f: name, e: em(error) })); }
      }
    }
  } finally {
    canvas.width = canvas.height = 0;
  }
  if (ctx !== myLabRom) return;
  if (files.length) download(C.zipBuild(files), myLabFileBase() + '_sprites.zip', 'application/zip');
  if (skipped.length) toast(t('upSkip', { list: summarizeMyLabSpriteSkips(skipped) }), !files.length);
}

function summarizeMyLabSpriteSkips(skipped) {
  return skipped.slice(0, 6).join(', ') + (skipped.length > 6 ? ' … (' + skipped.length + ')' : '');
}

function matchingSpriteFrames(frames, current) {
  return frames.length === current.length && frames.every((frame, i) =>
    frame.w === current[i].w && frame.h === current[i].h &&
    frame.data.every((value, j) => value === current[i].data[j]));
}

async function importMyLabSprites(ctx, file) {
  if (file.size > myLabSpriteZipLimits.bytes) throw new Error('ZIP exceeds the import limit.');
  const zip = await C.zipRead(new Uint8Array(await file.arrayBuffer()), inflateRaw, myLabSpriteZipLimits);
  const edits = ctx.archives.map(() => new Map()), seen = new Set(), skipped = [];
  const parts = new Map();
  for (const character of ctx.characters.values()) {
    character.sprites.forEach((index, part) => parts.set(index, part));
  }
  let unchanged = 0;
  for (const { name, data } of zip) {
    if (ctx !== myLabRom) return;
    const match = /(?:^|\/)my-lab\/(boot|main)\/sprite_(\d+)\.png$/i.exec(name);
    if (!match) continue;
    const archive = myLabSpriteFolders.indexOf(match[1].toLowerCase()), index = Number(match[2]);
    const entry = ctx.archives[archive][index], key = archive + ':' + index;
    if (!entry || seen.has(key)) { skipped.push(name); continue; }
    seen.add(key);
    try {
      const { w, height, count, sheetWidth, sheetHeight } = myLabSheetLayout(entry);
      const png = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (png.byteLength < 33 || png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a ||
          png.getUint32(8) !== 13 || png.getUint32(12) !== 0x49484452) throw new Error(t('Choose a PNG image.'));
      if (png.getUint32(16) !== sheetWidth || png.getUint32(20) !== sheetHeight) {
        throw new Error(t('The PNG must be {width} × {height} pixels.', { width: sheetWidth, height: sheetHeight }));
      }
      const frames = C.subsFromSheet(await decodePng(new Blob([data], { type: 'image/png' })), w, height, count);
      const current = C.spriteDecode(entry, 0, true).subs;
      if (matchingSpriteFrames(frames, current)) { unchanged++; continue; }
      const original = ctx.originalSprites[archive][index];
      if (original !== entry && matchingSpriteFrames(frames, C.spriteDecode(original, 0, true).subs)) {
        edits[archive].set(index, original);
        continue;
      }
      const part = archive === 1 ? parts.get(index) : undefined;
      const options = { preservePaletteIndices: true };
      const replacement = ML.encodeSpriteSlot(entry, frames, C, part === undefined ? options : C.partOptions(part, options));
      if (matchingSpriteFrames(C.spriteDecode(replacement, 0, true).subs, current)) {
        unchanged++;
      } else {
        edits[archive].set(index, replacement);
      }
    } catch (error) { skipped.push(t('wrongSize', { f: name, e: em(error) })); }
  }
  if (ctx !== myLabRom) return;
  const count = edits[0].size + edits[1].size;
  if (count) {
    commitMyLabSprites(ctx, edits);
    measure('edit', 'sprite_sheet');
  }
  const result = [];
  if (count) result.push(t('upOk', { n: count }));
  if (unchanged) result.push(t('myLabSpriteZipUnchanged', { n: unchanged }));
  if (skipped.length) result.push(t('upSkip', { list: summarizeMyLabSpriteSkips(skipped) }));
  toast(result.join('\n') || t('myLabSpriteZipNoMatch'), !count && !unchanged);
}

function openMyLabSpriteZip(file) {
  return transferMyLabSprites('Importing Sprite Sheets', ctx => importMyLabSprites(ctx, file));
}
$('myLabSpriteZipExport').onclick = () => transferMyLabSprites('Exporting Sprite Sheets', exportMyLabSprites);
$('myLabSpriteZipImport').onclick = () => $('myLabSpriteZipFile').click();
$('myLabSpriteZipFile').onchange = event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) openMyLabSpriteZip(file);
};

function clearMyLabPreviews() {
  myLabCardObserver?.disconnect();
  myLabSpriteObserver?.disconnect();
  myLabCardObserver = myLabSpriteObserver = null;
  visStopAnimation('myLabCharacter');
  for (const id of ['myLabSpritePreview', 'gardenEditor', 'myLabCharacterPreview']) {
    if ($(id).open) $(id).close();
  }
  for (const id of ['myLabCharacterGrid', 'myLabSpriteGrid', 'myLabGardenSlots']) $(id).replaceChildren();
  for (const id of ['labSheetCanvas', 'myLabSpriteImage', 'myLabCharacterImage', 'myLabPortrait']) {
    $(id).width = $(id).height = 0;
  }
}
function showMyLabRom(ctx, name) {
  clearMyLabPreviews();
  closeDrawer();
  observer?.disconnect();
  $('gridFigs').replaceChildren();
  $('gridAll').replaceChildren();
  $('romLabItems').replaceChildren();
  clearDecodedSprites();
  const screenFitSupport = MLM.screenFitSupport(ctx.rom);
  myLabRom = Object.assign(ctx, {
    name,
    characterCards: new Map(),
    originalSprites: ctx.archives.map(entries => entries.slice()),
    spriteChanges: ctx.archives.map(() => new Map()),
    screenFitSupport,
    screenFit: screenFitSupport.supported && ctx.menu.mode === 'paradise' ? screenFitSupport.state : false,
    menuAction: MLM?.status(ctx.rom),
    usedFlash: myLabUsedFlash(ctx.rom),
  });
  state.ctx = null;
  state.changed.clear();
  state.labItemScan = state.labItemEdits = null;
  state.launchMap = state.poseSource = state.poseLayers = state.poseCache = null;
  $('myLabPortBackup').value = $('myLabPortKey').value = '';
  renderMyLabPort();
  $('btnPetClose').onclick();
  $('start').hidden = true;
  $('work').classList.remove('on');
  $('myLabRom').hidden = false;
  $('btnSave').disabled = false;
  setRomName(name);
  for (const id of ['myLabSavePage', 'myLabCharacterField']) $(id).replaceChildren();
  $('myLabCharacterSearch').value = '';
  $('myLabCharacterZoom').value = '0';
  $('myLabArchive').value = '1';
  const canCreateUpdate = myLabRom.menuAction === 'install';
  $('updateRomName').textContent = name;
  $('updateRequiresStock').hidden = canCreateUpdate;
  $('updateSourceRom').checked = canCreateUpdate;
  $('updateSourcePackage').checked = !canCreateUpdate;
  showUpdateSource();
  $('updatePackageActions').hidden = true;
  $('updatePatchStatus').textContent = $('updateRomStatus').textContent = '';
  $('myLabUpdateStatus').textContent = '';
  $('myLabUpdateExport').disabled = true;
  $('myLabUpdatePatch').disabled = true;
  $('myLabUartCreate').disabled = myLabRom.menuAction !== 'install';
  $('myLabSprite').value = 0;
  showMyLabTab(myLabTabs[0]);
  renderGameLabels();
  renderGiftChoices();
  renderMyLabMenu();
  renderMyLabSave();
  renderMyLabCharacters(true);
  renderMyLabSlots();
  renderMyLabChangeStatus();
  visRefreshRomVisitors();
  devRender();
  if (myLabRom.menuAction === 'update') void myLabPrepareMenu(myLabRom);
}
const romLoading = $('romLoading');
romLoading.addEventListener('cancel', event => event.preventDefault());
async function showRomStage(message) {
  $('romLoadingStage').textContent = message;
  await new Promise(resolve => setTimeout(resolve, 30));
}
async function loadRom(file, stayOnDevice = false) {
  if (romLoading.open || warnDeviceWrite()) return false;
  $('romLoadingFile').textContent = file.name;
  $('romLoadingStage').textContent = t("Reading the ROM file…");
  romLoading.showModal();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    await showRomStage(t("Identifying the edition and reading ROM data…"));
    const loaded = await openRomWorkspace(buf, file.name, stayOnDevice);
    if (loaded) {
      rememberNavigation({ file });
      measure('rom_open', stayOnDevice ? 'device_dump' : 'open_rom');
    }
    return loaded;
  } catch (error) {
    toast(t('notRom', { e: em(error) }), true);
    return false;
  } finally {
    romLoading.close();
  }
}
async function openRomWorkspace(buf, filename, stayOnDevice) {
  try {
    const lab = ML.openRom(buf, C, VIS);
    if (lab) { await showRomStage(t("Preparing the My Lab workspace…")); showMyLabRom(lab, filename); if (!stayOnDevice) showDestination('workspace', true); return true; }
  } catch (e) { toast(t('notRom', { e: em(e) }), true); return; }
  if (F.isClean(buf) || F.appKind(buf)) {
    toast(t("This ROM contains a legacy emulator or game program that this ParaLab build does not support. Use an unmodified Paradise ROM."), true);
    return;
  }
  let ctx;
  // CLEAN_ROM: a ROM without the Paradise (start device of this Studio): only the programs, no pictures or texts
  const clean = CLEAN_ROM && F.isClean(buf);
  if (clean) { const ed = F.edition(buf); ctx = { rom: buf, entries: [], files: [], groups: [], edition: ed ? (FL.EDITIONS[ed.id] || ed.id) : '?', editionId: ed?.id, limit: 0, clean: true }; }
  else try { ctx = C.openRom(buf); } catch (e) { toast(t('notRom', { e: em(e) }), true); return; }
  await showRomStage(t("Preparing the Paradise workspace…"));
  closeDrawer();
  ctx.sourceRom = buf;
  if (!stayOnDevice) showDestination('workspace', true);
  clearMyLabPreviews();
  myLabRom = null;
  $('romLabItems').replaceChildren();
  $('myLabRom').hidden = true;
  state.clean = clean; state.cleanInit = clean;
  $('btnPetClose').onclick();
  clearDecodedSprites();
  Object.assign(state, { ctx, name: filename, changed: new Map(), open: null, eyeOffsets: new Map(),
    labItemScan: null, labItemEdits: new Map() });
  // 1.7.3 test21 SPR_ALIGN: own Tama pictures of older versions with an odd length are padded (playdates failed at 90 %)
  if (!clean) for (const g of ctx.groups) for (let k = 0; k < 6; k++) { const f = C.spriteAlign(ctx.entries[g + k]); if (f) state.changed.set(g + k, f); }
  $('namesFind').value = '';
  $('start').hidden = true; $('work').classList.add('on'); $('btnSave').disabled = false;
  setRomName(filename);
  state.pmBios = undefined; state.pmKeys = null; state.abKeys = null;
  state.neonDonor = null;
  state.paraCleared = false;
  state.stampSet = null;
  state.emu = null; state.t7save = null; state.t7saveX = null; state.saveIn = null; state.emuRemove = false; state.doom = null; state.doomKeys = null; state.six = null; state.sixName = ''; state.sixWant = false; state.sixOff = false; state.petDirty = false; state.texts = new Map(); state.eyeShift = new Map(); state.mouthShift = new Map(); state.poseAdj = new Map(); state.poseCache = null; face.g = -1; state.dlcT = 'main'; state.figT = 'main'; state.dlcOpen = false; state.mainGuest = null; state.emuPack = (() => { const c = romEmuCfg(buf); return !!(c && c.version >= 5 && c.lzOff) && (!E.PACK_ASK || E.lzCount(buf, c.lzOff) > E.PACK_FEW); })();   // PACK_ASK: the 2 or 3 blocks every main TamaEmu packs do not mean "Pack the firmware" state.t18Main = null; state.t18Dirty = false; state.t18Pics = E.t18PicsRead(buf); state.t18PicsDirty = false; state.itemT = 'main'; state.progOpen = new Set(); state.mainPick = null; state.mainDirty = false; state.roomFree = null; state.paraMainTaken = false;
  state.labRelease = false; state.specialFood = false; state.labDonor = null;
  { const si = S6.sixInfo(buf); state.sixPlanet = si && si.version >= 5 ? si.planet : true; state.sixMenu = si && si.version >= 6 ? si.fieldMenu : true; }
  { const l = stubList(buf); const g = E.autoGet(buf, l); state.emuAuto = g === null ? E.autoGetOld(buf, l) : g; }
  { const c = E.emuClockGet(buf); state.emuClock = c === null ? true : c; }
  { const c = E.emuSessGet(buf); state.emuSess = c === null ? true : c; }   // 1.7.3 test7
  { const c = E.emuNfcGet(buf); state.emuNfc = c === null ? true : c; }
  state.emuOpt = E.emuOptGet(buf) || { vol: 0, dim: 0, off: 0 };
  { const fe = F.embedded(), f = fe && F.feldFind(buf, fe.stub);
    state.feld = !!(f && (f.flags & F.F_FIELDS)); state.bag = !!(f && (f.flags & F.F_BAG)); state.tama = !!(f && (f.flags & (F.F_TAMA | F.F_NEON_TAMA))); state.paramixShortcut = paramixShortcutOf(buf, f); state.gplay = !!(f && (f.flags & F.F_GPLAY)); state.saves = true;
    state.appsOnly = !!(f && (f.flags & F.F_APPS)); state.appsOnlyInit = state.appsOnly;
    state.feldInit = state.feld; state.bagInit = state.bag; state.tamaInit = state.tama; state.paramixShortcutInit = state.paramixShortcut; state.gplayInit = state.gplay; state.savesInit = true;
    state.launch = !!(f && f.version >= 2 && (f.flags & F.F_LAUNCH)); state.launchInit = state.launch; state.launchMap = null;
    state.t18Few = false; state.exitKey = EXIT_KEY ? exitGet(buf) : 0; state.exitKeyInit = state.exitKey; if ($('exitKey')) $('exitKey').value = String(state.exitKey);
    state.extras = f ? E.appsRead(buf, F.feldApps(buf, fe.stub).apps).map((x) => sessKeep(x, x.kind === 'tama' ? { kind: 'tama', guest: x.guest, dev: x.dev, clock: x.clock, nfc: x.nfc, opt: x.opt, pack: x.pack } : x.kind === 't18' ? { kind: 't18', fw: x.fw, clock: x.clock, opt: x.opt, keepOff: x.off } : x.kind === 'v1' ? { kind: 'v1', rom: x.rom, clock: x.clock } : x.kind === 'gb' ? { kind: 'gb', rom: x.rom, keys: x.keys, inv: x.inv, save: x.save } : x.kind === 'sms' ? { kind: 'sms', rom: x.rom, title: x.title, gg: x.gg, keys: x.keys, inv: x.inv, save: x.save } : x.kind === 'ab' ? { kind: 'ab', rom: x.rom, title: x.title, keys: x.keys, inv: x.inv, save: x.save } : x.kind === 'pm' ? { kind: 'pm', rom: x.rom, title: x.title, keys: x.keys, inv: x.inv, save: x.save, bios: x.bios } : x.kind === 'wolf' ? { kind: 'wolf', pack: x.pack, keys: x.keys, save: x.save } : x.kind === 'doom' ? { kind: 'doom', mcu: x.mcu, keys: x.keys, keys0: JSON.stringify(x.keys), save: x.save, name: x.name, region: x.region } : { rom: x.rom, figs: x.figs || [], clock: x.clock })) : []; state.extrasDirty = false;
    state.extrasUp = f ? extrasOld(buf, F.feldApps(buf, fe.stub).apps) : false;
    state.wolfInit = state.extras.some((x) => x.kind === 'wolf'); state.wolfKeysDirty = false;
    // test5: a T18Emu in the menu whose blocks were emptied (fault up to test4: main program removed in a start device)
    // 1.6.11 test2: a T7Emu that can lose the pet's save (old build): named in red until it is written anew
    state.oldT7 = []; if (F.emuType(buf) === 't7' && E.t7Outdated(buf)) state.oldT7.push(mainName(buf) || 'TAMA-GO');
    if (f) for (const x of E.appsRead(buf, F.feldApps(buf, fe.stub).apps)) if (E.extraKind(x) === 't7' && E.t7Outdated(buf, x.off)) state.oldT7.push(x.name);
    state.t18Broken = state.extras.some((x) => { if (x.kind !== 't18' || x.keepOff === undefined) return false; const c = E.t18Cfg(buf, x.keepOff); if (!c) return false;
      let n = 0; for (const b of c.map) if (b !== 0xFFFF && buf.subarray(b << 16, (b + 1) << 16).every((v) => v === 0xFF)) n++; return n >= 8; });
    state.sig0 = { emu: groupSig('emu'), gb: groupSig('gb'), sms: groupSig('sms'), pm: groupSig('pm'), ab: groupSig('ab') };   // 1.6.10 test4: each tab its own chip   // 1.6.8: programs of an older Studio are renewed on save
    // 1.6.9 test13: start device with DOOM, the main program out of the menu's list and its autostart
    state.cleanClock = true; if (f && clean) try { state.cleanClock = !F.feldApps(buf, fe.stub).noClock; } catch (e) {}   // 1.7.3 test7
    if (f && state.launch) { const fa = F.feldApps(buf, fe.stub);
      if (fa.v9) { state.emuAuto = !!fa.auto; const k = fa.mainSrc ? E.appsRead(buf, fa.apps).findIndex((x) => x.off === fa.mainSrc - 0x10000000 + 0x11000) : -1; state.mainPick = k >= 0 ? state.extras[k] || null : null; } }
    // A menu from an older Studio version is rebuilt on save (e.g. 0.9.5 had no item pictures)
    state.feldStale = false;
    if (f) {
      if (clean) try { const fa = F.feldApps(buf, fe.stub), re = fe.feldc ? F.cleanApply(buf, { apps: fa.apps, dl: fa.dl, mainSrc: fa.mainSrc, auto: fa.auto, noClock: fa.noClock, spot: F.cleanInfo(buf) }, { feld: fe.feldc, stub: fe.stub }) : buf; state.feldStale = re.some((v, i) => v !== buf[i]); } catch (e) { state.feldStale = false; }
      else try {
        const embOld = { stub: fe.stub, oldStub: E.embedded() && E.embedded().stub };
        const fa = F.feldApps(buf, fe.stub), low = fa.apps.length ? Math.min(...fa.apps.map((a) => a.src - 0x10000000 + 0x11000)) : 0;
        const dl = f.version >= 7 ? (buf[f.off + 0x334] | buf[f.off + 0x335] << 8 | buf[f.off + 0x336] << 16 | buf[f.off + 0x337] << 24) >>> 0 : 0, dlo = dl ? dl - 0x10000000 + 0x11000 : 0;
        const re = F.feldApply(F.feldStrip(buf, embOld, E), { fields: state.feld, bag: state.bag, tama: !neonRom() && state.tama, neonTama: neonRom() && state.tama, appsOnly: state.appsOnly, paramixShortcut: state.paramixShortcut, gplay: state.gplay, saves: state.saves, launch: state.launch, apps: fa.apps, name0: fa.name0, appsLow: low, dl, mainSrc: fa.mainSrc, auto: fa.auto, fieldNames: fieldTexts(buf).map((x) => x.name) }, F.feldSlots(buf, fe.stub), { feld: fe.feld, stub: fe.stub }, E);
        if (dlo) re.set(buf.subarray(dlo, dlo + 0x10000), dlo);   // the flash app stays where it is
        state.feldStale = re.length !== buf.length || re.some((v, i) => v !== buf[i]);
      } catch (e) { state.feldStale = false; }
    } }
  // fields and character names (from the ROM's character table and text table)
  state.fields = [];
  state.characterRows = new Map();
  state.characterTextById = new Map();
  try {
    state.fields = C.fieldSets(ctx);
    for (const character of C.charTable(ctx.files[0])) state.characterTextById.set(character.id, character.name);
    for (const character of C.characterSprites(ctx)) {
      if (!state.characterRows.has(character.group)) state.characterRows.set(character.group, character.name);
    }
  } catch (_) { state.fields = []; }
  refreshCharacterNames();
  renderGameLabels();
  renderGiftChoices();
  visRefreshRomVisitors();
  cleanTabs();
  if (!$('pane-lab-items').hidden && !clean) renderRomLabItems(true);
  renderInfo(); if (!clean) { renderGrids(); renderNames(); renderDim(); } renderEmu(); renderDoom(); renderFeld(); renderSave(); if (!dv.run) devRender();
  if (!$('pane-zh').hidden) renderZhPanel(false);
  const edition = workspaceEdition(ctx);
  toast(clean ? t('cleanLoaded', { ed: edition, n: state.extras.length }) :
    t('loaded', { ed: edition, s: ctx.entries.length, f: ctx.groups.length }));
  return true;
}
function refreshCharacterNames() {
  state.charNames.clear();
  for (const [group, row] of state.characterRows || []) {
    const name = romDisplayName(state.ctx.rom, row);
    if (name) state.charNames.set(group, name);
  }
}
// ------------------------------------------------------------------ names (1.6.8)
/* Field names: text numbers per field (the field's own one, and 64..66 where LAND/WATER/SKY stand a second time) */
/* 1.6.8: the extra fields (Land, Water, Sky) are part of the ROM being made: when six fields are switched on in the
 * Menu tab, their names can be changed before they are built in */
const sixActive = () => !!state.ctx && !state.launch && ((!!S6.sixInfo(state.ctx.rom) && !state.sixOff) || !!state.six || !!state.sixWant);
function fieldTexts(rom, six) {
  if (F.feldId(rom) === 7) return [];
  let fn = F.fieldNames(rom).map((s) => s.toUpperCase()); const lws = ['LAND', 'WATER', 'SKY'], out = [];
  if (six !== undefined) {
    const id = F.feldId(rom);
    if (!six) fn = fn.slice(0, 3);
    else if (fn.length <= 3) fn = fn.concat(id === 4 ? ['SKY'] : id >= 5 ? lws : []);
  }
  fn.forEach((nm, i) => {
    const k = lws.indexOf(nm), own = i < 3 ? 14 + i : k >= 0 ? 64 + k : -1;
    if (own < 0) return;
    const idx = [own]; if (i < 3 && k >= 0 && C.textGet(rom, 64 + k) === C.textGet(rom, own)) idx.push(64 + k);
    out.push({ idx, name: C.textGet(rom, own) });
  });
  return out;
}
function nameRow(box, label, cur, idx, max) {
  const l = document.createElement('label'), sp = document.createElement('span'), inp = document.createElement('input');
  sp.textContent = label; sp.title = label; inp.maxLength = max;
  const ed = state.texts.get(idx[0]); inp.value = ed !== undefined ? ed : cur; inp.classList.toggle('chg', ed !== undefined);
  inp.onchange = () => {
    const previous = state.texts.get(idx[0]) ?? cur;
    const v = C.textClean(inp.value);
    for (const i of idx) { if (!v || v === cur) state.texts.delete(i); else state.texts.set(i, v); }
    if ((v || cur) !== previous) measure('edit', 'rom_names');
    inp.value = v && v !== cur ? v : cur; inp.classList.toggle('chg', !!v && v !== cur); renderPlan();
  };
  l.append(sp, inp); box.appendChild(l);
}
function renderNames() {
  if (!state.ctx) return;
  if (!state.texts) state.texts = new Map();
  const rom = state.ctx.rom, fb = $('namesFields'), cb = $('namesChars');
  fb.innerHTML = ''; cb.innerHTML = '';
  $('namesFind').placeholder = t('namesFind');
  for (const f of fieldTexts(rom, sixActive())) nameRow(fb, romDisplayName(rom, f.idx[0]) || f.name, f.name, f.idx, 11);
  const seen = new Set();
  try {
    for (const c of C.charTable(state.ctx.files[0]).filter((c) => c.id > 1000 && c.id < 9000)) {
      if (seen.has(c.name)) continue;
      const display = romDisplayName(rom, c.name);
      const english = C.textGet(rom, c.name) || RL.text(rom, c.name, 'en');
      if (!english && !display) continue;
      seen.add(c.name);
      nameRow(cb, display || english, english, [c.name], 12);
    }
  } catch (e) { /* no character table */ }
  state.itemNames = [];
  for (const it of romItemCatalog(rom).values()) {
    if (seen.has(it.text)) continue;
    const name = C.textGet(rom, it.text) || RL.text(rom, it.text, 'en');
    const display = romDisplayName(rom, it.text) || name;
    if (!display) continue;
    seen.add(it.text);
    state.itemNames.push({ name, display, text: it.text });
  }
  renderItemNames();
}
function renderItemNames() {
  const query = $('namesFind').value.trim().toUpperCase();
  const rows = document.createDocumentFragment();
  for (const { name, display, text } of state.itemNames || []) {
    if (query && ![name, display, state.texts.get(text) || ''].some(value => value.toUpperCase().includes(query))) continue;
    nameRow(rows, display, name, [text], 22);
  }
  $('itemSearchEmpty').hidden = !query || !!rows.childElementCount;
  $('namesItems').replaceChildren(rows);
}
$('namesFind').oninput = renderItemNames;
$('namesUndo').onclick = () => { state.texts = new Map(); renderNames(); renderPlan(); };
function estimateEnd() {
  const ctx = state.ctx; if (ctx.clean) return C.ASSET_BASE;   // CLEAN_ROM: no pictures
  let pack = 4 * ctx.entries.length;
  for (let i = 0; i < ctx.entries.length; i++) { pack += (4 - pack % 4) % 4; pack += entry(i).length; }
  const al = (n) => n + ((4 - n % 4) % 4);
  return C.ASSET_BASE + 16 + 48 + al(ctx.files[0].length) + al(pack) + al(ctx.files[2].length);
}
function renderInfo() {
  const ctx = state.ctx; if (!ctx) return;
  $('paradiseAssetUsage').hidden = !!ctx.clean;
  const edition = workspaceEdition(ctx);
  if (ctx.clean) { $('info').innerHTML = ''; const s = document.createElement('span'); s.innerHTML = t('edition') + ': <b></b>'; s.lastChild.textContent = edition + ' · ' + t('cleanOn'); markEdition(s.lastChild, edition, romEditionKey(ctx.editionId)); $('info').appendChild(s); renderPlan(); return; }
  const end = estimateEnd(), total = ctx.limit - C.ASSET_BASE, used = end - C.ASSET_BASE, free = ctx.limit - end;
  const pct = Math.min(100, used / total * 100);
  $('info').innerHTML = '';
  const add = (label, html) => { const s = document.createElement('span'); s.innerHTML = label + ': <b>' + html + '</b>'; $('info').appendChild(s); };
  add(t('edition'), edition);
  markEdition($('info').querySelector('b'), edition, romEditionKey(ctx.editionId));
  add(t('sprites'), ctx.entries.length); add(t('figures'), ctx.groups.length); add(t('changed'), state.changed.size);
  const meter = $('paradiseAssetMeter');
  meter.setAttribute('aria-valuenow', pct.toFixed(1));
  meter.classList.toggle('over-capacity', free < 0);
  $('paradiseAssetUsed').style.setProperty('--end', pct.toFixed(1) + '%');
  const remaining = free < 0 ? t('{count} KB over capacity', { count: Math.ceil(-free / 1024) }) :
    t('{count} KB available', { count: Math.floor(free / 1024) });
  $('paradiseAssetUsageText').textContent = t("{v1}% used · {v2}", { v1: formatNumber(used / total * 100, 1), v2: remaining });
  renderPlan();
}

// --------------------------------------------------------------- grids
let observer;
function tile(kind, idx, label) {
  const b = document.createElement('button'); b.className = 'tile'; b.dataset.kind = kind; b.dataset.idx = idx;
  b.innerHTML = '<div class="stage"></div><div class="cap"><b>#' + idx + '</b> <span></span></div>';
  b.querySelector('.cap span').textContent = label || '';
  if (kind === 'fig') b.title = label || '#' + idx;
  b.onclick = () => openDrawer(kind, idx);
  observer.observe(b);
  return b;
}
function paintTile(b) {
  const i = +b.dataset.idx, kind = b.dataset.kind;
  let img;
  try {
    const poses = kind === 'fig' && posesOf(i, false);
    img = poses?.length ? characterPoseImage(i, false, poses[firstPose(poses)]) : spriteFrame(i);
  } catch (_) { return; }
  if (!img) return;
  const box = 96, sc = Math.max(1, Math.min(2, Math.floor(box / Math.max(img.w, img.h)) || 1));
  const cv = imgToCanvas(img);
  cv.style.width = img.w * sc + 'px';
  cv.style.height = img.h * sc + 'px';
  if (img.w * sc > box || img.h * sc > box) { cv.style.width = '100%'; cv.style.height = 'auto'; }
  const st = b.querySelector('.stage'); st.innerHTML = ''; st.appendChild(cv);
  const ch = kind === 'fig' ? [0, 1, 2, 3, 4, 5].some(k => state.changed.has(i + k)) : state.changed.has(i);
  b.classList.toggle('changed', ch);
}
function renderGrids() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((es, obs) => {
    if (obs !== observer || !state.ctx) return;
    for (const e of es) if (e.isIntersecting && e.target.isConnected) {
      paintTile(e.target);
      obs.unobserve(e.target);
    }
  }, { rootMargin: '300px' });
  const ctx = state.ctx, gf = $('gridFigs');
  gf.replaceChildren();
  $('gridAll').replaceChildren();
  $('paradiseSpritesPage').value = '0';
  for (const g of ctx.groups) gf.appendChild(tile('fig', g, [state.charNames.get(g), groupRole(g)].filter(Boolean).join(' ')));
  renderFieldPick();
  if (!$('pane-all').hidden) renderSpriteGrid();
}
function renderSpriteGrid(page = 0) {
  const grid = $('gridAll');
  if (!state.ctx) return;
  const lastPage = Math.max(0, Math.ceil(state.ctx.entries.length / SPRITES_PER_PAGE) - 1);
  const start = Math.max(0, Math.min(page, lastPage)) * SPRITES_PER_PAGE;
  if (grid.firstElementChild && Number(grid.firstElementChild.dataset.idx) === start) return;
  for (const card of grid.children) observer.unobserve(card);
  grid.replaceChildren();
  syncSpritePager('paradiseSprites', start, state.ctx.entries.length);
  const six = S6.sixInfo(state.ctx.rom);
  const cards = document.createDocumentFragment();
  for (let i = start; i < Math.min(start + SPRITES_PER_PAGE, state.ctx.entries.length); i++) {
    const h = C.spriteHeader(state.ctx.entries[i]);
    const card = tile('spr', i, h.sw * Math.max(1, h.iw) + '×' + h.sh * Math.max(1, h.ih));
    if (six?.kind === 'gen3' && i >= six.sprites) {
      card.classList.add('locked');
      card.title = t('sprSix');
    }
    cards.appendChild(card);
  }
  grid.appendChild(cards);
}
bindSpritePager('paradiseSprites', renderSpriteGrid);
function refreshTile(kind, idx) {
  document.querySelectorAll('.tile[data-idx="' + idx + '"][data-kind="' + kind + '"]').forEach(paintTile);
  if (kind === 'spr') { const g = state.ctx.groups.find(g => idx >= g && idx < g + 6); if (g !== undefined) refreshTile('fig', g); }
  else for (let k = 0; k < 6; k++) document.querySelectorAll('.tile[data-idx="' + (idx + k) + '"][data-kind="spr"]').forEach(paintTile);
  renderInfo();
}
/* CLEAN_ROM: without the Paradise its tabs (pictures, names, size, DOOM) have nothing to show */
const CLEAN_TABS = ['figs', 'all', 'names', 'dim', 'lab-items', 'zh'];
function cleanTabs() {
  const off = !!state.clean;
  document.querySelectorAll('.tab[data-tab]').forEach((b) => { b.hidden = off && CLEAN_TABS.includes(b.dataset.tab); });
  for (const option of $('paradiseTool').options) option.hidden = $(option.value).hidden;
  const sel = document.querySelector('.tab[data-tab][aria-selected="true"]');
  if (off && sel && sel.hidden) document.querySelector('.tab[data-tab="feld"]').click();
}
const paradiseTabs = [...document.querySelectorAll('.tab[data-tab]')];
for (const tab of paradiseTabs) {
  const panel = $('pane-' + tab.dataset.tab);
  tab.id = 'tool-' + tab.dataset.tab;
  tab.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-labelledby', tab.id);
  panel.setAttribute('role', 'tabpanel');
  tab.onclick = () => {
    if (tab.getAttribute('aria-selected') !== 'true' && !tab.hasAttribute('data-legacy')) {
      const tool = tab.dataset.tab;
      const names = { figs: 'characters', all: 'sprites', feld: 'menu', zh: 'translate', dim: 'character_import' };
      measure('feature_view', 'workspace_' + (names[tool] || tool.replaceAll('-', '_')));
    }
    for (const item of paradiseTabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      $('pane-' + item.dataset.tab).hidden = !active;
    }
    rememberNavigation({ paradise: tab.id });
    $('paradiseHeading').textContent = tab.textContent;
    $('paradiseTool').value = tab.id;
    if (tab.dataset.tab === 'all') renderSpriteGrid(Number($('paradiseSpritesPage').value));
    if (tab.dataset.tab === 'lab-items' && state.ctx) renderRomLabItems(false);
    if (tab.dataset.tab === 'zh') renderZhPanel(false);
  };
}

// Both navigation layouts activate the same tab and retain its editor state.
function setupToolNavigation(key, tabs) {
  const picker = $(key + 'Tool');
  let group;
  const available = tabs.filter(tab => !tab.hasAttribute('data-legacy'));
  for (const tab of available) {
    if (tab.previousElementSibling?.classList.contains('nav-group')) {
      group = document.createElement('optgroup');
      group.label = tab.previousElementSibling.textContent;
      picker.appendChild(group);
    }
    group.appendChild(new Option(tab.textContent, tab.id));
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    tab.onkeydown = event => {
      const visible = available.filter(item => !item.hidden);
      const position = visible.indexOf(tab);
      const next = { ArrowDown: position + 1, ArrowRight: position + 1,
        ArrowUp: position - 1, ArrowLeft: position - 1, Home: 0, End: visible.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = visible[(next + visible.length) % visible.length];
      target.click();
      target.focus();
    };
  }
  picker.onchange = () => $(picker.value).click();
}

function updateToolLabels(key, tabs) {
  const picker = $(key + 'Tool');
  for (const option of picker.options) option.textContent = $(option.value).textContent;
  const groups = tabs.filter(tab => !tab.hasAttribute('data-legacy') && tab.previousElementSibling?.classList.contains('nav-group'));
  Array.from(picker.querySelectorAll('optgroup')).forEach((group, i) => {
    group.label = groups[i].previousElementSibling.textContent;
  });
  const selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
  if (selected) $(key + 'Heading').textContent = selected.textContent;
}

// Options for a sprite that belongs to a character group (eyes keep their length,
// colours avoid the slots the game recolours). Empty for other sprites.
function partOpts(i) {
  const g = state.ctx.groups.find(g => i >= g && i < g + 6);
  return g === undefined ? {} : C.partOptions(i - g);
}
function groupRole(g) {
  const ctx = state.ctx;
  if (g === ctx.groups[0]) return t('roleFallback');
  if (ctx.egg >= 0 && g === ctx.egg + 6) return t('roleBaby');
  if (g === ctx.adult) return t('roleAdult');
  return '';
}

// --------------------------------------------------------------- sheets
function sheetOf(kind, idx) {
  if (kind === 'fig') return C.groupSheet([0, 1, 2, 3, 4, 5].map(k => decode(idx + k).subs));
  return C.sheetFromSubs(decode(idx).subs);
}
const sheetName = (kind, idx) => (kind === 'fig' ? 'figur_' : 'sprite_') + pad4(idx) + '.png';
/** Apply an edited sheet. Unchanged parts keep their original bytes. */
/* 1.6.8: pictures the six fields added (they share their data and are made again when the fields are updated) */
function sixAdded(i) { const si = S6.sixInfo(state.ctx.rom); return !!si && si.kind === 'gen3' && i >= si.sprites; }
function applySheet(kind, idx, img) {
  if (kind === 'spr' && sixAdded(idx)) throw new Error(t('sprSix'));
  const opts = { allowMoreColors: $('optColors').checked };
  // encode first, change nothing until every part is accepted (a character is never half replaced)
  const plan = [];
  const setEntry = (i, subs) => {
    const cur = decode(i).subs;
    if (subs.length === cur.length && subs.every((s, k) => C.sameImage(s, cur[k]))) return;
    const orig = state.ctx.entries[i];
    const od = C.spriteDecode(orig).subs;
    if (subs.every((s, k) => C.sameImage(s, od[k]))) { plan.push([i, null]); return; }
    plan.push([i, C.spriteEncode(orig, subs, Object.assign({}, opts, partOpts(i)))]);
  };
  const commit = () => {
    plan.forEach(([i, e]) => { if (e) state.changed.set(i, e); else state.changed.delete(i); });
    if (plan.length) measure('edit', kind === 'fig' ? 'character_sheet' : 'sprite_sheet');
  };
  if (kind === 'fig') { C.groupFromSheet(img).forEach((subs, k) => setEntry(idx + k, subs)); commit(); return; }
  const d = decode(idx); setEntry(idx, C.subsFromSheet(img, d.subs[0].w, d.subs[0].h, d.subs.length)); commit();
}
function parseName(name) {
  const m = /(figur|figure|sprite)_(\d+)\.png$/i.exec(name.split('/').pop());
  if (!m) return null;
  return { kind: /sprite/i.test(m[1]) ? 'spr' : 'fig', idx: +m[2] };
}
async function uploadFiles(files) {
  const items = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const z = await C.zipRead(new Uint8Array(await f.arrayBuffer()), inflateRaw);
      for (const e of z) items.push({ name: e.name, blob: new Blob([e.data], { type: 'image/png' }) });
    } else items.push({ name: f.name, blob: f });
  }
  let ok = 0; const skip = [];
  for (const it of items) {
    const p = parseName(it.name);
    if (!p) { if (/\.png$/i.test(it.name)) skip.push(it.name.split('/').pop()); continue; }
    if (p.kind === 'fig' && !state.ctx.groups.includes(p.idx)) { skip.push(it.name.split('/').pop()); continue; }
    if (p.kind === 'spr' && !(p.idx >= 0 && p.idx < state.ctx.entries.length)) { skip.push(it.name.split('/').pop()); continue; }
    try { applySheet(p.kind, p.idx, await decodePng(it.blob)); ok++; refreshTile(p.kind, p.idx); }
    catch (e) { skip.push(t('wrongSize', { f: it.name.split('/').pop(), e: em(e) })); }
  }
  if (!ok && !skip.length) toast(t('upNone'), true);
  else toast(t('upOk', { n: ok }) + (skip.length ? '\n' + t('upSkip', { list: skip.slice(0, 6).join(', ') + (skip.length > 6 ? ' …' : '') }) : ''), skip.length > 0 && !ok);
  if (state.open) openDrawer(state.open.kind, state.open.idx);
}
/* Fields (worlds): filter the character grid and export everything of one field */
function renderFieldPick() {
  const sel = $('figField'), cur = sel.value; sel.innerHTML = '';
  const o = document.createElement('option'); o.value = ''; o.textContent = t('figAll'); sel.appendChild(o);
  state.fields.forEach((f) => { const x = document.createElement('option'); x.value = f.type; x.textContent = romField(state.ctx.rom, f.type, f.name); sel.appendChild(x); });
  sel.value = state.fields.some((f) => String(f.type) === cur) ? cur : '';
  applyFieldPick();
}
function applyFieldPick() {
  const f = state.fields.find((x) => String(x.type) === $('figField').value);
  const set = f ? new Set(f.chars.map((c) => c.group)) : null;
  document.querySelectorAll('#gridFigs .tile').forEach((b) => { b.hidden = !!set && !set.has(+b.dataset.idx); });
  $('btnZipField').hidden = !f; $('btnFieldIn').hidden = !f;
}
$('figField').onchange = applyFieldPick;
$('btnZipField').onclick = () => busy(t("Exporting Field"), async () => {
  const f = state.fields.find((x) => String(x.type) === $('figField').value); if (!f) return;
  const files = [], lines = ['ParaLab: ' + f.name + ' (' + state.ctx.edition + ')', ''];
  const groups = new Set();
  for (const c of f.chars) {
    const name = sheetName('fig', c.group);
    if (!groups.has(c.group)) {
      files.push({ name, data: await pngBytes(sheetOf('fig', c.group)) });
      groups.add(c.group);
    }
    lines.push(name + '  stage ' + c.stage + '  ' + (C.textGet(state.ctx.rom, c.name) || ''));
  }
  const pics = [...f.maps, ...f.overlays, ...f.closeups];
  for (const i of pics) files.push({ name: sheetName('spr', i), data: await pngBytes(sheetOf('spr', i)) });
  if (f.maps.length) lines.push('', 'field map: ' + f.maps.map((i) => sheetName('spr', i)).join(' '));
  if (f.overlays.length) lines.push('map overlays: ' + f.overlays.map((i) => sheetName('spr', i)).join(' '));
  if (f.closeups.length) lines.push('close-up backgrounds: ' + f.closeups.map((i) => sheetName('spr', i)).join(' '));
  files.push({ name: 'contents.txt', data: new TextEncoder().encode(lines.join('\n') + '\n') });
  const meta = { paramix: 'field', edition: state.ctx.edition, type: f.type, name: f.name, chars: f.chars.map((c) => ({ id: c.id, stage: c.stage, group: c.group })), maps: f.maps, overlays: f.overlays, closeups: f.closeups };
  files.push({ name: 'field.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 1)) });
  download(C.zipBuild(files), baseName() + '_' + f.name.toLowerCase() + '.zip', 'application/zip');
  toast(t('fieldZipOk', { f: f.name, n: f.chars.length, s: pics.length }));
});
/* Load a field ZIP (from this or another ROM) into the selected field: characters in
   the same order (child, teens, adults), field map, overlays and close-ups one to one. */
$('btnFieldIn').onclick = () => $('fileField').click();
$('fileField').onchange = (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  busy(t("Importing Field"), async () => {
    const dst = state.fields.find((x) => String(x.type) === $('figField').value); if (!dst) return;
    const z = await C.zipRead(new Uint8Array(await file.arrayBuffer()), inflateRaw);
    const by = new Map(z.map((x) => [x.name.split('/').pop(), x.data]));
    let meta = null; try { meta = JSON.parse(new TextDecoder().decode(by.get('field.json'))); } catch (err) { meta = null; }
    if (!meta || meta.paramix !== 'field') { toast(t('fieldInBad'), true); return; }
    let n = 0, eyes = 0; const skip = [];
    const put = async (kind, srcIdx, dstIdx) => {
      const nm = sheetName(kind, srcIdx), data = by.get(nm); if (!data || dstIdx === undefined) return;
      try { applySheet(kind, dstIdx, await decodePng(new Blob([data], { type: 'image/png' }))); n++; refreshTile(kind, dstIdx); }
      catch (err) { if (/^eye image too detailed/.test(err.message)) eyes++; else skip.push(t('wrongSize', { f: nm, e: em(err) })); }
    };
    const groups = new Map();
    for (let i = 0; i < meta.chars.length && i < dst.chars.length; i++) {
      const src = meta.chars[i], target = dst.chars[i];
      if (!groups.has(target.group)) groups.set(target.group, src.group);
      else if (groups.get(target.group) !== src.group) groups.set(target.group, null);
    }
    for (const [target, source] of groups) {
      if (source === null) skip.push(t('fieldInShared', { n: target }));
      else await put('fig', source, target);
    }
    for (let i = 0; i < meta.maps.length && i < dst.maps.length; i++) await put('spr', meta.maps[i], dst.maps[i]);
    for (let i = 0; i < meta.overlays.length && i < dst.overlays.length; i++) await put('spr', meta.overlays[i], dst.overlays[i]);
    for (let i = 0; i < meta.closeups.length && i < dst.closeups.length; i++) await put('spr', meta.closeups[i], dst.closeups[i]);
    toast(t('fieldInOk', { src: meta.name + ' (' + meta.edition + ')', dst: dst.name, n }) + (eyes ? '\n' + t('fieldInEyes', { k: eyes }) : '') + (skip.length ? '\n' + t('upSkip', { list: skip.slice(0, 4).join(', ') + (skip.length > 4 ? ' …' : '') }) : ''), skip.length > 0 && !n);
  });
};
async function zipSheets(kind) {
  const list = kind === 'fig' ? state.ctx.groups : state.ctx.entries.map((e, i) => i);
  const files = [];
  for (const i of list) files.push({ name: sheetName(kind, i), data: await pngBytes(sheetOf(kind, i)) });
  download(C.zipBuild(files), baseName() + (kind === 'fig' ? '_figuren.zip' : '_sprites.zip'), 'application/zip');
}

// --------------------------------------------------------------- drawer
let drawerTrigger;
function openDrawer(kind, idx) {
  let img;
  try {
    img = sheetOf(kind, idx);
  } catch (error) {
    toast(em(error), true);
    return;
  }
  const opening = $('drawer').inert;
  if (opening) drawerTrigger = document.activeElement;
  state.open = { kind, idx };
  const kindLabel = kind === 'fig' ? state.charNames.get(idx) || t('figure') : t('sprite');
  $('dTitle').textContent = kindLabel + ' #' + idx;
  const canvas = imgToCanvas(img, 1, $('dCanvas'));
  sizeDrawerCanvas(canvas);
  const meta = $('dMeta'); meta.innerHTML = '';
  const li = (s) => { const x = document.createElement('li'); x.textContent = s; meta.appendChild(x); };
  li(t('mSheet', { w: img.w, h: img.h }));
  if (kind === 'fig') {
    li(t('mGroupRows')); li(t('mEyes')); li(t('mColorsFig'));
    if (groupRole(idx)) li(groupRole(idx) + labelSeparator() + t(idx === state.ctx.groups[0] ? 'roleFallbackText' : idx === state.ctx.adult ? 'roleAdultText' : 'roleBabyText'));
    if (state.ctx.editionId !== 8) {
      const character = C.characterSprites(state.ctx).find(row => row.group === idx);
      for (const [label, value] of characterReference(character?.id)) li(t(label) + labelSeparator() + value);
    }
  }
  else {
    const h = C.spriteHeader(state.ctx.entries[idx]);
    li(t('mSize', { w: h.sw, h: h.sh, n: h.numSprites / (Math.max(1, h.iw) * Math.max(1, h.ih)), iw: Math.max(1, h.iw), ih: Math.max(1, h.ih) }));
    li(t('mColors', { c: h.bpp >= 0x10 ? t('mDirect') : t('mPal', { n: 1 << [1, 2, 4, 8][h.bpp] }), p: h.bpp >= 0x10 ? 0 : Math.max(1, h.numPal) }));
    if (sixAdded(idx)) li(t('sprSix'));
    if (h.numPal > 1) li(t('mKeep'));
  }
  const ch = kind === 'fig' ? [0, 1, 2, 3, 4, 5].some(k => state.changed.has(idx + k)) : state.changed.has(idx);
  $('dReset').disabled = !ch;
  $('dEyes').hidden = kind !== 'fig'; if (kind === 'fig') { if (face.g !== idx) $('dPoseOnly').checked = false; eyePreview(idx); }
  visStopAnimation('dCharacter');
  $('dCharacterPreview').hidden = kind !== 'fig';
  if (kind === 'fig') startCharacterAnimation(idx);
  $('dUp').disabled = kind === 'spr' && sixAdded(idx);
  for (const surface of document.querySelectorAll('body > .bar, main, footer')) surface.inert = true;
  $('drawer').inert = false;
  $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); $('scrim').classList.add('on');
  if (opening) $('dClose').focus();
}
/* 1.6.8: move a character's eyes and mouth (composite entries of the field). The preview shows every pose of the big
 * or the small figure. Arrows move eyes or mouth in all poses (small figure half as far) or, with "this pose only",
 * the layers of the pose shown (state.poseAdj: figure -> word positions -> extra offset). */
const shTxt = (sh) => (sh[0] || sh[1] ? (sh[0] > 0 ? '+' : '') + sh[0] + ' / ' + (sh[1] > 0 ? '+' : '') + sh[1] : '');
const face = { g: -1, pose: 0, small: false };
function posesOf(g, small) {
  if (state.poseSource !== state.ctx.files[0] || !state.poseCache) {
    state.poseSource = state.ctx.files[0];
    state.poseLayers = C.paraLayers(state.poseSource);
    state.poseCache = new Map();
  }
  const base = small ? g + 3 : g, k = state.ctx.files[0].length + ':' + base;
  if (!state.poseCache.has(k)) state.poseCache.set(k, C.facePoses(state.ctx.files[0], base, base + 1, base + 2, state.poseLayers));
  return state.poseCache.get(k);
}
const poseKey = (l) => l.ox + ':' + l.oy;
function poseAdjGet(g, l) { const m = state.poseAdj && state.poseAdj.get(g), v = l && m && m.get(poseKey(l)); return v ? v.d : [0, 0]; }
function firstPose(ps) { const i = ps.findIndex((p) => p.eye && p.eye.sub === 0 && p.mouth && p.mouth.sub === 0); return i >= 0 ? i : Math.max(0, ps.findIndex((p) => p.eye && p.eye.sub === 0)); }
function characterPoseImage(g, small, f) {
  const ge = (state.eyeShift && state.eyeShift.get(g)) || [0, 0], gm = (state.mouthShift && state.mouthShift.get(g)) || [0, 0];
  const sc = (v) => (small ? [half(v[0]), half(v[1])] : v);
  const ea = poseAdjGet(g, f.eye), ma = poseAdjGet(g, f.mouth);
  const base = small ? g + 3 : g, b = spriteFrame(base, f.bs);
  const img = C.emptyImage(b.w, b.h);
  img.data.set(b.data);
  const put = (part, lay, sh) => {
    if (!lay) return; let e; try { e = spriteFrame(base + part, lay.sub); } catch (_) { return; }
    if (!e) return;
    const ox = lay.dx + ((b.w - e.w) >> 1) + sh[0], oy = lay.dy + ((b.h - e.h) >> 1) + sh[1];
    for (let y = 0; y < e.h; y++) for (let xx = 0; xx < e.w; xx++) {
      const s = (y * e.w + xx) * 4; if (e.data[s + 3] < 128) continue;
      const X = xx + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= b.w || Y >= b.h) continue;
      const t = (Y * b.w + X) * 4; img.data[t] = e.data[s]; img.data[t + 1] = e.data[s + 1]; img.data[t + 2] = e.data[s + 2]; img.data[t + 3] = 255;
    }
  };
  const se = sc(ge), sm = sc(gm);
  put(1, f.eye, [se[0] + ea[0], se[1] + ea[1]]); put(2, f.mouth, [sm[0] + ma[0], sm[1] + ma[1]]);
  return img;
}
function startCharacterAnimation(idx, paused = matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const poses = posesOf(idx, false);
  const frames = poses.length ? poses.map(pose => characterPoseImage(idx, false, pose)) : decode(idx).subs;
  const playback = { canvas: $('dCharacterImage'), paused };
  visAnimations.set('dCharacter', playback);
  visUseFrames('dCharacter', playback, frames, firstPose(poses));
}
function eyePreview(g) {
  if (face.g !== g) { face.g = g; face.small = false; face.pose = firstPose(posesOf(g, false)); }
  const ps = posesOf(g, face.small), only = $('dPoseOnly').checked, cv = $('dEyeCv'), x = cv.getContext('2d');
  const ge = (state.eyeShift && state.eyeShift.get(g)) || [0, 0], gm = (state.mouthShift && state.mouthShift.get(g)) || [0, 0];
  $('dFaceBig').classList.toggle('on', !face.small); $('dFaceSmall').classList.toggle('on', face.small);
  $('dFaceHint').textContent = t(only ? 'poseOnlyHint' : 'eyeMvHint');
  x.clearRect(0, 0, 64, 64);
  let f;
  if (ps.length) { face.pose = Math.min(Math.max(0, face.pose), ps.length - 1); f = ps[face.pose]; }
  else { const o = C.eyeFirst(state.ctx.files[0], g, g + 1); if (!o) return; f = { bs: o.bs, eye: { sub: o.es, dx: o.dx, dy: o.dy, ox: -1, oy: -1 }, mouth: null }; }
  $('dPoseNr').textContent = ps.length ? t('poseNr', { i: face.pose + 1, n: ps.length }) : '';
  $('dPosePrev').disabled = $('dPoseNext').disabled = ps.length < 2;
  $('dPoseOnly').disabled = !ps.length;
  $('dMouthRow').hidden = !f.mouth;
  const ea = poseAdjGet(g, f.eye), ma = poseAdjGet(g, f.mouth);
  $('dEyeVal').textContent = shTxt(only ? ea : ge); $('dMouthVal').textContent = shTxt(only ? ma : gm);
  const b = characterPoseImage(g, face.small, f);
  cv.width = b.w; cv.height = b.h; x.putImageData(new ImageData(b.data, b.w, b.h), 0, 0);
  // FACE_SCALE (1.7.2 test15): every sprite at 3x (big 192 px, small 96 px), before the small one was blown up to 192 px
  if (FACE_SCALE) { cv.style.width = (b.w * 3) + 'px'; cv.style.height = (b.h * 3) + 'px'; cv.style.margin = ((192 - b.h * 3) >> 1) + 'px ' + ((192 - b.w * 3) >> 1) + 'px'; }
}
const FACE_SCALE = true;
const clamp16 = (v) => Math.max(-16, Math.min(16, v));
function curLayer(which) { const ps = posesOf(face.g, face.small); const f = ps[face.pose]; return f ? f[which] : null; }
function faceMove(which, dx, dy, reset) {
  if (!state.open || state.open.kind !== 'fig') return;
  const g = state.open.idx;
  if ($('dPoseOnly').checked) {
    const l = curLayer(which); if (!l || l.ox < 0) return;
    if (!state.poseAdj) state.poseAdj = new Map();
    const m = state.poseAdj.get(g) || new Map(), k = poseKey(l), c = (m.get(k) || { d: [0, 0] }).d, n = reset ? [0, 0] : [clamp16(c[0] + dx), clamp16(c[1] + dy)];
    if (n[0] || n[1]) m.set(k, { ox: l.ox, oy: l.oy, d: n }); else m.delete(k);
    if (m.size) state.poseAdj.set(g, m); else state.poseAdj.delete(g);
  } else {
    const key = which === 'eye' ? 'eyeShift' : 'mouthShift';
    if (!state[key]) state[key] = new Map();
    const c = state[key].get(g) || [0, 0], n = reset ? [0, 0] : [clamp16(c[0] + dx), clamp16(c[1] + dy)];
    if (n[0] || n[1]) state[key].set(g, n); else state[key].delete(g);
  }
  eyePreview(g);
  const paused = visAnimations.get('dCharacter')?.paused;
  visStopAnimation('dCharacter');
  startCharacterAnimation(g, paused);
  refreshTile('fig', g);
  renderPlan();
}
document.querySelectorAll('[data-eye]').forEach((bt) => bt.onclick = () => { const [dx, dy] = bt.dataset.eye.split(',').map(Number); faceMove('eye', dx, dy); });
document.querySelectorAll('[data-mouth]').forEach((bt) => bt.onclick = () => { const [dx, dy] = bt.dataset.mouth.split(',').map(Number); faceMove('mouth', dx, dy); });
$('dEyeReset').onclick = () => faceMove('eye', 0, 0, true);
$('dMouthReset').onclick = () => faceMove('mouth', 0, 0, true);
const poseStep = (k) => { if (!state.open) return; const n = posesOf(face.g, face.small).length; if (n) face.pose = (face.pose + k + n) % n; eyePreview(state.open.idx); };
$('dPosePrev').onclick = () => poseStep(-1); $('dPoseNext').onclick = () => poseStep(1);
const faceSize = (small) => { if (!state.open) return; face.small = small; face.pose = firstPose(posesOf(face.g, small)); eyePreview(state.open.idx); };
$('dFaceBig').onclick = () => faceSize(false); $('dFaceSmall').onclick = () => faceSize(true);
$('dPoseOnly').onchange = () => { if (state.open) eyePreview(state.open.idx); };
function closeDrawer() {
  if ($('drawer').inert) return;
  visStopAnimation('dCharacter');
  $('dCanvas').width = $('dCanvas').height = 0;
  state.open = null;
  $('drawer').inert = true;
  for (const surface of document.querySelectorAll('body > .bar, main, footer')) surface.inert = false;
  if (drawerTrigger?.isConnected) drawerTrigger.focus({ preventScroll:true });
  drawerTrigger = null;
  $('drawer').classList.remove('open');
  $('drawer').setAttribute('aria-hidden', 'true');
  $('scrim').classList.remove('on');
}
$('dCharacterPlayback').onclick = () => visTogglePlayback('dCharacter');
$('dClose').onclick = closeDrawer; $('scrim').onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
function sizeDrawerCanvas(canvas) {
  canvas.style.width = canvas.width * state.zoom + 'px';
  canvas.style.height = canvas.height * state.zoom + 'px';
}
document.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
  state.zoom = +b.dataset.z;
  if (state.open) sizeDrawerCanvas($('dCanvas'));
});
$('dDown').onclick = async () => { const { kind, idx } = state.open; download(await pngBlob(sheetOf(kind, idx)), sheetName(kind, idx)); };
$('dUp').onclick = () => $('fileOne').click();
$('fileOne').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !state.open) return;
  const { kind, idx } = state.open;
  try { await busy(t("Importing Sprite Sheet"), async () => applySheet(kind, idx, await decodePng(f))); refreshTile(kind, idx); openDrawer(kind, idx); toast(t('upOk', { n: 1 })); }
  catch (err) { toast(t('wrongSize', { f: f.name, e: em(err) }), true); }
};
$('dReset').onclick = () => {
  const { kind, idx } = state.open;
  if (kind === 'fig') for (let k = 0; k < 6; k++) state.changed.delete(idx + k); else state.changed.delete(idx);
  refreshTile(kind, idx); openDrawer(kind, idx); toast(t('resetOk'));
};

// ------------------------------------------------------------------ card
function eyeRectFor(ch) {
  if (!state.eyeRects) state.eyeRects = new Map();
  if (state.eyeRects.has(ch)) return state.eyeRects.get(ch);
  const pre = C.dimEyePreset(ch);
  const r = pre === undefined ? C.dimGuessEye(ch) : pre;
  state.eyeRects.set(ch, r); return r;
}
/** Insert a card character into group g (body, eye layer, blank mouth). */
function insertDim(ch, g) {
  const ctx = state.ctx;
  if (!state.eyeLayer) {
    // Standard: the card character keeps its own eyes in the body. The game draws the eye
    // image of the current character on top (field and cell), so it stays empty.
    const parts = C.dimCharParts(ch);
    [0, 1, 2, 3, 4, 5].forEach(k => {
      const orig = ctx.entries[g + k];
      state.changed.set(g + k, k === 0 || k === 3 ? C.spriteEncode(orig, parts[k], C.partOptions(k)) : C.spriteBlank(orig, C.partOptions(k)));
    });
    state.eyeOffsets.delete(g);
    return true;
  }
  const rect = eyeRectFor(ch);
  let res = rect ? C.dimCharPartsWithEyes(ch, rect) : null;
  const parts = res ? res.parts : C.dimCharParts(ch);
  [0, 2, 3, 5].forEach(k => {
    const orig = ctx.entries[g + k];
    state.changed.set(g + k, k === 0 || k === 3 ? C.spriteEncode(orig, parts[k], C.partOptions(k)) : C.spriteBlank(orig, C.partOptions(k)));
  });
  let eyesOk = !!res;
  for (const [k, layer] of [[1, res && res.big], [4, res && res.small]]) {
    const orig = ctx.entries[g + k]; let enc = null;
    if (layer) for (const v of C.eyeVariants(layer, k === 1)) { try { enc = C.spriteEncode(orig, v, C.partOptions(k)); break; } catch (e) { /* too big, fewer open eyes */ } }
    if (!enc) eyesOk = false;
    state.changed.set(g + k, enc || C.spriteBlank(orig, C.partOptions(k)));
  }
  if (!state.eyeOffsets) state.eyeOffsets = new Map();
  if (eyesOk) state.eyeOffsets.set(g, [res.eyeBig, res.eyeSmall]); else state.eyeOffsets.delete(g);
  return eyesOk;
}
/** Data pack with the eye layer placed for every inserted character still changed. */
const half = (v) => Math.sign(v) * Math.round(Math.abs(v) / 2);   // symmetric: -1 and 1 both move one pixel
function currentDataPack() {
  let dp = state.ctx.files[0];
  if (!state.eyeOffsets) return null;
  let any = false;
  for (const [g, v] of state.eyeOffsets) {
    if (v === 'hide') {
      if (!state.changed.has(g)) continue;
      dp = C.hideEyes(dp, g, g + 1).dataPack; dp = C.hideEyes(dp, g + 3, g + 4).dataPack;
      any = true; continue;
    }
    const [b, sm] = v;
    if (!state.changed.has(g + 1)) continue;
    dp = C.setEyeOffset(dp, g, g + 1, 64, 32, b[0], b[1]).dataPack;
    dp = C.setEyeOffset(dp, g + 3, g + 4, 32, 16, sm[0], sm[1]).dataPack;
    any = true;
  }
  // 1.6.8: eyes moved in the drawer (small figure: half the way)
  for (const [g, [dx, dy]] of state.mouthShift || []) {   // mouth: the same way as the eyes
    dp = C.shiftEyes(dp, g, g + 2, dx, dy).dataPack; dp = C.shiftEyes(dp, g + 3, g + 5, half(dx), half(dy)).dataPack;
    any = true;
  }
  for (const [, m] of state.poseAdj || []) { if (m.size) { dp = C.layersMove(dp, [...m.values()]); any = true; } }   // single poses
  for (const [g, [dx, dy]] of state.eyeShift || []) {
    dp = C.shiftEyes(dp, g, g + 1, dx, dy).dataPack; dp = C.shiftEyes(dp, g + 3, g + 4, half(dx), half(dy)).dataPack;
    any = true;
  }
  return any ? dp : null;
}
function renderDim(preserveSelection = false) {
  const area = $('dimArea');
  const selection = preserveSelection ? Array.from(area.querySelectorAll('.assign select'), select => select.value) : [];
  area.replaceChildren();
  if (!state.dim) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = t('dimNone'); area.appendChild(p); return; }
  const dim = state.dim, ctx = state.ctx;
  const bar = document.createElement('div'); bar.className = 'assign';
  const selD = document.createElement('select'); dim.chars.forEach(c => { const o = document.createElement('option'); o.value = c.index; o.textContent = t('dimNr') + ' ' + c.index + (c.baby ? ' (' + t('dimBaby') + ')' : ''); selD.appendChild(o); });
  const selG = document.createElement('select'); ctx.groups.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = t('figure') + ' #' + g + (groupRole(g) ? ' (' + groupRole(g) + ')' : ''); selG.appendChild(o); }); if (ctx.groups.includes(ctx.adult)) selG.value = ctx.adult;
  for (const [index, select] of [selD, selG].entries()) {
    if (Array.from(select.options).some(option => option.value === selection[index])) select.value = selection[index];
  }
  const go = document.createElement('button'); go.className = 'btn primary small'; go.textContent = t('dimApply');
  go.onclick = () => busy(t("Applying Character"), async () => {
    const ch = dim.chars[+selD.value], g = +selG.value;
    const ok = insertDim(ch, g);
    measure('edit', 'character_import');
    refreshTile('fig', g); toast(t('dimOk', { d: ch.index, g }) + (state.eyeLayer && eyeRectFor(ch) && !ok ? '\n' + t('dimEyesTooBig') : ''));
  });
  const l1 = document.createElement('span'); l1.textContent = t('dimPick');
  const l2 = document.createElement('span'); l2.textContent = t('dimTarget');
  selD.setAttribute('aria-label', l1.textContent);
  selG.setAttribute('aria-label', l2.textContent);
  bar.append(l1, selD, l2, selG, go);
  if (dim.eggs.length && ctx.egg >= 0) {
    const eg = document.createElement('button'); eg.className = 'btn small'; eg.textContent = t('dimEgg');
    eg.onclick = () => {
      const e = C.dimEggSubs(dim.eggs);
      state.changed.set(ctx.egg, C.spriteEncode(ctx.entries[ctx.egg], e.small, {}));
      state.changed.set(ctx.egg + 3, C.spriteEncode(ctx.entries[ctx.egg + 3], e.big, {}));
      refreshTile('spr', ctx.egg); refreshTile('spr', ctx.egg + 3); toast(t('eggOk'));
    };
    bar.appendChild(eg);
  }
  area.appendChild(bar);
  // eye editor: the chosen card character large, the eye frame drawn, click to move it
  const ed = document.createElement('div'); ed.className = 'eyeed';
  const cv = document.createElement('canvas'); cv.className = 'eyecv';
  const side = document.createElement('div');
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = t('eyeHint');
  const none = document.createElement('label'); none.className = 'check';
  const cb = document.createElement('input'); cb.type = 'checkbox'; none.append(cb, document.createTextNode(' ' + t('eyeNone')));
  side.append(hint, none); ed.append(cv, side); if (state.eyeLayer) area.appendChild(ed);
  const S = 5;
  const draw = () => {
    const ch = dim.chars[+selD.value], im = ch.frames.idle1, r = eyeRectFor(ch);
    imgToCanvas(im, S, cv);
    const g2 = cv.getContext('2d');
    if (r) { g2.strokeStyle = '#ff2fa0'; g2.lineWidth = 2; g2.strokeRect(r[0] * S - 1, r[1] * S - 1, (r[2] - r[0] + 1) * S + 2, (r[3] - r[1] + 1) * S + 2); }
    cb.checked = !r;
  };
  cv.onclick = (e) => {
    const ch = dim.chars[+selD.value], b = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - b.left) / b.width * ch.frames.idle1.w), y = Math.floor((e.clientY - b.top) / b.height * ch.frames.idle1.h);
    state.eyeRects.set(ch, C.eyeRectAt(ch, x, y)); draw();
  };
  cb.onchange = () => { const ch = dim.chars[+selD.value]; state.eyeRects.set(ch, cb.checked ? null : (C.dimEyePreset(ch) || C.dimGuessEye(ch))); draw(); };
  selD.onchange = () => { state.dimSel = selD.value; draw(); };
  if (state.dimSel === undefined) { const c = dim.chars.find(x => !x.baby); if (c) state.dimSel = String(c.index); }
  if (state.dimSel !== undefined) selD.value = state.dimSel;
  const grid = document.createElement('div'); grid.className = 'dimgrid';
  dim.chars.forEach(c => {
    const b = document.createElement('button'); b.className = 'tile';
    b.innerHTML = '<div class="stage"></div><div class="cap"><b>' + t('dimNr') + ' ' + c.index + '</b>' + (c.baby ? ' ' + t('dimBaby') : '') + '</div>';
    b.querySelector('.stage').appendChild(imgToCanvas(c.frames.idle1, c.baby ? 3 : 1));
    b.onclick = () => { selD.value = c.index; state.dimSel = selD.value; grid.querySelectorAll('.tile').forEach(x => x.classList.toggle('sel', x === b)); draw(); };
    grid.appendChild(b);
  });
  area.appendChild(grid);
  draw();
}
$('btnDim').onclick = () => $('fileDim').click();
$('fileDim').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const raw = new Uint8Array(await f.arrayBuffer()); state.dim = C.smaDetect(raw) ? C.smaLoad(raw) : C.dimLoad(raw); state.dimSel = undefined; renderDim(); if (!state.dim.chars.length) toast(t('notDim', { e: t('cardNoChars') }), true); }
  catch (err) { toast(t('notDim', { e: em(err) }), true); }
};

// ------------------------------------------------------------ overview
/* 1.6.8: one chip for all emulators, the main one (A and C, or the first entry) in bold */
function planEmus(emuOn, kind) {
  const em = state.emu, xs = state.extras || [];
  const oldNm = () => (F.embedded() && F.feldApps(state.ctx.rom, F.embedded().stub).name0) || mainName(state.ctx.rom) || 'EMU';
  const mainNm = em ? emuNm(em) : emuOn ? oldNm() : '';
  const v = [];
  if (mainNm) v.push([mainNm, !doomMain()]);   // with DOOM as the main program the emulator goes to the menu
  if (!em && kind === 2 && state.emuRemove && !state.paraMainTaken) v.push([oldNm() + ' ' + t('stDel'), false]);
  xs.filter((x) => !OWN_CHIP.has(x.kind) && x.kind !== 'doom').forEach((x) => v.push([(v.length ? ', ' : '') + E.extraName(x), false]));
  if (!v.length) return [t('planEmus'), t('stNone'), 'off'];
  const isNew = !!em || xs.some((x) => !OWN_CHIP.has(x.kind) && x.fresh) || (!!state.extrasDirty && groupSig('emu') !== (state.sig0 || {}).emu), upd = emuUpPending() || emuAutoDirty() || !!(state.extrasUp && state.extrasUp.has('emu')), gone = !em && kind === 2 && state.emuRemove;
  if (isNew || upd || !gone) v.push([' · ' + (isNew ? t('stNew') : upd ? t('stUpd') : t('stSame')), false]);
  return [t('planEmus'), v, isNew || upd ? 'new' : gone ? 'del' : 'keep'];
}
/* 1.6.10 test2: Wolfenstein 3D with its own chip and its own part of the flash bar */
function planWolf() {
  const xs = (state.extras || []).filter((y) => y.kind === 'wolf');
  if (!xs.length) return [t('planWolf'), state.wolfInit ? t('stDel') : t('stNone'), state.wolfInit ? 'del' : 'off'];
  const what = xs.map((x) => {
    const inf = E.wolfInfo(x.pack) || { shareware: true, episodes: 1 };
    return inf.sod ? 'Spear of Destiny' : t(inf.shareware ? 'wolfShare' : 'wolfFull') + (inf.episodes > 1 ? ', ' + t('wolfEps', { n: inf.episodes }) : '');
  }).join(' + ');
  const fresh = xs.some((x) => x.fresh);
  return [t('planWolf'), (fresh ? t('stNew') : state.wolfKeysDirty ? t('stUpd') : t('stSame')) + ', ' + what, fresh || state.wolfKeysDirty ? 'new' : 'keep'];
}
/* 1.6.10 test4: Game Boy and Master System with their own chip and their own part of the flash bar */
const OWN_CHIP = new Set(['wolf', 'gb', 'sms', 'pm', 'ab']);
function groupKind(x) { return OWN_CHIP.has(x.kind) ? x.kind : 'emu'; }
function groupSig(g) {
  return JSON.stringify((state.extras || []).filter((x) => groupKind(x) === g).map((x) => [E.extraName(x), x.keys || null, !!x.inv, x.clock, x.nfc, x.opt, x.sess !== false]));
}
function planGroup(g, label) {
  const xs = (state.extras || []).filter((x) => x.kind === g), sig0 = (state.sig0 || {})[g], was = !!sig0 && sig0 !== '[]';
  if (!xs.length) return [label, was ? t('stDel') : t('stNone'), was ? 'del' : 'off'];
  const isNew = xs.some((x) => x.fresh), upd = !isNew && (groupSig(g) !== sig0 || !!(state.extrasUp && state.extrasUp.has(g)));
  return [label, xs.map((x) => E.extraName(x)).join(', ') + ' · ' + (isNew ? t('stNew') : upd ? t('stUpd') : t('stSame')), isNew || upd ? 'new' : 'keep'];
}
const formatNumber = (value, maximumFractionDigits) => new Intl.NumberFormat(locale(), { maximumFractionDigits }).format(value);
const MB = n => formatNumber(n / 1048576, n < 1048576 ? 2 : 1) + ' MB';
/* test17: the overview's free room from a quiet trial build (after removing a program, after loading) */
let roomSoonT = 0, roomSoonRun = false;
function roomSoon() {
  clearTimeout(roomSoonT);
  roomSoonT = setTimeout(async () => {
    if (roomSoonRun || toast.mute || !state.ctx || state.sixOff) return;
    const sig = roomSig(); if (state.roomFree && state.roomFree.sig === sig) return;
    roomSoonRun = true;
    try { const m = await roomTry(); if (!state.roomFree || state.roomFree.sig !== sig) state.roomFree = { sig, kb: -1 }; } finally { roomSoonRun = false; }   // 1.7.3 test13: a trial that failed (no programs, no room) says nothing about the room (it showed all as "reserved")
    if (roomSig() === sig) renderPlan();
  }, 400);
}
function renderFlashLayout(bar, leg, segs, total) {
  bar.classList.add('flash-layout');
  leg.classList.add('flash-layout');
  bar.replaceChildren();
  leg.replaceChildren();
  let offset = 0;
  segs.forEach(([k, l, n]) => {
    if (n <= 0) return;
    const i = document.createElement('i');
    i.className = 'seg ' + k;
    i.style.setProperty('--start', Math.min(100, offset / total * 100) + '%');
    offset += n;
    i.style.setProperty('--end', Math.min(100, offset / total * 100) + '%');
    i.title = l + ': ' + MB(n);
    bar.appendChild(i);
    const g = document.createElement('span'); g.innerHTML = '<i class="dot ' + k + '"></i>'; g.appendChild(document.createTextNode(l + ' ' + MB(n) + ' (' + formatNumber(n / total * 100, 1) + '%)')); leg.appendChild(g);
  });
}
function renderPlan() {
  const el = $('paradisePlanChanges'); if (!el || !state.ctx) return;
  const rom = state.ctx.rom, kind = appInstalled();
  const emuOn = !!state.emu || (kind === 2 && !state.emuRemove && !state.doom), doomOn = !!state.doom || (doomFree() && doomXs().length > 0) || (kind === 1 && !state.emuRemove && (!state.emu || !!state.launch));
  const fe = F.embedded(), menuOld = fe && F.feldFind(rom, fe.stub);
  const st = (on, isNew, old, extra) => on ? (isNew ? t('stNew') : t('stSame')) + (extra ? ', ' + extra : '') : (old ? t('stDel') : t('stNone'));
  const chips = [
    [t('planFig'), state.changed.size ? t('stChanged', { n: state.changed.size }) : t('stSame'), state.changed.size ? 'new' : 'keep'],
    planEmus(emuOn, kind),
    planGroup('gb', t('planGb')),
    planGroup('sms', t('planSms')),
    planGroup('pm', t('planPm')),
    planGroup('ab', t('planAb')),
    planWolf(),
    [t('planDoom'), st(doomOn, !!state.doom, kind === 1, state.doom ? (DOOM_EPS && doomFree() && state.doom.sel ? doomChip(state.doom) : 'E' + $('doomEp').value) + ($('doomMusic').checked ? ' + ' + t('doomMusic') : '') : ''), state.doom ? 'new' : doomOn ? 'keep' : kind === 1 ? 'del' : 'off'],
  ];
  const menuOn = menuWanted(), parts = [state.appsOnly ? t('appsOnlyOn') : '', state.launch ? t('planLaunch') : '', state.feld ? t(neonRom() ? 'neonSaves' : 'feldOn') : '', state.bag ? t('bagOn') : '', state.tama ? t('tamaOn') : '', menuOn && state.paramixShortcut !== false && !state.launch && !state.clean && !state.ctx.clean ? t('paramixShortcut') : '', state.gplay ? t('gplayOn') : ''].filter(Boolean).join(', ');
  const menuSame = state.appsOnly === state.appsOnlyInit && state.feld === state.feldInit && state.bag === state.bagInit && state.tama === state.tamaInit && state.paramixShortcut === state.paramixShortcutInit && !!state.gplay === !!state.gplayInit && state.saves === state.savesInit && state.launch === state.launchInit;
  if (state.clean) chips[0] = [t('planFig'), t('cleanOn'), state.cleanInit ? 'keep' : 'new'];
  chips.push([t('planMenu'), menuOn ? parts + (state.feldStale && menuSame ? ' (' + t('stUpd') + ')' : '') : (menuOld ? t('stDel') : t('stNone')), menuOn ? ((menuSame && !state.feldStale) ? 'keep' : 'new') : menuOld ? 'del' : 'off']);
  const sixIn = !!S6.sixInfo(rom);
  { const n = new Set([...(state.eyeShift || new Map()).keys(), ...(state.mouthShift || new Map()).keys(), ...(state.poseAdj || new Map()).keys()]).size; if (n) chips.push([t('planEyes'), t('planNamesN', { n }), 'new']); }
  if (state.texts && state.texts.size) chips.push([t('planNames'), t('planNamesN', { n: state.texts.size }), 'new']);
  if (sixIn || state.six || state.sixWant) chips.push([t('planSix'), sixIn ? t('stSame') : t('stNew'), sixIn ? 'keep' : 'new']);
  if (state.neonDonor) chips.push([t('neonDonorOn'), t('stNew'), 'new']);
  // Flash: from 0x111000 to the end
  const base = state.clean ? 0x10000 : 0x111000, end = 0x1000000, total = end - base, segs = [];
  const assets = state.clean ? 0 : estimateEnd() - base + (state.six && !sixIn ? 0xB9000 : 0); if (assets) segs.push(['fw', t('segFw'), assets]);
  let doomSize = 0, emuSize = 0;
  if (doomFree()) doomSize = doomXs().reduce((n, x) => n + E.extraSize(x), 0);
  else if (state.doom) { const f = state.doom.fit[$('doomEp').value]; doomSize = (f ? ($('doomMusic').checked && f.music ? f.sizeM : f.sizeP) : 0) + (0xD48000 - 0xCA0000); }
  else if (doomOn) doomSize = (rom[0x830000] | rom[0x830001] << 8 | rom[0x830002] << 16 | rom[0x830003] << 24) + (0xD48000 - 0xCA0000);
  if (state.emu) emuSize = state.emu.size || 0;
  else if (emuOn) { const c7 = E.t7Cfg(rom), c18 = E.t18Cfg(rom); if (c18) emuSize = c18.map.filter((b) => b !== 0xFFFF).length << 16; else if (c7) emuSize = c7.romLen + c7.figs.reduce((n, f) => n + f.len, 0); else { const o = 0xA0000 + 0x140 + 12; emuSize = rom[o] | rom[o + 1] << 8 | rom[o + 2] << 16 | rom[o + 3] << 24; } }
  const gs = { wolf: 0, gb: 0, sms: 0, pm: 0, ab: 0 };
  for (const x of state.extras || []) if (x.kind === 'doom') continue; else if (OWN_CHIP.has(x.kind)) gs[x.kind] += E.extraSize(x); else emuSize += E.extraSize(x);   // more emulators: program, save, data
  const wolfSize = gs.wolf;
  if (doomOn) segs.push(['doom', t('segDoom'), doomSize]);
  if (emuOn || (state.extras || []).some((x) => !OWN_CHIP.has(x.kind))) segs.push(['emu', t('segEmu'), emuSize]);
  if (gs.gb) segs.push(['gb', t('segGb'), gs.gb]);
  if (gs.sms) segs.push(['sms', t('segSms'), gs.sms]);
  if (gs.pm) segs.push(['pm', t('segPm'), gs.pm]);
  if (gs.ab) segs.push(['ab', t('segAb'), gs.ab]);
  if (wolfSize) segs.push(['wolf', t('segWolf'), wolfSize]);
  if (state.feld && !doomOn) { const ed = F.edition(rom); segs.push(['slots', t('segSlots'), ed ? ed.profile.names.length * 0x58000 : 0]); }
  // NEON_BAR: Neon Planets: its save lies between 0xD80000 and 0xF00000 (programs may use the MB behind it)
  const neonBar = NEON_BAR && !state.clean && SV.family(state.ctx.editionId) === 'neon';
  const save = state.clean ? 0 : neonBar ? 0xF00000 - 0xD80000 : (state.launch ? 0xF00000 : end) - 0xD29000; if (save) segs.push(['save', t('segSave'), save]);
  if (neonBar) segs.push(['resv', t('segResv'), 0x10000]);   // the rescue start's block   // start device: the MB behind the save is free for programs
  let used = segs.reduce((a, x) => a + x[2], 0);
  // test17 ROOM_REAL: in a start device the free part is what the last trial build really left (program parts need
  // whole, partly aligned blocks; the write protection block and the flash app count as used); the rest is programs
  const rfOk = ROOM_AUTO && state.launch && state.roomFree && state.roomFree.sig === roomSig(), rf = rfOk && state.roomFree.kb >= 0 ? state.roomFree.kb * 1024 : -1;
  if (rf >= 0) { const fix = total - used - rf, e = segs.find((x) => x[0] === 'emu'); if (fix > 0) segs.push(['resv', t('segResv'), fix]); else if (e) e[2] = Math.max(0, e[2] + fix); used = total - rf; }   // test18: what programs keep empty (spares, saves, gaps) apart
  else if (ROOM_AUTO && state.launch && state.ctx && !rfOk) roomSoon();
  segs.push(['free', t('segFree'), Math.max(0, total - used)]);
  el.innerHTML = '';
  const h = document.createElement('div'); h.className = 'plan-h'; h.textContent = t('planTitle'); el.appendChild(h);
  const row = document.createElement('div'); row.className = 'chips';
  chips.filter(([l, , c]) => c !== 'off' || l === t('planFig') || l === t('planMenu')).forEach(([l, v, c]) => {
    const d = document.createElement('span'); d.className = 'chip ' + c; d.innerHTML = '<b></b> <span></span>'; d.firstChild.textContent = l;
    if (Array.isArray(v)) for (const [txt, bold] of v) { const e = document.createElement(bold ? 'strong' : 'span'); e.textContent = txt; d.lastChild.appendChild(e); }   // 1.6.8: the main emulator in bold
    else d.lastChild.textContent = v;
    row.appendChild(d);
  });
  el.appendChild(row);
  renderFlashLayout($('paradiseLayoutBar'), $('paradiseLayoutLegend'), segs, total);
  if ((state.oldT7 || []).length) { const w = document.createElement('div'); w.className = 'rule warn'; w.textContent = t('t7Old', { n: state.oldT7.join(', ') }); el.appendChild(w); }
  if (state.t18Broken && (state.extras || []).some((x) => x.kind === 't18' && x.keepOff !== undefined)) { const w = document.createElement('div'); w.className = 'rule warn'; w.textContent = t('t18Broken'); el.appendChild(w); }

}

// ------------------------------------------------------------ emulator
function appInstalled() {
  try {
    const r = state.ctx.rom, fe = F.embedded();
    if (state.ctx.clean) return 0;   // CLEAN_ROM: no main program at 0x0A0000, every program is in the menu (DOOM too, test3)
    if (fe && F.isLaunch(r, fe.stub)) return F.appKind(r);   // 1.6.8: start device, the home screen hooks point to the trampolines
    return E.installedOrigs(r, E.sceneTable(r)) ? F.appKind(r) : 0;
  } catch (e) { return 0; }
}
function emuInstalled() { return appInstalled() === 2; }
function doomInstalled() { return appInstalled() === 1; }
/* Where the stub can sit: the emulator's own at 0x0B0000, or the menu's (also elsewhere) */
function stubList(rom) {
  const ee = E.embedded(), fe = F.embedded(), l = [];
  if (ee) l.push([E.STUB_OFF, ee.stub]);
  if (fe) { l.push([E.STUB_OFF, fe.stub]); const f = F.feldFind(rom, fe.stub); if (f && f.stubOff !== E.STUB_OFF) l.push([f.stubOff, fe.stub]); }
  return l;
}
function emuAutoDirty() { return (emuInstalled() || (doomInstalled() && !state.launch)) && !state.emu && !state.emuRemove && !state.doom && (!!E.autoGet(state.ctx.rom, stubList(state.ctx.rom)) !== !!state.emuAuto || (emuInstalled() && emuClockDirty())); }
function emuClockDirty() { const sv = E.emuSessGet(state.ctx.rom); if (sv !== null && sv !== (state.emuSess !== false)) return true; const c = E.emuClockGet(state.ctx.rom), n = E.emuNfcGet(state.ctx.rom), o = E.emuOptGet(state.ctx.rom), w = state.emuOpt || {}; return (c !== null && c !== !!state.emuClock) || (n !== null && n !== (state.emuNfc !== false)) || (!!o && (o.vol !== w.vol || o.dim !== w.dim || o.off !== w.off)); }
function emuUpPending() {
  const emb = E.embedded();
  if (state.emu || state.emuRemove || state.doom || !emb || !emuInstalled()) return false;
  try {
    if (F.emuType(state.ctx.rom) === 't7') return !!(E.t7Embedded() && E.t7Upgrade(state.ctx.rom, E.t7Embedded()));
    if (F.emuType(state.ctx.rom) === 'v1') return !!(E.v1Embedded() && E.v1Upgrade(state.ctx.rom, E.v1Embedded()));
    if (F.emuType(state.ctx.rom) === 't18') return !!(E.t18Embedded() && E.t18Upgrade(state.ctx.rom, E.t18Embedded(), E.embedded() && E.embedded().stub));
    return !!E.emuUpgrade(state.ctx.rom, emb.app);
  } catch (e) { return false; }
}
/* Room for emulator and DOOM: both need the area after the characters from 0x830000 and the program space at 0x0A0000 */
/* 1.6.9 test25: firmware that reaches past 0x0A0000 (Jade Forest wave 2 up to 0x0A1683, GitHub issue; Tropical, Glacier):
 * no main program there, but a start device puts every program into the menu (appsPlace, anywhere free) */
function a0Free() { const r = state.ctx.rom; return !!F.appKind(r) || r.subarray(0xA0000, 0xA1000).every(b => b === 0xFF); }
function appRoom() { return !a0Free() || estimateEnd() <= 0x830000; }   // without a main program the trial build decides (roomMissing)
function renderEmu() {
  if (!state.ctx) return;
  renderGb();
  renderSms();
  renderPm();
  renderAb();
  const has = emuInstalled();
  $('btnEmuOff').hidden = true; $('btnEmuUndo').hidden = true;   // 1.6.8: in the list of programs (×, ↺)
  let s;
  if (!E.embedded()) s = t('emuMissing');
  const t7In = has && F.emuType(state.ctx.rom) === 't7', t7 = state.emu ? !!state.emu.t7 : t7In && !state.emuRemove;
  const t18In = has && F.emuType(state.ctx.rom) === 't18', t18 = state.emu ? !!state.emu.t18 : t18In && !state.emuRemove;
  const t7Fr = state.emu ? !!state.emu.t7 && E.t7Kind(state.emu.rom) === 'friends' : t7In && !!E.t7Cfg(state.ctx.rom) && E.t7Cfg(state.ctx.rom).romLen === 0xC0000;
  if (state.emu) s = state.emu.v1 ? t(E.v3Detect(state.emu.rom) ? 'v3Ok' : 'v1Ok') : state.emu.t7 ? t(t7Fr ? 't7OkFr' : 't7Ok') : state.emu.t18 ? t('t18Ok') : t('emuOk', { size: E.DEVICES[state.emu.dev].label });
  else if (state.emuRemove) s = t('emuGone');
  else s = has ? t(t7In ? (t7Fr ? 't7HasFr' : 't7Has') : t18In ? 't18Has' : 'emuHas') + (emuUpPending() ? ' ' + t('emuUp') : '') : (state.extras && state.extras.length ? t('emuInList', { n: state.extras.map((x) => E.extraName(x)).join(', ') }) : t('emuNone'));
  const v1 = state.emu ? !!state.emu.v1 : has && F.emuType(state.ctx.rom) === 'v1' && !state.emuRemove;
  const v3 = v1 && E.v3Detect(state.emu ? state.emu.rom : E.v1FromRom(state.ctx.rom));
  s += (state.emu || (has && !state.emuRemove) ? '\n' + t(v3 ? 'v3Use' : v1 ? 'v1Use' : t7 ? 't7Use' : t18 ? 't18Use' : 'emuUse') : '');
  const bigIn = has && !state.emu && !state.emuRemove && state.ctx.rom[0xA0148] === 0 && state.ctx.rom[0xA014A] === 0x84;
  if ((state.emu && state.emu.big) || bigIn) s += '\n' + t('emuBig');
  if (PACK_WARN && mainFew()) s += '\n' + t('packFew');
  const room = appRoom();
  $('btnEmu').disabled = !room;
  if (!room) s = t('noRoomApp');
  else if (!a0Free()) s += '\n' + t(state.launch ? 'a0Menu' : 'a0MenuN');
  else if (!state.launch && !state.emu && (state.doom || (doomInstalled() && !state.emuRemove))) s += '\n' + t('emuVsDoom');
  $('emuStat').textContent = s;
  renderT7Figs(t7 && room && !t7Fr);
  renderApps();
  $('emuAutoRow').hidden = true; $('emuClockRow').hidden = true;   // 1.6.8: in the main program's row
  { const is4u = state.emu ? (state.emu.dev === '4u' || state.emu.dev === '4u-plain') : (!state.emuRemove && E.emuNfcGet(state.ctx.rom) !== null); $('emuNfcRow').hidden = true; void is4u; $('emuNfc').checked = state.emuNfc !== false; }
  $('emuAuto').checked = !!state.emuAuto;
  $('emuClock').checked = state.emuClock !== false;
  renderPlan();
  $('emuDlc').hidden = true;   // 1.6.8: settings, figures and download slots open per program in the list (▾)
  $('btnT7Fig').hidden = true;
}
/* T7Emu figures: list with remove buttons */
function t7State() {
  if (state.emu && state.emu.t7) return state.emu;
  const cur = E.t7FromRom(state.ctx.rom); if (!cur) return null;
  return { t7: true, dev: 't7', rom: cur.rom, figs: cur.figs, size: 0 };
}
function t7Size(st) { return st.rom.length + st.figs.reduce((n, f) => n + f.data.length, 0); }
/* 1.6.8: download items and figures also for the programs in the menu. Target: 'main' or the index in state.extras */
const DLC_DEV = ['idl', 'ps', '4u', '4u-plain'];
/* tg: 'main' or the index in state.extras (default: the file dialog's target state.dlcT) */
function dlcTarget(tg = state.dlcT) {
  if (typeof tg === 'number') { const x = (state.extras || [])[tg]; return x && x.kind === 'tama' && DLC_DEV.includes(x.dev) ? { guest: x.guest, dev: x.dev, set: (g) => { x.guest = g; state.extrasDirty = true; } } : null; }
  const em = state.emu;
  if (em) return !em.t7 && !em.t18 && !em.v1 && DLC_DEV.includes(em.dev) ? { guest: em.guest, dev: em.dev, set: (g) => { em.guest = g; } } : null;
  // the installed main TamaEmu: its firmware with the save, read from the ROM; it goes into the work on the first change
  const mg = state.mainGuest;
  if (mg && !state.emuRemove) return { guest: mg.g, dev: mg.dev, set: (g) => { const pk = E.packMain(g, mg.dev, null, !!state.emuPack); state.emu = { guest: g, dev: mg.dev, size: pk.blob.length, big: pk.big, kept: true }; state.mainGuest = null; } };
  return null;
}
/* test5: Gotchi Points of a Tama-Go (T7Emu): EEPROM 0x030-0x034, 5 bytes BCD lowest digits first, no checksum
 * (save.bin: behind the 2 byte page mask). Goes in like an imported save: the running state starts anew. */
function t7GpSave(tg) {
  const rom = state.ctx.rom;
  if (tg === 'main') return state.t7save || SV.t7SaveOut(rom);
  const x = state.extras[tg]; if (!x || x.kind || x.fresh) return null;
  if (state.t7saveX && state.t7saveX.i === tg) return state.t7saveX.save;
  const o = romExtras(rom).find((r) => E.extraKind(r) === 't7' && r.rom.length === x.rom.length && r.rom.every((v, k) => v === x.rom[k]));
  return o ? SV.t7SaveOut(rom, o.saveOff) : null;
}
function t7GpGet(sv) {
  let n = 0;
  for (let i = 4; i >= 0; i--) { const v = sv[0x32 + i], hi = v >> 4, lo = v & 15; if (hi > 9 || lo > 9) return -1; n = n * 100 + hi * 10 + lo; }
  return n;
}
function t7GpInto(box, tg) {
  const sv = t7GpSave(tg); if (!sv || !(sv[0] & 1)) return;   // page 0 of the EEPROM must be there
  const n = t7GpGet(sv); if (n < 0) return;
  const l = document.createElement('label'); l.className = 'check'; const sp = document.createElement('span'); sp.textContent = t('t7Gp') + ' ';
  const inp = document.createElement('input'); inp.type = 'number'; inp.min = 0; inp.max = 999999; inp.value = String(n); inp.style.width = '7em';
  inp.onchange = () => {
    let v = Math.max(0, Math.min(999999, Math.floor(+inp.value || 0)));
    const g = new Uint8Array(sv);
    for (let i = 0; i < 5; i++) { const d = v % 100; g[0x32 + i] = ((d / 10 | 0) << 4) | (d % 10); v = Math.floor(v / 100); }
    if (tg === 'main') state.t7save = g; else state.t7saveX = { i: tg, save: g };
    renderPlan(); renderEmu();
  };
  l.append(sp, inp); box.appendChild(l);
  const w = document.createElement('div'); w.className = 'hint'; w.textContent = t('t7GpHint'); box.appendChild(w);
}
/* 1.6.8 (test47): items of T18Emu (MyMeets files) go straight into its firmware's save; the running state starts anew */
function t18Target(tg) {
  if (typeof tg === 'number') { const x = (state.extras || [])[tg]; return x && x.kind === 't18' ? { fw: x.fw, set: () => { x.items = true; state.extrasDirty = true; } } : null; }
  const em = state.emu;
  if (em) return em.t18 ? { fw: em.rom, set: () => { em.items = true; } } : null;
  if (!emuInstalled() || state.emuRemove || F.emuType(state.ctx.rom) !== 't18') return null;
  if (!state.t18Main) state.t18Main = E.t18FromRom(state.ctx.rom);
  const fw = state.t18Main; if (!fw) return null;
  return { fw, set: () => { state.t18Dirty = true; } };   // written into the installed program on save (E.t18RomWriteGuest)
}
function picCanvas(pic, sc) {
  const c = document.createElement('canvas'); c.className = 'itempic';
  if (!pic) { c.width = c.height = 1; return c; }
  c.width = pic.w; c.height = pic.h; c.style.width = (pic.w * sc) + 'px'; c.style.height = (pic.h * sc) + 'px';
  c.getContext('2d').putImageData(new ImageData(pic.rgba, pic.w, pic.h), 0, 0); return c;
}
/* test47: pictures for "grow up" (the user's own files: <name>.png, <id>.png or the Android T18Emu set with erwachsen.json) */
function t18PicsInto(box) {
  const h = document.createElement('h4'); h.className = 'subhead'; h.textContent = t('t18Pics'); box.appendChild(h);
  const tools = document.createElement('div'); tools.className = 'tools';
  const pick = document.createElement('button'); pick.className = 'btn small'; pick.textContent = t('t18PicsPick'); pick.onclick = () => $('fileT18Pic').click();
  tools.appendChild(pick);
  if (state.t18Pics && state.t18Pics.size) { const del = document.createElement('button'); del.className = 'btn small'; del.textContent = t('t18PicsDel'); del.onclick = () => { state.t18Pics = new Map(); state.t18PicsDirty = true; renderEmu(); }; tools.appendChild(del); }
  box.appendChild(tools);
  if (state.t18Pics && state.t18Pics.size) {
    const g = document.createElement('div'); g.className = 'picgrid';
    for (const [id, p] of state.t18Pics) { const f = document.createElement('figure'); const c = picCanvas(E.t18PicRgba(p), 1); const cap = document.createElement('figcaption'); cap.textContent = (E.T18_ADULTS.find((a) => a[0] === id) || [0, '#' + id])[1]; f.append(c, cap); g.appendChild(f); }
    box.appendChild(g);
  }
  const w = document.createElement('div'); w.className = 'hint'; w.textContent = t('t18PicsHint'); box.appendChild(w);
}
async function pngRgba(bytes) {
  const { w, h, data } = await decodePng(new Blob([bytes], { type: 'image/png' }), {});
  return { w, h, rgba: data };
}
/* test3: items or Tamapoints changed: with "keep saves" the device would bring back its own T18 save (session, sector
 * tables, spare blocks) over the changed one. The whole T18 save comes from the image then (it is the device's state at
 * reading plus the change). */
function t18Fresh(rom, off, fresh) {
  const c = E.extraCfg(rom, off); if (!c || c.kind !== 't18') return;
  fresh.push([c.saveOff, c.saveOff + 0x24000]);
  for (const b of c.spare) if (b !== 0xFFFF) fresh.push([b << 16, (b + 1) << 16]);
}
/* test2: a name the Studio cannot read (Japanese letters) shows as its number */
function t18Nm(r) { return r.readable !== false || !r.cat ? r.name : t('t18ItemNo', { n: r.cat }); }
/* test6: MixingMeets for T18Emu on the Paradise. The page (mixing-meets.com, Connect and Return) speaks Web Bluetooth
 * with "TMGC_meets" (service fff0, fff1 notify, fff2 write). This bookmarklet replaces navigator.bluetooth on that page:
 * "Select Tamagotchi" then opens the serial port of the UART dongle on the Paradise's contacts, and T18Emu hands the data
 * to the firmware's Bluetooth module, as the Android T18Emu does. Frames: see t18/src/app/main.c (T18_LINK). */
/* 1.7.6 BRIDGE_WAIT: the Tama waits only about 20 s for the app. Select Tamagotchi now also works first: the bridge
 * waits until the Tama reports its module set up (hello bit 0, CONNECTION, APP, VISIT) and says so; what went wrong
 * stays in the box (reported: "fail" on the Tama, nothing else known). */
const BRIDGE_WAIT = true;
function pmxBridge(bw) {
  if (window.__pmxBridge) { alert('ParaLab: bridge already on'); return; }
  if (!navigator.serial) { alert('ParaLab: this browser has no Web Serial (Chrome or Edge on a computer)'); return; }
  window.__pmxBridge = 1;
  const bn = document.createElement('div');
  bn.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#1d2b44;color:#fff;padding:8px 12px;border-radius:8px;font:13px/1.3 sans-serif;max-width:320px';
  let er = '';
  const bt = document.createElement('span'); bn.appendChild(bt);
  const st = (m, e) => { if (bw && e) er = m; bt.textContent = 'ParaLab: ' + m + (bw && er && er !== m ? '\n(before: ' + er + ')' : ''); };
  if (bw) bn.style.whiteSpace = 'pre-line';
  st('bridge on. Select Tamagotchi, then choose the dongle.'); document.body.appendChild(bn);
  const FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb', FFF1 = '0000fff1-0000-1000-8000-00805f9b34fb', FFF2 = '0000fff2-0000-1000-8000-00805f9b34fb';
  let port = null, reader = null, writer = null, hello = 0, hf = 0, ack = null, ping = null, live = false;
  const notes = [], gone = [];
  let fs = 0, fty = 0, flen = 0, fbuf = [], fsum = 0;
  const frame = (ty, d) => { const a = new Uint8Array(4 + d.length); a[0] = 0x5A; a[1] = ty; a[2] = d.length; let s = ty + d.length; for (let i = 0; i < d.length; i++) { a[3 + i] = d[i]; s += d[i]; } a[3 + d.length] = s & 255; return a; };
  const send = (ty, d) => writer.write(frame(ty, d || []));
  const R = { uuid: FFF1, properties: { notify: true, read: false, write: false, writeWithoutResponse: false }, value: null,
    addEventListener: (ty, fn) => { if (ty === 'characteristicvaluechanged') notes.push(fn); }, removeEventListener: () => {},
    startNotifications: async () => R, stopNotifications: async () => R };
  const got = (ty, d) => {
    if (ty === 0x48) { hello = Date.now(); const f = d.length ? d[0] : 0; if (bw && live && (hf & 1) && !(f & 1)) st('the Tama closed the connection.'); hf = f; return; }
    if (ty === 0x4B) { const a = ack; ack = null; if (a) a(); return; }
    if (ty === 0x4E) { const u = new Uint8Array(d); R.value = new DataView(u.buffer); for (const fn of notes) { try { fn({ target: R }); } catch (e) { console.error(e); } } }
  };
  const feed = (b) => {
    if (fs === 0) { if (b === 0xA5) fs = 1; return; }
    if (fs === 1) { fty = b; fsum = b; fs = 2; return; }
    if (fs === 2) { if (b > 64) { fs = 0; return; } flen = b; fsum += b; fbuf = []; fs = flen ? 3 : 4; return; }
    if (fs === 3) { fbuf.push(b); fsum += b; if (fbuf.length >= flen) fs = 4; return; }
    fs = 0; if ((fsum & 255) === b) got(fty, fbuf);
  };
  const down = () => { if (!live) return; live = false; dev.gatt.connected = false; clearInterval(ping); for (const fn of gone) { try { fn({ target: dev }); } catch (e) {} } };
  const readLoop = async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; for (const b of value) feed(b); } } catch (e) {} st('dongle closed', 1); down(); };
  const write = async (data) => {
    if (!live) throw new Error('Your Tama disconnected');
    const u = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let o = 0; o < u.length; o += 60) {
      const p = new Promise((res, rej) => { ack = res; setTimeout(() => { if (ack === res) { ack = null; if (bw) st('the Paradise did not answer.', 1); rej(new Error('Paradise did not answer')); } }, bw ? 60000 : 15000); });   // BRIDGE_WAIT: the game may take its time (marriage)
      await send(0x57, Array.from(u.subarray(o, o + 60))); await p;
    }
  };
  const T = { uuid: FFF2, properties: { write: true, writeWithoutResponse: false, notify: false, read: false },
    writeValueWithResponse: write, writeValue: write, writeValueWithoutResponse: write };
  const svc = { uuid: FFF0, isPrimary: true, getCharacteristic: async (u) => { u = String(u).toLowerCase(); if (u.indexOf('fff1') >= 0) return R; if (u.indexOf('fff2') >= 0) return T; throw new Error('No characteristic ' + u); } };
  const dev = { id: 'paramix', name: 'TMGC_meets', addEventListener: (ty, fn) => { if (ty === 'gattserverdisconnected') gone.push(fn); }, removeEventListener: () => {} };
  dev.gatt = { device: dev, connected: false,
    connect: async () => { await send(0x43, [1]); live = true; dev.gatt.connected = true; clearInterval(ping); ping = setInterval(() => { send(0x50, []).catch(() => {}); }, 1000); st('connected to the Paradise'); return dev.gatt; },
    disconnect: () => { if (writer) send(0x43, [0]).catch(() => {}); down(); },
    getPrimaryService: async (u) => { if (String(u).toLowerCase().indexOf('fff0') < 0) throw new Error('No services matching UUID ' + u); return svc; } };
  const requestDevice = async () => {
    if (!port) {
      const pp = await navigator.serial.requestPort();
      try { await pp.open({ baudRate: 460800, bufferSize: 4096 }); }
      catch (e) { st('the dongle is busy. In ParaLab press "Release UART" (or close ParaLab), then try again.'); alert('ParaLab: the dongle is busy.\nParaLab still holds it: press "Release UART" there or close ParaLab, then try again.'); throw e; }
      port = pp;
      reader = port.readable.getReader(); writer = port.writable.getWriter(); readLoop();
    }
    st('looking for T18Emu on the Paradise...');
    const t0 = Date.now(); while (!hello && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
    if (!hello) { st('no answer from the Paradise. Start TAMA MEETS on it and check the dongle.', 1); throw new Error('Paradise not found: start T18Emu and check the dongle'); }
    if (bw && !(hf & 1)) {
      st('Paradise found. On the Tama now: CONNECTION, APP, VISIT.');
      const t1 = Date.now(); while (!(hf & 1) && Date.now() - t1 < 120000) { if (Date.now() - hello > 4000) break; await new Promise((r) => setTimeout(r, 100)); }
      if (!(hf & 1)) { st(Date.now() - hello > 4000 ? 'the Paradise stopped answering.' : 'the Tama did not wait for the app (CONNECTION, APP, VISIT).', 1); throw new Error('Tama not ready'); }
    }
    st('Paradise found'); return dev;
  };
  try { Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice, getAvailability: async () => true } }); }
  catch (e) { alert('ParaLab: could not take over Bluetooth on this page'); }
  window.addEventListener('pagehide', () => { try { if (writer) writer.write(frame(0x43, [0])); } catch (e) {} });
}
function pmxBridgeHref() { return 'javascript:' + encodeURIComponent('(' + pmxBridge.toString() + ')(' + BRIDGE_WAIT + ')'); }
window.pmxBridgeHref = pmxBridgeHref;   // for the test
window.pmxTest = { uartWarnInto: (b) => uartWarnInto(b), devFree: () => devFree(), devRender: () => devRender(), dv: () => dv };
function t18BridgeInto(box) {
  const h = document.createElement('h4'); h.className = 'subhead'; h.textContent = t('mmTitle'); box.appendChild(h);
  const a = document.createElement('a'); a.className = 'btn small'; a.href = pmxBridgeHref(); a.textContent = t('mmLink'); a.onclick = (e) => { e.preventDefault(); toast(t('mmDrag')); };
  box.appendChild(a);
  const w = document.createElement('div'); w.className = 'hint'; w.style.whiteSpace = 'pre-line'; w.textContent = t(BRIDGE_WAIT ? 'mmHint2' : 'mmHint'); box.appendChild(w);
  uartWarnInto(box);
  pairInto(box, 'pairHint');
}
/* 1.6.9: visits over the contacts for the other emulators (T7Emu Tama-Go so far) */
const IR_HINT = { ps: 'pairHintPs', idl: 'pairHintIdl' };   /* TamaEmu with the infrared link (1.6.9) */
function linkInto(box, hint) { pairInto(box, hint); }
/* test7: the bridge page needs the dongle for themselves. While the Studio holds it, say so and
 * offer to let it go. */
const uartWarns = [];
function uartWarnRender() {
  for (const b of uartWarns) { if (!b.isConnected) continue; b.hidden = !dv.io; }
}
function uartWarnInto(box) {
  const d = document.createElement('div'); d.className = 'uartwarn';
  const m = document.createElement('span'); m.textContent = t('uartBusy') + ' ';
  const k = document.createElement('button'); k.className = 'btn small'; k.textContent = t('uartFree'); k.onclick = () => devFree();
  d.append(m, k); box.appendChild(d); uartWarns.push(d); d.hidden = !dv.io;
}
async function devFree() {
  if (dv.run) { toast(t('uartRun')); return; }
  try { if (dv.io) await dv.io.close(); } catch (e) {}
  dv.io = null; dv.d = null; dv.loaded = false; $('devProgress').hidden = true; devRender(''); toast(t('uartFreed'));
}
/* 1.6.9: visits between two Paradise: plugged together at the top, the programs talk over the contacts themselves */
function pairInto(box, hint) {
  const h = document.createElement('h4'); h.className = 'subhead'; h.textContent = t('pairTitle'); box.appendChild(h);
  const w = document.createElement('div'); w.className = 'hint'; w.style.whiteSpace = 'pre-line'; w.textContent = t(hint); box.appendChild(w);
}
function t18ItemsInto(box, tg) {
  const T = t18Target(tg); if (!T) return;
  const it = E.t18Items(T.fw);
  const h = document.createElement('h4'); h.className = 'subhead'; h.textContent = t('t18Items'); box.appendChild(h);
  if (!it.save) { const w = document.createElement('div'); w.className = 'hint'; w.textContent = t('t18ItemsNoSave'); box.appendChild(w); return; }
  const tools = document.createElement('div'); tools.className = 'tools';
  const pick = document.createElement('button'); pick.className = 'btn small'; pick.textContent = t('t18ItemsPick');
  pick.onclick = () => { state.itemT = tg; $('fileT18Item').click(); };
  const pl = document.createElement('label'); pl.className = 'check'; const ps = document.createElement('span'); ps.textContent = t('t18Points') + ' ';
  const pi = document.createElement('input'); pi.type = 'number'; pi.min = 0; pi.max = 65535; pi.value = String(it.points); pi.style.width = '7em';
  pi.onchange = () => { E.t18Points(T.fw, +pi.value || 0); T.set(); renderEmu(); };
  pl.append(ps, pi); tools.append(pick, pl); box.appendChild(tools);
  const grid = document.createElement('div'); grid.className = 'dlcgrid';
  for (const a of it.areas) {
    const d = document.createElement('div'); d.className = 'dlcbox';
    const used = a.slots.filter((x) => x.rec);
    const hh = document.createElement('h4'); hh.textContent = t('t18A_' + a.key) + ' ' + used.length + '/' + (used.length + a.free); d.appendChild(hh);
    for (const x of used) {
      const r = document.createElement('div'); r.className = 'dlcrow';
      const n = document.createElement('span'); n.className = 'itemname'; n.append(picCanvas(x.rec.pic, 1), document.createTextNode(' ' + t18Nm(x.rec)));
      const sel = document.createElement('select'); [1, 2, 3].forEach((v) => { const o = document.createElement('option'); o.value = String(v); o.textContent = v + '×'; sel.appendChild(o); });
      sel.value = String(x.count); sel.onchange = () => { E.t18ItemCount(T.fw, a.key, x.n, +sel.value); T.set(); renderEmu(); }; if (a.noCount) sel.hidden = true;
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t('dlcDel');
      b.onclick = () => { E.t18ItemDel(T.fw, a.key, x.n); T.set(); toast(t('dlcGone', { n: t18Nm(x.rec) })); renderEmu(); };
      const ctl = document.createElement('span'); ctl.className = 'itemctl'; ctl.append(sel, b); r.append(n, ctl); d.appendChild(r);
    }
    const f = document.createElement('div'); f.className = 'dlcrow free'; f.textContent = t('dlcFreeN', { n: a.free }); d.appendChild(f);
    grid.appendChild(d);
  }
  { const d = document.createElement('div'); d.className = 'dlcbox';
    const hh = document.createElement('h4'); hh.textContent = t('t18A_room'); d.appendChild(hh);
    const r = document.createElement('div'); r.className = 'dlcrow';
    if (it.room) {
      const n = document.createElement('span'); n.className = 'itemname'; n.append(picCanvas(it.room.pic, 0.5), document.createTextNode(' ' + t18Nm(it.room)));
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t('t18RoomBack');
      b.onclick = () => { E.t18RoomReset(T.fw); T.set(); renderEmu(); };
      r.append(n, b);
    } else r.textContent = t('t18RoomBuiltin');
    d.appendChild(r); grid.appendChild(d); }
  box.appendChild(grid);
  const w = document.createElement('div'); w.className = 'hint'; w.textContent = t('t18ItemsHint'); box.appendChild(w);
}
function figTarget(tg = state.figT) {
  if (typeof tg === 'number') { const x = (state.extras || [])[tg]; if (!x || x.kind || E.t7Kind(x.rom) !== 'go') return null; x.figs = x.figs || []; return x; }
  return t7State();
}
async function mainGuestLoad() {
  if (state.mainGuest) return true;
  const cfg = romEmuCfg(state.ctx.rom); if (!cfg) return false;
  const g = await SV.emuGuestAsync((a, n) => state.ctx.rom.subarray(a, a + n), cfg);
  state.mainGuest = { g, dev: cfg.dev };
  return true;
}
function renderT7Figs() { $('btnT7Fig').hidden = true; $('t7Figs').hidden = true; }   // 1.6.8: the figures are in the program's row
/* list of the figures of one T7Emu, each with × */
function figsInto(box, tg) {
  const st = figTarget(tg); if (!st) return;
  if (!st.figs.length) { const d = document.createElement('span'); d.className = 'hint'; d.textContent = t('t7FigNone'); box.appendChild(d); return; }
  const wrap = document.createElement('div'); wrap.className = 'chips';
  st.figs.forEach((f, i) => {
    const c = document.createElement('span'); c.className = 'chip keep'; c.textContent = E.t7FigName(f.name) + ' ';
    const x = document.createElement('button'); x.className = 'btn small'; x.textContent = '×';
    x.onclick = () => { const s2 = figTarget(tg); s2.figs.splice(i, 1); if (typeof tg === 'number') state.extrasDirty = true; else { s2.size = t7Size(s2); state.emu = s2; emuRemoveClear(); } renderEmu(); };
    c.appendChild(x); wrap.appendChild(c);
  });
  box.appendChild(wrap);
}
/* the download content stores of one TamaEmu, each slot with its name */
function dlcInto(box, tg) {
  const g0 = dlcTarget(tg); if (!g0) return;
  const grid = document.createElement('div'); grid.className = 'dlcgrid';
  for (const st of E.dlcStores(g0.guest)) {
    const used = st.slots.filter(x => x.name).length;
    const d = document.createElement('div'); d.className = 'dlcbox';
    const h = document.createElement('h4'); h.textContent = t('dlcK' + st.kind) + ' ' + used + '/' + st.slots.length; d.appendChild(h);
    for (const x of st.slots) {
      if (!x.name) continue;
      const r = document.createElement('div'); r.className = 'dlcrow';
      const n = document.createElement('span'); n.textContent = x.name;
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t('dlcDel');
      b.onclick = () => { const g = dlcTarget(tg); g.set(E.dlcFree(g.guest, st.kind, x.slot)); if (E.SAVE_FLAG[g.dev] && E.SAVE_FLAG[g.dev].kind === st.kind) stampMark(tg, 0); toast(t('dlcGone', { n: x.name })); renderEmu(); };
      r.append(n, b); d.appendChild(r);
    }
    const f = document.createElement('div'); f.className = 'dlcrow free'; f.textContent = t('dlcFreeN', { n: st.slots.length - used }); d.appendChild(f);
    grid.appendChild(d);
  }
  box.appendChild(grid);
}
function selectInto(box, label, items, val, fn) {
  const r = document.createElement('div'); r.className = 'tools';
  const l = document.createElement('label'); l.className = 'check';
  const sp = document.createElement('span'); sp.textContent = label + ' ';
  const sel = document.createElement('select'); items.forEach((txt, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = txt; sel.appendChild(o); });
  sel.value = String(val || 0); sel.onchange = () => fn(+sel.value);
  l.append(sp, sel); r.appendChild(l); box.appendChild(r);
}
/* 1.6.8: TamaEmu and T18Emu options (set here, the toy has no menu for them) */
function optInto(box, o, set) {
  selectInto(box, t('optVol'), [t('optVolN'), t('optVolQ'), t('optVolL'), t('optOff')], o.vol, (v) => { o.vol = v; set(); });
  { const U = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0];   // 5 % .. 100 %
    selectInto(box, t('optDim'), U.map((i) => E.OPT_LV[i] + ' %'), Math.max(0, U.indexOf(o.dim)), (v) => { o.dim = U[v]; set(); }); }
  selectInto(box, t('optScr'), [t('optScrToy'), '10 s', '20 s', '30 s', '1 Min', '2 Min', '5 Min', '10 Min'], o.off, (v) => { o.off = v; set(); });
  const h = document.createElement('p'); h.className = 'hint'; h.textContent = t('optDev'); box.appendChild(h);
}
/* 1.7.3 test7: the program's "remember where you left off" taken over from the ROM */
function sessKeep(x, y) { if (x.sess === false) y.sess = false; return y; }
const SESS_KINDS = new Set(['tama', 't18', 't7', 'v1', 'gb', 'sms', 'pm', 'ab']);
function clockOff() { return !!state.clean && state.cleanClock === false; }
function checkInto(box, label, hint, on, fn, off) {
  const r = document.createElement('div'); r.className = 'tools';
  const l = document.createElement('label'); l.className = 'check';
  const c = document.createElement('input'); c.type = 'checkbox'; c.checked = on; c.disabled = !!off; c.onchange = () => fn(c.checked);
  const sp = document.createElement('span'); sp.textContent = label;
  l.append(c, ' ', sp); r.appendChild(l);
  if (hint) { const h = document.createElement('span'); h.className = 'hint'; h.textContent = hint; r.appendChild(h); }
  box.appendChild(r);
}
/* All programs in one list (1.6.8). Each row opens with ▾: its settings, figures or download slots. */
function renderApps() {
  const box = $('appsList'); box.innerHTML = '';
  const room = appRoom();
  $('btnApp').disabled = !room || !E.t7Embedded();
  state.progOpen = state.progOpen || new Set();
  const row = (key, name, tag, cls, btns, detail) => {
    const r = document.createElement('div'); r.className = 'prow ' + (cls || '');
    const open = !!detail && state.progOpen.has(key);
    if (detail) { const tb = document.createElement('button'); tb.className = 'btn small ptog'; tb.textContent = open ? '▴' : '▾'; tb.title = t('progMore'); tb.onclick = () => { if (open) state.progOpen.delete(key); else state.progOpen.add(key); renderEmu(); }; r.appendChild(tb); }
    const n = document.createElement('span'); n.className = 'pname'; n.textContent = name;
    const g = document.createElement('span'); g.className = 'ptag'; g.textContent = tag;
    r.append(n, g);
    for (const [txt, fn, title, c, off] of btns) { const b = document.createElement('button'); b.className = 'btn small' + (c ? ' ' + c : ''); b.textContent = txt; if (title) b.title = title; if (fn) b.onclick = fn; if (off) b.disabled = true; r.appendChild(b); }
    box.appendChild(r);
    if (open) { const d = document.createElement('div'); d.className = 'pdet'; detail(d); box.appendChild(d); }
  };
  const has = emuInstalled(), em = state.emu, tagMain = t(state.launch ? 'progMainL' : 'progMain');
  // DOOM at 0x0A0000 is the main program then (in a start device the emulators all go to the menu)
  const dm = doomMain();
  const dIn = doomInstalled(), dGone = dIn && !state.doom && (state.emuRemove || (!state.launch && !!state.emu));
  const doomOut = () => { if (state.doom) state.doom = null; else { state.emuRemove = true; if (!state.launch) state.emu = null; } renderEmu(); renderDoom(); };
  const doomBack = () => { state.emuRemove = false; if (!state.launch) state.emu = null; renderEmu(); renderDoom(); };
  // 1.6.9 test13: in the start device DOOM stays at 0x0A0000, but the main program (first in the menu, can start when
  // switched on) can be any program of the list (switch FELD_AUTO in the menu)
  const lp = !!state.launch && (dm || !!state.clean) && mainV9();
  if (lp && state.mainPick && state.mainPick !== 'emu' && !(state.extras || []).includes(state.mainPick)) state.mainPick = null;
  if (lp && state.mainPick === 'emu' && !em) state.mainPick = null;
  const pick = (v) => { state.mainPick = v; state.mainDirty = true; renderEmu(); };
  const autoL = (d) => checkInto(d, t('emuAuto'), t('autoHintL'), !!state.emuAuto, (v) => { state.emuAuto = v; state.mainDirty = true; renderEmu(); });
  const star = (on, v) => on ? ['★', null, t('progIsMain'), 'pstar on', true] : ['☆', () => pick(v), t('progMakeMain'), 'pstar'];
  const doomIsMain = dm && !(lp && state.mainPick);
  if (dm) row('doom', 'DOOM', (doomIsMain ? tagMain : t('progMenu')) + (state.doom ? ' · ' + t('stNew') : ''), doomIsMain ? 'main' : '', [lp ? star(doomIsMain, null) : ['★', null, t('progIsMain'), 'pstar on', true], ['×', doomOut, t('doomOff')]],
    state.launch ? (lp && doomIsMain && !state.clean ? autoL : null) : (d) => checkInto(d, t('emuAuto'), t('doomAutoHint'), !!state.emuAuto, (v) => { state.emuAuto = v; renderEmu(); }));
  else if (dGone) row('doom', 'DOOM', t('progGone'), 'main gone', [['↺', doomBack, t('progUndo')]]);
  const undo = () => { state.emu = null; emuRemoveClear(); state.t7save = null; renderEmu(); renderDoom(); };
  // settings of the main program (they are in the program at 0x0A0000)
  const mainSet = (d, dev) => {
    if (!dm && !state.clean) checkInto(d, t('emuAuto'), t(state.launch && mainV9() ? 'autoHintL' : 'emuAutoHint'), !!state.emuAuto, (v) => { state.emuAuto = v; if (state.launch) state.mainDirty = true; renderEmu(); });
    else if (lp && state.mainPick === 'emu') autoL(d);
    checkInto(d, t('emuClock'), t(clockOff() ? 'emuClockOff' : 'emuClockHint'), !clockOff() && state.emuClock !== false, (v) => { state.emuClock = v; renderEmu(); }, clockOff());
    checkInto(d, t('emuSess'), t('emuSessHint'), state.emuSess !== false, (v) => { state.emuSess = v; renderEmu(); });
    if (dev === '4u' || dev === '4u-plain') checkInto(d, t('emuNfc'), t('emuNfcHint'), state.emuNfc !== false, (v) => { state.emuNfc = v; renderEmu(); });
    // 1.7.3 test20 PACK_OPT: pack the firmware (less room, some places slower); an installed one is read back and built anew
    if (E.PACK_OPT && dev && E.DEVICES[dev]) checkInto(d, t('emuPack'), t('emuPackHint'), !!state.emuPack, (v) => {
      state.emuPack = v;
      if (state.emu && state.emu.guest) { const pk = E.packMain(state.emu.guest, state.emu.dev, null, v); state.emu = Object.assign({}, state.emu, { size: pk.blob.length, big: pk.big }); renderEmu(); return; }
      busy(t("Packing Program"), async () => { if (await mainGuestLoad()) { const mg = state.mainGuest, pk = E.packMain(mg.g, mg.dev, null, v); state.emu = { guest: mg.g, dev: mg.dev, size: pk.blob.length, big: pk.big, kept: true }; state.mainGuest = null; } renderEmu(); });
    });
    if (dev !== 't7' && dev !== 'v1' && dev) { state.emuOpt = state.emuOpt || { vol: 0, dim: 0, off: 0 }; optInto(d, state.emuOpt, () => renderEmu()); }
  };
  const xRow = (x, i) => {
    const b = [], go = !x.kind && E.t7Kind(x.rom) === 'go', big = x.kind === 'tama' && DLC_DEV.includes(x.dev);
    if (go) b.push([t('t7FigPick') + (x.figs && x.figs.length ? ' (' + x.figs.length + ')' : ''), () => { state.figT = i; $('fileT7Fig').click(); }]);
    if (big) b.push([t('dlcPick'), () => { state.dlcT = i; $('fileDlc').click(); }]);
    const xMain = lp && state.mainPick === x;
    if (lp) b.push(star(xMain, x));
    else { const ok = !dm && canMain(x); b.push(['☆', ok ? () => busy(t("Updating Main Program"), () => mainChecked(i)) : null, t(ok ? 'progMakeMain' : x.kind === 'gb' ? 'gbNoMain' : x.kind === 'sms' ? 'smsNoMain' : x.kind === 'pm' ? 'pmNoMain' : x.kind === 'ab' ? 'abNoMain' : x.kind === 'wolf' ? 'wolfNoMain' : dm ? 'progNoMainDoom' : 'progNoMain'), 'pstar', !ok]); }
    b.push(['×', () => { if (state.mainPick === x) { state.mainPick = null; state.mainDirty = true; } if (x.fromPara) state.emuRemove = true; if (x.wadSrc) state.doom = null; state.extras.splice(i, 1); state.extrasDirty = true; state.t7saveX = null; state.dlcT = 'main'; state.figT = 'main'; state.progOpen = new Set(); renderEmu(); }, t('progDel')]);
    const det = (x.kind === 'wolf' || x.kind === 'doom') && !xMain ? null : (d) => {   // 1.7.3 test7: every emulator has "remember where you left off"   // test37: the Game Boy has no clock
      if (xMain) autoL(d);
      if (!(x.kind === 'v1' && !E.v1Clock(x.rom)) && x.kind !== 'gb' && x.kind !== 'sms' && x.kind !== 'pm' && x.kind !== 'ab' && x.kind !== 'wolf' && x.kind !== 'doom') checkInto(d, t('emuClock'), t(clockOff() ? 'emuClockOff' : 'emuClockHint'), !clockOff() && x.clock !== false, (v) => { x.clock = v; state.extrasDirty = true; renderEmu(); }, clockOff());
      if (SESS_KINDS.has(E.extraKind(x))) checkInto(d, t('emuSess'), t('emuSessHint'), x.sess !== false, (v) => { x.sess = v; state.extrasDirty = true; renderEmu(); });
      if (x.kind === 'tama' || x.kind === 't18') { x.opt = x.opt || { vol: 0, dim: 0, off: 0 }; optInto(d, x.opt, () => { state.extrasDirty = true; renderEmu(); }); }
      if (x.kind === 'tama' && (x.dev === '4u' || x.dev === '4u-plain')) checkInto(d, t('emuNfc'), t('emuNfcHint'), x.nfc !== false, (v) => { x.nfc = v; state.extrasDirty = true; renderEmu(); });
      if (E.PACK_OPT && x.kind === 'tama') checkInto(d, t('emuPack'), t('emuPackHint'), !!x.pack, (v) => { x.pack = v; state.extrasDirty = true; renderEmu(); });   // 1.7.3 test20
      if (go) { figsInto(d, i); t7GpInto(d, i); linkInto(d, 'pairHintT7'); }
      if (big) dlcInto(d, i);
      if (x.kind === 'tama' && IR_HINT[x.dev]) linkInto(d, IR_HINT[x.dev]);
      if (x.kind === 'v1' && E.v1Name(x.rom).startsWith('DIGIMON')) linkInto(d, 'pairHintDigi');
      if (x.kind === 'v1' && E.v3Detect(x.rom)) linkInto(d, 'pairHintV3');
      if (x.kind === 't18') { t18ItemsInto(d, i); t18BridgeInto(d); }
    };
    row('x' + i, E.extraName(x), xMain ? tagMain : t('progMenu'), xMain ? 'main' : '', b, det);
  };
  const xFirst = lp && state.mainPick && state.mainPick !== 'emu' ? (state.extras || []).indexOf(state.mainPick) : -1;
  if (xFirst >= 0) xRow(state.extras[xFirst], xFirst);
  if (em) {
    const nm = emuNm(em);
    const b = [], go = em.t7 && E.t7Kind(em.rom) === 'go', big = !em.t7 && !em.t18 && !em.v1 && DLC_DEV.includes(em.dev);
    if (go) b.push([t('t7FigPick') + (em.figs.length ? ' (' + em.figs.length + ')' : ''), () => { state.figT = 'main'; $('fileT7Fig').click(); }]);
    if (big) b.push([t('dlcPick'), () => { state.dlcT = 'main'; $('fileDlc').click(); }]);
    const emMain = lp && state.mainPick === 'emu';
    b.push(lp ? star(emMain, 'emu') : dm ? ['☆', null, t('progNoMainDoom'), 'pstar', true] : ['★', null, t('progIsMain'), 'pstar on', true]);
    b.push(['×', undo, t('progUndo')]);
    row('main', nm, dm ? (emMain ? tagMain : t('progMenu')) + ' · ' + t('stNew') : em.kept ? tagMain : tagMain + ' · ' + t('stNew'), dm && !emMain ? '' : 'main', b, (d) => { mainSet(d, em.dev); if (go) { figsInto(d, 'main'); linkInto(d, 'pairHintT7'); } if (big) dlcInto(d, 'main'); if (!em.t7 && !em.t18 && !em.v1 && IR_HINT[em.dev]) linkInto(d, IR_HINT[em.dev]); if (em.v1 && E.v3Detect(em.rom)) linkInto(d, 'pairHintV3'); if (em.t18) { t18ItemsInto(d, 'main'); t18PicsInto(d); t18BridgeInto(d); } });
  } else if (has && !state.emuRemove) {
    const nm = (F.embedded() && F.feldApps(state.ctx.rom, F.embedded().stub).name0) || mainName(state.ctx.rom) || 'EMU';
    const b = [], c7 = F.emuType(state.ctx.rom) === 't7' && E.t7Cfg(state.ctx.rom), go = c7 && c7.romLen !== 0xC0000, cfg = romEmuCfg(state.ctx.rom), big = cfg && DLC_DEV.includes(cfg.dev);
    if (go) b.push([t('t7FigPick') + (c7.figs.length ? ' (' + c7.figs.length + ')' : ''), () => { state.figT = 'main'; $('fileT7Fig').click(); }]);
    if (big) b.push([t('dlcPick'), () => busy(t("Loading Downloadable Content"), async () => { if (await mainGuestLoad()) { state.dlcT = 'main'; $('fileDlc').click(); } })]);
    b.push(['★', null, t('progIsMain'), 'pstar on', true]);
    b.push(['×', () => { state.emu = null; state.emuRemove = true; renderEmu(); }, t('emuOff')]);
    row('main', nm, tagMain, 'main', b, (d) => {
      mainSet(d, cfg ? cfg.dev : F.emuType(state.ctx.rom));
      if (go) { figsInto(d, 'main'); t7GpInto(d, 'main'); linkInto(d, 'pairHintT7'); }
      if (cfg && IR_HINT[cfg.dev]) linkInto(d, IR_HINT[cfg.dev]);
      if (F.emuType(state.ctx.rom) === 't18') { t18ItemsInto(d, 'main'); t18PicsInto(d); t18BridgeInto(d); }
      if (big) { if (state.mainGuest) dlcInto(d, 'main'); else { const w = document.createElement('div'); w.className = 'hint'; w.textContent = t('dlcLoading'); d.appendChild(w); busy(t("Loading Downloadable Content"), async () => { await mainGuestLoad(); renderEmu(); }); } }
    });
  } else if (has && state.emuRemove && !state.paraMainTaken) {
    const nm = (F.embedded() && F.feldApps(state.ctx.rom, F.embedded().stub).name0) || mainName(state.ctx.rom) || 'EMU';
    row('main', nm, t('progGone'), 'main gone', [['↺', undo, t('progUndo')]]);
  }
  // further programs (started from the menu): each with its own clock setting; 1.7.2 test4: the main one first
  (state.extras || []).forEach((x, i) => { if (i !== xFirst) xRow(x, i); });
  if (!box.children.length) { const d = document.createElement('span'); d.className = 'hint'; d.textContent = t('progNone'); box.appendChild(d); }
  else if ((state.extras || []).length && !menuWanted()) { const d = document.createElement('span'); d.className = 'hint'; d.textContent = t('appNeedMenu'); box.appendChild(d); }
}
/* 1.6.8: choose which program is the main one (A and C, or the first entry of the start device) */
/* does a program in the menu come from an older Studio? (vectors and code differ from the program in this one) */
/* test24 EXIT_KEY: how to go back from a program, for all of them (tab Menu): "EX" << 16 | mode in the last word of
 * each program's vector table (IRQ 63, never used); 0 = as before (the word stays the program's own). */
const EXIT_KEY = true, EXIT_AT = 0x13C, EXIT_MAGIC = 0x5845;
function exitOffs(rom) {
  const offs = F.isClean(rom) ? [] : [0xA0000]; try { for (const x of romExtras(rom)) offs.push(x.off); } catch (e) {}
  return offs.filter((o) => { const w = rd32(rom, o + EXIT_AT); return (w >>> 16) === EXIT_MAGIC || (w === rd32(rom, o + EXIT_AT - 4) && (w & 1) && w < 0x10000); });
}
function exitGet(rom) { for (const o of exitOffs(rom)) { const w = rd32(rom, o + EXIT_AT); if ((w >>> 16) === EXIT_MAGIC) return w & 3; } return 0; }
function exitSet(rom, mode) {
  let out = rom;
  for (const o of exitOffs(rom)) {
    const w = mode ? ((EXIT_MAGIC << 16) | mode) >>> 0 : rd32(rom, o + EXIT_AT - 4);
    if (rd32(out, o + EXIT_AT) === w) continue;
    if (out === rom) out = new Uint8Array(rom);
    out[o + EXIT_AT] = w & 255; out[o + EXIT_AT + 1] = (w >>> 8) & 255; out[o + EXIT_AT + 2] = (w >>> 16) & 255; out[o + EXIT_AT + 3] = (w >>> 24) & 255;
  }
  return out;
}
function extrasOld(rom, apps) {
  const up = new Set();
  try {
    const progs = { t7: E.t7Embedded(), tama: E.embedded() && E.embedded().app, t18: E.t18Embedded(), v1: E.v1Embedded(), gb: E.gbEmbedded(), sms: E.smsEmbedded(), pm: E.pmEmbedded(), ab: E.abEmbedded() };   // 1.7.3 test5: ArduboyEmu too
    for (const x of E.appsRead(rom, apps)) {
      const k = E.extraKind(x), img = k === 't18' ? null : k === 'v1' && E.v3Detect(x.rom) ? E.v3Embedded() : k === 'gb' && E.gbIsColor(x.rom) ? E.gbcEmbedded() : progs[k]; if (!img) continue;   // 1.7.2: Game Boy Color games against GBCEmu   // T18Emu: its image is patched all over; test4: V3Emu against its own program
      const at = x.off, same = (a, z) => { for (let i = a; i < z; i++) if (rom[at + i] !== img[i]) return false; return true; };
      if (!same(0, EXIT_AT) || !same(0x800, Math.min(img.length, 0x10000))) up.add(groupKind({ kind: k }));
    }
  } catch (e) { return false; }
  return up.size ? up : false;   // 1.7.3 test6: the groups (chips) whose program is older
}
/* 1.6.8: choosing or dropping an emulator does not bring back a DOOM the user took out (emuRemove means "take the
 * program at 0x0A0000 out", which is DOOM when DOOM is built in) */
function emuRemoveClear() { if (!doomInstalled()) state.emuRemove = false; }
/* 1.6.9 test13: the Studio's menu program knows the main program out of its list (version 9) */
function mainV9() { const fe = F.embedded(); if (!fe) return false; const f = fe.feld; for (let i = 0; i + 8 <= f.length; i += 4) if ((f[i] | f[i + 1] << 8 | f[i + 2] << 16 | f[i + 3] << 24) >>> 0 === 0x444C4546) return (f[i + 4] | f[i + 5] << 8) >= 9; return false; }
// Legacy game installers are no longer part of ParaLab.
const DOOM_LAUNCH = false, NEON_BAR = true;
function doomMain() { return false; }
function doomFree() { return false; }
function doomXs() { return []; }
async function paraMainSync() {}
function doomFreeSync() {}
function curMainX() {
  const em = state.emu;
  if (em) return emuX(em);
  return null;
}
function canMain(x) {
  if (x.kind === 'gb' || x.kind === 'sms' || x.kind === 'pm' || x.kind === 'ab' || x.kind === 'wolf') return false;   // 1.6.9 test36: GBEmu only in the menu (and Wolf3D)
  // outside a start device only T7Emu goes to the menu, so the old main program must be a T7Emu (or none)
  if (state.launch) return true;
  if (!a0Free()) return false;   // test25: no main program at 0x0A0000 in this edition
  const em = state.emu, ty = em ? (em.v1 ? 'v1' : em.t7 ? 't7' : em.t18 ? 't18' : 'tama') : (emuInstalled() && !state.emuRemove ? F.emuType(state.ctx.rom) : null);
  return !ty || ty === 't7' || ty === 'v1';
}
async function makeMain(i) {
  const x = state.extras[i]; if (!x) return;
  let old = curMainX();
  if (!old && emuInstalled() && !state.emuRemove) old = await installedX(state.ctx.rom);
  let em;
  if (x.kind === 't18') { let n = 0; for (let k = 0; k < 128; k++) if (!x.fw.subarray(k << 16, (k + 1) << 16).every((v) => v === 0xFF)) n++; em = { t18: true, dev: 't18', rom: x.fw, size: n << 16 }; }
  else if (x.kind === 'tama') { const pk = E.packMain(x.guest, x.dev, null, !!state.emuPack); em = { guest: x.guest, dev: x.dev, size: pk.blob.length, big: pk.big }; }
  else if (x.kind === 'v1') em = { v1: true, dev: 'v1', rom: x.rom, size: x.rom.length + 0x2000 };
  else { em = { t7: true, dev: 't7', rom: x.rom, figs: x.figs || [] }; em.size = t7Size(em); }
  state.extras.splice(i, 1);
  if (old) old.opt = state.emuOpt;
  state.emuOpt = x.opt || { vol: 0, dim: 0, off: 0 };
  // outside a start device only T7Emu and V1Emu go to the menu; another main program is replaced
  if (old && !state.launch && (old.kind === 'tama' || old.kind === 't18')) { toast(t('progReplaced', { n: E.extraName(x), o: E.extraName(old) })); old = null; }
  if (old) state.extras.unshift(old);
  state.emu = em; emuRemoveClear(); state.extrasDirty = true; state.t7saveX = null; state.progOpen = new Set(); state.dlcT = 'main'; state.figT = 'main'; state.mainGuest = null;
  if (!state.launch) state.doom = null;
  if (!x.fresh) toast(t('progMainNow', { n: E.extraName(x) }));
  renderDoom(); renderEmu();
}
/* test17: the star in a start device: only if it still fits, otherwise the old order stays */
async function mainChecked(i) {
  if (!ROOM_AUTO || !state.launch) return makeMain(i);
  const snap = { emu: state.emu, extras: state.extras.slice(), emuRemove: state.emuRemove, mainPick: state.mainPick, emuOpt: state.emuOpt, mainGuest: state.mainGuest };
  await makeMain(i);
  const m = await roomTry();
  if (m.k || m.err) { Object.assign(state, snap); state.extras = snap.extras.slice(); state.extrasDirty = true; renderDoom(); renderEmu(); toast(m.k ? t('mainNoRoom', { k: m.k }) : t('appFail', { e: m.err }), true); }
}
/* 1.6.8: the main program (state.emu) in the form of a further program, its name; the installed one read from the ROM */
function emuX(em) { return !em ? null : em.v1 ? { kind: 'v1', rom: em.rom } : em.t18 ? { kind: 't18', fw: em.rom } : em.t7 ? { rom: em.rom, figs: em.figs } : { kind: 'tama', guest: em.guest, dev: em.dev }; }
function emuNm(em) { return em.v1 ? E.v1Name(em.rom) : em.t7 ? E.t7XName(em.rom) : em.t18 ? E.extraName({ kind: 't18' }) : E.tamaName(em.guest, em.dev); }
async function installedX(r0) {
  const ty = F.emuType(r0);
  if (ty === 't7') { const c7 = E.t7FromRom(r0); return c7 ? { rom: c7.rom, figs: c7.figs } : null; }
  if (ty === 't18') { const fw = E.t18FromRom(r0); return fw ? { kind: 't18', fw } : null; }
  if (ty === 'v1') { const r = E.v1FromRom(r0); return r ? { kind: 'v1', rom: r } : null; }
  const cfg = romEmuCfg(r0); return cfg ? { kind: 'tama', guest: await SV.emuGuestAsync((a, n) => r0.subarray(a, a + n), cfg), dev: cfg.dev } : null;
}
function hasOldSave() { return typeof state.dlcT === 'number' ? !!state.extras[state.dlcT] && !state.extras[state.dlcT].fresh : !!(state.emu && state.emu.kept) || !!state.mainGuest; }
$('btnApp').onclick = () => $('fileApp').click();
$('fileApp').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  await addExtra(new Uint8Array(await f.arrayBuffer()), f.name);
};
/* 1.6.8: trial build of the ROM as it would be saved now; KB missing for the programs, 0 if they fit */
let lastRoom = 0, lastFree = -1;
async function roomMissing() {
  const m = await roomTry(); return m.k;
}
/* test17 ROOM_AUTO: a trial build that also reports other failures (before: "T18Emu needs 0x0F0000" counted as
 * fitting when adding and only came up when writing), and the room really left afterwards */
const ROOM_AUTO = true;
async function roomTry() {
  lastRoom = 0; lastFree = -1; const mute = toast.mute = {};
  let ok = false;
  try { ok = !!(await composeRom()); } catch (e) { mute.err = em(e); } finally { toast.mute = null; }
  if (ok && lastFree >= 0) state.roomFree = { sig: roomSig(), kb: lastFree };
  return { k: lastRoom, err: !ok && !lastRoom ? (mute.err || '?') : '' };
}
/* which programs are in, and which one is the main one (the overview's real free room belongs to that) */
/* 1.7.2 ROOM_FIGS: figures and the firmware data (download content) change the room too, not only the program list */
const ROOM_FIGS = true, roomIds = new WeakMap(); let roomIdN = 0;
function roomId(a) { if (!a || typeof a !== 'object') return 0; if (!roomIds.has(a)) roomIds.set(a, ++roomIdN); return roomIds.get(a); }
function roomCont(x) { return !x ? '' : [(x.figs || []).reduce((n, f) => n + ((f.data && f.data.length) || f.len || 0), 0) + '/' + (x.figs || []).length, roomId(x.guest), roomId(x.rom), roomId(x.fw)].join(':'); }
function roomSig() { return JSON.stringify([state.emu ? emuNm(state.emu) : '', !!state.emuRemove, !!state.doom, !!state.launch, (state.extras || []).map((x) => E.extraName(x))].concat(DOOM_MUSSZ && state.doom ? [$('doomMusic').checked] : []).concat(ROOM_FIGS ? [roomCont(state.emu), (state.extras || []).map(roomCont)] : [])); }
/* test17: in a start device the first program (at 0x0A0000) changes how much room the others need (TamaEmu and
 * T18Emu use the fixed areas there, T18Emu's part at 0x0F0000 is fixed). When the choice does not fit, every other
 * program is tried as the first one; the smallest shortfall of all is the one reported, so the message is the same
 * whatever order the programs were added in. */
/* test25 T18_FEW: T18Emu takes 10 spare blocks and a TamaEmu in the menu 576 KB for spare pages when they can; when the
 * programs do not fit then (T18Emu with iD L in the menu was 256 KB short), it is tried again with 6 blocks for T18Emu
 * and 256 KB for each TamaEmu (as the main TamaEmu has), T18Emu's blocks into the small gaps first (a TamaEmu needs one
 * piece), before saying "no room" */
const T18_FEW = true, T18_FEW_N = 6;
const HI_ORPHAN = true;
function t18Here() { return !!(state.emu && (state.emu.t18 || state.emu.guest)) || (state.extras || []).some((x) => E.extraKind(x) === 't18' || E.extraKind(x) === 'tama') || (emuInstalled() && /t18|tama/.test(F.emuType(state.ctx.rom))); }
async function roomFit() {
  const r = await roomFit1();
  if (!T18_FEW || !r.k || state.t18Few || !t18Here()) return r;
  state.t18Few = true;
  const r2 = await roomFit1();
  if (!r2.k && !r2.err) return r2;
  state.t18Few = false; return r;
}
async function roomFit1() {
  const m0 = await roomTry(); if (!m0.k && !m0.err) return { k: 0 };
  if (!ROOM_AUTO || !state.launch) return { k: m0.k };   // outside a start device only the room counts (the menu may still be off)
  if (doomMain() || state.clean) return m0;
  const snap = { emu: state.emu, extras: state.extras.slice(), emuRemove: state.emuRemove, mainPick: state.mainPick, emuOpt: state.emuOpt, mainGuest: state.mainGuest, progOpen: state.progOpen };
  const back = () => { Object.assign(state, snap); state.extras = snap.extras.slice(); state.extrasDirty = true; };
  let best = m0.k || Infinity, err = m0.err;
  const names = snap.extras.map((x) => E.extraName(x));
  for (let i = 0; i < snap.extras.length; i++) {
    if (!canMain(snap.extras[i])) continue;
    back(); toast.mute = {}; try { await makeMain(i); } finally { toast.mute = null; }
    const m = await roomTry();
    if (!m.k && !m.err) { toast(t('mainAuto', { n: names[i] })); renderEmu(); return { k: 0 }; }
    if (m.k && m.k < best) best = m.k;
  }
  back(); renderEmu();
  return best < Infinity ? { k: best } : { k: 0, err };
}
async function addExtra(g, fname, preset) {
  let x = preset || null;
  if (x) { /* 1.7.3: made by its tab (Arduboy) */ }
  else if (E.gbDetect(g)) { if (E.gbColorOnly(g) && !E.gbIsColor(g)) { toast(t('gbColor', { f: fname }), true); return; } x = { kind: 'gb', rom: g, keys: gbKeysNow().slice(), inv: state.gbInv !== false }; }   // 1.6.9 test36: GBEmu
  else if (E.pmDetect(g)) x = { kind: 'pm', rom: g, title: E.pmTitle(fname), keys: pmKeysNow().slice(), inv: state.pmInv !== false, bios: state.pmBios || null };   // 1.7.3 PokeMiniEmu
  else if (E.smsDetect(g, fname)) x = { kind: 'sms', rom: g, title: E.smsTitle(fname), gg: E.smsGameGear(g, fname), keys: smsKeysNow().slice(), inv: state.smsInv !== false };   // 1.6.10 test2: SMSEmu
  else if (E.v1Detect(g)) x = { kind: 'v1', rom: g };   // 1.6.8: V1Emu (first Tamagotchis, Digital Monster)
  else if (E.t7Detect(g)) x = { rom: g };
  else if (E.t18Detect(g)) x = { kind: 't18', fw: g };
  else { try { const dev = E.emuDetect(g); try { E.packGuest(g, dev); } catch (e1) { E.packGuest(g, dev, { lz: true }); } x = { kind: 'tama', guest: g, dev }; } catch (err) { x = null; } }
  if (!x) {
    let main = false; try { main = !!E.t18Detect(g) || (E.emuDetect(g) && true); } catch (err) { main = false; }
    toast(t(main && !state.launch ? 'appBadMain' : state.launch ? 'appBadL' : 'appBad', { f: fname }), true); return;
  }
  state.extras = state.extras || [];
  if (state.extras.length >= E.APPX_MAX) { toast(t('appMax'), true); return; }
  { let m = curMainX(); if (!m && emuInstalled() && !state.emuRemove) { const r0 = state.ctx.rom, ty = F.emuType(r0); if (ty === 't7') { const c7 = E.t7FromRom(r0); if (c7) m = { rom: c7.rom }; } else if (ty === 't18') { const fw = E.t18FromRom(r0); if (fw) m = { kind: 't18', fw }; } else if (ty === 'v1') { const r = E.v1FromRom(r0); if (r) m = { kind: 'v1', rom: r }; } else if (x.kind === 'tama') { await mainGuestLoad(); if (state.mainGuest) m = { kind: 'tama', guest: state.mainGuest.g, dev: state.mainGuest.dev }; } } if ((m && sameFw(x, m)) || state.extras.some((y) => sameFw(x, y))) { toast(t('appTwice', { n: E.extraName(x) }), true); return; } }   // 1.6.8: each program once
  if (x.kind === 't18' && (state.extras.some((y) => y.kind === 't18') || (state.emu && state.emu.t18) || (!state.emu && F.emuType(state.ctx.rom) === 't18' && !state.emuRemove))) { toast(t('appT18One'), true); return; }
  x.fresh = true; state.extras.push(x); state.extrasDirty = true; state.t7saveX = null;
  // test25: no room at 0x0A0000 and no start device: a colour Tama or TG18 cannot go anywhere
  if (!state.launch && !a0Free() && (x.kind === 'tama' || x.kind === 't18')) { state.extras = state.extras.filter((y) => y !== x); toast(t('a0NoMain', { f: fname }), true); renderEmu(); return; }
  // outside a start device a colour Tama or TG18 only runs as the main program (A and C): it becomes the main one
  if (!state.launch && (x.kind === 'tama' || x.kind === 't18')) { busy(t("Updating Main Program"), () => makeMain(state.extras.length - 1)); return; }
  // 1.6.8: does it still fit? A trial build right away, not only when writing
  const wasAppsOnly = state.appsOnly, wasShortcut = state.paramixShortcut;
  if (neonRom() && !state.launch && !state.appsOnly) { state.appsOnly = true; state.paramixShortcut = true; }
  const f = await busy(t("Checking Available Space"), roomFit), k = f.k;
  if (k || f.err) { state.appsOnly = wasAppsOnly; state.paramixShortcut = wasShortcut; state.extras = state.extras.filter((y) => y !== x); state.extrasDirty = true; renderEmu(); toast(k ? t('noRoomAdd', { n: E.extraName(x), k }) + (E.PACK_OPT && (state.extras || []).some((y) => y.kind === 'tama' && !y.pack) ? t('packTip') : '') : t('appFail', { e: f.err }), true); return; }
  renderEmu(); if (neonRom()) renderFeld();
}
$('btnT7Fig').onclick = () => $('fileT7Fig').click();
$('fileT7Fig').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  const st = figTarget(); if (!st) return;
  const xi = typeof state.figT === 'number';
  for (const f of files) {
    const raw = new Uint8Array(await f.arrayBuffer());
    if (!E.t7FigDetect(raw)) { toast(t('t7FigBad', { f: f.name }), true); continue; }
    const d = E.t7FigData(raw);
    if (st.figs.length >= 16) { toast(t('t7FigMax'), true); break; }
    if (st.figs.some((x) => E.t7FigName(x.name) === E.t7FigName(f.name))) { toast(t('t7FigDup', { f: E.t7FigName(f.name) }), true); continue; }
    if (!xi && E.t7Room(st.figs.concat([{ name: f.name, data: d }]), st.rom.length) < 0) { toast(t('t7FigFull', { f: E.t7FigName(f.name) }), true); continue; }
    st.figs = st.figs || []; st.figs.push({ name: f.name, data: d });
  }
  if (xi) { state.extrasDirty = true; state.t7saveX = null; renderEmu(); return; }
  st.size = t7Size(st); state.emu = st; emuRemoveClear(); if (!state.launch) state.doom = null;
  renderDoom(); renderEmu();
};
/* Download content of the 8 MB guest firmware: one box per store, every slot with its name */
function renderDlc() { $('dlcList').innerHTML = ''; }   // 1.6.8: the slots are in the program's row
const DLC_ZIP = true;
const DLC_KEEP = true;   // 1.7.6: see the write button
/* 1.7.6 PS_DL2: a P's stamp card changed in the Studio: its save byte has to follow on the device (guest flash taken from
 * the device, and the save copy in the run state). Key 'main' or the index of the extra. */
function stampMark(tg, v) { state.stampSet = state.stampSet || {}; state.stampSet[typeof tg === 'number' ? tg : 'main'] = v; }
function stampFor(key) { return state.stampSet && state.stampSet[key] !== undefined ? state.stampSet[key] : -1; }
$('btnDlc').onclick = () => $('fileDlc').click();
$('fileDlc').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length || !dlcTarget()) return;
  let nb0 = -1; try { const t0 = dlcTarget(); nb0 = E.packGuest(t0.guest, t0.dev).blocks; } catch (err) { nb0 = -1; }
  // DLC_ZIP (1.7.2 test13): .zip files (as the VDPs come) bring their .jpg files; items for another device stay out
  const ents = [];
  for (const f of files) {
    const d = new Uint8Array(await f.arrayBuffer());
    if (DLC_ZIP && f.name.toLowerCase().endsWith('.zip')) {
      try { for (const x of await C.zipRead(d, inflateRaw)) { const nm = x.name.split('/').pop(); if (/\.jpe?g$/i.test(nm)) ents.push({ name: nm, data: x.data, zip: true }); } }
      catch (err) { toast(t('dlcBad', { f: f.name, e: em(err) }), true); }
    } else ents.push({ name: f.name, data: d });
  }
  for (const f of ents) {
    try {
      const tg = dlcTarget();
      const rec = E.dlcRecord(f.data, tg.dev);
      if (f.zip && /^t4u_/.test(String.fromCharCode(...rec.subarray(0x34, 0x3B))) && !/^4u/.test(tg.dev) && !(tg.dev === 'ps' && (rec[0xFF] === 2 || rec[0xFF] === 3))) continue;   // 1.7.6: the 4U items made for the P's stay in
      const r = E.dlcAdd(tg.guest, rec);
      tg.set(r.guest);
      if (r.stamp) stampMark(state.dlcT, E.SAVE_FLAG[tg.dev].on);   // 1.7.6 PS_DL2: the save (and its run state) gets the card or mail
      toast(t('dlcOk', { n: E.dlcName(rec), k: t('dlcK' + r.store.kind), s: r.slot + 1 }));
    } catch (err) { toast(t('dlcBad', { f: f.name, e: em(err) }), true); }
  }
  // the first item in a still empty store needs a new block: the emulator's layout changes, its save starts anew
  try { const t1 = dlcTarget(); const c0 = state.dlcT === 'main' ? romEmuCfg(state.ctx.rom) : null, relay = !!(c0 && c0.version < 5 && E.packMain(t1.guest, t1.dev, null, !!state.emuPack).lzOff !== undefined);   // MAIN_LZ: an older main TamaEmu gets the packed layout
    if (((nb0 >= 0 && E.packGuest(t1.guest, t1.dev).blocks !== nb0) || relay) && hasOldSave()) toast(t('dlcNewArea'), true); } catch (err) { /* only a hint */ }
  renderEmu();
};
$('fileT18Item').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ''; const T = t18Target(state.itemT); if (!files.length || !T) return;
  const recs = [];
  for (const f of files) {
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (f.name.toLowerCase().endsWith('.zip')) { const z = await C.zipRead(b, inflateRaw); for (const x of z) recs.push(...E.t18iScan(x.data)); }
      else recs.push(...E.t18iScan(b));
    } catch (err) { toast(t('dlcBad', { f: f.name, e: em(err) }), true); }
  }
  if (!recs.length) { toast(t('t18ItemsNone'), true); return; }
  let n = 0;
  for (const r of recs) {
    if (r.model && r.model !== 'tg18') toast(t('t18ItemsOther', { n: t18Nm(r), m: r.model.toUpperCase() }), true);
    try { const x = E.t18ItemAdd(T.fw, r, 1); n++; toast(t('t18ItemOk', { n: t18Nm(r), k: t('t18A_' + x.area) })); }
    catch (err) { toast(t('dlcBad', { f: t18Nm(r), e: err.message === 'full' ? t('t18ItemsFull') : em(err) }), true); }
  }
  if (n) T.set();
  renderEmu();
};
$('fileT18Pic').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  const ents = [];
  for (const f of files) {
    const b = new Uint8Array(await f.arrayBuffer());
    if (f.name.toLowerCase().endsWith('.zip')) { try { for (const x of await C.zipRead(b, inflateRaw)) ents.push({ name: x.name.split('/').pop(), data: x.data }); } catch (err) { toast(t('dlcBad', { f: f.name, e: em(err) }), true); } }
    else ents.push({ name: f.name, data: b });
  }
  const byImg = new Map();   // the Android set: erwachsen.json names every picture
  // English firmwares (Param block at 0xF800D864) take the pictures of the English ones first, the others the Japanese ones
  const fw0 = state.emu && state.emu.t18 ? state.emu.rom : null, pa = fw0 ? E.t18Addrs(fw0).param : (state.ctx.rom[0xA0140 + 428] | state.ctx.rom[0xA0140 + 429] << 8 | state.ctx.rom[0xA0140 + 430] << 16 | state.ctx.rom[0xA0140 + 431] << 24) >>> 0;
  const EN = new Set(['34525147dbe95eb512760981a07f5c30', '1a7d362f6f31b637e0a3b34ba6b6d110', '190a9d6801ed709f9a090a74f95039af']), wantEn = !pa || pa === 0xF800D864;
  const rank = new Map();
  for (const x of ents) if (/\.json$/i.test(x.name)) { try { const j = JSON.parse(new TextDecoder().decode(x.data)); for (const k in j) for (const a of j[k] || []) if (a.img) { byImg.set(a.img, a.id); rank.set(a.img, EN.has(k) === wantEn ? 0 : 1); } } catch (err) { /* not that file */ } }
  ents.sort((a, b) => (rank.has(b.name) ? rank.get(b.name) : 0) - (rank.has(a.name) ? rank.get(a.name) : 0));   // the wanted ones last: they win
  state.t18Pics = state.t18Pics || new Map(); let n = 0;
  for (const x of ents) {
    if (!/\.png$/i.test(x.name)) continue;
    const id = byImg.has(x.name) ? byImg.get(x.name) : E.t18AdultFind(x.name);
    if (id < 0 || !E.T18_ADULTS.some((a) => a[0] === id)) { toast(t('t18PicsUnknown', { f: x.name }), true); continue; }
    try { state.t18Pics.set(id, E.t18PicMake(await pngRgba(x.data))); n++; } catch (err) { toast(t('dlcBad', { f: x.name, e: em(err) }), true); }
  }
  if (n) { state.t18PicsDirty = true; toast(t('t18PicsOk', { n })); }
  renderEmu();
};
$('btnEmu').onclick = () => $('fileEmu').click();
$('fileEmu').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const g = new Uint8Array(await f.arrayBuffer());
  // 1.6.8: one button for everything: the first program is the main one (A and C), every further one goes to the menu
  if (E.gbDetect(g)) { await addExtra(g, f.name); renderGb(); return; }
  if (E.smsDetect(g, f.name)) { await addExtra(g, f.name); renderSms(); return; }   // 1.6.10 test2   // 1.6.9 test36: Game Boy games go to the menu
  if (state.emu || (emuInstalled() && !state.emuRemove) || (state.extras || []).length || (E.v1Detect(g) && doomMain()) || !a0Free()) { await addExtra(g, f.name); return; }   // test25: no room at 0x0A0000: the menu   // the first program stays the main one
  if (E.v1Detect(g)) { state.emu = { v1: true, dev: 'v1', rom: g, size: g.length + 0x2000 }; extrasDedupe(null); emuRemoveClear(); if (!state.launch) state.doom = null; renderDoom(); }
  else if (E.t18Detect(g)) {
    let n = 0; for (let i = 0; i < 128; i++) if (!g.subarray(i << 16, (i + 1) << 16).every((v) => v === 0xFF)) n++;
    state.emu = { t18: true, dev: 't18', rom: g, size: n << 16 }; extrasDedupe(null); emuRemoveClear(); if (!state.launch) state.doom = null; renderDoom();
  } else if (E.t7Detect(g)) {
    const old = state.emu && state.emu.t7 ? state.emu : t7State();   // the figures stay
    const st = { t7: true, dev: 't7', rom: g, figs: old && E.t7Kind(g) === 'go' ? old.figs : [] };
    st.size = t7Size(st); state.emu = st; extrasDedupe(null); emuRemoveClear(); if (!state.launch) state.doom = null; renderDoom();
  } else
  try { const dev = E.emuDetect(g); const pk = E.packMain(g, dev, null, !!state.emuPack); state.emu = { guest: g, dev, size: pk.blob.length, big: pk.big }; extrasDedupe(null); emuRemoveClear(); if (!state.launch) state.doom = null; renderDoom(); }
  catch (err) { toast(t('emuBad', { e: em(err) }), true); }
  renderEmu();
};
$('emuAuto').onchange = (e) => { state.emuAuto = e.target.checked; renderEmu(); };
$('emuClock').onchange = (e) => { state.emuClock = e.target.checked; renderEmu(); };
$('emuNfc').onchange = (e) => { state.emuNfc = e.target.checked; renderEmu(); };
$('btnEmuOff').onclick = () => { state.emu = null; state.emuRemove = true; renderEmu(); };
$('btnEmuUndo').onclick = () => { state.emu = null; emuRemoveClear(); state.t7save = null; renderEmu(); renderDoom(); };

// ---------------------------------------------------------------- DOOM
function keySel(id, val, wheel) {
  const sel = $(id); sel.innerHTML = '';
  [[1, 'A'], [2, 'B'], [4, 'C']].concat(wheel ? [[8, t('kWheel')]] : []).forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); });
  sel.value = String(val);
}
/* 1.6.9 test36: tab Game Boy. The games go into the menu (GBEmu, kind 'gb' in state.extras); one key layout for all. */
const GB_BTNS = [[0, 'gbNone'], [1, 'A'], [2, 'B'], [8, 'Start'], [4, 'Select'], [16, 'gbRight'], [32, 'gbLeft'], [64, 'gbUp'], [128, 'gbDown']];
const GB_INS = ['gbInA', 'gbInB', 'gbInC', 'gbInWp', 'gbInWu', 'gbInWd', 'gbInAC', 'gbInBC', 'gbInAB'];
function gbKeysNow() { if (!state.gbKeys) { const x = (state.extras || []).find((y) => y.kind === 'gb' && y.keys && y.keys.length === 9); state.gbKeys = x ? x.keys.slice() : E.GB_KEYS_DEFAULT.slice(); state.gbInv = x ? !!x.inv : true; } return state.gbKeys; }   // 1.6.10 test1: wheel reversed by default
function gbKeysApply() { for (const x of state.extras || []) if (x.kind === 'gb') { x.keys = state.gbKeys.slice(); x.inv = !!state.gbInv; } state.extrasDirty = true; renderPlan(); }
function renderGb() {
  if (!$('gbList')) return;
  const xs = (state.extras || []).map((x, i) => [x, i]).filter(([x]) => x.kind === 'gb');
  const box = $('gbList'); box.innerHTML = '';
  if (!xs.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('gbNone2'); box.appendChild(d); }
  for (const [x, i] of xs) {
    const r = document.createElement('div'); r.className = 'dlcrow';
    const n = document.createElement('span'); n.className = 'itemname'; n.textContent = t("{v1}  ({v2} KB)", { v1: E.extraName(x), v2: (x.rom.length >> 10) });
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '×'; b.title = t('progDel');
    b.onclick = () => { state.extras.splice(i, 1); state.extrasDirty = true; renderEmu(); };
    r.append(n, b); box.appendChild(r);
  }
  if (xs.length && !menuWanted()) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('appNeedMenu'); box.appendChild(d); }
  const k = gbKeysNow(), g = $('gbKeyGrid'); g.innerHTML = '';
  GB_INS.forEach((nm, i) => {
    const l = document.createElement('label'); const sp = document.createElement('span'); sp.textContent = t(nm);
    const sel = document.createElement('select');
    for (const [v, tn] of GB_BTNS) { const o = document.createElement('option'); o.value = String(v); o.textContent = tn.startsWith('gb') ? t(tn) : tn; sel.appendChild(o); }
    sel.value = String(GB_BTNS.some(([v]) => v === k[i]) ? k[i] : 0);
    sel.onchange = () => { state.gbKeys[i] = +sel.value; gbKeysApply(); renderGb(); };
    l.append(sp, sel); g.appendChild(l);
  });
  $('gbInv').checked = !!state.gbInv;
  const used = new Set(k.filter((v) => v)); const miss = [[1, 'A'], [2, 'B'], [8, 'Start']].filter(([v]) => !used.has(v)).map(([, n]) => n);
  $('gbKeysStat').textContent = miss.length ? t('gbKeysMiss', { n: miss.join(', ') }) : '';
}
$('btnGb').onclick = () => { if (!state.ctx) { toast(t('gbNeedRom'), true); return; } $('fileGb').click(); };
$('fileGb').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    const g = new Uint8Array(await f.arrayBuffer());
    if (!E.gbDetect(g)) { toast(t('gbBad', { f: f.name }), true); continue; }
    await addExtra(g, f.name);
  }
  renderGb();
};
$('gbInv').onchange = () => { gbKeysNow(); state.gbInv = $('gbInv').checked; gbKeysApply(); };
$('btnGbKeysDef').onclick = () => { state.gbKeys = E.GB_KEYS_DEFAULT.slice(); state.gbInv = true; gbKeysApply(); renderGb(); };
/* 1.6.10 test2: tab Master System. As the Game Boy: the games go into the menu (SMSEmu, kind 'sms'); one key layout. */
const SMS_BTNS = [[0, 'gbNone'], [16, 'smsB1'], [32, 'smsB2'], [64, 'smsPause'], [8, 'gbRight'], [4, 'gbLeft'], [1, 'gbUp'], [2, 'gbDown']];
function smsKeysNow() { if (!state.smsKeys) { const x = (state.extras || []).find((y) => y.kind === 'sms' && y.keys && y.keys.length === 9); state.smsKeys = x ? x.keys.slice() : E.SMS_KEYS_DEFAULT.slice(); state.smsInv = x ? !!x.inv : true; } return state.smsKeys; }
function smsKeysApply() { for (const x of state.extras || []) if (x.kind === 'sms') { x.keys = state.smsKeys.slice(); x.inv = !!state.smsInv; } state.extrasDirty = true; renderPlan(); }
function renderSms() {
  if (!$('smsList')) return;
  const xs = (state.extras || []).map((x, i) => [x, i]).filter(([x]) => x.kind === 'sms');
  const box = $('smsList'); box.innerHTML = '';
  if (!xs.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('gbNone2'); box.appendChild(d); }
  for (const [x, i] of xs) {
    const r = document.createElement('div'); r.className = 'dlcrow';
    const n = document.createElement('span'); n.className = 'itemname'; n.textContent = t("{v1}  ({v2} KB)", { v1: E.extraName(x), v2: (x.rom.length >> 10) });
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '×'; b.title = t('progDel');
    b.onclick = () => { state.extras.splice(i, 1); state.extrasDirty = true; renderEmu(); };
    r.append(n, b); box.appendChild(r);
  }
  if (xs.length && !menuWanted()) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('appNeedMenu'); box.appendChild(d); }
  const k = smsKeysNow(), g = $('smsKeyGrid'); g.innerHTML = '';
  GB_INS.forEach((nm, i) => {
    const l = document.createElement('label'); const sp = document.createElement('span'); sp.textContent = t(nm);
    const sel = document.createElement('select');
    for (const [v, tn] of SMS_BTNS) { const o = document.createElement('option'); o.value = String(v); o.textContent = t(tn); sel.appendChild(o); }
    sel.value = String(SMS_BTNS.some(([v]) => v === k[i]) ? k[i] : 0);
    sel.onchange = () => { state.smsKeys[i] = +sel.value; smsKeysApply(); renderSms(); };
    l.append(sp, sel); g.appendChild(l);
  });
  $('smsInv').checked = !!state.smsInv;
  const used = new Set(k.filter((v) => v)); const miss = [[16, t('smsB1')], [32, t('smsB2')]].filter(([v]) => !used.has(v)).map(([, n]) => n);
  $('smsKeysStat').textContent = miss.length ? t('gbKeysMiss', { n: miss.join(', ') }) : '';
}
$('btnSms').onclick = () => { if (!state.ctx) { toast(t('gbNeedRom'), true); return; } $('fileSms').click(); };
$('fileSms').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    const g = new Uint8Array(await f.arrayBuffer());
    if (!E.smsDetect(g, f.name)) { toast(t('smsBad', { f: f.name }), true); continue; }
    await addExtra(g, f.name);
  }
  renderSms();
};
$('smsInv').onchange = () => { smsKeysNow(); state.smsInv = $('smsInv').checked; smsKeysApply(); };
$('btnSmsKeysDef').onclick = () => { state.smsKeys = E.SMS_KEYS_DEFAULT.slice(); state.smsInv = true; smsKeysApply(); renderSms(); };
/* 1.7.3: tab Pokemon mini. As the Master System: the games go into the menu (PokeMiniEmu, kind 'pm'); one key layout;
 * an own BIOS (optional) for all of them, else PokeMini's free one. Games also in .zip files. */
const PM_BTNS = [[0, 'gbNone'], [1, 'pmA'], [2, 'pmB'], [4, 'pmC'], [64, 'gbRight'], [32, 'gbLeft'], [8, 'gbUp'], [16, 'gbDown'], [128, 'pmPower'], [256, 'pmShake']];
function pmKeysNow() { if (!state.pmKeys) { const x = (state.extras || []).find((y) => y.kind === 'pm' && y.keys && y.keys.length === 9); state.pmKeys = x ? x.keys.slice() : E.PM_KEYS_DEFAULT.slice(); state.pmInv = x ? !!x.inv : true; } return state.pmKeys; }
function pmKeysApply() { for (const x of state.extras || []) if (x.kind === 'pm') { x.keys = state.pmKeys.slice(); x.inv = !!state.pmInv; } state.extrasDirty = true; renderPlan(); }
function pmBiosNow() { if (state.pmBios === undefined) { const x = (state.extras || []).find((y) => y.kind === 'pm' && y.bios); state.pmBios = x ? x.bios : null; } return state.pmBios; }
function pmBiosApply() { for (const x of state.extras || []) if (x.kind === 'pm') x.bios = state.pmBios || null; state.extrasDirty = true; renderPlan(); }
function renderPm() {
  if (!$('pmList')) return;
  const xs = (state.extras || []).map((x, i) => [x, i]).filter(([x]) => x.kind === 'pm');
  const box = $('pmList'); box.innerHTML = '';
  if (!xs.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('gbNone2'); box.appendChild(d); }
  for (const [x, i] of xs) {
    const r = document.createElement('div'); r.className = 'dlcrow';
    const n = document.createElement('span'); n.className = 'itemname'; n.textContent = t("{v1}  ({v2} KB)", { v1: E.extraName(x), v2: (x.rom.length >> 10) });
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '×'; b.title = t('progDel');
    b.onclick = () => { state.extras.splice(i, 1); state.extrasDirty = true; renderEmu(); };
    r.append(n, b); box.appendChild(r);
  }
  if (xs.length && !menuWanted()) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('appNeedMenu'); box.appendChild(d); }
  const bios = pmBiosNow(); $('pmBiosStat').textContent = t(bios ? 'pmBiosOwn' : 'pmBiosFree'); $('btnPmBiosDel').hidden = !bios;
  const k = pmKeysNow(), g = $('pmKeyGrid'); g.innerHTML = '';
  GB_INS.forEach((nm, i) => {
    const l = document.createElement('label'); const sp = document.createElement('span'); sp.textContent = t(nm);
    const sel = document.createElement('select');
    for (const [v, tn] of PM_BTNS) { const o = document.createElement('option'); o.value = String(v); o.textContent = t(tn); sel.appendChild(o); }
    sel.value = String(PM_BTNS.some(([v]) => v === k[i]) ? k[i] : 0);
    sel.onchange = () => { state.pmKeys[i] = +sel.value; pmKeysApply(); renderPm(); };
    l.append(sp, sel); g.appendChild(l);
  });
  $('pmInv').checked = !!state.pmInv;
  const used = new Set(k.filter((v) => v)); const miss = [[1, 'A'], [2, 'B'], [4, 'C'], [64, t('gbRight')], [32, t('gbLeft')], [8, t('gbUp')], [16, t('gbDown')]].filter(([v]) => !used.has(v)).map(([, n]) => n);
  $('pmKeysStat').textContent = miss.length ? t('gbKeysMiss', { n: miss.join(', ') }) : '';
}
/* the files of a pick: .min directly, .zip opened (a BIOS among them is taken as the own BIOS) */
async function pmFiles(files) {
  const out = [];
  for (const f of files) {
    const b = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) { try { for (const z of await C.zipRead(b, inflateRaw)) { const nm = z.name.split('/').pop(); if (nm) out.push({ name: nm, data: z.data }); } } catch (err) { toast(t('dlcBad', { f: f.name, e: em(err) }), true); } }
    else out.push({ name: f.name, data: b });
  }
  return out;
}
$('btnPm').onclick = () => { if (!state.ctx) { toast(t('gbNeedRom'), true); return; } $('filePm').click(); };
$('filePm').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of await pmFiles(files)) {
    if (E.pmBiosDetect(f.data)) { state.pmBios = f.data; pmBiosApply(); continue; }
    if (E.pmTooBig(f.data)) { toast(t('pmBig', { f: f.name }), true); continue; }
    if (!E.pmDetect(f.data)) { toast(t('pmBad', { f: f.name }), true); continue; }
    pmBiosNow(); await addExtra(f.data, f.name);
  }
  renderPm();
};
$('btnPmBios').onclick = () => { if (!state.ctx) { toast(t('gbNeedRom'), true); return; } $('filePmBios').click(); };
$('filePmBios').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of await pmFiles(files)) { if (E.pmBiosDetect(f.data)) { state.pmBios = f.data; pmBiosApply(); renderPm(); return; } }
  toast(t('pmBiosBad', { f: files.map((f) => f.name).join(', ') }), true);
};
$('btnPmBiosDel').onclick = () => { state.pmBios = null; pmBiosApply(); renderPm(); };
$('pmInv').onchange = () => { pmKeysNow(); state.pmInv = $('pmInv').checked; pmKeysApply(); };
$('btnPmKeysDef').onclick = () => { state.pmKeys = E.PM_KEYS_DEFAULT.slice(); state.pmInv = true; pmKeysApply(); renderPm(); };
/* 1.7.3: tab Arduboy. As the Pokemon mini: the games (.hex, also in .zip files) go into the menu (ArduboyEmu, kind
 * 'ab'); one key layout for all of them. */
const AB_BTNS = [[0, 'gbNone'], [16, 'pmA'], [32, 'pmB'], [8, 'gbRight'], [4, 'gbLeft'], [1, 'gbUp'], [2, 'gbDown']];
function abKeysNow() { if (!state.abKeys) { const x = (state.extras || []).find((y) => y.kind === 'ab' && y.keys && y.keys.length === 9); state.abKeys = x ? x.keys.slice() : E.AB_KEYS_DEFAULT.slice(); state.abInv = x ? !!x.inv : true; } return state.abKeys; }
function abKeysApply() { for (const x of state.extras || []) if (x.kind === 'ab') { x.keys = state.abKeys.slice(); x.inv = !!state.abInv; } state.extrasDirty = true; renderPlan(); }
function renderAb() {
  if (!$('abList')) return;
  const xs = (state.extras || []).map((x, i) => [x, i]).filter(([x]) => x.kind === 'ab');
  const box = $('abList'); box.innerHTML = '';
  if (!xs.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('gbNone2'); box.appendChild(d); }
  for (const [x, i] of xs) {
    const r = document.createElement('div'); r.className = 'dlcrow';
    const n = document.createElement('span'); n.className = 'itemname'; n.textContent = t("{v1}  ({v2} KB)", { v1: E.extraName(x), v2: Math.ceil(x.rom.length / 1024) });
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '×'; b.title = t('progDel');
    b.onclick = () => { state.extras.splice(i, 1); state.extrasDirty = true; renderEmu(); };
    r.append(n, b); box.appendChild(r);
  }
  if (xs.length && !menuWanted()) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = t('appNeedMenu'); box.appendChild(d); }
  const k = abKeysNow(), g = $('abKeyGrid'); g.innerHTML = '';
  GB_INS.forEach((nm, i) => {
    const l = document.createElement('label'); const sp = document.createElement('span'); sp.textContent = t(nm);
    const sel = document.createElement('select');
    for (const [v, tn] of AB_BTNS) { const o = document.createElement('option'); o.value = String(v); o.textContent = t(tn); sel.appendChild(o); }
    sel.value = String(AB_BTNS.some(([v]) => v === k[i]) ? k[i] : 0);
    sel.onchange = () => { state.abKeys[i] = +sel.value; abKeysApply(); renderAb(); };
    l.append(sp, sel); g.appendChild(l);
  });
  $('abInv').checked = !!state.abInv;
  const used = new Set(k.filter((v) => v)); const miss = [[16, 'A'], [32, 'B'], [8, t('gbRight')], [4, t('gbLeft')], [1, t('gbUp')], [2, t('gbDown')]].filter(([v]) => !used.has(v)).map(([, n]) => n);
  $('abKeysStat').textContent = miss.length ? t('gbKeysMiss', { n: miss.join(', ') }) : '';
}
$('btnAb').onclick = () => { if (!state.ctx) { toast(t('gbNeedRom'), true); return; } $('fileAb').click(); };
$('fileAb').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of await pmFiles(files)) {
    if (!/\.hex$/i.test(f.name)) continue;
    const bin = E.abHex(f.data);
    if (!bin) { toast(t(f.data.length > 0x16000 ? 'abBig' : 'abBad', { f: f.name }), true); continue; }
    abKeysNow();
    await addExtra(bin, f.name, { kind: 'ab', rom: bin, title: E.abTitle(f.name), keys: state.abKeys.slice(), inv: state.abInv !== false });
  }
  renderAb();
};
$('abInv').onchange = () => { abKeysNow(); state.abInv = $('abInv').checked; abKeysApply(); };
$('btnAbKeysDef').onclick = () => { state.abKeys = E.AB_KEYS_DEFAULT.slice(); state.abInv = true; abKeysApply(); renderAb(); };
/* 1.6.10 test1: tab Wolf3D. The user's game files become one pack (wolf.js) in the browser; Wolf3D goes into the menu
 * (kind 'wolf' in state.extras, only one). Keys like DOOM on the Paradise. */
function renderDoom() {}

// ------------------------------------------------------------- actions
$('btnOpen').onclick = () => { if (!warnDeviceWrite()) $('fileRom').click(); };
async function myLabPrepareMenu(ctx, key) {
  if (ctx !== myLabRom || ctx.menuDraft || ctx.menuBusy) return;
  ctx.menuBusy = true;
  renderMyLabMenu();
  try {
    const image = await busy(t("Preparing My Lab Menu"), () => MLM.apply(ctx.rom, key));
    if (myLabRom !== ctx) return;
    if (image.every((byte, offset) => byte === ctx.rom[offset])) {
      ctx.menuCurrent = true;
      return;
    }
    const staged = ML.openRom(image, C, VIS);
    if (!staged?.flashImage) throw new Error('Invalid My Lab menu or rescue layout');
    const { menu, text, flashImage } = staged;
    ctx.menuDraft = { menu, text, flashImage, usedFlash: myLabUsedFlash(image), screenFitSupport: MLM.screenFitSupport(image) };
    measure('edit', 'menu');
    renderMyLabChangeStatus();
    devRender();
  } catch (error) {
    if (myLabRom === ctx) toast(em(error), true);
  } finally {
    ctx.menuBusy = false;
    if (myLabRom === ctx) {
      renderMyLabMenu();
      renderMyLabPort();
    }
  }
}
$('myLabMenuSwitch').onchange = event => {
  if (!event.target.checked) {
    myLabRom.menuDraft = null;
    renderMyLabMenu();
    renderMyLabPort();
    renderMyLabChangeStatus();
    devRender();
  } else if (myLabRom.menuAction === 'update') {
    void myLabPrepareMenu(myLabRom);
  } else {
    // Keep the switch off until the selected key successfully prepares the draft.
    event.target.checked = false;
    $('myLabMenuKey').click();
  }
};
$('myLabMenuKey').onchange = async event => {
  const file = event.target.files[0], ctx = myLabRom;
  event.target.value = '';
  if (!file || !ctx) return;
  try {
    if (file.size > 128) throw new Error('Open the matching eight-digit My Lab device key');
    await myLabPrepareMenu(ctx, (await file.text()).trim());
  } catch (error) {
    if (ctx === myLabRom) toast(em(error), true);
  }
};
function myLabPortNeedsKey(ctx) {
  return ctx.menuAction === 'install' && !ctx.menuDraft;
}
function myLabPortInputs(ctx) {
  const backup = $('myLabPortBackup').files[0];
  const key = myLabPortNeedsKey(ctx) ? $('myLabPortKey').files[0] : null;
  if (ctx.menuAction && ctx.menu.mode !== 'paradise' && backup && key !== undefined) return { backup, key };
}
function renderMyLabPort() {
  const action = myLabRom.menu.mode !== 'paradise' && myLabRom.menuAction;
  const existingPort = myLabRom.menu.mode === 'paradise';
  const { supported, version } = currentScreenFitSupport(myLabRom);
  const fit = $('myLabScreenFit');
  fit.disabled = !supported;
  fit.checked = supported && myLabRom.screenFit === true;
  fit.indeterminate = supported && myLabRom.screenFit === null;
  const versionLabel = !supported && version ? 'My Lab v' + version + ' · ' : '';
  $('myLabScreenFitHint').textContent = versionLabel + t(supported ? 'myLabScreenFitHint' : 'myLabScreenFitUnsupported');
  $('myLabParadiseBuilder').hidden = !action;
  $('myLabPortUnsupported').hidden = !!action || existingPort;
  $('myLabPortKeyRow').hidden = !myLabPortNeedsKey(myLabRom);
  $('myLabPortStatus').textContent = myLabRom.portStatus ? em(myLabRom.portStatus) :
    myLabRom.portDraft ? t('myLabPortDone') : '';
  $('myLabPortSwitch').checked = !!myLabRom.portDraft;
  $('myLabPortBackup').disabled = $('myLabPortKey').disabled = !!myLabRom.portBusy;
  $('myLabPortSwitch').disabled = !!myLabRom.portBusy || (!myLabRom.portDraft && !myLabPortInputs(myLabRom));
}
function renderMyLabPortPlan() {
  renderMyLabPort();
  renderMyLabOverview();
  renderMyLabChangeStatus();
  devRender();
}
async function setMyLabPort(enabled) {
  const ctx = myLabRom;
  if (!ctx || ctx.portBusy) return;
  ctx.portStatus = '';
  ctx.portDraft = null;
  const inputs = enabled && myLabPortInputs(ctx);
  if (!inputs) {
    renderMyLabPortPlan();
    return;
  }
  const { backup, key } = inputs;
  ctx.portBusy = true;
  renderMyLabPortPlan();
  try {
    if (backup.size !== FL.FLASH_SIZE) throw new Error('Choose an original Paradise ROM backup from this device');
    if (key && key.size > 128) throw new Error('Open the matching eight-digit My Lab device key');
    const source = myLabFlashImage() || ctx.rom;
    const image = await busy(t('myLabPortPreparing'), async () => MLM.createParadiseImage(source,
      new Uint8Array(await backup.arrayBuffer()), key && (await key.text()).trim()));
    if (ctx !== myLabRom) return;
    ctx.portDraft = { flashImage: image, usedFlash: myLabUsedFlash(image), screenFitSupport: MLM.screenFitSupport(image) };
    measure('edit', 'my_lab_port', 'my-lab-on-paradise');
  } catch (error) {
    ctx.portStatus = error;
  } finally {
    ctx.portBusy = false;
    if (ctx === myLabRom) renderMyLabPortPlan();
  }
}
$('myLabPortBackup').onchange = $('myLabPortKey').onchange = () => setMyLabPort(true);
$('myLabScreenFit').onchange = event => {
  if (!myLabRom) return;
  if (currentScreenFitSupport(myLabRom).supported) myLabRom.screenFit = event.target.checked;
  renderMyLabPortPlan();
};
$('myLabPortSwitch').onchange = event => setMyLabPort(event.target.checked);
$('myLabSavePage').onchange = renderMyLabSavePage;
$('myLabSaveBackup').onclick = () => {
  const page = myLabSelectedPage();
  if (page) download(ML.saveBackup(page, VIS), myLabFileBase() + '-page-' + $('myLabSavePage').value + MY_LAB_SAVE_EXT);
};
$('myLabSaveExport').onclick = () => {
  const save = myLabSaveView();
  if (save.latest) download(ML.deviceSaveBackup(save.data, null, C, VIS), myLabFileBase() + MY_LAB_SAVE_EXT);
};
function myLabSetSaveDraft(draft) {
  myLabRom.saveDraft = draft;
  renderMyLabSave();
  if (draft?.latest) {
    $('myLabSavePage').value = String(draft.latest.index);
    renderMyLabSavePage();
  }
  renderMyLabSlots();
  renderMyLabChangeStatus();
}
$('myLabSaveDelete').onclick = () => {
  if (!myLabRom || !confirm(t('myLabSaveDeleteAsk'))) return;
  try {
    myLabSetSaveDraft(ML.editRomSave(myLabRom.rom, myLabSaveView().data, null, VIS));
    measure('edit', 'clear_rom_save');
  }
  catch (error) { toast(em(error), true); }
};
$('myLabSaveUndo').onclick = () => myLabSetSaveDraft(null);
$('myLabSaveReplace').onclick = () => $('myLabSaveFile').click();
$('myLabSaveFile').onchange = async event => {
  const file = event.target.files[0], ctx = myLabRom;
  event.target.value = '';
  if (!file || !ctx) return;
  ctx.saveImportFile = file;
  try {
    if (file.size > ML.DEVICE_SAVE_END - ML.DEVICE_SAVE_FIRST + 20)
      throw new Error('Invalid My Lab save backup');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ctx !== myLabRom || ctx.saveImportFile !== file) return;
    const backup = ML.readDeviceSaveBackup(bytes, C, VIS);
    const scope = !backup.data ? 'myLabSaveReplacePage' :
      backup.dataStart === ML.DEVICE_SAVE_FIRST ? 'myLabSaveReplaceFull' : 'myLabSaveReplaceGarden';
    if (confirm(t(scope))) {
      myLabSetSaveDraft(ML.editRomSave(ctx.rom, myLabSaveView().data, backup, VIS));
      measure('edit', 'replace_rom_save');
    }
  } catch (error) {
    if (ctx === myLabRom && ctx.saveImportFile === file) toast(em(error), true);
  }
};
$('myLabCharacterField').onchange = () => renderMyLabCharacters(true);
$('myLabCharacterSearch').oninput = () => renderMyLabCharacters(true);
$('myLabCharacterZoom').onchange = () => renderMyLabCharacter(true);
$('myLabCharacterPose').onchange = () => {
  const playback = visAnimations.get('myLabCharacter');
  if (!playback) return;
  playback.paused = true;
  playback.index = Math.max(0, Math.min(playback.frames.length - 1, Math.trunc($('myLabCharacterPose').valueAsNumber || 1) - 1));
  visToggleFrameTimer('myLabCharacter', false);
  visPaintFrame('myLabCharacter');
};
$('myLabCharacterPose').onfocus = () => {
  const playback = visAnimations.get('myLabCharacter');
  if (playback) { playback.paused = true; visToggleFrameTimer('myLabCharacter', false); }
};
$('myLabCharacterPlayback').onclick = () => visTogglePlayback('myLabCharacter');
$('myLabCharacterPreview').onclose = event => {
  if (!event.target.open) visStopAnimation('myLabCharacter');
};
$('labSheetDownload').onclick = async () => {
  const { sheet, visitor } = myLabRom.characterPreview;
  download(await pngBlob(sheet), 'character-' + visitor.character.id + '.png');
};
$('labSheetReplace').onclick = () => $('labSheetFile').click();
$('labSheetFile').onchange = async event => {
  const file = event.target.files[0], ctx = myLabRom, id = ctx.characterId;
  event.target.value = '';
  if (!file) return;
  try {
    const sheet = await decodePng(file);
    if (ctx !== myLabRom || ctx.characterId !== id || !$('myLabCharacterPreview').open) return;
    const visitor = ctx.characters.get(id);
    const changes = ML.sheetChanges(visitor, sheet, C);
    if (!changes.size) { $('labSheetStatus').textContent = t("This sheet already matches the ROM."); return; }
    commitMyLabSprites(ctx, [new Map(), changes]);
    measure('edit', 'character_sheet');
    $('labSheetStatus').textContent = t("Sheet replaced. Use Save ROM to export your changes.");
  } catch (error) { $('labSheetStatus').textContent = em(error); }
};
$('myLabCharacterExport').onclick = () => {
  const { visitor, bytes } = myLabRom.characterPreview;
  download(bytes, 'my-lab-character-' + visitor.character.id + '.bin');
};
$('myLabArchive').onchange = () => { $('myLabSprite').value = 0; renderMyLabSprite(true); };
$('myLabSprite').onchange = () => {
  renderMyLabSprite(true);
  const index = Number($('myLabSprite').value) % SPRITES_PER_PAGE;
  $('myLabSpriteGrid').children[index]?.click();
};
$('myLabFrame').onchange = () => renderMyLabSprite();
$('myLabExport').onclick = () => {
  const { gardenSlot, gardenPreview } = myLabRom;
  if (gardenPreview) download(gardenPreview, 'my-lab-slot-' + (gardenSlot.slot + 1) + '-' + visView(gardenPreview).getUint16(0x10a, true) + '.bin');
};
function showUpdateSource() {
  $('updateFromRom').hidden = !$('updateSourceRom').checked;
  $('updateFromPackage').hidden = $('updateSourceRom').checked;
}
$('updateSourceRom').onchange = $('updateSourcePackage').onchange = showUpdateSource;
$('myLabUpdateOpen').onclick = () => $('myLabUpdateFile').click();
$('myLabUpdateFile').onchange = async (event) => {
  const file = event.target.files[0], ctx = myLabRom;
  event.target.value = '';
  if (!file || !ctx) return;
  const status = $('myLabUpdateStatus'), button = $('myLabUpdateExport');
  $('updatePackageActions').hidden = true;
  $('updatePatchStatus').textContent = '';
  ctx.updateFile = file;
  ctx.update = null;
  status.textContent = t("Checking {v1}…", { v1: file.name });
  button.disabled = true;
  $('myLabUpdatePatch').disabled = true;
  try {
    if (file.size > ML.UPDATE_MAX) throw new Error('File exceeds the My Lab update size limit');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ctx !== myLabRom || ctx.updateFile !== file) return;
    ML.inspectUpdate(bytes);
    ctx.update = bytes;
    status.textContent = t("{v1} · {v2} bytes. {v3}", { v1: file.name, v2: bytes.length.toLocaleString(locale()), v3: t('myLabUpdateReady') });
    $('updatePackageActions').hidden = false;
    button.disabled = false;
    $('myLabUpdatePatch').disabled = ctx.menuAction !== 'install';
  } catch (error) {
    if (ctx === myLabRom && ctx.updateFile === file) status.textContent = t('myLabUpdateBad', { error: em(error) });
  }
};
$('myLabUpdateExport').onclick = () => {
  if (myLabRom?.update) download(myLabRom.update, ML.UPDATE_NAME);
};
$('myLabUpdatePatch').onclick = () => {
  if (myLabRom?.menuAction === 'install' && myLabRom.update) $('myLabUpdatePatchKey').click();
};
$('myLabUpdatePatchKey').onchange = async event => {
  const file = event.target.files[0], ctx = myLabRom, source = ctx?.update;
  event.target.value = '';
  if (!file || !ctx || ctx.menuAction !== 'install' || !source) return;
  const status = $('updatePatchStatus');
  try {
    if (file.size > 128) throw new Error('Open the matching eight-digit My Lab device key');
    const key = (await file.text()).trim();
    const patched = await busy(t("Patching Update File"), () => MLM.patchUartUpdateFromRom(source, ctx.rom, key));
    if (ctx !== myLabRom || ctx.update !== source) return;
    download(patched, ML.UPDATE_NAME);
    measure('operation', 'patch_update_file');
    status.textContent = t('myLabUpdatePatchReady');
  } catch (error) {
    if (ctx === myLabRom && ctx.update === source)
      status.textContent = t('myLabUpdatePatchBad', { error: em(error) });
  }
};
$('myLabUartCreate').onclick = () => {
  if (myLabRom?.menuAction === 'install') $('myLabUartKey').click();
};
$('myLabUartKey').onchange = async event => {
  const file = event.target.files[0], ctx = myLabRom;
  event.target.value = '';
  if (!file || !ctx || ctx.menuAction !== 'install') return;
  const status = $('updateRomStatus');
  try {
    if (file.size > 128) throw new Error('Open the matching eight-digit My Lab device key');
    const key = (await file.text()).trim();
    const update = await busy(t("Building Update File"), () => MLM.createUartUpdate(ctx.rom, key));
    if (ctx !== myLabRom) return;
    download(update, ML.UPDATE_NAME);
    measure('operation', 'create_update_file');
    status.textContent = t('myLabUartReady');
  } catch (error) {
    if (ctx === myLabRom) status.textContent = t('myLabUartBad', { error: em(error) });
  }
};
$('fileRom').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadRom(f); };
const romDropZone = $('romDropZone');
$('drop').onclick = () => $('fileRom').click();
for (const event of ['dragenter', 'dragover']) {
  document.addEventListener(event, e => {
    e.preventDefault();
    const overCard = romDropZone.contains(e.target) && Array.from(e.dataTransfer?.types || []).includes('Files');
    romDropZone.classList.toggle('over', overCard);
    if (overCard) e.dataTransfer.dropEffect = 'copy';
  });
}
romDropZone.addEventListener('dragleave', e => {
  if (!romDropZone.contains(e.relatedTarget)) romDropZone.classList.remove('over');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  romDropZone.classList.remove('over');
  if (warnDeviceWrite()) return;
  const files = [...(e.dataTransfer?.files || [])]; if (!files.length) return;
  if (myLabRom && !$('myLabSprites').hidden && $('myLabSprites').contains(e.target) &&
      files.length === 1 && /\.zip$/i.test(files[0].name)) {
    openMyLabSpriteZip(files[0]);
    return;
  }
  const rom = files.find(f => f.size === 16777216 || /\.bin$/i.test(f.name) && f.size > 4194304);
  if (romDropZone.contains(e.target)) {
    loadRom(rom || files[0]);
    return;
  }
  if (rom) loadRom(rom);
  else if (state.ctx) busy(t("Importing Sprite Sheets"), () => uploadFiles(files));
});
$('btnUpload').onclick = $('btnUpload2').onclick = () => $('fileSheets').click();
$('fileSheets').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) busy(t("Importing Sprite Sheets"), () => uploadFiles(fs)); };
$('btnZipFigs').onclick = () => busy(t("Exporting Character Sheets"), () => zipSheets('fig'));
$('btnZipAll').onclick = () => busy(t("Exporting Sprite Sheets"), () => zipSheets('spr'));
$('btnNumbers').onclick = () => busy(t("Generating Numbered Sprites"), async () => {
  for (const g of state.ctx.groups) {
    const big = C.numberImage(String(g), 64, 64, 4), small = C.numberImage(String(g), 32, 32, 2);
    [Array(20).fill(big), null, null, Array(24).fill(small), null, null].forEach((subs, k) => {
      const i = g + k, orig = state.ctx.entries[i];
      state.changed.set(i, subs ? C.spriteEncode(orig, subs, C.partOptions(k)) : C.spriteBlank(orig, C.partOptions(k)));
    });
    refreshTile('fig', g);
  }
  toast(t('numOk'));
});
// ------------------------------------------------------------ field select
// installed six fields with the options chosen now?
const sixSame = (si) => !!si && si.planet === (state.sixPlanet !== false) && si.fieldMenu === (state.sixMenu !== false);
// 1.7.2: DNA per field comes to every ROM with six fields (no Land ROM needed)
const sixDnaUp = (si) => !!S6.DNA && !!si && !si.dna && si.version >= 7 && !state.sixOff && S6.sixDnaCan(state.ctx.rom);
function renderFeld() {
  if (!state.ctx) return;
  if (EXIT_KEY) { const sx = $('exitKey'), v = String(state.exitKey || 0); sx.innerHTML = ''; for (let i = 0; i < 4; i++) { const o = document.createElement('option'); o.value = String(i); o.textContent = t('exit' + i); sx.appendChild(o); } sx.value = v; }
  const fe = F.embedded(), rom = state.ctx.rom, ed = F.edition(rom), can = F.canFields(rom);
  const box = $('feldOn'), bag = $('bagOn'), tm = $('tamaOn'), la = !!state.launch, neon = neonRom();
  $('appsOnlyRow').hidden = !neon || la; $('appsOnlyOn').checked = !!state.appsOnly; $('appsOnlyOn').disabled = !fe || !!state.feld;
  $('launchOn').checked = la; $('launchOn').disabled = !fe || !ed || (neon && !SV.neonSaveLayout(rom)) || !!state.ctx.clean || (state.launchInit && C.isLauncher(state.ctx)) || !!S6.sixInfo(rom); $('launchOn').parentNode.title = S6.sixInfo(rom) ? t('launchSix') : '';
  $('cleanRow').hidden = !CLEAN_ROM || !la; $('cleanClockRow').hidden = !state.clean; $('cleanClock').checked = state.cleanClock !== false; $('cleanOn').checked = !!state.clean; $('cleanOn').disabled = !fe || !ed || !!state.ctx.clean || !FL.embedded() || !cleanCan();
  box.checked = !!state.feld && can && !la; box.disabled = !fe || !can || la;
  if (neon) box.disabled = box.disabled || !SV.neonSaveLayout(rom);
  const fieldLabel = box.parentNode.querySelector('[data-t]');
  fieldLabel.dataset.t = neon ? 'neonSaves' : 'feldOn';
  fieldLabel.textContent = t(fieldLabel.dataset.t);
  const fieldHint = $('feldHint');
  fieldHint.dataset.t = neon ? 'neonSaveFields' : 'feldHint';
  fieldHint.textContent = t(fieldHint.dataset.t);
  bag.checked = !!state.bag && !la; bag.disabled = !fe || !ed || (neon && !F.neonBagLayout(rom)) || la;
  bag.parentNode.title = neon && bag.disabled ? t('neonBagUnavailable') : '';
  tm.checked = !!state.tama && !la;
  tm.disabled = !fe || !ed || la || (neon && (!SV.neonSaveLayout(rom) || !F.neonAppearance(rom)));
  $('tamaOnHelp').textContent = neon ? t("Adjust care, appearance and age on Neon Planets.") : t("Change your Tama’s level, care and character.");
  const tamaLabel = tm.parentNode.querySelector('[data-t]');
  tamaLabel.dataset.t = neon ? 'neonTamaOn' : 'tamaOn';
  tamaLabel.textContent = t(tamaLabel.dataset.t);
  { const shortcut = $('paramixShortcut'), off = la || !!state.clean || !!state.ctx.clean;
    shortcut.checked = state.paramixShortcut !== false && !off; shortcut.disabled = !fe || !ed || off || !menuWanted();
    $('paramixShortcutRow').hidden = off; }
  { const g = $('gplayOn'), off = la || !!state.clean || !!state.ctx.clean; $('gplayRow').hidden = !F.GPLAY; g.checked = !!state.gplay && !off; g.disabled = !fe || !ed || neon || off; }
  let s;
  // six fields (Tropical/Glacier): row visible there only
  const si = S6.sixInfo(rom), sixIn = !!si, sixOld = !!si && (si.version < S6.VERSION || S6.sixStale(si)), sixCan = !!S6.kindOf(rom), jade = S6.kindOf(rom) === 'jade';
  const neonBuilt = !!NT?.installed?.(rom);
  const labUpgrade = LR.needsUpgrade(rom);
  const labInstalled = labUpgrade || LR.installed(rom);
  $('labReleaseRow').hidden = la || !!state.clean || !(labInstalled || LR.supported(rom));
  const specialInstalled = SF.installed(rom);
  const specialWanted = !!state.specialFood;
  $('specialFoodOn').checked = specialInstalled || specialWanted;
  $('specialFoodOn').disabled = specialInstalled;
  $('labReleaseOn').checked = labInstalled || !!state.labRelease || specialWanted;
  $('labReleaseOn').disabled = labInstalled || specialWanted;
  $('labReleasePick').hidden = specialWanted ? specialInstalled : labInstalled || !state.labRelease;
  const labDonor = state.labDonor || state.neonDonor;
  $('labReleaseStat').textContent = specialWanted
    ? (labDonor ? t('neonDonorReady', { name: labDonor.name }) : t('specialFoodHint'))
    : labUpgrade ? t('labReleaseUpgrade') : labInstalled ? t('labReleaseInstalled') :
    labDonor && state.labRelease ? t('neonDonorReady', { name: labDonor.name }) : t('labReleaseHint');
  const neonItems = !!NT?.itemsInstalled(rom);
  $('neonDonorRow').hidden = !NT || !LZ || !ed || neon || la || !!state.clean ||
    (neonBuilt && neonItems && !NT.needsPlanetNames(rom));
  const neonHint = !neonBuilt ? 'neonDonorHint' : neonItems ? 'neonLocalizeHint' : 'neonItemsHint';
  $('neonDonorStat').textContent = (state.neonDonor
    ? t('neonDonorReady', { name: state.neonDonor.name }) : t(neonHint));
  $('sixRow').hidden = !sixCan || la;
  for (const [id, k] of [['sixOnTxt', jade ? 'sixOnJ' : 'sixOn'], ['sixHintTxt', jade ? 'sixHintJ' : 'sixHint']]) { $(id).dataset.t = k; $(id).textContent = t(k); }
  $('sixOn').checked = (sixIn && !state.sixOff) || !!state.six || !!state.sixWant; $('sixOn').disabled = !fe || !S6.embedded() || neonBuilt;
  if (neonBuilt && state.feldInit) box.disabled = true;
  $('btnSix').hidden = jade || (neonBuilt && !S6.sixStale(si)) || (sixIn && !sixOld && sixSame(si));
  $('sixPlanetRow').hidden = !sixCan || la || !((sixIn && !state.sixOff) || state.six || state.sixWant);
  $('sixPlanet').checked = state.sixPlanet !== false; $('sixPlanet').disabled = !fe || !S6.embedded() || neonBuilt;
  $('sixMenu').checked = state.sixMenu !== false; $('sixMenu').disabled = !fe || !S6.embedded() || neonBuilt;
  if (!fe) s = t('feldMissing');
  else if (!ed) s = t('feldUnknown');
  else if (state.clean) s = t('cleanUse') + (state.ctx.clean ? '' : '\n' + t('cleanWarn'));
  else if (la) s = t('launchUse') + (state.launchInit && C.isLauncher(state.ctx) ? '\n' + t('launchOld') : '');
  else {
    s = t('feldCur', { f: fieldName(rom, F.fieldNow(rom)) });
    if (can) {
      s += '\n' + t('feldList', { s: F.fieldNames(rom).slice(0, sixIn && state.sixOff ? 3 : 99).concat(!sixIn && (state.six || (jade && state.sixWant)) ? (jade ? ['Sky'] : ['Land', 'Water', 'Sky']) : []).map(name => fieldName(rom, name)).join(listSeparator()) });
      const ff = F.feldFind(rom, fe.stub), sm = ff && ff.version >= 6 && (ff.flags & F.F_SAVES);
      const sl = neon
        ? (F.saveSlots(rom, fe.stub)?.list || []).filter(x => x.used).map(x => t('saveSlot', { n: x.i + 1 }))
        : F.feldSlots(rom, fe.stub).map(x => sm ? t('saveSlot', { n: x.index + 1 }) : fieldName(rom, F.NAMES[x.field]));
      if (sl.length) s += '\n' + t('feldStored', { s: sl.join(listSeparator()) });
    } else s += '\n' + t('feldNo');
    if (sixCan && sixIn && state.sixOff) s += '\n' + t(jade ? 'sixOffJ' : 'sixOff');
    else if (sixCan) {
      if (jade) { if (sixOld) s += '\n' + t('sixOldJ'); else if (sixIn) s += '\n' + t('sixInJ'); else if (!S6.sixCan(rom)) s += '\n' + t('sixNoFw'); }
      else if (sixOld && state.six) s += '\n' + t('sixOk', { n: state.sixName });
      else if (sixOld) s += '\n' + t('sixOld');
      else if (sixIn && !sixSame(si) && !state.six) s += '\n' + t('sixPlanetNeed');
      else if (sixIn) s += '\n' + t('sixIn');
      else if (!S6.sixCan(rom)) s += '\n' + t('sixNoFw');
      else if (state.sixWant && !state.six) s += '\n' + t('sixNeed');
      else if (state.six) s += '\n' + t('sixOk', { n: state.sixName });
    }
  }
  const installed = fe && F.feldFind(rom, fe.stub);
  const menuStatus = t(installed ? 'ParaLab menu installed in this ROM.' : 'No ParaLab menu detected in this ROM.');
  $('feldControls').hidden = la || !menuWanted();
  $('feldControls').textContent = t("On the home screen, hold A and C together. Turn the wheel to select, press B to confirm, or C to go back.");
  renderMenuList('feldStat', [...(fe && ed ? [menuStatus] : []), ...s.split('\n').filter(Boolean)]);
  renderPlan();
}
$('appsOnlyOn').onchange = (e) => { state.appsOnly = e.target.checked; if (state.appsOnly) state.paramixShortcut = true; else if (neonRom()) { state.tama = false; state.bag = false; } renderFeld(); };
$('feldOn').onchange = (e) => {
  state.feld = e.target.checked;
  if (state.feld) measure('edit', 'menu');
  if (state.feld && neonRom() && !state.appsOnly) { state.appsOnly = true; state.paramixShortcut = true; }
  renderFeld();
};
$('exitKey').onchange = (e) => { state.exitKey = +e.target.value; renderPlan(); };
$('launchOn').onchange = (e) => busy(t("Updating Startup Settings"), async () => {
  state.launch = e.target.checked;
  if (!state.launch) { state.clean = false; await paraMainSync(); doomFreeSync(); cleanTabs(); }
  if (state.launch) { launchMapGet(); state.appsOnly = false; state.feld = state.bag = state.tama = state.gplay = false; state.sixWant = false; state.six = null; state.neonDonor = null; }
  renderInfo(); renderFeld(); renderEmu(); renderNames();
});
/* CLEAN_ROM: the feld build of this Studio knows the clock sector (menu version 10) */
function cleanCan() { const fe = F.embedded(); if (!fe || !fe.feldc) return false; const f = fe.feldc; for (let i = 0; i + 8 <= f.length; i += 4) if ((f[i] | f[i + 1] << 8 | f[i + 2] << 16 | f[i + 3] << 24) >>> 0 === 0x444C4546) return (f[i + 4] | f[i + 5] << 8) >= 10; return false; }
$('cleanOn').onchange = (e) => busy(t("Updating ROM Layout"), async () => {
  state.clean = e.target.checked;
  if (state.clean) { state.six = null; state.sixWant = false; }
  await paraMainSync(); doomFreeSync();
  state.roomFree = null; cleanTabs();
  renderInfo(); renderFeld(); renderEmu(); renderDoom();
});
$('cleanClock').onchange = (e) => { state.cleanClock = e.target.checked; state.mainDirty = true; renderFeld(); renderEmu(); };   // 1.7.3 test7
$('sixOn').onchange = (e) => {
  state.sixOff = !e.target.checked && !!S6.sixInfo(state.ctx.rom);   // 1.6.8: take the extra fields out again
  state.sixWant = e.target.checked;
  if (!e.target.checked) { state.six = null; state.neonDonor = null; }
  else { state.feld = true; if (!state.six && S6.sixNeedsSource(state.ctx.rom)) $('fileSix').click(); }
  renderFeld(); renderNames();
};
$('btnSix').onclick = () => $('fileSix').click();
$('sixPlanet').onchange = (e) => { state.sixPlanet = e.target.checked; renderFeld(); };
$('sixMenu').onchange = (e) => { state.sixMenu = e.target.checked; renderFeld(); };
$('fileSix').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const buf = new Uint8Array(await f.arrayBuffer());
  if (!S6.sixSource(buf)) { toast(t('sixBad', { n: f.name }), true); renderFeld(); return; }
  state.six = buf; state.sixName = f.name; state.sixWant = true; state.feld = true;
  toast(t('sixOk', { n: f.name }));
  renderFeld(); renderNames();
};
$('specialFoodOn').onchange = (e) => { state.specialFood = e.target.checked; renderFeld(); };
$('labReleaseOn').onchange = (e) => { state.labRelease = e.target.checked; renderFeld(); };
$('labReleasePick').onclick = () => $('labReleaseFile').click();
$('labReleaseFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const rom = new Uint8Array(await file.arrayBuffer());
  if (rom.length !== 0x1000000 || C.editionIdOf(rom) !== 8) { toast(t('neonDonorBad'), true); return; }
  state.labDonor = { rom, name: file.name };
  renderFeld();
};
$('neonDonorPick').onclick = () => $('neonDonorFile').click();
$('neonDonorFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length !== 0x1000000 || C.editionIdOf(buf) !== 8) { toast(t('neonDonorBad'), true); return; }
  state.neonDonor = { rom: buf, name: file.name };
  if (S6.kindOf(state.ctx.rom) === 'gen3' && (state.six || state.sixWant || S6.sixInfo(state.ctx.rom))) {
    state.sixOff = false; state.sixWant = true; state.feld = true;
  }
  state.bag = true;
  renderFeld(); renderNames();
};
$('bagOn').onchange = (e) => {
  state.bag = e.target.checked;
  if (state.bag && neonRom() && !state.appsOnly) { state.appsOnly = true; state.paramixShortcut = true; }
  renderFeld();
};
$('tamaOn').onchange = (e) => {
  state.tama = e.target.checked;
  if (state.tama && neonRom() && !state.appsOnly) { state.appsOnly = true; state.paramixShortcut = true; }
  renderFeld();
};
$('paramixShortcut').onchange = (e) => { state.paramixShortcut = e.target.checked; renderFeld(); };
$('gplayOn').onchange = (e) => { state.gplay = e.target.checked; renderFeld(); };

/* Build the new ROM from the loaded one and everything chosen in the tabs.
   Returns { rom, name, res } or null (the reason is shown). same: nothing chosen. */
/** test5: the flash of a further T18Emu that stays in place (its blocks, spares, program and save) */
function keptT18Ranges(xs, rom) {
  const r = [];
  for (const x of xs) {
    if (x.kind !== 't18' || x.keepOff === undefined) continue;
    const c = E.t18Cfg(rom, x.keepOff); if (!c) continue;
    for (const b of c.map.concat(c.spare)) if (b !== 0xFFFF) r.push([b << 16, (b + 1) << 16]);
    r.push([x.keepOff, x.keepOff + 0x10000]);
  }
  return r;
}
const APPS_CLEAR_FIRST = true;
/* test20 DL_RESCUE: in the start device DOWNLOAD starts the flash app of the write protection (0xFF0000) instead of a
 * copy of its own (64 KB less). dlStrip: the copy an earlier write placed stayed in the flash every time (each write
 * put a new one elsewhere, 11 copies = 704 KB on one device); copies of it are emptied before placing anew. */
const DL_SIG = true, DL_RESCUE = true, DL_AT = 0x10000000 + 0xFF0000 - 0x11000;
function dlStrip(rom, fe) {
  const fa = F.feldApps(state.ctx.rom, fe.stub), src = state.ctx.rom;
  const pats = [];
  if (fa.dl && fa.dl !== DL_AT) { const o = fa.dl - 0x10000000 + 0x11000; if (o >= 0x100000 && o + 0x10000 <= 0xFF0000) pats.push(src.subarray(o, o + 0x10000)); }
  { const r = src.subarray(0xFF0000, 0x1000000), app = r.subarray(0, 0xE000); if (String.fromCharCode(...r.subarray(0xE000, 0xE008)) === 'SONIXDEV') { const b = new Uint8Array(0x10000); let n = 0xE000; while (n > 0 && app[n - 1] === 0xFF) n--; b.set(app.subarray(0, n)); pats.push(b); } }
  // 1.7.2 DL_SIG: copies of older flash app versions differ from both patterns; they all start with the same 64 bytes
  const sig = DL_SIG && FL.embedded() ? FL.embedded().subarray(0, 64) : null;
  if (!pats.length && !sig) return rom;
  let out = rom;
  for (let o = 0x100000; o < 0xFF0000; o += 0x10000) {
    const blk = out.subarray(o, o + 0x10000);
    const hit = pats.some((p) => { for (let i = 0; i < 0x10000; i++) if (blk[i] !== p[i]) return false; return true; }) || (sig && sig.every((v, i) => blk[i] === v));
    if (hit) { if (out === rom) out = new Uint8Array(rom); out.fill(0xFF, o, o + 0x10000); }
  }
  return out;
}
/* CLEAN_ROM: the programs placed from 0x10000, then the menu, the restart routine and the load table; the device's
 * ID page stays (edition), DOWNLOAD starts the flash app of the rescue start */
async function composeClean() {
  const fe = F.embedded(), emb = FL.embedded(), src = state.ctx.rom;
  if (!fe || !emb || !cleanCan()) { toast(t('emuMissing'), true); return null; }
  // test3 DOOM_FREE: DOOM is a program of the list like the others (no fixed places, any program can be the main one)
  await paraMainSync(); doomFreeSync();
  const dxs = doomXs();
  if (dxs.length > 1 && !DOOM_EPS) { toast(t('doomOne'), true); return null; }
  const keysDirty = !!state.doomKeys && dxs.some((x) => JSON.stringify(state.doomKeys) !== (x.keys0 || JSON.stringify(x.keys)));
  const emuUp = !state.ctx.clean && emuUpPending();
  if (state.ctx.clean && !state.emu && !state.doom && !keysDirty && !state.extrasDirty && !state.mainDirty && !state.extrasUp && !state.feldStale && !state.t7saveX && !state.saveIn && (state.exitKey || 0) === (state.exitKeyInit || 0) && !emuUp) return { rom: src, name: state.name, res: null, same: true };
  let mainX = null;
  if (state.emu) mainX = emuX(state.emu);
  else if (!state.ctx.clean && emuInstalled() && !state.emuRemove && !state.paraMainTaken) mainX = await installedX(src);
  if (mainX) { mainX.clock = state.emuClock !== false; mainX.nfc = state.emuNfc !== false; mainX.opt = state.emuOpt; mainX.sess = state.emuSess !== false; }
  extrasDedupe(mainX);
  const extrasL = mainX ? [mainX].concat(state.extras || []) : (state.extras || []);
  if (!extrasL.length) { toast(t('launchNeed'), true); return null; }
  if (!E.t7Embedded()) { toast(t('emuMissing'), true); return null; }
  const ed = F.edition(src); if (!ed) { toast(t('feldUnknown'), true); return null; }
  const fresh = [];
  let rom = F.cleanBase(src), apps = [];
  const de = D.embedded();
  for (const x of dxs) {
    if (!de || !de.appF) { toast(t('doomMissing'), true); return null; }
    if (state.doomKeys) x.keys = Object.assign({}, state.doomKeys);
    const err = x.keys && D.doomKeysCheck(x.keys); if (err) { toast(em(err), true); return null; }
    if (x.wadSrc) { const m = doomMcuOf(x); if (!m) { toast(t('doomBig'), true); return null; } x.mcu = m; }
  }
  // a T18Emu that stays where it is keeps its blocks, spares and save (as in the start device with the Paradise)
  if (state.ctx.clean) for (const [a, b] of keptT18Ranges(extrasL, src)) rom.set(src.subarray(a, b), a);
  const progs = { t7: E.t7Embedded(), tama: E.embedded() && E.embedded().app, t18: E.t18Embedded(), v1: E.v1Embedded(), doom: de && de.appF ? { app: de.appF, xip: de.xipF } : null };
  try {
    const r = E.appsPlace(rom, extrasL, progs, { lang, clock: state.emuClock !== false, nfc: state.emuNfc !== false, launch: true, clean: true, noClock: clockOff(), txSpare: T18_FEW && state.t18Few ? 0x40000 : undefined, keep: F.cleanReserved(), dlApp: null });
    rom = r.rom; apps = r.list; lastFree = r.freeKB; state.tamaPacked = !!r.lzUsed;   // 1.7.3 test18 TAMA_RAW: packed only for lack of room
    const at = (k) => apps[k + (mainX ? 1 : 0)];
    if (state.t7saveX && at(state.t7saveX.i)) rom = SV.t7SaveIn(rom, state.t7saveX.save, at(state.t7saveX.i).off + 0x10000);
    const si = state.saveIn, sk = !si ? null : si.key === 'm' ? (mainX ? -1 : null) : si.key;
    if (typeof sk === 'number' && (sk === -1 ? apps[0] : at(sk))) {
      const a = sk === -1 ? apps[0] : at(sk), cx = E.extraCfg(rom, a.off);
      if (si.kind === 'v1' && cx) { rom = new Uint8Array(rom); rom.set(si.data, cx.saveOff); fresh.push([cx.saveOff, cx.saveOff + 0x2000]); }
      if (si.kind === 'tama' && cx) fresh.push([cx.saveOff, cx.saveOff + 0x50000], [cx.guestOff, cx.spareEnd]);
    }
    extrasL.forEach((x, i) => { if (x.carry && apps[i]) { const cx = E.extraCfg(rom, apps[i].off); if (cx && cx.kind === 'tama') fresh.push([cx.saveOff, cx.saveOff + 0x50000], [cx.guestOff, cx.spareEnd]); } });
    for (const x of extrasL) if (x.kind === 't18' && x.items && x.keepOff !== undefined) { const k = extrasL.indexOf(x); if (apps[k]) t18Fresh(rom, apps[k].off, fresh); }
  } catch (e) { lastRoom = e && e.room ? e.missing : 0; toast(e && e.room ? t(e.frag ? 'noRoomFrag' : 'noRoomKB', { k: e.missing }) + (e.packHint ? t('packTip') : '') : t('appFail', { e: em(e) }), true); return null; }
  // the main program: the one chosen with the star, or the main program of the Paradise taken along
  const k = state.mainPick === 'emu' ? (mainX ? 0 : -1) : state.mainPick ? extrasL.indexOf(state.mainPick) : (mainX && !state.ctx.clean ? 0 : -1);
  const mainSrc = k >= 0 && apps[k] ? apps[k].src : 0;
  try { rom = F.cleanApply(rom, { apps, dl: DL_AT, mainSrc, auto: !!state.emuAuto && !!mainSrc, noClock: state.cleanClock === false }, { feld: fe.feldc, stub: fe.stub }); }
  catch (e) { toast(t('feldFail', { e: em(e) }), true); return null; }
  { const w = FL.withRescue(rom, emb); if (!w) { toast(t('feldFail', { e: 'rescue' }), true); return null; } rom = w; }
  if (EXIT_KEY && (state.exitKey || exitGet(rom))) rom = exitSet(rom, state.exitKey || 0);
  return { rom, name: baseName() + (state.doom ? '_doom_E' + $('doomEp').value : '') + '_clean.bin', res: null, fresh };
}
async function composeRom() {
  const prepared = await composeBaseRom();
  if (!prepared || !state.labItemEdits?.size) return prepared;
  const image = new Uint8Array(prepared.rom);
  for (const { original, edited } of state.labItemEdits.values()) {
    if (!matchingBytes(image, original)) {
      toast(t("The ROM rebuild changed the Lab Item at {v1}. Export that ARC2 separately.", { v1: labItemAddress(original.address) }), true);
      return null;
    }
    image.set(edited.bytes, edited.address);
  }
  return { ...prepared, rom: image, name: prepared.name.replace(/(?:\.bin)?$/i, '_lab-items.bin'), same: false };
}

async function composeBaseRom() {
  if (CLEAN_ROM && state.clean) return composeClean();
  const keysDirty = !state.doom && doomInstalled() && state.doomKeys && D.doomKeysGet(state.ctx.rom) && JSON.stringify(state.doomKeys) !== JSON.stringify(D.doomKeysGet(state.ctx.rom));
  const si0 = S6.sixInfo(state.ctx.rom), sixUp = (!!si0 && (si0.version < S6.VERSION || !sixSame(si0)) && !S6.sixNeedsSource(state.ctx.rom)) || sixDnaUp(si0) || S6.sixFieldsUpdateNeeded(state.ctx.rom) || S6.sixLabGamesUpdateNeeded(state.ctx.rom);
  const emuUp = emuUpPending();
  const growthUp = NT?.growthUpdateNeeded(state.ctx.rom);
  if (!state.changed.size && !state.t7save && !state.emu && !state.emuRemove && !state.doom && !keysDirty && !emuUp && !emuAutoDirty() && !state.six && !state.neonDonor && !state.labRelease && !state.specialFood && !sixUp && !growthUp && !(state.sixWant && !S6.sixInfo(state.ctx.rom)) && state.appsOnly === state.appsOnlyInit && state.feld === state.feldInit && state.bag === state.bagInit && state.tama === state.tamaInit && state.paramixShortcut === state.paramixShortcutInit && !!state.gplay === !!state.gplayInit && state.saves === state.savesInit && state.launch === state.launchInit && (state.exitKey || 0) === (state.exitKeyInit || 0) && !state.feldStale && !state.extrasDirty && !state.mainDirty && !state.extrasUp && !state.t7saveX && !state.saveIn && !state.sixOff && !state.petDirty && !state.t18Dirty && !state.t18PicsDirty && !(state.texts && state.texts.size) && !(state.eyeShift && state.eyeShift.size) && !(state.mouthShift && state.mouthShift.size) && !(state.poseAdj && state.poseAdj.size)) {
    try {
      const release = LR.upgrade(state.ctx.rom);
      const rom = SF.upgrade(release);
      const name = state.paraCleared ? baseName() + '_save-cleared.bin' :
        rom === state.ctx.rom ? state.name : baseName() + (rom === release ? '_release-fixed.bin' : '_special-food-fixed.bin');
      return { rom, name, res: null, same: !state.paraCleared && rom === state.ctx.rom };
    } catch (e) { toast(t('labReleaseFail', { e: em(e) }), true); return null; }
  }
  const fe = F.embedded(); let feldSaved;
  try { feldSaved = fe ? F.feldSlots(state.ctx.rom, fe.stub) : []; }
  catch (e) { toast(t('feldFail', { e: em(e) }), true); return null; }
  if (neonRom() && !state.feld && feldSaved.length && !await deviceDialog(t('sixOffSlots'))) return null;
  // start device with DOOM (1.6.8): DOOM is the program at 0x0A0000, the emulator of the Emulator tab goes along as a further program
  const doomL = !!state.launch && (!!state.doom || (doomInstalled() && !state.emuRemove));
  let mainX = null;
  if (doomL && state.emu) mainX = emuX(state.emu);
  else if (doomL && state.doom && emuInstalled()) mainX = await installedX(state.ctx.rom);
  // 1.6.8: an extra that is the same firmware as the main emulator only once (a start device read back shows its
  // emulator as a further program; choosing it again in the Emulator tab must not put it in twice)
  if (mainX) { mainX.clock = state.emuClock !== false; mainX.nfc = state.emuNfc !== false; mainX.opt = state.emuOpt; mainX.sess = state.emuSess !== false; }
  extrasDedupe(mainX);
  const extrasL = mainX ? [mainX].concat(state.extras || []) : (state.extras || []);
  if (state.emu && state.doom && !doomL) { toast(t('doomBoth'), true); return null; }
  if (state.doom && state.doomKeys && D.doomKeysCheck(state.doomKeys)) { toast(em(D.doomKeysCheck(state.doomKeys)), true); return null; }
  let rom = state.ctx.rom, res = null;
  const fresh = [];   // 1.6.8: ranges taken from the image even with "keep saves" (imported saves)
  if (state.launch && !FL.embedded()) { toast(t('emuMissing'), true); return null; }
  if (state.launch && !(state.emu || state.doom || (state.extras && state.extras.length) || (appInstalled() && !state.emuRemove))) { toast(t('launchNeed'), true); return null; }
  const lmap = state.launch ? launchMapGet() : null;
  if (state.changed.size || (lmap && lmap.size) || (state.eyeShift && state.eyeShift.size) || (state.mouthShift && state.mouthShift.size) || (state.poseAdj && state.poseAdj.size)) {
    const all = lmap ? new Map([...lmap, ...state.changed]) : state.changed;
    try { res = C.buildRom(state.ctx, all, currentDataPack()); rom = res.rom; }
    catch (e) { toast(t('tooBig', { e: em(e) }), true); return null; }
  }
  // 1.6.8: names of fields, Tamas and items (text tables)
  if (state.texts && state.texts.size) { try { rom = C.textApply(rom, state.texts); } catch (e) { toast(t('tooBig', { e: em(e) }), true); return null; } }
  if (fe) rom = F.feldStrip(rom, { stub: fe.stub, oldStub: E.embedded() && E.embedded().stub }, E);
  // Emulator instead of installed DOOM: remove DOOM completely first (program part, WAD), then install the emulator
  // test5: a further T18Emu that stays where it is (start device) has blocks in the area the main program's removal
  // empties (0x830000..0xD48000): they are put back; a new main program must not take them
  // test6 APPS_CLEAR_FIRST: the further programs of the old ROM go before the main program is built in (they are
  // placed again afterwards); before, a new main program (T18Emu needs 91 blocks) only saw the room they left
  if (fe && APPS_CLEAR_FIRST) { const old = E.appsRead(state.ctx.rom, F.feldApps(state.ctx.rom, fe.stub).apps); if (old.length) rom = E.appsClear(rom, old.filter((o) => !extrasL.some((x) => x.kind === 't18' && x.keepOff === o.off))); }
  // test25 HI_ORPHAN: start device: what removed programs left behind the Paradise's save becomes free (see E.hiFree)
  if (HI_ORPHAN && fe && state.launch && APPS_CLEAR_FIRST) { const ff = F.feldFind(rom, fe.stub); rom = E.hiFree(rom, extrasL.filter((x) => x.kind === 't18' && x.keepOff !== undefined).map((x) => x.keepOff), ff ? ff.off : 0); }
  const t18Keep = keptT18Ranges(extrasL, rom), t18Back = (r) => { for (const [a, b] of t18Keep) r.set(rom.subarray(a, b), a); return r; };
  const romMain0 = rom;
  if (state.emu && doomInstalled() && !doomL) { try { rom = t18Back(E.emuRemove(rom)); } catch (e) { toast(t('emuFail', { e: em(e) }), true); return null; } }
  if ((state.emu && !doomL) || state.emuRemove) {
    const emb = E.embedded();
    try {
      if (state.emu && doomL) { /* goes along as a further program */ }
      else if (state.emu && state.emu.v1) { if (!emb || !E.v1Embedded()) throw new Error(t('emuMissing')); rom = E.v1Patch(rom, state.emu.rom, E.v1Embedded(), emb.stub, { lang, clock: state.emuClock !== false }); }
      else if (state.emu && state.emu.t7) { if (!emb || !E.t7Embedded()) throw new Error(t('emuMissing')); rom = E.t7Patch(rom, state.emu.rom, state.emu.figs, E.t7Embedded(), emb.stub, { lang }); }
      else if (state.emu && state.emu.t18) { if (!emb || !E.t18Embedded()) throw new Error(t('emuMissing')); rom = E.t18Patch(rom, state.emu.rom, E.t18Embedded(), emb.stub, { lang, launch: !!state.launch, spares: T18_FEW && state.t18Few ? T18_FEW_N : undefined, holes: T18_FEW && state.t18Few }).rom; }
      else if (state.emu) { if (!emb) throw new Error(t('emuMissing')); rom = E.emuPatch(rom, state.emu.guest, emb.app, emb.stub, { lang, pack: !!state.emuPack }).rom; }
      else rom = t18Back(E.emuRemove(rom));
    } catch (e) { toast(e && e.needPack ? t('packNeed') : t('emuFail', { e: em(e) }), true); return null; }
    if (t18Keep.some(([a, b]) => rom.subarray(a, b).some((v, i) => v !== romMain0[a + i]))) { toast(t('emuFail', { e: t('t18Clash') }), true); return null; }
  }
  if (state.t7save && F.emuType(rom) === 't7' && !doomL) rom = SV.t7SaveIn(rom, state.t7save);
  if (state.saveIn && state.saveIn.key === 'm' && !doomL) {
    if (state.saveIn.kind === 'v1' && F.emuType(rom) === 'v1') { rom = new Uint8Array(rom); rom.set(state.saveIn.data, 0xC0000); fresh.push([0xC0000, 0xC2000]); }
    if (state.saveIn.kind === 'tama' && F.emuType(rom) === 'tama') { const g0 = rd32(rom, 0xA0148), se = rd32(rom, 0xA0144) >= 3 ? rd32(rom, 0xA0140 + 152) : g0 + rd32(rom, 0xA014C); fresh.push([0xC0000, 0x110000], [g0, se]); }
  }
  // newer emulator program: only the program changes, the Tamagotchi's save stays
  if (emuUp && F.appKind(rom) === 2) { const ty = F.emuType(rom), u = ty === 'v1' ? E.v1Upgrade(rom, E.v1Embedded()) : ty === 't7' ? E.t7Upgrade(rom, E.t7Embedded()) : ty === 't18' ? E.t18Upgrade(rom, E.t18Embedded(), E.embedded() && E.embedded().stub) : E.emuUpgrade(rom, E.embedded().app); if (u) rom = u; }
  if (state.t18Dirty && state.t18Main && !state.emu && !state.emuRemove && F.emuType(rom) === 't18') { try { rom = E.t18RomWriteGuest(rom, state.t18Main); t18Fresh(rom, 0xA0000, fresh); } catch (e) { toast(t('emuFail', { e: em(e) }), true); return null; } }   // test47: items
  if (F.emuType(rom) === 't18' && state.t18Pics && (state.t18Pics.size || state.t18PicsDirty)) rom = E.t18PicsWrite(rom, state.t18Pics);   // test47: grow-up pictures
  if (state.doom && !state.doom.ok.length && !(state.doom.fit.all && state.doom.fit.all.plain)) { toast(t('doomBig'), true); return null; }
  if (state.doom && !doomFree()) {   // DOOM_LAUNCH: otherwise DOOM is a program of the menu (below)
    const emb = D.embedded(), embE = E.embedded();
    try {
      if (!emb || !embE) throw new Error(t('doomMissing'));
      rom = (await D.doomBuild(rom, state.doom.wadM || state.doom.wad, { episode: $('doomEp').value, music: $('doomMusic').checked, keys: state.doomKeys || D.KEYS_DEFAULT }, { app: emb.app, xip: emb.xip, wasm: emb.wasm, stub: embE.stub }, E)).rom;
    } catch (e) { toast(t('doomFail', { e: em(e) }), true); return null; }
  }
  // Change the keys of an already installed DOOM
  if (!state.doom && doomInstalled() && !state.emuRemove && state.doomKeys && D.doomKeysGet(rom)) {
    const k = state.doomKeys, err = D.doomKeysCheck(k);
    if (err) { toast(em(err), true); return null; }
    rom = D.doomKeysSet(rom, k);
  }
  // 1.6.8: extra fields out again (several saves with the edition's own fields only)
  if (state.sixOff && S6.sixInfo(rom)) {
    const base = F.fieldNames(S6.sixStrip(state.ctx.rom)), now = F.fieldNow(state.ctx.rom);
    if (now && base.length && !base.includes(now)) { toast(t('sixOffField', { f: now, s: base.join(', ') }), true); return null; }
    if (feldSaved.length && !await deviceDialog(t('sixOffSlots'))) return null;
    rom = S6.sixStrip(rom); feldSaved = [];
  }
  const needSrc = S6.sixNeedsSource(rom);
  if (state.sixWant && needSrc && !state.six && !S6.sixInfo(rom)) { toast(t('sixNeed'), true); return null; }
  let sixHave = S6.sixInfo(rom);
  if (sixHave && needSrc && !state.six && sixHave.version >= S6.VERSION && !sixSame(sixHave)) { toast(t('sixPlanetNeed'), true); return null; }
  if (state.six && S6.sixStale(sixHave) && sixHave.version === S6.VERSION && sixSame(sixHave)) {
    try { rom = S6.sixWalkingUpdate(rom, state.six); sixHave = S6.sixInfo(rom); }
    catch (e) { toast(t('sixFail', { e: em(e) }), true); return null; }
  }
  if ((state.six || (state.sixWant && !needSrc) || (!needSrc && sixHave)) && !(sixHave && sixHave.version >= S6.VERSION && sixSame(sixHave) && !(S6.sixStale && S6.sixStale(sixHave)))) {
    if (state.doom || doomInstalled() || state.emu) { toast(t('sixFail', { e: t('sixApp') }), true); return null; }
    if (state.extras && state.extras.length) { toast(t('appSix'), true); return null; }
    try { rom = S6.sixApply(rom, state.six, S6.embedded(), { planet: state.sixPlanet !== false, fieldMenu: state.sixMenu !== false }); }
    catch (e) { toast(t('sixFail', { e: em(e) }), true); return null; }
  }
  if (S6.DNA && S6.sixInfo(rom)) rom = S6.sixDna(rom, S6.embedded(), true);
  if (S6.HUNT && S6.sixInfo(rom)) rom = S6.sixHunt(rom);   // 1.7.3 test23: egg hunt per field
  try { rom = S6.sixLabGamesUpdate(rom, S6.embedded()); }
  catch (e) { toast(t('sixFail', { e: em(e) }), true); return null; }
  if (S6.sixInfo(rom)) rom = S6.sixFix(rom);   // the archive may have moved: rain pictures point to 0xF00000
  if (state.neonDonor) {
    try {
      if (NT.installed(rom)) {
        if (NT.needsPlanetNames(rom)) rom = NT.localizePlanetNames(rom, state.neonDonor.rom);
      } else {
        if (C.editionIdOf(rom) >= 4 || LZ.isInstalled(rom)) {
          const helper = LZ.embedded(rom);
          rom = LZ.isInstalled(rom) ? LZ.refresh(rom, helper) : LZ.patch(rom, helper, null, true, fe?.stub).rom;
        }
        const added = NT.transplant(rom, state.neonDonor.rom);
        rom = NT.installGrowth(added.rom, added.rows);
      }
      if (!NT.itemsInstalled(rom)) {
        rom = NT.transplantItems(rom, state.neonDonor.rom).rom;
        if (C.editionIdOf(rom) >= 5) feldSaved = NT.clearItemSaveSlots(feldSaved);
      }
    } catch (e) { toast(t('neonDonorFail', { e: em(e) }), true); return null; }
  }
  if (NT?.growthUpdateNeeded(rom)) {
    try { rom = NT.upgradeGrowth(rom); }
    catch (e) { toast(t('neonDonorFail', { e: em(e) }), true); return null; }
  }
  let labLabel = null;
  if (state.specialFood && !state.launch && !state.clean) {
    const donor = state.labDonor || state.neonDonor;
    try { rom = SF.apply(rom, donor?.rom, fe?.stub).rom; }
    catch (e) { toast(t('labReleaseFail', { e: em(e) }), true); return null; }
  } else if (state.labRelease && !state.launch && !state.clean) {
    const donor = state.labDonor || state.neonDonor;
    // Grow the archive before placing programs, the catalog and save slots.
    try {
      const prepared = LR.prepare(rom, donor?.rom);
      rom = prepared.rom;
      labLabel = prepared.label;
    } catch (e) { toast(t('labReleaseFail', { e: em(e) }), true); return null; }
  }
  // more emulators (1.6.0): the old blocks go, the list is placed again from the top of the emulator area
  let apps = [], appsLow = 0;
  if (fe && !APPS_CLEAR_FIRST) { const old = E.appsRead(state.ctx.rom, F.feldApps(state.ctx.rom, fe.stub).apps); if (old.length) rom = E.appsClear(rom, old.filter((o) => !extrasL.some((x) => x.kind === 't18' && x.keepOff === o.off))); }   // test2: an installed T18Emu stays
  let dl = 0;
  if (extrasL.length || state.launch) {
    if (!fe || !menuWanted()) { toast(t('appNeedMenu'), true); return null; }
    if (!E.t7Embedded()) { toast(t('emuMissing'), true); return null; }
    const progs = { t7: E.t7Embedded(), tama: E.embedded() && E.embedded().app, t18: E.t18Embedded(), v1: E.v1Embedded() };
    if (DOOM_LAUNCH && doomFree()) {   // 1.7.6: DOOM in the menu of a start device (as in the ROM without the Paradise)
      const de = D.embedded();
      for (const x of extrasL.filter((y) => y.kind === 'doom')) {
        if (!de || !de.appF) { toast(t('doomMissing'), true); return null; }
        if (state.doomKeys) x.keys = Object.assign({}, state.doomKeys);
        const err = x.keys && D.doomKeysCheck(x.keys); if (err) { toast(em(err), true); return null; }
        if (x.wadSrc) { const m = doomMcuOf(x); if (!m) { toast(t('doomBig'), true); return null; } x.mcu = m; }
      }
      progs.doom = de && de.appF ? { app: de.appF, xip: de.xipF } : null;
    }
    let dlRes = false;
    if (state.launch) { rom = dlStrip(rom, fe); if (DL_RESCUE && FL.embedded()) { const w = FL.withRescue(rom, FL.embedded()); if (w) { rom = w; dlRes = true; } } }
    const keep = neonRom() && state.feld ? [F.neonSlotRange()] : F.appKind(rom) === 1 ? [[0x830000, 0xD48000]] : [];
    try { const r = E.appsPlace(rom, extrasL, progs, { lang, clock: state.emuClock !== false, nfc: state.emuNfc !== false, launch: !!state.launch, txSpare: T18_FEW && state.t18Few ? 0x40000 : undefined, keep, dlApp: state.launch && !dlRes ? FL.embedded() : null }); rom = r.rom; apps = r.list; appsLow = r.low; dl = dlRes ? DL_AT : r.dl; lastFree = r.freeKB;
      for (const x of extrasL) if (x.kind === 't18' && x.items && x.keepOff !== undefined) t18Fresh(rom, x.keepOff, fresh);   // test3
      if (state.t7saveX && apps[state.t7saveX.i + (mainX ? 1 : 0)]) rom = SV.t7SaveIn(rom, state.t7saveX.save, apps[state.t7saveX.i + (mainX ? 1 : 0)].off + 0x10000);
      if (state.saveIn && typeof state.saveIn.key === 'number' && apps[state.saveIn.key + (mainX ? 1 : 0)]) {
        const at = apps[state.saveIn.key + (mainX ? 1 : 0)].off, cx = E.extraCfg(rom, at);
        if (state.saveIn.kind === 'v1' && cx) { rom = new Uint8Array(rom); rom.set(state.saveIn.data, cx.saveOff); fresh.push([cx.saveOff, cx.saveOff + 0x2000]); }
        if (state.saveIn.kind === 'tama' && cx) fresh.push([cx.saveOff, cx.saveOff + 0x50000], [cx.guestOff, cx.spareEnd]);   // the imported pet: no run state of the device
      }
      extrasL.forEach((x, i) => { if (!x.carry || !apps[i + (mainX ? 1 : 0)]) return; const cx = E.extraCfg(rom, apps[i + (mainX ? 1 : 0)].off); if (cx && cx.kind === 'tama') fresh.push([cx.saveOff, cx.saveOff + 0x50000], [cx.guestOff, cx.spareEnd]); });   // test26: a save taken along from the device
      }
    catch (e) { lastRoom = e && e.room ? e.missing : 0; toast(e && e.room ? t(e.frag ? 'noRoomFrag' : 'noRoomKB', { k: e.missing }) + (e.packHint ? t('packTip') : '') : t('appFail', { e: em(e) }), true); return null; }
  }
  // 1.6.8: always the firmware's name (TAMA-GO, FRIENDS, ID L, 4U+ ...), not the emulator's
  // 1.6.9 test13: the chosen main program's place in the list (0 = the program at 0x0A0000)
  const mainSrcOf = () => { if (!state.launch || !state.mainPick || (a0Free() && !doomL)) return 0; const k = state.mainPick === 'emu' ? (mainX ? 0 : -1) : extrasL.indexOf(state.mainPick); return k >= 0 && apps[k] ? apps[k].src : 0; };
  const name0 = F.appKind(rom) === 1 ? 'DOOM' : state.emu && state.emu.guest ? E.tamaName(state.emu.guest, state.emu.dev) : (!state.emu && !state.emuRemove && fe && F.appKind(state.ctx.rom) === F.appKind(rom) && F.feldApps(state.ctx.rom, fe.stub).name0) || mainName(rom);
  if (fe && menuWanted()) {
    try { rom = F.feldApply(rom, { fields: state.feld, bag: state.bag, tama: !neonRom() && state.tama, neonTama: neonRom() && state.tama, appsOnly: state.appsOnly, paramixShortcut: state.paramixShortcut, gplay: state.gplay && !state.clean, saves: state.saves, launch: !!state.launch, apps, name0, appsLow, dl, mainSrc: mainSrcOf(), auto: !!state.emuAuto, fieldNames: fieldTexts(rom).map((x) => x.name) }, feldSaved, { feld: fe.feld, stub: fe.stub }, E); }
    catch (e) { toast(t('feldFail', { e: em(e) }), true); return null; }
  }
  if (state.neonDonor && NT.installed(rom)) {
    const menu = fe && F.feldFind(rom, fe.stub);
    if (!menu || !(menu.flags & 0x100) || ![3, 4].includes(rd32(rom, menu.stubOff + 0x304))) {
      toast(t('neonDonorFail', { e: 'native Tama Files could not be installed' }), true); return null;
    }
  }
  // autostart of the emulator (the stubs above were written with it off), clock switch (1.5.1)
  if (F.appKind(rom) === 2) rom = E.emuSessSet(E.emuOptSet(E.emuNfcSet(E.emuClockSet(rom, state.emuClock !== false), state.emuNfc !== false), state.emuOpt), state.emuSess !== false);
  if (F.appKind(rom) === 2 || (F.appKind(rom) === 1 && !state.launch)) {   // 1.6.8: DOOM as the main program can start right away too
    let a = E.autoSet(rom, stubList(rom), !!state.emuAuto);
    const fe2 = F.embedded();
    // stub of an older Studio (no switch): put in the current one
    if (!a && state.emuAuto && E.embedded() && !(fe2 && F.feldFind(rom, fe2.stub))) {
      try { rom = E.installApp(rom, rom.slice(0xA0000, 0xB0000), E.embedded().stub); a = E.autoSet(rom, stubList(rom), true); } catch (e) { a = null; }
    }
    if (a) rom = a;
  }
  if (EXIT_KEY && (state.exitKey || exitGet(rom))) rom = exitSet(rom, state.exitKey || 0);
  if (labLabel !== null || LR.needsUpgrade(rom)) {
    // A blank save-pool page is already allocated once the menu is built.
    try { rom = labLabel === null ? LR.upgrade(rom) : LR.install(rom, labLabel); }
    catch (e) { toast(t('labReleaseFail', { e: em(e) }), true); return null; }
  }
  try { rom = SF.upgrade(rom); }
  catch (e) { toast(t('labReleaseFail', { e: em(e) }), true); return null; }
  const name = baseName() + (state.changed.size ? '_paramix' : '') + (state.emu ? (state.emu.v1 ? '_v1' : state.emu.t7 ? '_t7' : state.emu.t18 ? '_t18' : '_emu') : '') + (state.doom ? '_doom_E' + $('doomEp').value : '') + (S6.sixInfo(rom) ? (S6.kindOf(rom) === 'jade' ? '_4fields' : '_6fields') : state.feld ? '_fields' : '') + (NT?.installed?.(rom) ? '_neon-tama' : '') + (NT?.itemsInstalled?.(rom) ? '_neon-items' : '') + (state.bag ? '_items' : '') + (SF.installed(rom) ? '_special-food' : LR.installed(rom) ? '_my-lab' : '') + (state.launch ? '_start' : '') + '.bin';
  return { rom, name, res, fresh };
}
function romExportName(edition, features, date = new Date()) {
  const twoDigits = value => String(value).padStart(2, '0');
  const day = date.getFullYear() + twoDigits(date.getMonth() + 1) + twoDigits(date.getDate());
  const time = twoDigits(date.getHours()) + twoDigits(date.getMinutes());
  const utcOffset = -date.getTimezoneOffset(), minutes = Math.abs(utcOffset);
  const zone = (utcOffset < 0 ? '-' : '') + twoDigits(Math.floor(minutes / 60)) + twoDigits(minutes % 60);
  const names = { land: 'pink-land', water: 'blue-water', sky: 'purple-sky', jade: 'jade-forest',
    tropics: 'orange-tropics', glacier: 'white-glacier', neon: 'neon-planets' };
  const model = names[edition] || edition || 'paradise';
  return [model, day, time, zone, features.length ? features.join('+') : 'original', '__VERSION__'].join('_') + '.bin';
}

function paradiseExportFeatures() {
  const features = [];
  if (state.changed.size || state.eyeShift?.size || state.mouthShift?.size || state.poseAdj?.size)
    features.push('sprites');
  if (state.texts?.size) features.push('names');
  if (state.paraCleared || state.petDirty || state.saveIn) features.push('save');
  if (state.labItemEdits?.size) features.push('lab-items');
  if (state.feld !== state.feldInit || state.saves !== state.savesInit) features.push('save-slots');
  if (state.bag !== state.bagInit) features.push('items');
  if (state.tama !== state.tamaInit) features.push('tama-editor');
  if (state.gplay !== state.gplayInit) features.push('games');
  if (state.appsOnly !== state.appsOnlyInit || state.launch !== state.launchInit ||
      state.paramixShortcut !== state.paramixShortcutInit || state.exitKey !== state.exitKeyInit || state.feldStale)
    features.push('menu');
  if (state.six || state.sixOff || (state.sixWant && !S6.sixInfo(state.ctx.rom))) features.push('fields');
  if (state.neonDonor) features.push('neon-content');
  if (state.labRelease) features.push('my-lab-transfer');
  if (state.specialFood) features.push('special-food');
  return features;
}

function myLabSaveExportFeatures(context) {
  if (!context.saveDraft) return [];
  const original = context.data;
  const edited = context.saveDraft.data;
  const gardenFirst = ML.GARDEN_FIRST - ML.DEVICE_SAVE_FIRST;
  const gardenEnd = ML.GARDEN_END - ML.DEVICE_SAVE_FIRST;
  const differs = (start, end) => edited.subarray(start, end).some((byte, offset) => byte !== original[start + offset]);
  const features = [];
  if (differs(0, gardenFirst) || differs(gardenEnd, edited.length)) features.push('save');
  if (differs(gardenFirst, gardenEnd)) features.push('garden');
  return features;
}

$('btnSave').onclick = () => busy(t("Exporting ROM"), async () => {
  if (myLabRom) {
    const port = myLabRom.portDraft;
    const edition = sourceEdition(!!port)?.key;
    const features = [];
    if (port) features.push('port');
    if (myLabScreenFitChanged() || (port && selectedScreenFit(myLabRom))) features.push('screen-fit');
    if (myLabRom.menuDraft) features.push('menu');
    features.push(...myLabSaveExportFeatures(myLabRom));
    if (myLabRom.spriteChanges.some(edits => edits.size)) features.push('sprites');
    try {
      const rom = features.length
        ? myLabOutputImage(port?.flashImage || myLabFlashImage() || myLabRom.rom)
        : myLabRom.rom;
      const name = romExportName(edition, features);
      download(rom, name);
      measure('operation', 'export_rom', port ? 'my-lab-on-paradise' : undefined);
      $('myLabChangeStatus').textContent = t('myLabExported', { name });
    } catch (error) { toast(em(error), true); }
    return;
  }
  if (!state.ctx) return;
  const edition = sourceEdition()?.key, features = paradiseExportFeatures();
  const c = await composeRom();
  if (!c) return;
  // Include a rescue tool in edited images with the on-device menu.
  const menu = F.embedded(), flash = FL.embedded();
  const withTool = !c.same && menu && flash && F.feldFind(c.rom, menu.stub) ? FL.withRescue(c.rom, flash) : c.rom;
  const rom = withTool || c.rom;
  if (!c.same && !await packOk(rom)) return;
  if (!c.same && !features.length) features.push('maintenance');
  if (withTool && withTool !== c.rom) features.push('flash-tool');
  const name = romExportName(edition, features);
  download(rom, name);
  measure('operation', 'export_rom');
  state.saved = state.changed.size;
  const msg = c.res ? t('saved', { name, n: state.changed.size, kb: c.res.free / 1024 | 0 }) : t('savedEmu', { name });
  toast(withTool ? msg : msg + '\n' + t('fl_noRescue'), !withTool);
});

// ------------------------------------------------------------- device (UART)
const FL = window.ParamixFlash;
const hasFlashApp = !!FL.embedded();
const dv = { io: null, d: null, writing: false, writeOperation: null, loaded: false, opening: false, connecting: null, reconnecting: false, run: false, cancel: false };
const canReadLabItems = device => !!device && device.info.editionIdentified !== false &&
  Number.isInteger(device.info.edition) && device.info.edition >= 1 && device.info.edition <= 8;
const deviceTabs = Array.from($('deviceTabs').querySelectorAll('[role="tab"]'));
const uartToolTabs = Array.from($('uartToolTabs').querySelectorAll('[role="tab"]'));
function selectDevicePanel(tabs, tab) {
  if (tab.getAttribute('aria-selected') !== 'true' && warnDeviceWrite()) return false;
  if (tab.getAttribute('aria-selected') !== 'true')
    measure('feature_view', tab.getAttribute('aria-controls'));
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    $(item.getAttribute('aria-controls')).hidden = !selected;
  }
  rememberNavigation(tabs === deviceTabs ? { device: tab.id } : { uart: tab.id });
  return true;
}
function renderVisitorChoiceHint(lab) {
  $('visitorChoiceHint').textContent = t(lab ? 'Choose an adult Tama to send to the garden.' :
    'To return the received character, leave the default visitor selected.');
}
function showDeviceTab(tab) {
  if (!selectDevicePanel(deviceTabs, tab)) return;
  const panel = $(tab.getAttribute('aria-controls'));
  if (panel.id === 'deviceGift') void loadDeviceCatalog('gift');
  if (panel.id === 'deviceItem') void loadDeviceCatalog('lab');
  if (panel.id === 'devicePlaydate' || panel.id === 'deviceLab') {
    const lab = panel.id === 'deviceLab';
    panel.prepend($('visitBox'));
    renderVisitorChoiceHint(lab);
    $('playdateActions').hidden = lab;
    $('labActions').hidden = !lab;
    $('visPlaydateEditor').hidden = lab;
    $('visUnlock').hidden = lab;
    for (const [id, key] of [['visCharacterLabel', lab ? 'labCharacter' : 'visCharacter'], ['visDefault', lab ? 'labChoose' : 'visMirror']]) {
      const element = $(id);
      element.dataset.t = key;
      element.textContent = t(key);
    }
  }
  visRender();
}
function bindDeviceTabs(tabs, select) {
  for (const [index, tab] of tabs.entries()) {
    tab.onclick = () => select(tab);
    tab.onkeydown = event => {
      const count = tabs.length;
      const next = { ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count, Home: 0, End: count - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next]);
      if (tabs[next].getAttribute('aria-selected') === 'true') tabs[next].focus();
    };
  }
}
bindDeviceTabs(deviceTabs, showDeviceTab);
bindDeviceTabs(uartToolTabs, tab => selectDevicePanel(uartToolTabs, tab));
let deviceOnlyChanged = $('devOnly').checked, deviceKeepSaves = $('devKeep').checked;
function deviceWritePlan() {
  const device = dv.d;
  const myLab = device?.info.edition === 0xFE;
  const bridge = device?.info.edition === FL.MY_LAB_ON_PARADISE;
  const stagedPort = myLabRom?.portDraft;
  const labImage = stagedPort?.flashImage || myLabFlashImage();
  const paradiseImage = !!stagedPort || (!!labImage && ML.isParadiseFlashImage(labImage, C));
  const raw = myLab || bridge || paradiseImage;
  const portUpdate = bridge && paradiseImage;
  const fixedOptions = !myLab && (bridge || paradiseImage) && !portUpdate;
  const keep = !fixedOptions && deviceKeepSaves;
  const onlyChanged = fixedOptions || deviceOnlyChanged;
  const source = myLabRom || state.ctx;
  const paradiseBackup = bridge && !!state.ctx && !!F.edition(state.ctx.rom) && !F.isClean(state.ctx.rom);
  const canWrite = myLab ? !!labImage && !paradiseImage :
    bridge ? paradiseImage || paradiseBackup : !!state.ctx || paradiseImage;
  const content = [];
  if (myLabRom && !labImage) {
    content.push(t("A flashable My Lab image is required."));
  } else if (myLabRom) {
    content.push(paradiseImage ? t('myLabPortDevice') : t("My Lab flash image"));
    if (paradiseImage && selectedScreenFit(myLabRom)) content.push(t('myLabScreenFit'));
    if (myLabRom.spriteChanges.some(edits => edits.size)) content.push(t('myLabSpriteEdits'));
    if (myLabRom.menuDraft && !stagedPort) content.push(t("Staged menu included"));
    if (myLabRom.saveDraft) content.push(keep ? t("Staged save excluded to keep the device save") : t("Staged save included"));
  } else if (source) {
    if (bridge) content.push(t('myLabPortLoadedBackup'), t("Workspace edits excluded during direct restore"));
    else content.push(t("Loaded {v1} ROM with current workspace edits", { v1: workspaceEdition(state.ctx) }));
  } else content.push(t("Open a ROM in Workspace."));
  if (state.ctx && !raw) {
    for (const chip of document.querySelectorAll('#plan .chip.new, #plan .chip.del')) {
      content.push(Array.from(chip.children, part => part.textContent.trim()).join(' — '));
    }
    if (state.petDirty || state.paraCleared || state.saveIn) content.push(t("Save data"));
    if (state.specialFood) content.push(t("Special food"));
    if (state.labRelease) content.push(t("My Lab release"));
    if (state.labItemEdits?.size) content.push(keep ? t("Lab Item edits excluded to keep device saves") : t("Lab Item edits"));
  }
  if (device && source && !canWrite && (!myLabRom || labImage)) content.push(t("Incompatible with this target."));
  const name = myLabRom?.name || (state.ctx && state.name);
  const target = device ? connectedEdition(device) + (device.info.readOnly ? ' · ' + t('devReadOnly').toLowerCase() : '') : t('Connect a device to identify the target.');
  const saves = !device || !canWrite ? '—' : keep ? t(myLab || portUpdate ? 'Keep the device save and Garden.' :
    'Preserve compatible device saves and apply supported workspace save edits.') : t('Replace with save data from the write image.');
  const edition = sourceEdition(!!stagedPort);
  return { device, source, name, edition, target, content, saves, canWrite, raw, myLab, labImage, paradiseImage, portUpdate, keep, onlyChanged, fixedOptions };
}

function renderWriteContent(container, plan) {
  if (!plan.source || (myLabRom && !plan.labImage)) {
    container.textContent = plan.content.join(' ');
    return;
  }
  const list = document.createElement('ul');
  list.className = 'write-content-list';
  const portLabel = plan.paradiseImage ? t('myLabPortDevice') : null;
  for (const text of plan.content) {
    const item = document.createElement('li');
    item.textContent = text;
    if (text === portLabel) markEdition(item, text, 'my-lab-on-paradise');
    list.append(item);
  }
  container.replaceChildren(list);
}

function renderWriteReview(plan) {
  $('writeSource').textContent = plan.name || t("No ROM loaded");
  renderSourceEdition('writeSourceEdition', plan.edition);
  renderWriteContent($('writeContent'), plan);
  $('writeTarget').textContent = plan.target;
  markDeviceEdition($('writeTarget'), plan.device);
  $('writeSaves').textContent = plan.saves;
}

function deviceDialog(message, title = t("Confirm Device Operation"), action = t("Continue"), notice = false, writeMode = null) {
  const dialog = $('deviceDialog');
  if (dialog.open) return Promise.resolve(false);
  const review = writeMode === 'review';
  $('writeRisk').hidden = !writeMode;
  $('deviceDialogTitle').textContent = title;
  $('deviceDialogMessage').replaceChildren(message);
  $('deviceDialogMessage').hidden = review;
  $('writeSummary').hidden = !review;
  dialog.setAttribute('aria-describedby', (review ? 'writeSummary' : 'deviceDialogMessage') + (writeMode ? ' writeRisk' : ''));
  $('deviceDialogCancel').hidden = notice;
  $('deviceDialogAccept').textContent = action;
  const targetDevice = dv.d;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept' && dv.d === targetDevice), { once: true });
    dialog.showModal();
    $(notice ? 'deviceDialogAccept' : 'deviceDialogCancel').focus();
  });
}

function confirmFlashOperation(message, title = t("Confirm Device Write"), action = t("Write to Device")) {
  return deviceDialog(message, title, action, false, 'write');
}

function warnDeviceWrite() {
  if (!dv.writing) return false;
  void deviceDialog(t("Keep this page open and the device connected until the write finishes."),
    t("Device Write in Progress"), t("Stay Here"), true);
  return true;
}

async function devWriteTask(fn) {
  if (dv.run || dv.writing) return;
  dv.writing = true;
  dv.writeOperation = {};
  try { await devTask(fn); }
  finally { dv.writing = false; dv.writeOperation = null; }
}

function confirmDeviceWrite(plan, image) {
  const base = plan.source.sourceRom || plan.source.rom;
  let changed = 0;
  for (let i = 0; i < image.length; i++) if (image[i] !== base[i]) changed++;
  $('reviewSourceName').textContent = plan.name;
  renderSourceEdition('reviewSourceEdition', plan.edition);
  $('reviewTargetName').textContent = plan.target;
  markDeviceEdition($('reviewTargetName'), plan.device);
  renderWriteContent($('reviewContent'), plan);
  $('reviewSaves').textContent = plan.saves;
  $('reviewSaves').classList.toggle('replace-saves', !plan.keep);
  $('reviewMode').textContent = plan.onlyChanged ? t("Only changed sectors") : t("Full write");
  $('reviewBytes').textContent = t("{v1} bytes", { v1: changed.toLocaleString(locale()) });
  return deviceDialog('', t("Review Device Write"), t("Write to {v1}", { v1: plan.target }), false, 'review');
}

// The combined Tropical/Glacier ID and My Lab on Paradise do not identify a shell edition.
const DEVICE_ART = {
  1: 'land', 2: 'water', 3: 'sky', 4: 'jade', 5: 'tropics', 6: 'glacier', 8: 'neon',
  [FL.MY_LAB_ON_PARADISE]: 'my-lab-on-paradise', 0xFE: 'my-lab',
};
function renderDeviceConnection() {
  const device = dv.d;
  const info = $('devInfo');
  info.textContent = dv.connecting ? (dv.cancel ? t("Cancelling…") : t("Connecting…")) :
    device ? t('devOn', { ed: connectedEdition(device), mb: device.info.capacity >> 20, l: dv.loaded ? t('devLoaded') : '' }) +
    (device.info.readOnly ? ' · ' + t('devReadOnly') : '') :
    dv.opening ? t("Choose a USB port…") : dv.run ? t("Connecting…") : t('devNone');
  markDeviceEdition(info, device);
}

function devRender(msg) {
  const ser = !!(navigator.serial && hasFlashApp);
  if (!dv.run) $('devProgress').hidden = true;
  const plan = deviceWritePlan();
  const { myLab, canWrite } = plan;
  const readOnly = dv.d?.info.readOnly;
  const paradiseBridge = dv.d?.info.edition === FL.MY_LAB_ON_PARADISE;
  renderWriteReview(plan);
  $('connectionSteps').hidden = !!dv.d;
  $('btnUartRelease').hidden = !dv.io || !!dv.connecting;
  $('btnUartRelease').disabled = dv.opening || dv.run;
  $('btnDump').disabled = !dv.d || dv.run;
  $('btnWrite').disabled = !dv.d || dv.run || !canWrite || readOnly;
  $('btnSaveRead').disabled = !dv.d || dv.run;
  $('btnSaveWrite').disabled = !dv.d || dv.run || readOnly;
  $('btnReadLabItems').disabled = dv.opening || dv.run || !canReadLabItems(dv.d);
  $('btnParaIn').disabled = !dv.d || dv.run || readOnly || myLab || paradiseBridge;
  const saveHint = !dv.d ? 'deviceSaveFormats' : paradiseBridge && readOnly ? 'portSaveBackup' : myLab || paradiseBridge ? 'myLabDeviceSaveHint' : 'devSaveHint';
  $('devSaveHint').dataset.t = saveHint;
  $('devSaveHint').textContent = t(saveHint);
  $('devOnly').disabled = $('devKeep').disabled = dv.run || plan.fixedOptions;
  $('devOnly').checked = plan.onlyChanged;
  $('devKeep').checked = plan.keep;
  $('btnDevStop').hidden = !dv.run;
  $('btnDevStop').disabled = !!dv.cancel;
  $('btnRescueTest').disabled = $('btnRescueBack').disabled = !dv.d || dv.run || myLab || paradiseBridge;
  const edition = dv.d?.info.edition;
  const deviceArt = $('connectedDeviceArt');
  const model = dv.d?.info.editionIdentified === false ? '' : DEVICE_ART[edition] || '';
  deviceArt.className = 'device-art ' + model;
  deviceArt.hidden = !model;
  renderDeviceConnection();
  if (msg !== undefined) $('devStat').textContent = msg;
  else if (!ser) $('devStat').textContent = t('devNoSerial');
  else if (dv.d && !canWrite && !dv.run && !readOnly) $('devStat').textContent = t('devNeedRom');
  else if ($('devStat').textContent === t('devNeedRom')) $('devStat').textContent = '';
  uartWarnRender();
  visRender();
}
/* Flasher errors and notes carry a code; German has its own texts, English uses the module's */
function flMsg(x) {
  const key = x?.code && 'fl_' + x.code;
  if (key && locale() !== 'en' && Object.hasOwn(T.en, key)) return t(key, x.p);
  return t(x?.message || x?.text || String(x));
}
function transferProgress(prefix, done, total, label) {
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.floor(done / total * 1000) / 10)) : null;
  $(prefix + 'Progress').hidden = percent === null;
  if (percent !== null) {
    $(prefix + 'Bar').style.setProperty('--end', percent + '%');
    $(prefix + 'Percent').textContent = percent + '%';
    $(prefix + 'Meter').setAttribute('aria-valuenow', percent);
    $(prefix + 'Meter').setAttribute('aria-label', label);
  }
}

let devicePhaseSample = null;
function devicePhaseEta(phase, done, total, now) {
  if (!(total > 0 && done >= 0 && done < total)) {
    devicePhaseSample = null;
    return '';
  }
  const sample = devicePhaseSample;
  if (!sample || sample.phase !== phase || sample.total !== total || done < sample.lastDone) {
    devicePhaseSample = { phase, total, started:now, firstDone:done, lastDone:done };
    return '';
  }
  sample.lastDone = done;
  const elapsed = (now - sample.started) / 1000;
  const advanced = done - sample.firstDone;
  if (elapsed < 1 || advanced <= 0) return '';
  const seconds = Math.ceil((total - done) * elapsed / advanced);
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's';
}

function devProg(ph, done, total) {
  transferProgress('dev', done, total, t('ph' + ph));
  const remaining = devicePhaseEta(ph, done, total, performance.now());
  $('devEta').hidden = !remaining;
  $('devEta').textContent = remaining ? t("Stage ETA ~{v1}", { v1: remaining }) : '';
  const big = total >= 0x400000, u = big ? 1 << 20 : 1024;
  const n = ph === 'write' || (ph === 'check' && total === 1) ?
    done + ' / ' + total : (done / u | 0) + ' / ' + (total / u | 0) + (big ? ' MB' : ' KB');
  $('devStat').textContent = t('ph' + ph) + '  ' + n;
}
async function devTask(fn) {
  devicePhaseSample = null;
  $('devEta').hidden = true;
  dv.restartNeeded = false;
  $('devRestartGuide').hidden = true;
  $('devProgress').hidden = true;
  dv.run = true; dv.cancel = false; devRender('');
  const initialDevice = dv.d;
  let msg, complete = false;
  try {
    if (initialDevice) await initialDevice.resetTask(fn); else await fn();
    msg = $('devStat').textContent;
    complete = true;
  } catch (e) { msg = dv.cancel || e?.code === 'cancelled' ? t('devCancelled') : t('devErr', { e: flMsg(e) }); }
  finally {
    // Connect creates its device inside fn; arm only after hello and rescue checks finish.
    if (complete && dv.d && dv.d !== initialDevice) { try { await dv.d.resetIdle(true); } catch (_) {} }
    dv.run = false; devRender(msg);
    $('devRestartGuide').hidden = !(complete && dv.restartNeeded);
  }
}
const viewScroll = new Map();
function showDestination(view, newRom = false) {
  const main = document.querySelector('main');
  if (main.dataset.view !== view && warnDeviceWrite()) return;
  if (main.dataset.view !== view && !newRom) measure('feature_view', view);
  viewScroll.set(main.dataset.view, window.scrollY);
  main.dataset.view = view;
  rememberNavigation({ view });
  $('helpBox').hidden = view !== 'guide';
  if (view !== 'guide') {
    for (const button of document.querySelectorAll('.demo-toggle[aria-pressed="true"]')) setDemoPlayback(button, false);
  }
  $('device').hidden = view !== 'device';
  $('labCodesPage').hidden = view !== 'codes';
  for (const [key, id] of Object.entries({workspace:'btnWorkspace', guide:'btnHelp', device:'btnDevice', codes:'btnLabCodes'})) {
    if (key === view) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  if (view === 'device') devRender();
  if (view === 'codes') renderLabCodeReference();
  window.scrollTo(0, newRom ? 0 : viewScroll.get(view) || 0);
}
function setDemoPlayback(button, playing) {
  const image = $(button.getAttribute('aria-controls'));
  image.src = playing ? image.dataset.animation : image.dataset.poster;
  button.setAttribute('aria-pressed', String(playing));
}
for (const detail of document.querySelectorAll('.demo-group details')) {
  const image = detail.querySelector('img');
  const button = detail.querySelector('.demo-toggle');
  detail.addEventListener('toggle', () => {
    if (detail.open && !image.hasAttribute('src')) image.src = image.dataset.poster;
    if (!detail.open && button?.getAttribute('aria-pressed') === 'true') setDemoPlayback(button, false);
  });
  if (button) button.onclick = () => setDemoPlayback(button, button.getAttribute('aria-pressed') !== 'true');
}
$('guideOpenRom').onclick = () => $('fileRom').click();
for (const link of document.querySelectorAll('[data-view-link]')) {
  link.onclick = event => {
    event.preventDefault();
    const route = link.dataset.viewLink;
    let target = $(link.hash.slice(1));
    if (route === 'device') {
      showDestination('device');
      showDeviceTab(target);
    } else if (route === 'uart') {
      showDestination('device');
      showDeviceTab($('deviceTabUart'));
      const tool = uartToolTabs.find(tab => tab === target || $(tab.getAttribute('aria-controls')).contains(target));
      if (tool && !selectDevicePanel(uartToolTabs, tool)) return;
    } else {
      showDestination('workspace');
      if (route === 'save' && (myLabRom || state.ctx)) {
        const tab = myLabRom ? $('myLabTabSave') : $('tool-save');
        tab.click();
        target = tab.offsetWidth ? tab : $(myLabRom ? 'labTool' : 'paradiseTool');
      } else if (!myLabRom && !state.ctx) target = $('drop');
      else if (route === 'workspace') target = $('btnWorkspace');
    }
    if (target.disabled) {
      const heading = $(myLabRom ? 'labHeading' : 'paradiseHeading');
      heading.tabIndex = -1;
      heading.focus({ preventScroll:true });
    } else target.focus({ preventScroll:true });
    target.scrollIntoView({ block:'center' });
  };
}
$('btnWorkspace').onclick = () => showDestination('workspace');
$('btnDevice').onclick = $('launchDevice').onclick = () => showDestination('device');
$('btnHelp').onclick = $('launchGuide').onclick = () => showDestination('guide');
$('btnLabCodes').onclick = () => showDestination('codes');
$('btnUartRelease').onclick = devFree;
$('helpClose').onclick = () => { showDestination('workspace'); $('btnWorkspace').focus(); };
$('btnDevStop').onclick = async () => {
  if (dv.connecting) {
    dv.cancel = true;
    dv.connecting.abort();
    devRender();
    return;
  }
  const operation = dv.writeOperation;
  if (operation && (!await deviceDialog(t("Stop the write at the next cancellation point? Keep the device connected."), t("Stop Device Write?"), t("Stop Write")) || operation !== dv.writeOperation)) return;
  dv.cancel = true;
};
/* 1.6.9: simulated playdate partner for the Paradise (src/visit.js). Same link key and serial transport as the
 * flash app loader (src/flash.js). */
const VIS = window.ParamixVisit;
const COLLECTION_REFERENCE = /*__COLLECTION_REFERENCE__*/ {};
function referenceCharacterName(id) {
  const names = COLLECTION_REFERENCE.characters[id]?.names || COLLECTION_REFERENCE.names[id];
  return displayName(fallback => RL.name(names, gameLocale(), { fallback }));
}
function characterReference(id) {
  const entry = COLLECTION_REFERENCE.characters[id];
  if (!entry) return [];
  const facts = [['Lab Code', entry.code]];
  if (entry.young) facts.push(['Young Stage', referenceCharacterName(entry.young)]);
  if (entry.care) facts.push(['Raise Conditions', t(entry.care)]);
  return facts;
}

function fillReferenceFacts(list, facts) {
  for (const [label, value] of facts) {
    const term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = t(label);
    if (value instanceof Node) detail.append(value);
    else detail.textContent = value;
    list.append(term, detail);
  }
}

function codeCard(name, portrait, facts, href) {
  const card = document.createElement('article');
  card.className = 'session-card collection-reference-card';
  const title = document.createElement('h2');
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = name;
    title.append(link);
  } else title.textContent = name;
  const identity = document.createElement('div');
  identity.className = 'collection-reference-identity';
  identity.append(portrait, title);
  const details = document.createElement('dl');
  details.className = 'collection-reference-facts';
  fillReferenceFacts(details, facts);
  card.append(identity, details);
  return card;
}

function labCodePortrait(id, imageUrl) {
  const portrait = document.createElement('div');
  portrait.className = 'collection-reference-portrait';
  const image = new Image(64, 64);
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => {
    image.remove();
    const group = !myLabRom && VS.romVisitors.get('rom:' + id)?.visitor.character.group;
    if (!Number.isInteger(group)) return;
    try {
      const poses = posesOf(group, false);
      const pose = poses[firstPose(poses)];
      const preview = pose && characterPoseImage(group, false, pose);
      if (preview) portrait.append(imgToCanvas(preview));
    } catch (_) {}
  };
  if (imageUrl) {
    image.src = imageUrl;
    portrait.append(image);
  }
  return portrait;
}

function formatCollectionCode(code) {
  return code.slice(0, 4) + ' ' + code.slice(4);
}

function codeEditionsLabel(editions) {
  if (!editions) return t('Not listed');
  if (editions.length === VIS_ED.length - 1) return t('All Paradise Editions');
  const badges = document.createElement('span');
  badges.className = 'code-editions';
  for (const key of editions) {
    const badge = document.createElement('span');
    badge.className = 'edition-badge';
    badge.dataset.edition = key;
    badge.textContent = I18n.edition(key);
    badges.append(badge);
  }
  return badges;
}

function codeMatches(query, name, code) {
  return name.toLocaleLowerCase(locale()).includes(query) || code.toLowerCase().includes(query.replace(/\s/g, ''));
}

function renderLabCodeReference() {
  if ($('labCodesPage').hidden) return;
  const query = $('findCode').value.trim().toLocaleLowerCase(locale());
  if (!$('shopCodePanel').hidden) {
    renderShopCodeReference(query);
    return;
  }
  const entries = Object.entries(COLLECTION_REFERENCE.characters).map(([id, item]) => ({
    id, item, name: referenceCharacterName(id),
  })).filter(({ name, item }) => codeMatches(query, name, item.code))
    .sort((a, b) => a.name.localeCompare(b.name, locale()));
  $('labCodeCards').replaceChildren(...entries.map(({ id, item, name }) => {
    const facts = [
      ['Lab Code', formatCollectionCode(item.code)],
      ['Young Stage', (item.young && referenceCharacterName(item.young)) || t('Not listed')],
      ['Raise Conditions', t(item.care || 'Not listed')],
      ['Available For', codeEditionsLabel(item.editions)],
    ];
    return codeCard(name, labCodePortrait(id, item.image), facts,
      item.official && 'https://tamagotchi-official.com/anz/series/paradise/character/' + item.official + '/');
  }));
  $('codeEmpty').hidden = !!entries.length;
}

function renderShopCodeReference(query) {
  const catalog = deviceCatalogs.gift.data;
  const status = $('shopCodeStatus');
  if (!catalog) {
    $('codeEmpty').hidden = true;
    $('shopCodeRetry').hidden = true;
    status.hidden = false;
    status.textContent = t('Loading catalog…');
    void loadDeviceCatalog('gift')?.then(() => {
      if (deviceCatalogs.gift.data) renderLabCodeReference();
      else {
        status.textContent = t('Could not load the catalog.');
        $('shopCodeRetry').hidden = false;
      }
    });
    return;
  }
  status.hidden = true;
  $('shopCodeRetry').hidden = true;
  const entries = catalog.items.flatMap(row => {
    const [id, name, group, taiwan, names] = row;
    const code = COLLECTION_REFERENCE.shopCodes[id];
    if (!code) return [];
    const display = (traditionalGameText() && taiwan) || RL.name(names, gameLocale()) || name;
    if (!codeMatches(query, display, code)) return [];
    const editions = COLLECTION_REFERENCE.shopEditions?.[id] ?? VIS_ED.filter(key => GIFT_EDITIONS[key]?.includes(group));
    return [{ id, display, code, editions }];
  }).sort((a, b) => a.display.localeCompare(b.display, locale()));
  $('shopCodeCards').replaceChildren(...entries.map(({ id, display, code, editions }) => {
    const portrait = document.createElement('div');
    portrait.className = 'collection-reference-portrait code-item-portrait';
    portrait.setAttribute('aria-hidden', 'true');
    renderGiftIcon(portrait, id);
    return codeCard(display, portrait, [
      ['Shop Code', formatCollectionCode(code)],
      ['Available For', codeEditionsLabel(editions)],
    ]);
  }));
  $('codeEmpty').hidden = !!entries.length;
}

for (const button of [$('showLabCodes'), $('showShopCodes')]) {
  button.onclick = () => {
    const shop = button.id === 'showShopCodes';
    $('labCodePanel').hidden = shop;
    $('shopCodePanel').hidden = !shop;
    $('showLabCodes').setAttribute('aria-pressed', String(!shop));
    $('showShopCodes').setAttribute('aria-pressed', String(shop));
    renderLabCodeReference();
  };
}
$('findCode').oninput = renderLabCodeReference;
$('shopCodeRetry').onclick = renderLabCodeReference;
const changePortButton = $('changeDevicePort');
let selectedDevicePort = null;
const VS = {
  io: null, mode: null, opening: false, v: null, peer: null, chunks: [], bytes: 0,
  ghosts: [], savedVisitors: new Map(), baseVisitor: null, visitor: null, romContext: null, romVisitors: new Map(),
  romPalette: null, eyeChoices: new Map(), food: null,
};
const CATALOG_CONFIG = /*__CATALOG_CONFIG__*/ {};
const deviceCatalogs = {
  gift: { data: null, pending: null, status: 'giftCatalogStatus', retry: 'giftCatalogRetry' },
  lab: { data: null, pending: null, status: 'itemCatalogStatus', retry: 'itemCatalogRetry' },
};
const GIFT_BY_ID = new Map();
const romItemCatalogs = new WeakMap();
function romItemCatalog(rom) {
  if (!romItemCatalogs.has(rom)) romItemCatalogs.set(rom, new Map(F.itemCatalog(rom).map(item => [item.id, item])));
  return romItemCatalogs.get(rom);
}
const GAME_TRANSFER_TABS = { gift: 'deviceTabGift', item: 'deviceTabItem' };
let giftChoice = null;
const itemTransfer = { item: null, files: [], editedSprites: new Set(), selection: null, loading: false, folderRequest: 0, request: 0 };
const VIS_CAPTURE_LIMIT = 4 * 1024 * 1024;
const VIS_SCREENSHOT = 0x1b000;
// Native Space planet sprites, matched by decoded pixels across editions.
const VIS_ROM_PLANETS = {
  1: [207, 217, 218, 219, 223],
  4: [213, 223, 224, 225, 229, 241],
  5: [222, 232, 233, 234, 238, 250, 252, 253, 254, 255, 256, 257, 260, 261],
  7: [225, 227, 228, 229, 230, 235, 237, 238, 239, 240, 241, 242, 245, 246, 247, 248, 249, 250, 251, 252, 254],
};
const VIS_PLANET_PROFILES = [0, 1, 1, 1, 4, 5, 5, 7];
const VIS_ED = ['land', 'water', 'sky', 'jade', 'tropics', 'glacier', 'neon', 'my-lab'];
const UNLOCK_VISITORS = {
  land: [2002, 4066, 3008],
  water: [2003, 4067, 3012],
  sky: [2004, 4068, 3016],
  jade: [2069, 4090],
  tropics: [2091, 4112, 3095],
  glacier: [2113, 4134, 3117],
};
const unlockProgress = new Map();
const VIS_LANGUAGES = RL.LOCALES;
function visNameSlots(view, start) {
  return VIS_LANGUAGES.map((_, slot) => {
    const words = [];
    for (let offset = start + slot * 26, end = offset + 26; offset < end; offset += 2) {
      const code = view.getUint16(offset, true);
      if (!code) break;
      words.push(code);
    }
    return words;
  });
}
function visGhostName(view, start = 0x12, rom) {
  return RL.name(visNameSlots(view, start), gameLocale(), { rom });
}
function visGhostDisplayName(view, start = 0x12, rom) {
  const names = visNameSlots(view, start);
  return displayName(fallback => RL.name(names, gameLocale(), { rom, fallback }));
}
function visView(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function visDecodeSprite(sprite, colorPalette) {
  if (sprite.length < 22) return null;
  const h = C.spriteHeader(sprite), cells = h.sw * h.sh * h.numSprites;
  if (!cells || cells > 0x80000 || h.numSprites > 256 || !h.iw || !h.ih ||
      h.sw * h.iw > 128 || h.sh * h.ih > 128 || h.numPal > 16) return null;
  try {
    if (colorPalette && h.bpp === 2 && h.palOffset + 32 <= sprite.length) {
      sprite = sprite.slice();
      sprite.set(colorPalette, h.palOffset);
    }
    return C.spriteDecode(sprite, 0, true).subs;
  } catch (_) {
    return null;
  }
}
function visPlanetImage(bytes) {
  const view = visView(bytes);
  if (view.getUint32(VIS_SCREENSHOT + 8, true) !== 0x54485353) return null;
  const size = view.getUint32(VIS_SCREENSHOT + 12, true);
  if (size < 0x216 || size > 0x5000) return null;
  return visDecodeSprite(bytes.subarray(VIS_SCREENSHOT + 0x200, VIS_SCREENSHOT + size))?.[0];
}
function visSpriteSheets(bytes) {
  const view = visView(bytes);
  // Each zoom level has its own body, eyes and mouth sprite block.
  return Array.from({ length: 6 }, (_, part) => {
    const field = 0x110 + part * 8;
    const offset = view.getUint32(field, true), length = view.getUint32(field + 4, true);
    if (offset < 0x1d34 || length < 22 || offset + length > VIS_SCREENSHOT) return null;
    const palette = part % 3 === 0 ? 0x140 : part % 3 === 2 ? 0x160 : 0;
    const entry = bytes.subarray(offset, offset + length);
    const frames = visDecodeSprite(entry, palette ? bytes.subarray(palette, palette + 32) : null);
    if (!frames?.length) return null;
    return { frames, x: view.getInt8(offset + 10), y: view.getInt8(offset + 11) };
  });
}
function visCharacterPoses(bytes, sheets, firstOnly = false) {
  const view = visView(bytes), poses = [[], []];
  for (let pose = 0; pose < 54; pose++) {
    const layers = [];
    const start = 0x600 + pose * 110, group = pose >= 30 ? 3 : 0;
    if (firstOnly && poses[group / 3].length) continue;
    for (let layer = 0; layer < 3; layer++) {
      const at = start + layer * 22;
      const part = view.getUint16(at, true);
      if (part !== group + layer || !bytes.subarray(at, at + 22).some(Boolean)) continue;
      const sheet = sheets[part];
      const sprite = sheet?.frames[view.getUint16(at + 12, true)];
      if (!sprite) continue;
      // The first two signed coordinates come after the sprite ID.
      layers.push({ part, sprite, x: view.getInt16(at + 2, true) + sheet.x, y: view.getInt16(at + 4, true) + sheet.y });
    }
    const body = layers.find(layer => layer.part === 0 || layer.part === 3);
    if (!body) continue;
    // The layers share a vertical center, with additional offsets from the sprite headers.
    for (const layer of layers) {
      layer.y += Math.trunc((body.sprite.h - layer.sprite.h) / 2);
    }
    const left = Math.min(...layers.map(l => l.x)), top = Math.min(...layers.map(l => l.y));
    const width = Math.max(...layers.map(l => l.x + l.sprite.w)) - left;
    const height = Math.max(...layers.map(l => l.y + l.sprite.h)) - top;
    if (width > 256 || height > 256) continue;
    const image = C.emptyImage(width, height);
    for (const { sprite, x: dx, y: dy } of layers) {
      for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
        const src = (y * sprite.w + x) * 4;
        if (!sprite.data[src + 3]) continue;
        image.data.set(sprite.data.subarray(src, src + 4), ((dy - top + y) * width + dx - left + x) * 4);
      }
    }
    poses[group / 3].push({ ...image, x: left - body.x, y: top - body.y });
  }
  return poses;
}
function visDrawImage(canvas, image) {
  canvas.width = image.w;
  canvas.height = image.h;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.w, image.h), 0, 0);
}
function visPicture(id, image) {
  const figure = $(id);
  figure.hidden = !image;
  if (image) visDrawImage(figure.querySelector('canvas'), image);
}
const VIS_FRAME_MS = 320;
const visAnimations = new Map();

function visStopAnimation(prefix) {
  const playback = visAnimations.get(prefix);
  if (playback) clearInterval(playback.timer);
  visAnimations.delete(prefix);
}
function visPlaybackLabel(prefix) {
  const playback = visAnimations.get(prefix);
  const button = $(prefix + 'Playback'), label = t(playback?.timer ? 'visPauseFrames' : 'visPlayFrames');
  if (button.textContent !== label) button.textContent = label;
  if (playback) {
    if (playback.frameInput) playback.frameInput.value = playback.index + 1;
    $(prefix + 'Frame').textContent = t('visFrameCount', { index: playback.index + 1, total: playback.frames.length });
  }
}
function visPaintFrame(prefix) {
  const playback = visAnimations.get(prefix);
  const { canvas, frames, index, left, top } = playback;
  const frame = frames[index], context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(new ImageData(frame.data, frame.w, frame.h), (frame.x || 0) - left, (frame.y || 0) - top);
  visPlaybackLabel(prefix);
}
function visToggleFrameTimer(prefix, play) {
  const playback = visAnimations.get(prefix);
  clearInterval(playback.timer);
  playback.timer = play && playback.frames.length > 1 ? setInterval(() => {
    if (document.hidden || !playback.canvas.getClientRects().length) return;
    playback.index = (playback.index + 1) % playback.frames.length;
    visPaintFrame(prefix);
  }, VIS_FRAME_MS) : null;
  visPlaybackLabel(prefix);
}
function visTogglePlayback(prefix) {
  const playback = visAnimations.get(prefix);
  if (!playback) return;
  playback.paused = !playback.paused;
  visToggleFrameTimer(prefix, !playback.paused);
}
function visSetFrameSequence(prefix) {
  const playback = visAnimations.get(prefix), zoom = $(prefix + 'Zoom'), layer = $(prefix + 'Layer');
  const views = playback.views;
  for (const option of zoom.options) option.disabled = !views[Number(option.value)].some(frames => frames?.length);
  if (!views[Number(zoom.value)].some(frames => frames?.length)) zoom.value = zoom.options[0].disabled ? '1' : '0';
  const available = views[Number(zoom.value)];
  for (const [index, option] of Array.from(layer.options).entries()) option.disabled = !available[index]?.length;
  if (!available[layer.selectedIndex]?.length) layer.selectedIndex = Array.from(layer.options).findIndex(option => !option.disabled);
  visUseFrames(prefix, playback, available[layer.selectedIndex], 0);
}
function visUseFrames(prefix, playback, frames, index) {
  playback.frames = frames;
  playback.index = index;
  playback.left = Math.min(...frames.map(f => f.x || 0));
  playback.top = Math.min(...frames.map(f => f.y || 0));
  playback.canvas.width = Math.max(...frames.map(f => (f.x || 0) + f.w)) - playback.left;
  playback.canvas.height = Math.max(...frames.map(f => (f.y || 0) + f.h)) - playback.top;
  $(prefix + 'Playback').disabled = frames.length < 2;
  visPaintFrame(prefix);
  visToggleFrameTimer(prefix, !playback.paused);
}
function visSetAnimation(prefix, bytes, sheets) {
  const previous = visAnimations.get(prefix);
  visStopAnimation(prefix);
  const figure = $(prefix + 'Character');
  const poses = visCharacterPoses(bytes, sheets);
  const views = poses.map((frames, zoom) => {
    const layers = sheets.slice(3 * zoom, 3 * zoom + 3).map(sheet => sheet?.frames);
    return [frames.length ? frames : layers[0], ...layers];
  });
  const hasFrames = views.some(view => view.some(frames => frames?.length));
  figure.hidden = !hasFrames;
  if (!hasFrames) return false;
  const playback = {
    views, canvas: figure.querySelector('canvas'), frames: [], index: 0, timer: null,
    paused: previous?.paused ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  visAnimations.set(prefix, playback);
  $(prefix + 'Zoom').onchange = () => visSetFrameSequence(prefix);
  $(prefix + 'Layer').onchange = () => visSetFrameSequence(prefix);
  $(prefix + 'Playback').onclick = () => visTogglePlayback(prefix);
  visSetFrameSequence(prefix);
  return true;
}
function visCharacterImages(prefix, bytes, planet) {
  const character = visSetAnimation(prefix, bytes, visSpriteSheets(bytes));
  visPicture(prefix + 'Planet', planet);
  $(prefix + 'ImageStatus').hidden = !!(character || planet);
}
const visHex = (n, width = 4) => '0x' + n.toString(16).toUpperCase().padStart(width, '0');
function visModel(code) {
  const key = VIS_ED.find(key => VIS.ED[key] === code);
  return key ? [key, I18n.edition(key)] : undefined;
}
function visNativeFieldModel(field) {
  const name = C.FIELD_NAMES[field];
  if (name) return [field >= 7 ? 'neon' : DEVICE_ART[field], name];
}
function romEditionKey(id) {
  return id === 7 ? 'tropical-glacier' : DEVICE_ART[id];
}
function workspaceEdition(context) {
  return I18n.edition(romEditionKey(context.editionId)) || context.edition;
}

function measure(event, feature, target, catalogId) {
  window.ParaLabAnalytics?.('paralab_' + event, feature, sourceEdition()?.key, target, catalogId);
}

function sourceEdition(stagedPort = false) {
  if (stagedPort || myLabRom?.menu.mode === 'paradise') return { key: 'my-lab-on-paradise', name: t('myLabPortDevice') };
  if (myLabRom) return { key: 'my-lab', name: I18n.edition('my-lab') };
  if (state.ctx) return { key: romEditionKey(state.ctx.editionId), name: workspaceEdition(state.ctx) };
}

function renderSourceEdition(id, edition) {
  const element = $(id);
  element.hidden = !edition;
  element.textContent = edition?.name || '';
  if (edition) markEdition(element, edition.name, edition.key);
}

function connectedEdition(device) {
  if (device.info.edition === FL.MY_LAB_ON_PARADISE) return t('myLabPortDevice');
  return I18n.edition(romEditionKey(device.info.edition)) || device.info.name;
}

function markEdition(element, name, key) {
  const text = element.textContent;
  const start = name ? text.indexOf(name) : -1;
  if (!key || start < 0) return;
  const badge = document.createElement('span');
  badge.dataset.edition = key;
  badge.className = 'edition-badge';
  badge.textContent = name;
  element.replaceChildren(text.slice(0, start), badge, text.slice(start + name.length));
}
function markDeviceEdition(element, device) {
  if (device && device.info.editionIdentified !== false)
    markEdition(element, connectedEdition(device), romEditionKey(device.info.edition));
}
function visCharacterParameters(prefix, view, playdate, hasPlanet) {
  const word = (offset) => view.getUint16(offset, true);
  const hexWord = (offset) => visHex(word(offset));
  const palette = (offset) => Array.from({ length: 16 }, (_, i) => hexWord(offset + 2 * i)).join(' ');
  const field = word(0x100), color = view.getUint8(0x10);
  const fieldModel = visNativeFieldModel(field);
  const fieldName = romField(prefix === 'visVisitor' && VS.baseVisitor?.fromRom ? activeRom() : null, field, fieldModel?.[1]);
  const rows = [
    ['visField', field + ' · ' + fieldName],
    ['visEyeId', hexWord(0x0e)], ['visOriginalId', hexWord(0x10a)], ['visRank', word(0xfe)],
    ['visColor', color === 0xff ? t('visOriginalPalette') : color],
    ['visCharacterFlags', hexWord(0x102)],
    ['visGhostType', view.getUint32(8, true) & 3], ['visGhostFlags', visHex(view.getUint32(8, true), 8)],
    ['visGhostLength', view.getUint32(0x10c, true)],
    ['visGhostChecksum', visHex(view.getUint32(0, true), 8)],
    ['visBodyPalette', palette(0x140)], ['visMouthPalette', palette(0x160)],
  ];
  const addNames = (base, label) => {
    const names = visNameSlots(view, base);
    const rom = prefix === 'visVisitor' && VS.baseVisitor?.fromRom ? activeRom() : null;
    VIS_LANGUAGES.forEach(([locale, language]) => {
      const source = RL.name(names, locale, { fallback: false, rom });
      if (!source) return;
      const traditional = locale === 'zh-Hans' && traditionalGameText();
      rows.push([t(label, { language: traditional ? '繁體中文' : language }),
        traditional ? RL.taiwanText(source) : source, traditional ? 'zh-Hant' : locale]);
    });
  };
  addNames(0x12, 'visNameSlot');
  if (hasPlanet) {
    rows.push(
      ['visPlanetSize', view.getUint32(VIS_SCREENSHOT + 12, true)],
      ['visPlanetChecksum', visHex(view.getUint32(VIS_SCREENSHOT, true), 8)],
    );
    addNames(VIS_SCREENSHOT + 0x10, 'visPlanetNameSlot');
  }
  if (playdate && prefix === 'visPeer') {
    const data = visView(playdate), base = VIS.GHOST_SIZE;
    rows.push(
      ['visDeviceUid', visHex(data.getUint32(base + 4, true), 8)],
      ['visCharacterUid', visHex(data.getUint32(base + 8, true), 8)],
      ['visFriendship', data.getUint16(base + 12, true)],
      ['visPreviousResult', data.getUint16(base + 14, true)],
      ['visHunger', data.getUint8(base + 16)], ['visHappiness', data.getUint8(base + 17)],
      ['visLove', data.getUint16(base + 18, true) & 1],
    );
  }
  const list = $(prefix + 'Parameters');
  list.replaceChildren();
  for (const [key, value, locale] of rows) {
    const label = document.createElement('dt'), detail = document.createElement('dd');
    label.textContent = t(key);
    detail.textContent = value;
    if (key === 'visField' && fieldModel) markEdition(detail, fieldName, fieldModel[0]);
    if (locale) detail.lang = locale;
    list.append(label, detail);
  }
}
function visCharacterLabels(prefix, bytes, name, playdate, planet, romType = playdate && visView(playdate).getUint16(VIS.GHOST_SIZE + 2, true)) {
  const view = visView(bytes);
  const info = [];
  if (romType !== undefined) {
    const model = visModel(romType)?.[1] || t('visUnknownModel');
    const device = t('visRomInfo', { model, rom: romType, hex: visHex(romType) });
    info.push(prefix === 'visVisitor' ? t('visSourceDevice') + ' — ' + device : device);
  }
  info.push(t('visCharacterInfo', {
    chara: visHex(view.getUint16(0x0c, true)), stage: view.getUint16(0xfc, true),
  }));
  const fromRom = prefix === 'visVisitor' && VS.baseVisitor?.fromRom;
  const sourceRom = fromRom ? activeRom() : null;
  const visitor = fromRom && VS.romVisitors.get($('visGhost').value)?.visitor;
  $(prefix + 'Name').lang = locale();
  $(prefix + 'Name').textContent = (visitor ? visitorDisplayName(visitor) : visGhostDisplayName(view, 0x12, sourceRom) || name) || t('visUnnamed');
  const planetName = planet ? visGhostDisplayName(view, VIS_SCREENSHOT + 0x10, sourceRom) : '';
  $(prefix + 'PlanetName').textContent = planetName ? ' · ' + planetName : '';
  $(prefix + 'Info').textContent = info.join(' · ');
  const sourceModel = visModel(romType);
  if (sourceModel) markEdition($(prefix + 'Info'), sourceModel[1], sourceModel[0]);
  visCharacterParameters(prefix, view, playdate, !!planet);
}
function visPeerLabels(planet = VS.peer && visPlanetImage(VS.peer)) {
  if (!VS.peer) return;
  visCharacterLabels('visPeer', VS.peer, null, VS.peer, planet);
}
function visitorName(visitor) {
  const { id, name } = visitor.character;
  return romText(activeRom(), name) || RL.name(visitor.names, gameLocale(), { rom: activeRom() }) || visHex(id);
}
function visitorDisplayName(visitor) {
  return romDisplayName(activeRom(), visitor.character.name) ||
    displayName(fallback => RL.name(visitor.names, gameLocale(), { rom: activeRom(), fallback })) ||
    visHex(visitor.character.id);
}
function visitorFieldName(field) {
  return field ? romField(activeRom(), field, visNativeFieldModel(field)?.[1]) : '';
}
function refreshVisitorLabels() {
  $('visRomVisitors').label = t('visRomCharacters');
  $('visSavedVisitors').label = t('Saved Visitors');
  const labels = ['visGhost', 'visEyesChoice', 'foodBody', 'foodEyes'].map(id =>
    [id, new Map(Array.from($(id).options, option => [option.value, option]))]);
  for (const [key, entry] of VS.romVisitors) {
    const { id, field } = entry.visitor.character;
    entry.name = visitorName(entry.visitor);
    const name = visitorDisplayName(entry.visitor);
    const fieldName = visitorFieldName(field);
    for (const [select, options] of labels) {
      const option = options.get(key);
      if (option) option.textContent = [name, select.startsWith('vis') ? fieldName : '', visHex(id)].filter(Boolean).join(' · ');
    }
  }
  for (const option of $('visGhost').querySelectorAll(':scope > option:not(#visDefault)')) {
    const ghost = VS.ghosts[option.value];
    if (ghost) option.textContent = visGhostDisplayName(visView(ghost.bytes)) || ghost.name;
  }
  for (const option of $('visSavedVisitors').children) {
    const ghost = VS.savedVisitors.get(option.value);
    if (ghost) option.textContent = visGhostDisplayName(visView(ghost.bytes)) || ghost.name;
  }
  const selected = VS.romVisitors.get($('visGhost').value);
  if (selected) {
    if (VS.baseVisitor?.fromRom) VS.baseVisitor.name = selected.name;
    if (VS.visitor?.fromRom) VS.visitor.name = selected.name;
  }
  $('foodBody').options[0].textContent = t('Choose an adult Tama');
  $('foodEyes').options[0].textContent = t('Default eyes');
  const colors = paletteNames();
  for (const option of $('foodColor').options)
    option.textContent = option.value === '' ? t('Default color') : colors[Number(option.value)];
}
function visRefreshRomVisitors() {
  const context = myLabRom || state.ctx;
  if (VS.io || VS.romContext === context) return;
  VS.romContext = context;
  VS.romVisitors.clear();
  VS.romPalette = null;
  const group = $('visRomVisitors');
  group.label = t('visRomCharacters');
  group.replaceChildren();
  try {
    const ctx = state.clean ? null : state.ctx;
    const entries = myLabRom?.archives[1] || ctx?.entries;
    VS.romPalette = entries ? C.characterPaletteVariants(entries)?.bytes : null;
    const visitors = myLabRom ? myLabRom.characters.values() : VIS.collectRomVisitors(ctx, C);
    for (const visitor of visitors) {
      const { id, field } = visitor.character;
      const name = visitorName(visitor);
      const option = document.createElement('option');
      option.value = 'rom:' + id;
      option.dataset.stage = visitor.character.stage;
      const fieldName = visitorFieldName(field);
      option.textContent = [visitorDisplayName(visitor), fieldName, visHex(id)].filter(Boolean).join(' · ');
      group.appendChild(option);
      VS.romVisitors.set(option.value, { visitor, name });
    }
  } catch (_) {
    group.replaceChildren();
    VS.romVisitors.clear();
  }
  group.hidden = !VS.romVisitors.size;
  if ($('visGhost').value.startsWith('rom:')) $('visGhost').value = '';
  populateFoodBodies();
  renderLabCodeReference();
  visSelectVisitor();
}
function visAddChoice(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}
function paletteNames() {
  const colors = t('visPaletteNames').split('|');
  return colors.length === 16 ? colors : T.en.visPaletteNames.split('|');
}
function visAppearanceLabels() {
  const colors = $('visColorChoice').options, originalEyes = $('visEyesChoice').options[0];
  const names = paletteNames();
  if (colors[0]) colors[0].textContent = t('visKeepColor');
  for (let i = 1; i < colors.length; i++) colors[i].textContent = names[Number(colors[i].value)];
  if (originalEyes) originalEyes.textContent = t('visKeepEyes');
}
function visConfigureAppearance() {
  const base = VS.baseVisitor;
  $('visVisitorAppearance').hidden = !base?.canEdit;
  const colors = $('visColorChoice'), eyes = $('visEyesChoice');
  colors.replaceChildren(); eyes.replaceChildren(); VS.eyeChoices.clear();
  visAddChoice(colors, '', t('visKeepColor'));
  visAddChoice(eyes, '', t('visKeepEyes'));
  colors.value = ''; eyes.value = '';
  $('visAppearanceNeedsRom').hidden = !base?.canEdit || !!VS.romPalette || !!VS.romVisitors.size;
  if (!base?.canEdit) return;

  const available = VIS.ghostAppearanceOptions(base.bytes, C);
  if (VS.romPalette && available.tint) {
    paletteNames().forEach((name, index) => visAddChoice(colors, String(index), name));
  }
  if (available.eyes) {
    const originalId = visView(base.bytes).getUint16(0x0e, true);
    for (const [value, { visitor }] of VS.romVisitors) {
      const donor = VIS.romEyes(visitor, available.eyes, C);
      if (!donor || (base.fromRom && donor.id === originalId)) continue;
      const field = visitorFieldName(visitor.character.field);
      visAddChoice(eyes, value, [visitorDisplayName(visitor), field, visHex(donor.id)].filter(Boolean).join(' · '));
      VS.eyeChoices.set(value, donor);
    }
  }
}
function visSelectVisitor() {
  const value = $('visGhost').value, rom = VS.romVisitors.get(value);
  VS.baseVisitor = null;
  let error;
  try {
    VS.baseVisitor = rom ? {
      bytes: VIS.buildRomGhost(rom.visitor, C), name: rom.name, fromRom: true, canEdit: true,
      romType: VS.romContext.editionId || undefined,
    } : value.startsWith('saved:') ? VS.savedVisitors.get(value) : VS.ghosts[value];
  } catch (e) {
    error = e;
  }
  visConfigureAppearance();
  visConfigurePlaydate();
  visRenderVisitor();
  if (error) $('visRomVisitorError').textContent = t('visRomVisitorError', { reason: em(error) });
}
function visConfigurePlaydate() {
  const base = VS.baseVisitor, select = $('visPlanetChoice');
  const ids = VIS_ROM_PLANETS[VIS_PLANET_PROFILES[state.ctx?.editionId]] || [];
  select.replaceChildren();
  visAddChoice(select, '', t('visPlanetAuto'));
  select.options[0].dataset.t = 'visPlanetAuto';
  for (const id of ids) {
    if (state.ctx.entries[id]) visAddChoice(select, String(id), '#' + id);
  }
  $('visPlanetNeedsRom').hidden = select.options.length > 1;
  VS.playdateFields = base ? VIS.playdateFields(base.playdate, base.bytes, base.romType || VIS.ED[$('visEd').value]) : null;
  for (const [key, , width] of VIS.PLAYDATE_FIELDS) {
    const value = VS.playdateFields?.[key];
    $(key + 'Input').value = value === undefined ? '' : width === 4 ? visHex(value, 8) : String(value);
  }
}

for (const [key, , width] of VIS.PLAYDATE_FIELDS) {
  const label = document.createElement('label'), title = document.createElement('span');
  title.dataset.t = key;
  const input = document.createElement('input');
  input.id = key + 'Input';
  input.type = 'text';
  input.inputMode = width === 4 ? 'text' : 'numeric';
  input.maxLength = width === 4 ? 10 : width === 2 ? 5 : width === 1 ? 3 : 1;
  input.onchange = () => {
    if (!VS.playdateFields) return;
    const text = input.value.trim(), max = width ? 2 ** (8 * width) - 1 : 1;
    const valid = width === 4 ? /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text) : /^\d+$/.test(text);
    const value = Number(text);
    if (valid && value <= max) VS.playdateFields[key] = value;
    const saved = VS.playdateFields[key];
    input.value = width === 4 ? visHex(saved, 8) : String(saved);
  };
  label.append(title, input);
  $('visPlaydateFields').append(label);
}
$('visPlanetChoice').onchange = () => visRenderVisitor();
function visRenderVisitor(renderImages = true) {
  if (renderImages) {
    const base = VS.baseVisitor;
    $('visRomVisitorError').textContent = '';
    VS.visitor = null;
    try {
      if (base) {
        const color = $('visColorChoice').value;
        let bytes = VIS.editGhostAppearance(base.bytes, {
          color: color === '' ? undefined : Number(color), palette: VS.romPalette,
          eyes: VS.eyeChoices.get($('visEyesChoice').value),
        });
        const planetId = $('visPlanetChoice').value;
        const sourcePlanet = planetId === '' ? null : visDecodeSprite(state.ctx.entries[Number(planetId)])?.[0];
        if (sourcePlanet || base.fromRom || visPlanetImage(bytes)) {
          if (bytes === base.bytes) bytes = bytes.slice();
          if (sourcePlanet) VIS.writeRomGhostPlanet(bytes, sourcePlanet, C);
          else if (base.fromRom) {
            const poses = visCharacterPoses(bytes, visSpriteSheets(bytes));
            const portrait = poses[0][0] || poses[1][0];
            if (portrait) VIS.writeRomGhostPlanet(bytes, portrait, C);
          } else VIS.setPlanetNameAndChecksum(bytes, C);
        }
        VS.visitor = { ...base, bytes, sourcePlanet: !!sourcePlanet };
      }
    } catch (e) {
      $('visRomVisitorError').textContent = t('visRomVisitorError', { reason: em(e) });
    }
    visRender();
  }
  const ghost = VS.visitor || VS.baseVisitor;
  $('visVisitor').hidden = !ghost;
  if (!ghost) { visStopAnimation('visVisitor'); return; }
  // A ROM visitor's generated portrait is for the Playdate packet, not a planet screenshot.
  const planet = ghost.fromRom && !ghost.sourcePlanet ? null : visPlanetImage(ghost.bytes);
  visCharacterLabels('visVisitor', ghost.bytes, ghost.name, ghost.playdate, planet, ghost.romType);
  if (renderImages) visCharacterImages('visVisitor', ghost.bytes, planet);
}
function visReceivePeer(bytes) {
  VS.peer = bytes;
  const planet = visPlanetImage(bytes);
  visCharacterImages('visPeer', bytes, planet);
  $('btnVisPeerExport').disabled = false;
  visPeerLabels(planet);
  $('visPeer').hidden = false;
}
async function visImportGhost(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error(t('visGhostFormat'));
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const view = visView(fileBytes);
  let bytes = fileBytes, name;
  const png = fileBytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a;
  if (png) {
    bytes = null;
    for (let offset = 8; offset + 12 <= fileBytes.length;) {
      const end = offset + 8 + view.getUint32(offset);
      if (end + 4 > fileBytes.length) throw new Error(t('visGhostFormat'));
      const type = view.getUint32(offset + 4);
      const chunk = fileBytes.subarray(offset + 8, end);
      if (type === 0x7461426e) { // taBn
        if (C.crc32(fileBytes.subarray(offset + 4, end)) !== view.getUint32(end)) throw new Error(t('visGhostFormat'));
        bytes = chunk;
      } else if (type === 0x74455874) { // tEXt
        const text = new TextDecoder().decode(chunk);
        if (text.startsWith('tama:meta\0')) {
          try { name = JSON.parse(text.slice(10))?.item_name; } catch (_) {}
        }
      } else if (type === 0x49454e44) break; // IEND
      offset = end + 4;
    }
  }
  const playdate = bytes?.length === VIS.PACKET_SIZE ? bytes : undefined;
  if (playdate) bytes = playdate.subarray(0, VIS.GHOST_SIZE);
  if (bytes?.length !== VIS.GHOST_SIZE) throw new Error(t('visGhostFormat'));
  const header = visView(bytes);
  const size = header.getUint32(0x10c, true);
  if ((header.getUint32(8, true) & 3) || ((header.getUint32(0, true) + header.getUint32(4, true)) >>> 0) ||
      size < 0x1d34 || size > VIS_SCREENSHOT) throw new Error(t('visGhostFormat'));
  return { name: typeof name === 'string' && name ? name : visGhostName(header) || file.name, bytes, playdate, canEdit: !png };
}
$('visGhost').onchange = visSelectVisitor;
$('visColorChoice').onchange = () => visRenderVisitor();
$('visEyesChoice').onchange = () => visRenderVisitor();
$('btnVisGhostImport').onclick = () => $('visGhostImport').click();
$('visGhostImport').onchange = async () => {
  const imported = [], errors = [];
  const files = Array.from($('visGhostImport').files);
  $('visGhostImport').value = '';
  for (const file of files) {
    try {
      const ghost = await visImportGhost(file);
      const option = document.createElement('option');
      option.textContent = visGhostDisplayName(visView(ghost.bytes)) || ghost.name;
      option.value = String(VS.ghosts.push(ghost) - 1);
      option.dataset.stage = visView(ghost.bytes).getUint16(0xfc, true);
      $('visGhost').appendChild(option);
      if (!VS.io) $('visGhost').value = option.value;
      imported.push(file.name);
    } catch (e) {
      errors.push(file.name + ' (' + em(e) + ')');
    }
  }
  $('visGhostImportStatus').hidden = !imported.length;
  $('visGhostImportedFiles').textContent = imported.join(', ');
  $('visGhostError').textContent = errors.join(', ');
  if (!VS.io) visSelectVisitor();
};
function visDownloadCharacter(bytes, name, prefix) {
  const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
  download(bytes, prefix + filename + '.bin');
}
$('btnVisPeerExport').onclick = () => {
  if (VS.peer) visDownloadCharacter(VS.peer, visGhostName(visView(VS.peer)), 'playdate-');
};
function visitorPackage() {
  const ghost = VS.visitor;
  if (!ghost) return null;
  const bytes = ghost.playdate ? ghost.playdate.slice() : new Uint8Array(VIS.PACKET_SIZE);
  visView(bytes).setUint16(VIS.GHOST_SIZE + 2, ghost.romType || VIS.ED[$('visEd').value], true);
  bytes.set(ghost.bytes);
  return VIS.writePlaydateFields(bytes, VS.playdateFields);
}
$('btnVisVisitorExport').onclick = () => {
  if (VS.visitor?.canEdit) visDownloadCharacter(visitorPackage(), VS.visitor.name, 'visitor-');
};

async function savedVisitorOp(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('paralab.visitors', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('visitors', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('visitors', mode);
      const request = operation(tx.objectStore('visitors'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function refreshSavedVisitors() {
  const records = await savedVisitorOp('readonly', store => store.getAll());
  const group = $('visSavedVisitors'), selected = $('visGhost').value;
  const visitors = new Map();
  const options = [];
  for (const { key, name, packet } of records) {
    if (!(packet instanceof Uint8Array) || packet.length !== VIS.PACKET_SIZE) continue;
    const bytes = packet.subarray(0, VIS.GHOST_SIZE);
    if (!VIS.verifyGhost(bytes)) continue;
    const view = visView(bytes);
    const ghost = { name, bytes, playdate: packet, canEdit: true, romType: visView(packet).getUint16(VIS.GHOST_SIZE + 2, true) };
    const option = new Option(visGhostDisplayName(view) || name, key);
    option.dataset.stage = view.getUint16(0xfc, true);
    visitors.set(key, ghost);
    options.push(option);
  }
  VS.savedVisitors = visitors;
  group.replaceChildren(...options);
  group.hidden = !options.length;
  if (visitors.has(selected)) $('visGhost').value = selected;
  if (!VS.io && $('visGhost').value !== selected) visSelectVisitor();
  else visRender();
}

function savedVisitorStatus(message) {
  $('visSavedStatus').hidden = false;
  $('visSavedStatus').dataset.message = message;
  $('visSavedStatus').textContent = t(message);
}

$('btnVisSave').onclick = async () => {
  const packet = visitorPackage();
  if (!packet || VS.io) return;
  if (!VIS.verifyGhost(packet.subarray(0, VIS.GHOST_SIZE))) { savedVisitorStatus('visGhostFormat'); return; }
  const name = $('visVisitorName').textContent || VS.visitor.name;
  const key = 'saved:' + C.crc32(packet).toString(16);
  try {
    await savedVisitorOp('readwrite', store => store.put({ key, name, packet }));
    await refreshSavedVisitors();
    savedVisitorStatus('Visitor saved in this browser.');
  } catch (_) { savedVisitorStatus('Browser storage is unavailable. Export the visitor to keep a copy.'); }
};
$('btnVisForget').onclick = async () => {
  const key = $('visGhost').value;
  if (!VS.savedVisitors.has(key) || VS.io) return;
  try {
    await savedVisitorOp('readwrite', store => store.delete(key));
    await refreshSavedVisitors();
    savedVisitorStatus('Saved visitor removed.');
  } catch (_) { savedVisitorStatus('Browser storage is unavailable.'); }
};

function unlockVisitorChoice(edition) {
  const [id] = UNLOCK_VISITORS[edition];
  if (!myLabRom && VS.romVisitors.has('rom:' + id)) return 'rom:' + id;
  return [...VS.savedVisitors, ...VS.ghosts.entries()].find(([, ghost]) => {
    const view = visView(ghost.bytes);
    return view.getUint16(0xfc, true) === 3 && view.getUint16(0x0e, true) === id && view.getUint16(0x100, true) === VIS.ED[edition];
  })?.[0]?.toString();
}

function renderUnlockOptions(locked, uartBusy) {
  const target = $('visUnlockTarget').value;
  const info = UNLOCK_VISITORS[target];
  if (!info) return;
  const progress = unlockProgress.get(target)?.editions;
  const character = referenceCharacterName(info[1]);
  const portrait = $('visUnlockPortrait');
  const image = COLLECTION_REFERENCE.unlockPortraits[info[1]];
  if (portrait.getAttribute('src') !== image) {
    portrait.src = image;
    portrait.hidden = false;
  }
  $('visUnlockConditions').textContent = info[2] ?
    t('{character} · {young} cannot evolve into this character.', { character, young: referenceCharacterName(info[2]) }) : character;
  $('visUnlockTarget').disabled = locked;
  $('btnVisUnlockReset').hidden = !progress?.size;
  $('btnVisUnlockReset').disabled = locked;
  $('visUnlockStatus').textContent = t('{count}/2 required editions completed. Check the result on your device.', { count: Math.min(progress?.size || 0, 2) });
  for (const button of $('visUnlockEditions').children) {
    const edition = button.value;
    const visitor = unlockVisitorChoice(edition);
    button.hidden = edition === target;
    button.textContent = (progress?.has(edition) ? '✓ ' : '') + I18n.edition(edition);
    button.disabled = locked || uartBusy || !visitor || !navigator.serial;
    button.title = visitor ? '' : t('Load a {editionParadise} ROM or import the matching Kid visitor.');
  }
  $('visUnlockNeedsRom').hidden = Object.keys(UNLOCK_VISITORS).every(key => key === target || unlockVisitorChoice(key));
}

function startUnlockVisit(edition) {
  const visitor = unlockVisitorChoice(edition), target = $('visUnlockTarget').value;
  if (!visitor || target === edition || VS.io || VS.opening) return;
  $('visGhost').value = visitor;
  $('visEd').value = edition;
  updateEditionColor($('visEd'));
  visSelectVisitor();
  if (!VS.visitor) return;
  void visOpen('playdate', null, { preset: { target, edition } });
}
$('btnVisCapture').onclick = () => {
  if (!VS.bytes) return;
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  download(new Blob(VS.chunks, { type: 'application/octet-stream' }), 'playdate-incoming-' + date + '.bin');
};
function visKey() { return window.ParamixVisit.parseKey(FL.linkKey); }
const VIS_MODES = {
  playdate: ['visStat', 'visTitle'], lab: ['labStat', 'labSend'], food: ['foodStat', 'foodTitle'],
  gift: ['giftStat'], item: ['itemStat'],
};
function visStat(m, mode = 'playdate') { $(VIS_MODES[mode][0]).textContent = m; }
function visEdName() { return I18n.edition($('visEd').value); }
function adapterHint(element, tab) {
  element.hidden = !tab;
  element.replaceChildren();
  if (!tab) return;
  const link = document.createElement('a');
  link.href = '#' + tab.id;
  link.textContent = tab.textContent;
  link.onclick = event => {
    event.preventDefault();
    showDeviceTab(tab);
    tab.focus();
  };
  const [before, after] = t('The adapter is in use. Open {tab} to end the connection.').split('{tab}');
  element.append(before, link, after);
}
function visRender() {
  const locked = VS.opening || !!VS.io;
  const playdate = VS.mode === 'playdate', lab = VS.mode === 'lab', food = VS.mode === 'food';
  const uartBusy = dv.opening || dv.run || !!dv.io;
  const activeTab = deviceTabs.find(tab => tab.getAttribute('aria-selected') === 'true');
  const tabs = { playdate: 'deviceTabPlaydate', lab: 'deviceTabLab', food: 'deviceTabFood', ...GAME_TRANSFER_TABS };
  const activeMode = Object.keys(tabs).find(mode => tabs[mode] === activeTab.id);
  changePortButton.hidden = !selectedDevicePort;
  changePortButton.disabled = locked || uartBusy;
  const otherMode = VS.mode && VS.mode !== activeMode;
  const hint = $(GAME_TRANSFER_TABS[activeMode] ? activeMode + 'ConnectionHint' :
    activeMode === 'food' ? 'foodConnectionHint' : 'visConnectionHint'), uartHint = $('uartConnectionHint');
  const owner = VS.mode ? $(tabs[VS.mode]) : null;
  adapterHint(hint, uartBusy ? $('deviceTabUart') : otherMode ? owner : null);
  if (activeMode && !navigator.serial) {
    hint.hidden = false;
    hint.textContent = t('devNoSerial');
  }
  adapterHint(uartHint, VS.io && owner);
  $('btnConn').textContent = dv.d || dv.reconnecting ? t("Reconnect") : t('devConnect');
  $('btnConn').disabled = !navigator.serial || !hasFlashApp || dv.run || dv.opening || locked;
  $('btnVis').textContent = t(playdate ? 'visStop' : 'visStart');
  $('btnVis').disabled = !navigator.serial || uartBusy || VS.opening || (!!VS.io && !playdate) || (!VS.io && !!$('visGhost').value && !VS.visitor);
  const adult = VS.visitor && visView(VS.visitor.bytes).getUint16(0xfc, true) === 5;
  $('btnVisBreed').disabled = !navigator.serial || uartBusy || locked || !adult || $('visEd').value === 'my-lab';
  $('btnVisSave').hidden = !VS.visitor;
  $('btnVisSave').disabled = locked;
  $('btnVisForget').hidden = !VS.savedVisitors.has($('visGhost').value);
  $('btnVisForget').disabled = locked;
  renderUnlockOptions(locked, uartBusy);
  $('btnLabRelease').textContent = t(lab ? 'visStop' : 'labSend');
  $('btnLabRelease').disabled = !navigator.serial || uartBusy || VS.opening || (!!VS.io && !lab) ||
    (!lab && (!VS.visitor || visView(VS.visitor.bytes).getUint16(0xfc, true) !== 5));
  $('btnFoodSend').textContent = t(food ? 'visStop' : 'foodSend');
  $('btnFoodSend').disabled = !navigator.serial || uartBusy || VS.opening || (!!VS.io && !food) || !VS.food;
  renderGameTransfers(uartBusy, locked);
  $('btnFoodImport').disabled = $('foodMode').disabled = locked;
  for (const id of ['foodBody', 'foodEyes', 'foodColor']) $(id).disabled = locked || $(id).options.length < 2;
  $('visEd').disabled = lab || food || VS.opening || !!VS.playdateOptions?.breed || !!VS.playdateOptions?.preset;
  $('btnVisCapture').hidden = $('btnVisCapture').disabled = !VS.bytes;
  $('visGhost').disabled = locked;
  $('btnVisGhostImport').disabled = locked;
  const total = $('visGhost').options.length - 1;
  const adults = activeMode === 'lab' ? $('visGhost').querySelectorAll('option[data-stage="5"]').length : null;
  $('visitorCount').textContent = adults === null ? '(' + total + ')' :
    t(adults === 1 ? '({total} total · {count} adult)' : '({total} total · {count} adults)', { total, count: adults });
  $('visitorSourceName').textContent = myLabRom?.name || (state.ctx && state.name) || t('Open a {editionParadise} or {editionMyLab} ROM in Workspace.');
  $('visGhostImport').disabled = locked;
  $('visPlanetChoice').disabled = locked || $('visPlanetChoice').options.length < 2;
  for (const [key] of VIS.PLAYDATE_FIELDS) $(key + 'Input').disabled = locked;
  $('visColorChoice').disabled = locked || $('visColorChoice').options.length < 2;
  $('visEyesChoice').disabled = locked || $('visEyesChoice').options.length < 2;
  $('btnVisVisitorExport').disabled = !VS.visitor?.canEdit;
}
function editionOption(key) {
  const option = new Option(I18n.edition(key), key);
  option.dataset.edition = key;
  return option;
}
function refreshEditionOptions() {
  for (const id of ['visEd', 'visUnlockTarget', 'giftEdition', 'itemEdition']) {
    for (const option of $(id).options) option.textContent = I18n.edition(option.value);
  }
}

function updateEditionColor(select) {
  select.dataset.edition = select.value;
}
function visArm() {
  if (VS.v) VS.v.stop();
  const ed = visEdName();
  const io = VS.io;
  const options = VS.playdateOptions || {};
  const targetEdition = options.preset?.target || $('visEd').value;
  const ghost = options.preset ? VIS.prepareUnlockGhost(VS.visitor.bytes, options.preset.edition) : VS.visitor?.bytes;
  const playdateFields = options.preset && ghost ? VIS.playdateFields(null, ghost, VIS.ED[options.preset.edition]) :
    VS.visitor && VS.playdateFields;
  VS.v = window.ParamixVisit.createVisitor({
    edition: $('visEd').value, key: visKey(),
    ghost, playdateFields,
    breed: options.breed,
    send: (b) => io.write(b),
    log: (e, i) => {
      if (e === 'packet' && i.kind === 'data') visReceivePeer(i.playdate);
      else if (e === 'start') visStat(t('visRun'));
      else if (e === 'sent') visStat(t('visPlay'));
      else if (e === 'result' && i.breed && options.breed) visStat(t('Respond to the breeding prompt on your device.'));
      else if (e === 'done') {
        measure('transfer', options.preset ? 'playdate_unlock' : options.breed ? 'playdate_breed' : 'playdate', targetEdition);
        let message = t('visDone', { ed });
        if (options.breed) message = t(i.breedingOffered ? 'Breeding exchange complete. Check your device for the result.' : 'The device did not offer breeding for this Playdate.');
        if (options.preset) {
          const { target, edition } = options.preset;
          const peer = VS.peer && visView(VS.peer);
          if (peer?.getUint16(VIS.GHOST_SIZE + 2, true) === VIS.ED[target]) {
            const identity = peer.getUint32(VIS.GHOST_SIZE + 4, true) + ':' + peer.getUint32(VIS.GHOST_SIZE + 8, true);
            if (unlockProgress.get(target)?.identity !== identity) unlockProgress.set(target, { identity, editions: new Set() });
            unlockProgress.get(target).editions.add(edition);
          } else message = t('Playdate complete. Select your actual device edition to track progress.');
        }
        if (options.breed || options.preset) { void visClose().then(() => visStat(message)); return; }
        visStat(message);
        setTimeout(() => { if (VS.io === io && !VS.opening) { visArm(); visStat(message); } }, 500);
      } else if (e === 'error') {
        const message = i.text === 'key' ? t('visBadKey') : t('visErr', { e: t(i.text) });
        if (options.breed || options.preset) { void visClose().then(() => visStat(message)); return; }
        visStat(message);
        if (i.text !== 'key') setTimeout(() => { if (VS.io === io && !VS.opening) visArm(); }, 1000);
      }
    },
  });
  const menu = gameMenuPath(['playdate'], 'PLAYDATE', 'paradise neon');
  visStat(t('visWait', { ed, menu }));
}
async function visClose() {
  const io = VS.io, session = VS.v;
  $('itemProgress').hidden = true;
  VS.opening = true;
  VS.v = null;
  visRender();
  try { await session?.stop(); } catch (_) {}
  try { if (io) await io.close(); } catch (e) {}
  VS.io = null; VS.mode = null; VS.opening = false; VS.playdateOptions = null;
  visRefreshRomVisitors();
  visRender();
}

function startGameTransfer(io, mode, { targetEdition, catalogId, edited, ...transfer }) {
  const close = (message, uncertain = false) => {
    if (VS.io !== io || VS.opening) return;
    const checkDevice = uncertain && VS.v?.state.mayHaveReceived;
    visClose().then(() => visStat(checkDevice ? t('{message} Check the device before sending again.', { message }) : message, mode));
  };
  const makeSession = mode === 'gift' ? VIS.createGift : VIS.createLabItem;
  try {
    const session = VS.v = makeSession({
      ...transfer, key: visKey(), send: bytes => io.write(bytes),
      log(event, info) {
        if (event === 'start' && mode === 'gift') visStat(t("Gift exchange started. Follow the device prompts."), mode);
        if (event === 'progress' && mode === 'item' && VS.io === io && !VS.opening) {
          transferProgress('item', info.done, info.total, t("Lab Item transfer"));
          visStat(t("Sending Lab Item…"), mode);
        }
        if (event === 'sent') visStat(t("Gift acknowledged. Waiting for the device to finish the exchange…"), mode);
        if (event === 'error') close(info.text === 'key' ? t('visBadKey') : t(info.text), true);
        if (event === 'done' && VS.io === io && !VS.opening) {
          measure('transfer', mode === 'gift' ? 'gift' : edited ? 'edited_lab_item' : 'lab_item', targetEdition, catalogId);
          const returned = giftDisplayName(GIFT_BY_ID.get(info.result)?.row) || (info.result ? t('item #{id}', { id: info.result }) : '');
          close(mode === 'item' ? t('The device acknowledged all Lab Item data. Check the item on {editionParadise}.') :
            returned ? t('Gift sent. Received {item}.', { item: returned }) : t('Gift sent.'));
        }
      },
    });
    io.onData = bytes => session.feed(bytes);
    io.onClose = () => close(t('USB adapter disconnected.'), true);
    if (io.closed) { io.onClose(); return; }
    const path = mode === 'gift'
      ? gameMenuPath(['connection', 'gifts'], 'Connect → Gift', 'paradise neon')
      : gameMenuPath(['connection', 'download', 'download'], 'Connect → Download → Download', 'paradise neon');
    visStat(t(mode === 'gift' ? 'Waiting for {editionParadise}. Open {path} and press B.' : 'Waiting for {editionParadise}. Open {path}.', { path }), mode);
    void session.start();
  } catch (error) { close(em(error)); }
}

function getDevicePort() {
  return selectedDevicePort || navigator.serial.requestPort();
}

async function openDevicePort(port) {
  try {
    const io = await FL.serialOpen(port);
    selectedDevicePort = port;
    return io;
  } catch (error) {
    selectedDevicePort = null;
    throw error;
  }
}

async function changeTransferPort() {
  if (VS.io || VS.opening || dv.io || dv.run || dv.opening) return;
  VS.opening = true;
  visRender();
  try { selectedDevicePort = await navigator.serial.requestPort(); }
  catch (error) { if (error.name !== 'NotFoundError') toast(em(error), true); }
  finally { VS.opening = false; visRender(); }
}
changePortButton.onclick = changeTransferPort;
navigator.serial?.addEventListener?.('disconnect', event => {
  if (selectedDevicePort && (event.target === selectedDevicePort || event.port === selectedDevicePort)) {
    selectedDevicePort = null;
    visRender();
  }
});

async function visOpen(mode, transfer, playdateOptions = null) {
  if (VS.opening) return;
  if (VS.io) {
    if (VS.mode === mode) { await visClose(); visStat('', mode); }
    return;
  }
  if (!navigator.serial) { visStat(t('devNoSerial'), mode); return; }
  if (dv.opening || dv.run || dv.io) return;
  const ghost = VS.visitor?.bytes;
  if (playdateOptions?.breed && (!ghost || !VIS.verifyGhost(ghost))) return;
  visStat('', mode);
  VS.opening = true;
  visRender();
  try {
    VS.io = await openDevicePort(await getDevicePort());
    VS.mode = mode;
    VS.playdateOptions = playdateOptions;
  } catch (e) {
    if (e.name !== 'NotFoundError') visStat(transfer ? em(e) : t(mode === 'lab' ? 'labError' : 'visErr', { e: em(e) }), mode);
    return;
  } finally {
    VS.opening = false;
    visRender();
  }
  const io = VS.io;
  VS.chunks = [];
  VS.bytes = 0;
  if (transfer) {
    startGameTransfer(io, mode, transfer);
    return;
  }
  io.onClose = () => {
    if (VS.io === io && !VS.opening) visClose().then(() => visStat(t("USB adapter disconnected."), mode));
  };
  if (io.closed) { io.onClose(); return; }
  io.onData = (d) => {
    const remaining = VIS_CAPTURE_LIMIT - VS.bytes;
    if (remaining > 0 && d.length) {
      const chunk = d.slice(0, remaining);
      VS.chunks.push(chunk);
      VS.bytes += chunk.length;
      $('btnVisCapture').disabled = false;
    }
    if (VS.v) VS.v.feed(d);
  };
  visRender();
  if (mode === 'playdate') {
    VS.peer = null;
    $('visPeer').hidden = true;
    try { visArm(); }
    catch (error) { await visClose(); visStat(em(error)); }
    return;
  }
  if (mode === 'food') {
    try {
      VS.v = VIS.createSpecialFood({
        payload: VS.food, core: C, key: visKey(), send: bytes => io.write(bytes),
        log(event, info) {
          if (VS.io !== io) return;
          if (event === 'start') visStat(t('foodRun'), mode);
          if (event === 'sent') visStat(t('foodConfirm'), mode);
          if (event === 'done' || event === 'error') {
            if (event === 'done' && info.result === 1) measure('transfer', 'special_food');
            const message = event === 'error' ? t('visErr', { e: t(info.text) }) : t(info.result === 1 ? 'foodDone' : 'foodDeclined');
            visClose().then(() => visStat(message, mode));
          }
        },
      });
      visStat(t('foodReady'), mode);
    } catch (e) {
      await visClose();
      visStat(t('visErr', { e: em(e) }), mode);
    }
    return;
  }
  try {
    VS.v = VIS.createLabRelease({
      ghost, core: C, key: visKey(), send: bytes => io.write(bytes),
      log(event, info) {
        if (VS.io !== io) return;
        if (event === 'start') visStat(t('labRun'), 'lab');
        if (event === 'sent') visStat(t('labWait'), 'lab');
        if (event === 'done' || event === 'error') {
          if (event === 'done') measure('transfer', 'send_to_my_lab', 'my-lab');
          const message = event === 'done' ? t('labDone') : t('labError', { e: t(info.text) });
          visClose().then(() => visStat(message, 'lab'));
        }
      },
    });
    void VS.v.start();
  } catch (e) {
    await visClose();
    visStat(t('labError', { e: em(e) }), 'lab');
  }
}
$('btnVis').onclick = () => visOpen('playdate');
$('btnVisBreed').onclick = async () => {
  const visitor = VS.visitor;
  if (!visitor || !VIS.verifyGhost(visitor.bytes)) { visStat(t('Breeding needs a valid adult visitor.')); return; }
  const edition = $('visEd').value;
  const accepted = await deviceDialog(
    t('Breed with {character} from {edition}? If both sides accept on the device, your current generation can end.', {
      character: $('visVisitorName').textContent || visitor.name, edition: I18n.edition(edition),
    }), t('Breeding Playdate'), t('Start Breeding Playdate…'));
  if (accepted && VS.visitor === visitor && $('visEd').value === edition) void visOpen('playdate', null, { breed: true });
};
$('btnLabRelease').onclick = () => visOpen('lab');
$('btnFoodSend').onclick = () => visOpen('food');
const foodArchive = Uint8Array.from(atob('__FOOD_ARCHIVE__'), c => c.charCodeAt(0));
let foodBase = null, importedFood = null, editedFood = null;
const foodEyeChoices = new Map();

function populateFoodBodies() {
  const body = $('foodBody');
  body.replaceChildren();
  visAddChoice(body, '', t('Choose an adult Tama'));
  for (const [value, { visitor }] of VS.romVisitors) {
    if (visitor.character.stage === 5) visAddChoice(body, value, visitorDisplayName(visitor) + ' · ' + visHex(visitor.character.id));
  }
  $('foodNeedsRom').hidden = !!VS.romContext;
  selectFoodBody();
}
function selectFoodBody() {
  const entry = VS.romVisitors.get($('foodBody').value);
  foodBase = null;
  foodEyeChoices.clear();
  const eyes = $('foodEyes'), colors = $('foodColor');
  eyes.replaceChildren(); colors.replaceChildren();
  visAddChoice(eyes, '', t('Default eyes')); visAddChoice(colors, '', t('Default color'));
  try {
    if (entry) {
      foodBase = VIS.buildRomGhost(entry.visitor, C);
      const available = VIS.ghostAppearanceOptions(foodBase, C);
      for (const [key, { visitor }] of VS.romVisitors) {
        if (visitor === entry.visitor) continue;
        const donor = VIS.romEyes(visitor, available.eyes, C);
        if (donor) {
          foodEyeChoices.set(key, donor);
          visAddChoice(eyes, key, visitorDisplayName(visitor) + ' · ' + visHex(donor.id));
        }
      }
      if (available.tint && VS.romPalette) paletteNames().forEach((name, i) => visAddChoice(colors, String(i), name));
    }
    renderFoodCombination();
  } catch (error) { showFoodError(error); }
}
function showFoodError(error) {
  editedFood = null;
  $('foodPreview').hidden = true;
  $('foodEditorStatus').textContent = em(error);
  syncFoodMode();
}
function renderFoodCombination() {
  editedFood = null;
  $('foodPreview').hidden = true;
  $('foodEditorStatus').textContent = '';
  try {
    if (foodBase) {
      const color = $('foodColor').value;
      const bytes = VIS.editGhostAppearance(foodBase, {
        eyes:foodEyeChoices.get($('foodEyes').value), color:color === '' ? undefined : Number(color), palette:VS.romPalette
      });
      editedFood = VIS.buildSpecialFood(foodArchive, bytes, C);
      const poses = visCharacterPoses(bytes, visSpriteSheets(bytes), true);
      visPicture('foodPreview', poses[0][0] || poses[1][0]);
    }
  } catch (error) { showFoodError(error); return; }
  syncFoodMode();
}
function syncFoodMode() {
  const edit = $('foodMode').value === 'editor';
  $('foodEditor').hidden = !edit;
  $('foodFilePanel').hidden = edit;
  VS.food = edit ? editedFood : importedFood;
  visRender();
}
$('foodBody').onchange = selectFoodBody;
$('foodEyes').onchange = $('foodColor').onchange = renderFoodCombination;
$('foodMode').onchange = () => { visStat('', 'food'); syncFoodMode(); };
$('btnFoodImport').onclick = () => $('foodImport').click();
$('foodImport').onchange = async () => {
  const input = $('foodImport'), file = input.files[0];
  input.value = '';
  if (!file || VS.io || VS.opening) return;
  importedFood = null;
  VS.food = null;
  $('foodFile').textContent = t("No food file selected");
  visRender();
  try {
    if (file.size !== VIS.SPECIAL_FOOD_PAYLOAD) throw new Error();
    const bytes = new Uint8Array(await file.arrayBuffer());
    VIS.checkSpecialFood(bytes, C);
    importedFood = bytes;
    $('foodFile').textContent = file.name;
    visStat('', 'food');
  } catch (_) { visStat(t('foodFormat'), 'food'); }
  syncFoodMode();
};

const GIFT_EDITIONS = {
  land: ['base'], water: ['base'], sky: ['base'], jade: ['base', 'jade'],
  tropics: ['base', 'jade', 'wave3', 'tropics'], glacier: ['base', 'jade', 'wave3', 'glacier'], neon: ['base', 'neon'],
};

function setLabItemPrices(buyId, sellId, buy, sell) {
  $(buyId).value = buy;
  $(sellId).value = sell;
}

async function catalogResponse(file) {
  const response = await fetch(CATALOG_CONFIG.base + file);
  if (!response.ok) throw new Error('Catalog file unavailable (' + response.status + ').');
  return response;
}

function loadDeviceCatalog(kind) {
  const state = deviceCatalogs[kind];
  if (state.data || state.pending) return state.pending;
  const status = $(state.status), retry = $(state.retry);
  status.textContent = t("Loading catalog…");
  retry.hidden = true;
  if (kind === 'gift' && CATALOG_CONFIG.giftAtlas && !state.atlasPreloaded) {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = CATALOG_CONFIG.giftAtlas;
    document.head.append(preload);
    state.atlasPreloaded = true;
  }
  state.pending = Promise.resolve().then(async () => {
    const catalog = CATALOG_CONFIG[kind] || await (await catalogResponse(kind + '.json')).json();
    if (!Array.isArray(catalog?.items)) throw new Error('Invalid catalog.');
    state.data = catalog;
    if (catalog.atlas) document.documentElement.style.setProperty('--' + kind + '-atlas', 'url("' + catalog.atlas + '")');
    if (kind === 'gift') {
      for (const [tile, row] of catalog.items.entries()) GIFT_BY_ID.set(row[0], { row, tile });
      renderGiftChoices();
    } else renderLabItemCatalog();
    status.textContent = kind === 'lab' && !catalog.items.length ? t("Open an ARC2 file or folder to add Lab Items.") : '';
  }).catch(() => {
    state.data = null;
    status.textContent = t("Could not load the catalog.");
    retry.hidden = false;
  }).finally(() => {
    state.pending = null;
  });
  return state.pending;
}

function renderGiftIcon(icon, id) {
  const tile = GIFT_BY_ID.get(id)?.tile;
  if (!deviceCatalogs.gift.data?.atlas || tile === undefined) { icon.textContent = '◇'; return; }
  const image = document.createElement('span');
  image.className = 'gift-catalog-image';
  image.style.backgroundPosition = (-32 * (tile % 16)) + 'px ' + (-32 * Math.floor(tile / 16)) + 'px';
  icon.append(image);
}

function giftName(row, requested, fallback = true) {
  if (!row) return '';
  const [id, name, , , names, , variants] = row;
  const edition = $('giftEdition').value;
  const rom = state.ctx && !state.clean && romEditionKey(state.ctx.editionId) === edition && state.ctx.rom;
  const item = rom && romItemCatalog(rom).get(id);
  return (item && RL.text(rom, item.text, requested, { fallback: false })) ||
    RL.name(variants?.[edition]?.[0] || names, requested, { fallback }) || (fallback ? name : '');
}
function giftTaiwanName(row) {
  const source = giftName(row, 'zh-Hans', false);
  if (!source) return '';
  // Only use the curated catalog name when it describes the same source name.
  return RL.taiwanText(source === row[4]?.[7] && row[3] ? row[3] : source);
}
function giftDisplayName(row) {
  return (traditionalGameText() && giftTaiwanName(row)) || giftName(row, gameLocale());
}
function renderGiftDetails() {
  $('giftDetails').hidden = !giftChoice;
  $('giftSelection').textContent = giftChoice ? giftDisplayName(giftChoice) + ' · #' + giftChoice[0] : t("No gift selected");
  if (!giftChoice) return;
  const [id, , group] = giftChoice;
  const prices = giftChoice[6]?.[$('giftEdition').value]?.[1] || giftChoice[5];
  const editions = VIS_ED.filter(key => GIFT_EDITIONS[key]?.includes(group)).map(key => I18n.edition(key));
  const facts = $('giftFacts');
  facts.replaceChildren();
  const entries = [['Item ID', id + ' · ' + visHex(id)], ['Buy Price', prices[0] === 65535 ? t('Unavailable') : prices[0] + ' G'], ['Sell Price', prices[1] === 65535 ? t('Unavailable') : prices[1] + ' G'], ['Available For', editions.join(listSeparator())]];
  const code = COLLECTION_REFERENCE.shopCodes[id];
  const codeEditions = COLLECTION_REFERENCE.shopEditions?.[id];
  if (code && (!codeEditions || codeEditions.includes($('giftEdition').value))) entries.push(['Shop Code', code],
    ['How to Obtain', t('Enter the code under SHOP → SHOP CODE, then purchase the unlocked item.')]);
  fillReferenceFacts(facts, entries);
  $('giftNames').replaceChildren(...VIS_LANGUAGES.map(([code, label]) => {
    const group = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
    const traditional = code === 'zh-Hans' && traditionalGameText();
    term.textContent = traditional ? '繁體中文' : label;
    detail.textContent = (traditional ? giftTaiwanName(giftChoice) : giftName(giftChoice, code, false)) || '—';
    detail.lang = traditional ? 'zh-Hant' : code;
    group.append(term, detail);
    return group;
  }));
}

function renderGiftChoices() {
  const catalog = deviceCatalogs.gift.data;
  if (!catalog) return;
  const list = $('giftCatalog');
  const groups = GIFT_EDITIONS[$('giftEdition').value];
  const query = $('giftSearch').value.trim().toLowerCase();
  const available = catalog.items.filter(([, , group]) => groups?.includes(group));
  const rows = query ? available.filter(row => {
    const [id, name, , traditional, names, , variants] = row;
    return [String(id), '0x' + id.toString(16), giftDisplayName(row), name, traditional, ...(variants?.[$('giftEdition').value]?.[0] || names)]
      .some(value => value?.toLocaleLowerCase(locale()).includes(query));
  }) : available;
  if (!rows.includes(giftChoice)) giftChoice = null;
  renderGiftDetails();
  $('giftCount').textContent = query ? rows.length + ' / ' + available.length : available.length;
  list.replaceChildren(...rows.map(row => {
    const [id] = row;
    const card = itemPreviewCard(giftDisplayName(row), '#' + id, icon => {
      renderGiftIcon(icon, id);
    }, button => {
      giftChoice = row;
      selectTransferCard(list, button);
      renderGiftDetails();
      visRender();
    });
    card.firstElementChild.setAttribute('aria-pressed', String(row === giftChoice));
    return card;
  }));
  visRender();
}

function renderGameTransfers(uartBusy, locked) {
  for (const mode of ['gift', 'item']) {
    const active = VS.mode === mode;
    const button = $(mode === 'gift' ? 'btnGiftSend' : 'btnItemSend');
    button.textContent = active ? t("Cancel Transfer") : mode === 'gift' ? t("Send Gift") : t("Send Lab Item");
    const ready = mode === 'gift' ? !!giftChoice : itemTransfer.item && !itemTransfer.loading && itemPricesValid();
    button.disabled = !navigator.serial || uartBusy || VS.opening || (!active && (locked || !ready || !!dv.stash));
  }
  $('giftEdition').disabled = $('giftSearch').disabled = locked;
  $('giftCatalog').inert = $('itemCatalog').inert = locked;
  for (const id of ['itemEdition', 'btnItemImport', 'btnItemFolder', 'itemSearch', 'itemBuy', 'itemSell', 'itemNameFields', 'btnItemPreset', 'btnItemReset'])
    $(id).disabled = locked;
  for (const button of $('itemPreview').querySelectorAll('[data-lab-item-picture]')) button.disabled = locked;
  $('btnItemExport').disabled = !itemTransfer.item || itemTransfer.loading || !itemPricesValid();
}

function itemPricesValid() {
  if (itemTransfer.nameError) return false;
  return !itemTransfer.item?.editable || ['itemBuy', 'itemSell'].every(id => {
    const value = $(id).valueAsNumber;
    return Number.isInteger(value) && value >= 0 && value <= 65535;
  });
}

function labItemTransferBytes() {
  const item = itemTransfer.namedItem || itemTransfer.item;
  if (!item.editable) return item;
  const buy = $('itemBuy').valueAsNumber, sell = $('itemSell').valueAsNumber;
  return buy === item.buy && sell === item.sell ? item : LI.withPrices(item, buy, sell, C);
}

function selectTransferCard(list, button) {
  list.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  button?.setAttribute('aria-pressed', 'true');
}

function parseTransferItem(bytes, filename, source) {
  const item = LI.forTransfer(bytes, C);
  return item ? { ...item, filename, source } : null;
}

function renderLabItemCatalog() {
  const catalog = $('itemCatalog'), query = $('itemSearch').value.trim().toLowerCase();
  const items = [...(deviceCatalogs.lab.data?.items || []), ...itemTransfer.files];
  const visible = query ? items.filter(item => [itemDisplayName(item), item.filename, String(item.id), ...(item.names || [])]
    .some(value => value?.toLocaleLowerCase(locale()).includes(query))) : items;
  $('itemCount').textContent = query ? visible.length + ' / ' + items.length : items.length;
  catalog.replaceChildren(...visible.map(item => {
    const card = itemPreviewCard(itemDisplayName(item), '#' + item.id, icon => {
      if (item.bytes) labItemThumbnail(icon, item);
      else if (item.tile === null) icon.textContent = '◇';
      else {
        const { cell, columns } = deviceCatalogs.lab.data;
        const image = document.createElement('span');
        image.className = 'lab-catalog-image';
        image.style.width = image.style.height = cell + 'px';
        image.style.backgroundPosition = (-cell * (item.tile % columns)) + 'px ' + (-cell * Math.floor(item.tile / columns)) + 'px';
        icon.append(image);
      }
    }, button => {
      selectTransferCard(catalog, button);
      void loadTransferItem(item);
    });
    card.firstElementChild.setAttribute('aria-pressed', String(item === itemTransfer.selection));
    return card;
  }));
}

async function readCatalogLabItem(source) {
  let bytes;
  try {
    if (CATALOG_CONFIG.base) bytes = new Uint8Array(await (await catalogResponse(source.key + '.arc2')).arrayBuffer());
    else {
      const compressed = Uint8Array.from(atob(CATALOG_CONFIG.payloads[source.key]), character => character.charCodeAt(0));
      bytes = await inflateRaw(compressed);
    }
  } catch (_) {
    throw new Error('Could not load this Lab Item. Select its card to try again.');
  }
  const item = parseTransferItem(bytes, source.filename, 'catalog');
  if (!item || item.id !== source.id || item.checksum !== source.checksum || C.crc32(bytes) !== source.crc)
    throw new Error('The Lab Item file does not match the catalog.');
  return item;
}

function renderItemNameInputs(container, item) {
  container.replaceChildren(...VIS_LANGUAGES.map(([locale, label], i) => {
    const field = document.createElement('label'), input = document.createElement('input');
    field.className = 'session-field';
    field.textContent = label;
    input.lang = locale;
    input.value = item.names[i];
    field.append(input);
    return field;
  }));
}

$('itemNames').oninput = () => {
  const item = itemTransfer.item;
  if (!item) return;
  try {
    const names = Array.from($('itemNames').querySelectorAll('input'), input => input.value);
    itemTransfer.namedItem = LI.withNames(item, names, C);
    itemTransfer.nameError = '';
  } catch (error) {
    itemTransfer.nameError = em(error);
  }
  $('itemBuy').oninput();
};
function renderTransferItemName(item) {
  const labels = [itemDisplayName(item), '#' + item.id];
  if (item.source === 'import') labels.push(item.filename);
  $('itemSource').textContent = labels.filter(Boolean).join(' · ');
}
async function replaceTransferItemPicture(item, index, frame, image, file) {
  try {
    const replacement = await readLabItemPicture(file, image);
    if (itemTransfer.item !== item || VS.io || VS.opening) return;
    itemTransfer.item = LI.withPicture(item, index, frame, replacement, C);
    if (itemTransfer.item !== item) itemTransfer.editedSprites.add(index);
    renderLabItemPictures($('itemPreview'), itemTransfer.item, replaceTransferItemPicture, index, frame);
    $('itemNames').oninput();
  } catch (error) {
    if (itemTransfer.item === item) $('itemEditorStatus').textContent = em(error);
  }
}
async function loadTransferItem(source) {
  if (!source || VS.io || VS.opening) return;
  const request = ++itemTransfer.request;
  const filename = source.filename || source.name;
  itemTransfer.selection = source.bytes || source.key ? source : null;
  itemTransfer.item = null;
  itemTransfer.loading = true;
  $('itemEditor').hidden = true;
  $('itemEditorStatus').textContent = source.bytes ? '' : t("Reading ARC2…");
  $('itemProgress').hidden = true;
  visStat('', 'item');
  visRender();
  try {
    let item = source;
    if (source.key) item = await readCatalogLabItem(source);
    else if (!source.bytes) {
      if (source.size !== LI.SIZE) throw new Error('Choose a 16 KiB Lab Item ARC2 file.');
      item = parseTransferItem(new Uint8Array(await source.arrayBuffer()), filename, 'import');
    }
    if (request !== itemTransfer.request) return;
    if (!item) throw new Error('This file is not a supported Lab Item ARC2. Check its structure and checksum.');
    renderTransferItemName(item);
    renderLabItemPictures($('itemPreview'), item, replaceTransferItemPicture);
    $('itemPreview').hidden = false;
    $('itemPrices').hidden = !item.editable;
    setLabItemPrices('itemBuy', 'itemSell', item.buy, item.sell);
    $('itemEditorStatus').textContent = item.editable ? '' : t("This Lab Item can be sent with its original parameters.");
    itemTransfer.item = item;
    itemTransfer.originalItem = item;
    itemTransfer.editedSprites.clear();
    itemTransfer.namedItem = item;
    itemTransfer.nameError = '';
    renderItemNameInputs($('itemNames'), item);
    $('itemEditor').hidden = false;
  } catch (error) {
    if (request === itemTransfer.request) $('itemEditorStatus').textContent = em(error);
  } finally {
    if (request === itemTransfer.request) {
      itemTransfer.loading = false;
      visRender();
    }
  }
}

async function reviewGameTransfer(mode) {
  if (VS.io && VS.mode === mode) {
    const check = VS.v?.state.mayHaveReceived;
    await visClose();
    visStat(t(check ? 'Transfer cancelled. Check the device before sending again.' : 'Transfer cancelled.'), mode);
    return;
  }
  if (VS.io || VS.opening || dv.io || dv.opening || dv.run || dv.stash) return;
  const editionSelect = $(mode + 'Edition');
  const edition = editionSelect.selectedOptions[0]?.textContent;
  const targetEdition = editionSelect.value;
  let transfer, name, id, note;
  const facts = [['Target Edition', edition]];
  if (mode === 'gift') {
    if (!giftChoice) return;
    [id] = giftChoice;
    name = giftDisplayName(giftChoice);
    transfer = { id, targetEdition, catalogId: id };
    note = 'Paradise may ask you to give an item in return.';
  } else {
    if (!itemTransfer.item || !itemPricesValid()) return;
    const item = labItemTransferBytes(), original = itemTransfer.originalItem;
    transfer = {
      payload: item.bytes,
      targetEdition,
      catalogId: original.source === 'catalog' ? original.id : undefined,
      edited: item.bytes.some((byte, index) => byte !== original.bytes[index]),
    };
    id = item.id;
    name = itemDisplayName(item);
    const changedNames = VIS_LANGUAGES.filter((_, i) => item.names[i] !== original.names[i]);
    if (changedNames.length) facts.push(['Edited Names', changedNames.map(([, label]) => label).join(listSeparator())]);
    const changedSprites = itemTransfer.editedSprites.size;
    if (changedSprites) facts.push(['Edited Sprites', String(changedSprites)]);
    if (item.source === 'import') facts.push(['Source File', item.filename]);
    if (item.editable) {
      const price = (before, after) => before === after ? after + ' G' : before + ' G → ' + after + ' G';
      facts.push(['Buy Price', price(original.buy, item.buy)], ['Sell Price', price(original.sell, item.sell)]);
    }
    note = 'An existing Lab Item with the same ID may be replaced.';
  }
  const message = document.createElement('div');
  message.className = 'send-review';
  const header = document.createElement('div');
  header.className = 'send-review-heading';
  const icon = document.createElement('span');
  icon.className = 'lab-item-icon';
  if (mode === 'item') labItemThumbnail(icon, labItemTransferBytes());
  else renderGiftIcon(icon, id);
  icon.setAttribute('aria-hidden', 'true');
  const identity = document.createElement('div'), titleText = document.createElement('strong'), number = document.createElement('small');
  titleText.textContent = name;
  titleText.lang = locale();
  number.textContent = t('Item ID') + ' · #' + id;
  identity.append(titleText, number);
  header.append(icon, identity);
  const list = document.createElement('dl');
  list.className = 'write-facts';
  for (const [label, value] of facts) {
    const term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = t(label);
    detail.textContent = value;
    if (label === 'Target Edition') markEdition(detail, value, targetEdition);
    list.append(term, detail);
  }
  const hint = document.createElement('p');
  hint.className = 'send-review-note';
  hint.textContent = t(note);
  message.append(header, list, hint);
  const title = t(mode === 'gift' ? 'Send Gift' : 'Send Lab Item');
  if (await deviceDialog(message, t(mode === 'gift' ? 'Review Gift' : 'Review Lab Item'), title)) void visOpen(mode, transfer);
}

{
  const model = $('visEd');
  model.replaceChildren(...VIS_ED.map(editionOption));
  model.value = VIS_ED[0];
  updateEditionColor(model);
  model.onchange = () => {
    updateEditionColor(model);
    if (VS.mode === 'playdate' && (!VS.v || ['wait', 'done', 'error'].includes(VS.v.state.phase))) visArm();
  };

  const unlockTarget = $('visUnlockTarget');
  const unlockPortrait = $('visUnlockPortrait');
  unlockPortrait.onerror = () => { unlockPortrait.hidden = true; };
  unlockTarget.replaceChildren(...Object.keys(UNLOCK_VISITORS).map(editionOption));
  unlockTarget.onchange = () => { updateEditionColor(unlockTarget); visRender(); };
  updateEditionColor(unlockTarget);
  $('btnVisUnlockReset').onclick = () => { unlockProgress.delete(unlockTarget.value); visRender(); };
  for (const edition of Object.keys(UNLOCK_VISITORS)) {
    const button = document.createElement('button');
    button.className = 'btn small';
    button.type = 'button';
    button.value = edition;
    button.onclick = () => startUnlockVisit(edition);
    $('visUnlockEditions').append(button);
  }
  void refreshSavedVisitors().catch(() => {});

  const paradiseModels = VIS_ED.filter(edition => edition !== 'my-lab');
  const targets = [$('giftEdition'), $('itemEdition')];
  let savedEdition;
  try { savedEdition = localStorage.getItem('pmxLastParadiseEd'); } catch {}
  const initialEdition = paradiseModels.includes(savedEdition) ? savedEdition : paradiseModels[0];

  function applyTarget(edition) {
    for (const target of targets) {
      target.value = edition;
      updateEditionColor(target);
    }
  }
  for (const target of targets) {
    target.replaceChildren(...paradiseModels.map(editionOption));
    target.onchange = () => {
      applyTarget(target.value);
      try { localStorage.setItem('pmxLastParadiseEd', target.value); } catch {}
      renderGiftChoices();
    };
  }
  applyTarget(initialEdition);
}
$('giftSearch').oninput = renderGiftChoices;
$('itemSearch').oninput = renderLabItemCatalog;
$('giftCatalogRetry').onclick = () => loadDeviceCatalog('gift');
$('itemCatalogRetry').onclick = () => loadDeviceCatalog('lab');
$('btnGiftSend').onclick = () => reviewGameTransfer('gift');
$('btnItemSend').onclick = () => reviewGameTransfer('item');
$('btnItemImport').onclick = () => $('itemImport').click();
$('btnItemFolder').onclick = () => $('itemFolder').click();
$('itemImport').onchange = event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  selectTransferCard($('itemCatalog'));
  void loadTransferItem(file);
};
$('itemFolder').onchange = async event => {
  const request = ++itemTransfer.folderRequest;
  const files = Array.from(event.target.files).filter(file => file.size === LI.SIZE && /\.(arc2|bin)$/i.test(file.name));
  event.target.value = '';
  files.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const [, parsed] = await Promise.all([loadDeviceCatalog('lab'), Promise.allSettled(files.map(async file =>
    parseTransferItem(new Uint8Array(await file.arrayBuffer()), file.name, 'import')))]);
  if (request !== itemTransfer.folderRequest) return;
  const supported = parsed.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  const builtIn = deviceCatalogs.lab.data?.items || [];
  itemTransfer.files = [];
  for (const item of supported) {
    const crc = C.crc32(item.bytes);
    const known = builtIn.some(existing => existing.id === item.id && existing.checksum === item.checksum &&
      existing.crc === crc);
    const duplicate = itemTransfer.files.some(existing =>
      existing.id === item.id && existing.checksum === item.checksum &&
      existing.bytes.every((byte, index) => byte === item.bytes[index]));
    if (!known && !duplicate) itemTransfer.files.push(item);
  }
  renderLabItemCatalog();
  $('itemEditorStatus').textContent = !supported.length ? t("No supported Lab Items found in this folder.") :
    !itemTransfer.files.length ? t("These Lab Items are already in the catalog.") : '';
};
$('itemBuy').oninput = $('itemSell').oninput = () => {
  $('itemEditorStatus').textContent = itemTransfer.nameError || (itemPricesValid() ? '' : t("Enter whole prices from 0 to 65535."));
  visRender();
};
$('btnItemPreset').onclick = () => {
  setLabItemPrices('itemBuy', 'itemSell', 0, 9999);
  $('itemBuy').oninput();
};
$('btnItemReset').onclick = () => {
  const { buy, sell } = itemTransfer.item;
  setLabItemPrices('itemBuy', 'itemSell', buy, sell);
  $('itemBuy').oninput();
};
$('btnItemExport').onclick = () => {
  const item = labItemTransferBytes();
  download(item.bytes, item.filename.replace(/\.(arc2|bin)$/i, '') + '-copy.arc2');
};

const PL_HINT = true;
$('btnConn').onclick = async () => {
  if (VS.opening || VS.io || dv.opening || dv.run) return;
  dv.opening = true;
  devRender();
  let port;
  try { port = await getDevicePort(); } catch (e) { return; }
  finally { dv.opening = false; devRender(); }
  // A reconnect must not wait for a lock acknowledgement from the old transport.
  const previousIO = dv.io;
  dv.io = null; dv.d = null; dv.loaded = false;
  const controller = new AbortController(), { signal } = controller;
  dv.reconnecting = !!previousIO;
  dv.connecting = controller;
  await devTask(async () => {
    try {
      if (previousIO) await previousIO.close();
      signal.throwIfAborted();
      dv.io = await openDevicePort(port);
      signal.throwIfAborted();
      const { dev, loaded } = await FL.connect(dv.io, FL.embedded(), { signal }, devProg);
      signal.throwIfAborted();
      dev.confirmLowBattery = async mv => {
        if (dv.cancel || dv.d !== dev) return false;
        const accepted = await deviceDialog(
          t("Battery voltage is {v1} V. Losing power during a write can interrupt the update.", { v1: (mv / 1000).toFixed(2) }),
          t("Low Battery"), t("Write Anyway"), false, 'write');
        return accepted && !dv.cancel;
      };
      dv.d = dev; dv.loaded = loaded;
      devRender(t('devReady'));
      if (dev.info.edition === 0xFE) {
        $('rescueBox').hidden = true;
        $('rescueResume').hidden = true;
      } else await rescueCheck(signal);
      signal.throwIfAborted();
    } catch (e) {
      if (dv.io) await dv.io.close();
      dv.io = null; dv.d = null; dv.loaded = false;
      let pl = false; try { pl = PL_HINT && port.getInfo().usbVendorId === 0x067B; } catch (x) {}
      if (pl && e && (e.code === 'noData' || e.code === 'noAnswer')) e.message = flMsg(e) + '. ' + t('plHint'), e.code = null;
      throw e;
    } finally {
      dv.connecting = null;
      dv.reconnecting = false;
    }
  });
};
$('btnDump').onclick = () => devTask(async () => {
  const img = await dv.d.dump(devProg, () => dv.cancel);
  const name = romExportName(romEditionKey(dv.d.info.edition), []);
  download(img, name);
  await loadRom(new File([img], name), true);
  devRender(t('devDumped', { n: name }));
});
/*
 * test26 SAVE_CARRY: a TamaEmu or T18Emu that gets another place (main program <-> menu, or another place in the menu)
 * takes the device's save along when writing with "Keep saves". The device's layout is the loaded ROM's (checked by
 * the programs' settings sectors); only the sectors of its flash that differ on the device are read. The save then goes
 * into the new ROM like an imported one. Returns { changed, carried: Set of offsets in the loaded ROM } or null when
 * the user stops (the device could not be checked and a save might be lost).
 */
const SAVE_CARRY = true;
async function saveCarry(d, c1) {
  const r0 = state.ctx.rom, fe = F.embedded(), out = { changed: false, carried: new Set() };
  const progs = [];
  if (emuInstalled() && /tama|t18/.test(F.emuType(r0))) progs.push(0xA0000);
  for (const x of romExtras(r0)) if (E.extraKind(x) === 'tama' || E.extraKind(x) === 't18') progs.push(x.off);
  if (!progs.length) return out;
  // the same place: same program and the same layout there (firmware place, save place, block map); flags may change
  const nr = c1.rom, sameAt = (off) => { const m = rd32(r0, off + 0x140), to = m === 0x38584D50 ? 0x140 + 400 : 0x1DC; if (rd32(nr, off + 0x140) !== m) return false; for (let i = 0x148; i < to; i++) if (nr[off + i] !== r0[off + i]) return false; return true; };
  const moved = progs.filter((o) => !sameAt(o));
  if (!moved.length) return out;
  let ok = true;
  for (const o of [0xA0000].concat(romExtras(r0).map((x) => x.off))) { try { if (await d.crc(o, 0x1000) !== FL.crc32(r0, o, 0x1000)) ok = false; } catch (e) { ok = false; } }
  if (!ok) return await deviceDialog(t('carryUnknown')) ? out : null;
  const base = new Uint8Array(r0);
  const pull = async (a, b) => { for (const s of await d.changed(r0, null, () => dv.cancel, a & ~0xFFFF, (b + 0xFFFF) & ~0xFFFF)) { base.set(await d.read(s, 0x1000), s); out.changed = true; } };
  for (const o of moved) {
    const m = rd32(r0, o + 0x140);
    if (m === 0x43584D50) {   // TamaEmu: its firmware with the pet's own writes, spare pages, from the device
      const cfg = o === 0xA0000 ? romEmuCfg(r0) : SV.emuCfg(r0.subarray(o, o + 0x1000)); if (!cfg) continue;
      const end = cfg.spareEnd || cfg.guestOff + cfg.guestSize; await pull(cfg.guestOff, end);
      const g = await SV.emuGuestAsync((a, n) => base.subarray(a, a + n), cfg), me = { kind: 'tama', guest: g, dev: cfg.dev };
      // 1.7.6 DLC_KEEP: download items the Studio put into the stores go into the device's firmware (before they were lost)
      const withItems = (gs, key) => { if (!DLC_KEEP || !gs || gs.length !== g.length) return g; const m = new Uint8Array(g); for (const [a, z] of E.dlcAreas(cfg.dev)) m.set(gs.subarray(a, z), a); if (stampFor(key) >= 0) E.saveFlag(m, cfg.dev, stampFor(key)); return m; };
      if (state.emu && state.emu.guest && sameFw({ kind: 'tama', guest: state.emu.guest, dev: state.emu.dev }, me)) { const gm = withItems(state.emu.guest, 'main'), pk = E.packMain(gm, cfg.dev, null, !!state.emuPack); state.emu = Object.assign({}, state.emu, { guest: gm, size: pk.blob.length, big: pk.big }); out.carried.add(o); }
      else if (o === 0xA0000 && state.clean) { const x = (state.extras || []).find((y) => y.fromParaMain && y.kind === 'tama'); if (x) { x.guest = g; x.carry = true; state.extrasDirty = true; out.carried.add(o); } }   // CLEAN_ROM: the main program went to the menu
      else { const x = (state.extras || []).find((y) => E.extraKind(y) === 'tama' && sameFw(y, me)); if (x) { x.guest = withItems(x.guest, state.extras.indexOf(x)); x.carry = true; state.extrasDirty = true; out.carried.add(o); } }
    } else if (m === 0x38584D50) {   // T18Emu: its firmware with its save
      const tc = E.t18Cfg(r0, o); if (!tc) continue;
      for (const b of tc.map.concat(tc.spare)) if (b !== 0xFFFF && b < 0x100) await pull(b << 16, (b + 1) << 16);
      await pull(tc.saveOff, tc.saveOff + 0x24000);
      const fw = E.t18FromRom(base, o); if (!fw) continue;
      const me = { kind: 't18', fw };
      if (state.emu && state.emu.t18) { state.emu = Object.assign({}, state.emu, { rom: fw }); out.carried.add(o); }
      else if (o === 0xA0000 && state.clean) { const x = (state.extras || []).find((y) => y.fromParaMain && y.kind === 't18'); if (x) { x.fw = fw; delete x.keepOff; x.saveImp = true; state.extrasDirty = true; out.carried.add(o); } }
      else { const x = (state.extras || []).find((y) => E.extraKind(y) === 't18'); if (x) { x.fw = fw; delete x.keepOff; x.saveImp = true; state.extrasDirty = true; out.carried.add(o); } }
      void me;
    }
  }
  if (out.carried.size < moved.length && !await deviceDialog(t('carryMiss'))) return null;
  return out;
}
$('reviewDevice').onclick = () => {
  showDestination('device');
  showDeviceTab($('deviceTabUart'));
  if (!selectDevicePanel(uartToolTabs, $('romTransferTitle'))) return;
  $('writeSource').scrollIntoView({ block: 'center' });
  (dv.d ? $('writeReview') : $('btnConn')).focus({ preventScroll: true });
};
$('devOnly').onchange = () => {
  deviceOnlyChanged = $('devOnly').checked;
  renderWriteReview(deviceWritePlan());
};
$('devKeep').onchange = () => {
  deviceKeepSaves = $('devKeep').checked;
  renderWriteReview(deviceWritePlan());
};
$('btnWrite').onclick = async () => {
  const plan = deviceWritePlan();
  const { device, labImage, keep, onlyChanged } = plan;
  if (!device || dv.run || device.info.readOnly || !plan.canWrite) return;
  if (plan.raw) {
    const screenFit = myLabRom?.screenFit;
    const keepMyLabSaves = (plan.myLab || plan.portUpdate) && keep;
    let image;
    try {
      image = await busy(t("Preparing Write Review"), () =>
        labImage ? myLabOutputImage(labImage, keepMyLabSaves) : plan.source.rom);
    } catch (error) {
      toast(em(error), true);
      return;
    }
    const samePlan = () => dv.d === device && (myLabRom || state.ctx) === plan.source &&
      myLabRom?.screenFit === screenFit &&
      (myLabRom?.portDraft?.flashImage || myLabFlashImage()) === labImage;
    if (!samePlan()) return;
    if (!await confirmDeviceWrite(plan, image) ||
        (!keepMyLabSaves && !await deviceDialog(t(plan.myLab || plan.portUpdate ? 'devMyLabReplace' : 'devSureFull')))) return;
    if (!samePlan()) return;
    await devWriteTask(async () => {
      const confirmParadiseBackupReplacement = () => confirmFlashOperation(t('myLabPortReplacePairingHelp'),
        t('myLabPortReplacePairingTitle'), t('myLabPortReplacePairingWrite'));
      const result = await device.write(image, { onlyChanged, keepMyLabSaves, confirmParadiseBackupReplacement }, devProg, () => dv.cancel);
      if (result.cancelled) { devRender(t('devCancelled')); return; }
      const kept = result.kept ? t('devKept', { k: result.kept }) : '';
      dv.restartNeeded = result.written > 0;
      if (result.written) measure('operation', 'write_rom', romEditionKey(device.info.edition));
      devRender(result.written ? t('devDone', { w: result.written, k: kept }) : t('devSame'));
    });
    return;
  }
  try { await device.resetTask(async () => {
  let c = await busy(t("Preparing Write Review"), composeRom); if (!c) return;
  if (dv.d !== device || state.ctx !== plan.source || !await packOk(c.rom)) return;
  if (!await confirmDeviceWrite(plan, c.rom) || (!keep && !await deviceDialog(t('devSureFull')))) return;
  // CLEAN_ROM: a device with the Paradise becomes one without: its game and save go (a backup first)
  const cleanNew = CLEAN_ROM && F.isClean(c.rom);
  if (cleanNew && dv.d) { let dc = false; try { const h = await dv.d.read(0, 0x1000); dc = String.fromCharCode(...h.subarray(0, 8)) === 'SONIXDEV' && (h[8] & 1) === 0; /* our table: not encrypted */ } catch (e) { dc = false; } if (!dc && !await deviceDialog(t('cleanSure'))) return; }
  // test26: a TamaEmu or T18Emu that moves takes the device's save along
  let carried = new Set();
  if (keep && SAVE_CARRY && dv.d) {
    let cr = null; try { cr = await busy(t("Checking Device Saves"), () => saveCarry(dv.d, c)); } catch (e) { cr = await deviceDialog(t('carryUnknown')) ? { changed: false, carried: new Set() } : null; }
    if (!cr) return;
    carried = cr.carried;
    if (cr.changed && cr.carried.size) { c = await busy(t("Building Write Image"), composeRom); if (!c) return; }
  }
  // an emulator save on the device that the new ROM cannot keep: say so before (1.5.1)
  let emuSame = false, emuSess = false;
  if (keep && !cleanNew) {
    const EMU = { 0x43584D50: 'TamaEmu', 0x37584D50: 'T7Emu', 0x38584D50: 'T18Emu', 0x31584D50: 'V1Emu' };
    let dm = 0;
    try { const p = await dv.d.read(0xA0000, 0x1000); dm = (p[0x140] | p[0x141] << 8 | p[0x142] << 16 | p[0x143] << 24) >>> 0; } catch (e) { dm = 0; }
    const im = (c.rom[0xA0140] | c.rom[0xA0141] << 8 | c.rom[0xA0142] << 16 | c.rom[0xA0143] << 24) >>> 0;
    // 1.6.8: the same firmware chosen again (same layout and data as on the device) keeps the save
    if (EMU[dm] && dm === im && state.emu) { try { emuSame = await emuSameDev(dv.d, c.rom, dm); } catch (e) { emuSame = false; } }
    // 1.7.6 DLC_KEEP: download items for the main TamaEmu that need a new block change its layout. The pet's save then
    // went with it (User: P's, "the clothes I had disappear every time"). Now the guest flash is read from the device,
    // the Studio's item stores go into it, and the run state stays.
    if (DLC_KEEP && EMU[dm] && dm === im && dm === 0x43584D50 && state.emu && !emuSame && carried.has(0xA0000)) {
      // the guest came along with saveCarry (and the Studio's items): only the run state is left to keep
      try { const dcfg = SV.emuCfg(await dv.d.read(0xA0000, 0x1000)), icfg = SV.emuCfg(c.rom.subarray(0xA0000, 0xA1000)); if (dcfg && icfg && dcfg.dev === icfg.dev && dcfg.saveOff === icfg.saveOff) { emuSess = true; emuSame = true; } } catch (e) { emuSess = false; }
    } else if (DLC_KEEP && EMU[dm] && dm === im && dm === 0x43584D50 && state.emu && state.emu.kept && !emuSame) {
      try {
        const dcfg = SV.emuCfg(await dv.d.read(0xA0000, 0x1000)), icfg = SV.emuCfg(c.rom.subarray(0xA0000, 0xA1000));
        if (dcfg && icfg && dcfg.dev === state.emu.dev && icfg.dev === dcfg.dev && dcfg.saveOff === icfg.saveOff) {
          const gd = await busy(t("Reading Device Save"), () => SV.emuGuestAsync((a, n) => dv.d.read(a, n), dcfg));
          const gs = state.emu.guest, same = (a, z) => { for (let i = a; i < z; i++) if (gd[i] !== gs[i]) return false; return true; };
          if (same(0, 0x10000)) {   // the same firmware (its code at the reset vector)
            const g = new Uint8Array(gd);
            for (const [a, z] of E.dlcAreas(state.emu.dev)) g.set(gs.subarray(a, Math.min(z, gs.length)), a);
            if (stampFor('main') >= 0) E.saveFlag(g, state.emu.dev, stampFor('main'));
            const pk = E.packMain(g, state.emu.dev, null, !!state.emuPack);
            state.emu = { guest: g, dev: state.emu.dev, size: pk.blob.length, big: pk.big, kept: true };
            c = await busy(t("Building Write Image"), composeRom); if (!c) return;
            emuSess = true; emuSame = true;
          }
        }
      } catch (e) { emuSess = false; }
    }
    // 1.6.8: a T7Emu or V1Emu that goes from the main program to the menu takes its save along (keepPlan): no question
    let moved = false;
    if (EMU[dm] && dm !== im && (dm === 0x37584D50 || dm === 0x31584D50)) {
      try {
        const p = await dv.d.read(0xA0000, 0x1000), u = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
        const ro = u(p, 0x148), rl = u(p, 0x14C), dc = await dv.d.crc(ro, rl);
        const fe0 = F.embedded();
        if (fe0) for (const x of E.appsRead(c.rom, F.feldApps(c.rom, fe0.stub).apps)) { const cx = E.extraCfg(c.rom, x.off); if (cx && cx.romLen === rl && FL.crc32(c.rom, cx.romOff, cx.romLen) === dc) moved = true; }
      } catch (e) { moved = false; }
    }
    if (carried.has(0xA0000)) moved = true;   // test26: its save goes along
    if (EMU[dm] && !moved && (dm !== im || (state.emu && !emuSame))) {
      const n = EMU[im] ? (dm === im ? t('devEmuNew', { o: EMU[im] }) : EMU[im]) : t('devEmuNone');
      if (!await deviceDialog(t('devEmuLost', { o: EMU[dm], n }))) return;
    }
  }
  // test4: items or Tamapoints of T18Emu: its save on the device is replaced by the one in the ROM, "keep saves" or not
  if (keep && (state.t18Dirty || (state.extras || []).some((x) => x.kind === 't18' && x.items)) && !await deviceDialog(t('t18KeepAsk'))) return;
  if (dv.d !== device || state.ctx !== plan.source) return;
  await devWriteTask(async () => {
    const fe = F.embedded();
    const plan = keep ? FL.keepPlan(F, E, fe && { stub: fe.stub }, { emuChanged: !!state.emu && !emuSame && !emuSess, emuSess, carried: DLC_KEEP ? carried : null, after: state.stampSet ? stampSess : null, t7Save: !!state.t7save, t7SaveX: state.t7saveX ? state.t7saveX.i : -1, t18Imp: !!(state.extras || []).some((x) => x.saveImp), mine: studioSecs(state.ctx.rom, c.rom), fresh: c.fresh || [] }) : null;
    let img = c.rom;
    if (!cleanNew && F.emuType(img) === 't7') { const ck = await dv.d.clockRead(); if (ck && (ck.ctrl & 0x80)) img = E.t7Wall(img, ck.counter, new Date()); }
    if (!cleanNew && F.emuType(img) === 't18') { const ck = await dv.d.clockRead(); if (ck && (ck.ctrl & 0x80)) img = E.t18Wall(img, ck.counter, new Date()); }   // T18Emu: local time for the first start   // T7Emu: local time for the first time setting
    let r;
    try { r = await device.write(img, { onlyChanged, keep: plan, rescueApp: FL.embedded(), t18Bases: t18Bases(img, fe), onImage: (x) => stashPut(x) }, devProg, () => dv.cancel); }
    catch (e) { if (e && e.code === 'noRescueRoom') await deviceDialog(t('fl_noRescueRoom'), t("Write Stopped"), t("Close"), true); else if (e && e.code === 'cancelledWrite') await rescueCheck(); throw e; }
    await stashDel();
    dv.restartNeeded = r.written > 0;
    if (r.written) measure('operation', 'write_rom', romEditionKey(device.info.edition));
    let m = r.written ? t('devDone', { w: r.written, k: r.kept ? t('devKept', { k: r.kept }) : '' }) : t('devSame');
    if (r.rescue) m += '\n' + t('resOn');
    if (r.notes.length) m += '\n' + r.notes.map(flMsg).join('\n');
    devRender(m);
  });
  }); } catch (e) { devRender(t('devErr', { e: flMsg(e) })); }
};
/* 1.7.6 PS_DL2: after the plan (the device's run states are in the image): every P's TamaEmu whose guest save got a
 * stamp card change in the Studio takes the same byte into the save copy of its run state. */
async function stampSess(img) {
  const progs = [0xA0000];
  try { const fe = FL.embedded(); if (fe) for (const a of E.appsRead(img, F.feldApps(img, fe.stub).apps)) progs.push(a.off); } catch (e) { /* no menu */ }
  const want = new Set(Object.values(state.stampSet || {}));
  for (const o of progs) {
    try {
      const cfg = SV.emuCfg(img.subarray(o, o + 0x1000)), Fg = cfg && E.SAVE_FLAG[cfg.dev]; if (!Fg) continue;
      const g = await SV.emuGuestAsync((a, n) => img.subarray(a, a + n), cfg), v = E.saveFlagGet(g, cfg.dev);
      if (v >= 0 && want.has(v)) E.psSessStamp(img, cfg.saveOff, g.subarray(Fg.at[0], Fg.at[0] + Fg.len), v, cfg.dev);
    } catch (e) { /* only this program */ }
  }
}
/* test15: the T18Emu settings blocks in an image (main program and start device), for moving its block at 0xFF0000 */
function t18Bases(img, fe) {
  const out = [];
  if (rd32(img, 0xA0140) === 0x38584D50) out.push(0xA0000);
  try { if (fe) for (const a of E.appsRead(img, F.feldApps(img, fe.stub).apps)) if (rd32(img, a.off + 0x140) === 0x38584D50) out.push(a.off); } catch (e) {}
  return out;
}
/* test15: the image being written, kept in the browser until the write is done (a cut write goes on from there) */
const STASH_DB = 'pmxStash';
function stashDb() { return new Promise((ok, no) => { try { const q = indexedDB.open(STASH_DB, 1); q.onupgradeneeded = () => q.result.createObjectStore('img'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); } catch (e) { no(e); } }); }
async function stashOp(mode, fn) { try { const db = await stashDb(); return await new Promise((ok, no) => { const tx = db.transaction('img', mode), st = tx.objectStore('img'), q = fn(st); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); }); } catch (e) { return null; } }
const stashPut = (img) => stashOp('readwrite', (st) => st.put({ img, time: Date.now() }, 'last'));
const stashGet = () => stashOp('readonly', (st) => st.get('last'));
const stashDel = () => stashOp('readwrite', (st) => st.delete('last'));
/* test15: after connecting: a device without its table is in the rescue start (a write was cut off) */
async function rescueCheck(signal) {
  let h; try { h = await dv.d.read(0, 16); } catch (e) { return; }
  dv.rescue = String.fromCharCode(...h.subarray(0, 8)) !== 'SONIXDEV';
  const st = await stashGet();
  signal?.throwIfAborted();
  dv.stash = st && st.img && st.img.length === 0x1000000 ? st.img : null;
  $('rescueResume').hidden = !dv.stash;
  // a write that did not finish (cut before the device's table went off): the device starts, but go on anyway
  const k = dv.rescue ? (dv.stash ? 'resModeGo' : 'resModeRom') : dv.stash ? 'resHalf' : '';
  if (k) { devRender(t(k)); await deviceDialog(t(k), t("Device Recovery"), t("Close"), true); }
}
$('btnResume').onclick = () => devWriteTask(async () => {
  if (!dv.stash || !await confirmFlashOperation(t("Continue writing the saved recovery image to this device?"), t("Resume Device Write"), t("Resume Write"))) return;
  const r = await dv.d.write(dv.stash, { onlyChanged: true, keep: null, rescueApp: FL.embedded() }, devProg, () => dv.cancel);
  await stashDel(); dv.rescue = false; dv.stash = null; $('rescueResume').hidden = true;
  dv.restartNeeded = true;
  devRender(t('resResumed', { w: r.written }));
});

/* 1.6.13 test13: test of the rescue start on the device (only with #rettung in the address, see flash.js) */
$('rescueBox').hidden = !/rettung|rescue/.test(location.hash);
const RES_KEY = 'pmxRescueHdr';
$('btnRescueTest').onclick = async () => { if (!await confirmFlashOperation(t('resSure'))) return; devWriteTask(async () => {
  const hdr = await dv.d.rescueTest(FL.embedded(), devProg, () => dv.cancel);
  try { localStorage.setItem(RES_KEY, Array.from(hdr, (b) => b.toString(16).padStart(2, '0')).join('')); } catch (e) {}
  download(hdr, 'paradise-kopf-' + new Date().toISOString().slice(0, 10) + '.bin');
  devRender(t('resCleared'));
}); };
$('btnRescueBack').onclick = () => devWriteTask(async () => {
  let h = null; try { h = localStorage.getItem(RES_KEY); } catch (e) {}
  if (!h || h.length !== 0x2000) { devRender(t('resNoHdr')); return; }
  const hdr = new Uint8Array(0x1000); for (let i = 0; i < 0x1000; i++) hdr[i] = parseInt(h.substr(2 * i, 2), 16);
  if (!await confirmFlashOperation(t("Restore the saved boot header to this device?"), t("Restore Boot Header"), t("Restore Header"))) return;
  await dv.d.rescueRestore(hdr, devProg, () => dv.cancel);
  devRender(t('resBackDone'));
});

// ------------------------------------------------------------- save games
const SV = window.ParamixSaves;
const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()); };
const edSlug = (id) => (FL.EDITIONS[id] || 'paradise').toLowerCase().replace(/[ /]/g, '-');
function saveMsg(x) { return t('fl_' + x.code, x.p); }
function mainName(r) {
  const ty = F.emuType(r);
  if (ty === 't7') return E.t7XName(E.t7FromRom(r).rom);
  if (ty === 't18') return E.extraName({ kind: 't18' });
  if (ty === 'v1') { const v = E.v1FromRom(r); return v ? E.v1Name(v) : 'V1'; }
  const c = romEmuCfg(r); if (c) return E.extraName({ kind: 'tama', dev: c.dev });
  return '';
}
/* 1.6.8: an extra that is the same firmware as the main emulator only once */
function sameFw(a, b) {
  // 1.6.8: colour Tamas by their code blocks (the rest of the flash holds the pet's own writes)
  if (E.extraKind(a) === 'tama' && E.extraKind(b) === 'tama') {
    if (a.dev !== b.dev) return false;
    for (const k of [0, 1, 0x40, 0x41]) { const o = k << 16; if (o + 0x10000 > a.guest.length || o + 0x10000 > b.guest.length) continue; for (let i = o; i < o + 0x10000; i++) if (a.guest[i] !== b.guest[i]) return false; }
    return true;
  }
const ka = E.extraKind(a), kb = E.extraKind(b); if (ka !== kb) return false; const x = ka === 'tama' ? [a.guest, b.guest] : ka === 't18' ? [a.fw, b.fw] : [a.rom, b.rom]; if (!x[0] || !x[1]) return false; const [p0, p1] = x[0].length <= x[1].length ? x : [x[1], x[0]]; for (let i = 0; i < p0.length; i += 4093) if (p0[i] !== p1[i]) return false; for (let i = 0; i < p0.length; i++) if (p0[i] !== p1[i]) return false; for (let i = p0.length; i < p1.length; i++) if (p1[i] !== 0xFF) return false; return true;
}
function extrasDedupe(mainX) {
  const mainE = mainX || emuX(state.emu);
  if (mainE && state.extras && state.extras.some((x) => sameFw(x, mainE))) { state.extras = state.extras.filter((x) => !sameFw(x, mainE)); state.extrasDirty = true; }
  // the same firmware twice in the menu: once is enough (it would share nothing, only take room)
  const xs = state.extras || [], keep = xs.filter((x, i) => !xs.slice(0, i).some((y) => sameFw(x, y)));
  if (keep.length !== xs.length) { state.extras = keep; state.extrasDirty = true; }
}
/* 1.6.8: does the device hold the same emulator firmware (layout and data) as the image? */
/* 1.6.8: the sectors the Studio changed against the loaded ROM (download items in an emulator's firmware) */
const rd32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
function studioSecs(a, b) {
  const out = new Set(), n = Math.max(a.length, b.length);
  for (let s = 0; s < n; s += 0x1000) {
    if (s + 0x1000 > a.length || s + 0x1000 > b.length) { out.add(s); continue; }
    for (let i = s; i < s + 0x1000; i++) if (a[i] !== b[i]) { out.add(s); break; }
  }
  return out;
}
async function emuSameDev(d, img, m) {
  const p = await d.read(0xA0000, 0x1000), u = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  const eq = (a, z) => { for (let i = a; i < z; i++) if (p[i] !== img[0xA0000 + i]) return false; return true; };
  const crcEq = async (a, n) => n > 0 && a + n <= img.length && (await d.crc(a, n)) === FL.crc32(img, a, n);
  // TamaEmu: layout and block map, and the code blocks at the reset vector (the guest writes into other blocks
  // of its flash, those are kept from the device anyway)
  if (m === 0x43584D50) {
    if (!eq(0x148, 0x140 + 156)) return false;
    const rv = u(img, 0xA0140 + 20) === 0 ? 0 : 0x40, g = u(img, 0xA0148);
    for (const b of [rv, rv + 1]) { const k = img[0xA0140 + 24 + b]; if (k !== 0xFF && !(await crcEq(g + k * 0x10000, 0x10000))) return false; }
    return true;
  }
  if (m === 0x37584D50) return eq(0x148, 0x140 + 24 + 16 * 24) && crcEq(u(img, 0xA0148), u(img, 0xA014C));
  if (m === 0x31584D50) return eq(0x148, 0x154) && crcEq(u(img, 0xA0148), u(img, 0xA014C));   // V1Emu: ROM and its place  // T7Emu: ROM, figures
  if (m === 0x38584D50) {                                                                                   // T18Emu: block map and blocks
    if (!eq(0x14C, 0x140 + 400)) return false;
    const b0 = img[0xA0150] | img[0xA0151] << 8;   // the firmware's first block (code; it writes its save elsewhere)
    return b0 === 0xFFFF || crcEq(b0 << 16, 0x10000);
  }
  return false;
}
function romEmuCfg(rom) { return F.appKind(rom) === 2 && F.emuType(rom) === 'tama' ? SV.emuCfg(rom.subarray(0xA0000, 0xA1000)) : null; }
/* 1.7.5 PACK_WARN: a packed colour Tama runs slower, so saving or writing a ROM with one asks first (User: "slow") */
const PACK_WARN = true;
function packedTamas(rom) {
  if (!PACK_WARN) return [];
  const l = [], mc = romEmuCfg(rom);
  if (mc && E.lzCount(rom, mc.lzOff) > E.PACK_FEW) l.push(E.tamaName(state.emu && state.emu.guest ? state.emu.guest : null, mc.dev));
  const fe = F.embedded(), f = fe && F.feldFind(rom, fe.stub);
  if (f) l.push(...E.appsPacked(rom, F.feldApps(rom, fe.stub).apps));
  return l;
}
/* PACK_WARN: the main TamaEmu packs 2 or 3 rarely read blocks (room for its own writes): say so in the Emulator tab */
const fewMemo = new WeakMap();
function mainFew() {
  if (state.emuPack) return false;   // packed by choice: the checkbox says it
  if (state.emu) { if (!state.emu.guest || state.emu.v1 || state.emu.t7 || state.emu.t18 || !E.DEVICES[state.emu.dev]) return false;
    let n = fewMemo.get(state.emu.guest); if (n === undefined) { try { n = E.packMain(state.emu.guest, state.emu.dev, null, false).lzBlocks || 0; } catch (e) { n = 0; } fewMemo.set(state.emu.guest, n); }
    return n > 0; }
  if (state.emuRemove || !state.ctx) return false;
  const c = romEmuCfg(state.ctx.rom); return !!(c && c.lzOff) && E.lzCount(state.ctx.rom, c.lzOff) > 0;
}
async function packOk(rom) { const l = packedTamas(rom); return !l.length || deviceDialog(t('packWarn', { n: l.join(', ') })); }
function romT7(rom) { return F.emuType(rom) === 't7'; }
/* Further T7Emus of the loaded ROM (1.6.0): [{ name, saveOff }] */
function romExtras(rom) { const fe = F.embedded(); return fe ? E.appsRead(rom, F.feldApps(rom, fe.stub).apps) : []; }
/* Which T7Emu the save buttons are for: -1 the main one, otherwise the further one with this index */
/* 1.6.8: every program with a save, the main one ('m') and the ones in the menu (index in romExtras) */
/* 1.6.11 test2: every kind has an export and import: T18Emu the firmware with its save (as the T18Emu app), Game Boy and
 * Master System the cartridge RAM (.sav as other emulators), Wolf3D its saved game */
const SAVE_KINDS = new Set(['tama', 't7', 'v1', 't18', 'gb', 'sms', 'pm', 'ab', 'wolf']);
function saveExt(k) { return k === 'tama' || k === 'gb' || k === 'sms' ? '.sav' : k === 'pm' || k === 'ab' ? '.eep' : '.bin'; }
function savePrograms() {
  const rom = state.ctx.rom, out = [];
  if (emuInstalled()) { const ty = F.emuType(rom); if (SAVE_KINDS.has(ty)) out.push({ key: 'm', kind: ty, name: mainName(rom) || 'EMU', saveOff: 0xC0000, off: 0xA0000 }); }
  romExtras(rom).forEach((x, i) => { const k = E.extraKind(x); if (SAVE_KINDS.has(k)) out.push({ key: i, kind: k, name: x.name, saveOff: x.saveOff, off: x.off }); });
  return out;
}
/* Game Boy: the size of the cartridge RAM from the header (as Peanut-GB; MBC2 512 bytes), at most 32 KB */
function gbSaveLen(r) { if (!r || r.length < 0x150) return 0; if (r[0x147] === 5 || r[0x147] === 6) return 0x200; return Math.min([0, 0x800, 0x2000, 0x8000, 0x20000, 0x10000][r[0x149]] || 0, 0x8000); }
/* Master System: 32 KB cartridge RAM; 8 KB when the rest was never written */
function smsSaveLen(sv) { for (let i = 0x3000; i < 0x9000; i++) if (sv[i] !== 0xFF) return 0x8000; return 0x2000; }
/* an extra of state.extras for a program of the loaded ROM (same kind and place in the list of its kind) */
function extraFor(p) {
  const xs = romExtras(state.ctx.rom), x0 = xs[p.key]; if (!x0) return null;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  if (x0.kind === 'gb' || x0.kind === 'sms' || x0.kind === 'pm' || x0.kind === 'ab') return (state.extras || []).find((y) => y.kind === x0.kind && same(y.rom, x0.rom)) || null;
  const k = E.extraKind(x0), nth = xs.slice(0, p.key).filter((y) => E.extraKind(y) === k && (k !== 'wolf' || E.wolfSod(y.pack) === E.wolfSod(x0.pack))).length;
  return (state.extras || []).filter((y) => E.extraKind(y) === k && (k !== 'wolf' || E.wolfSod(y.pack) === E.wolfSod(x0.pack)))[nth] || null;
}
function saveFor() { const v = $('saveFor').value; return v === 'm' || v === '' || v === undefined ? -1 : +v; }
function saveProg() { const v = $('saveFor').value; return savePrograms().find((p) => String(p.key) === v) || null; }
function renderSave() {
  if (!state.ctx) return;
  const ps = savePrograms(), sel = $('saveFor'), cur = sel.value;
  sel.innerHTML = '';
  for (const p of ps) { const o = document.createElement('option'); o.value = String(p.key); o.textContent = p.name + (p.key === 'm' ? ' (' + t('progIsMain') + ')' : ''); sel.appendChild(o); }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  $('saveForRow').hidden = !ps.length;
  $('programSaveTools').hidden = !ps.length;
  const p = saveProg(), f = !p ? '.sav / .bin' : saveExt(p.kind);
  $('btnEmuOut').textContent = t('saveBtnOut', { f }); $('btnEmuIn').textContent = t('saveBtnIn', { f });
  $('btnEmuOut').disabled = !p; $('btnEmuIn').disabled = false; $('btnEmuOut').title = '';
  $('saveStat').textContent = !p ? t('saveNoProg') : t('saveProgInfo');
  $('btnPetOpen').disabled = $('btnPetRom').disabled = !!state.ctx.clean || (neonRom() && !SV.neonSaveLayout(state.ctx.rom));
  const [saveStart, saveEnd] = SV.region(state.ctx.editionId);
  $('btnParaClear').disabled = !!state.clean || !!state.ctx.clean || !F.edition(state.ctx.rom)
    || state.ctx.rom.subarray(saveStart, saveEnd).every(byte => byte === 0xFF);
  $('paraClearStatus').hidden = !state.paraCleared;
  $('paraClearStatus').textContent = state.paraCleared ? t('paraClearDone') : '';
  let con = false; try { con = !!dv.d && !dv.run; } catch (e) {}
  $('btnParaIn').disabled = !con || dv.d.info.readOnly || dv.d.info.edition === 0xFE || dv.d.info.edition === FL.MY_LAB_ON_PARADISE;
  // 1.6.8: which save (the menu keeps several)
  const ss = paraSlots(), sl = $('paraSlot'), sc = sl.value;
  sl.innerHTML = '';
  $('paraSlotRow').hidden = !ss;
  if (ss) {
    const add = (v, txt) => { const o = document.createElement('option'); o.value = v; o.textContent = txt; sl.appendChild(o); };
    if (ss.live < 0) add('live', t('slotLive', { n: F.fieldNow(state.ctx.rom) }));
    for (const x of ss.list) add(x.i === ss.live ? 'live' : String(x.i), x.i === ss.live ? t('slotLive', { n: slotLabel(ss, x.i) }) : x.used ? slotLabel(ss, x.i) : t('slotEmpty', { n: slotLabel(ss, x.i) }));
    if ([...sl.options].some((o) => o.value === sc)) sl.value = sc;
  }
  $('btnSlotClear').disabled = !con || !ss?.list.some(x => x.used && String(x.i) === paraSlotPick());
}
$('btnParaClear').onclick = () => {
  if ($('btnParaClear').disabled || !state.ctx) return;
  const { rom, editionId } = state.ctx;
  const slots = paraSlots()?.f;
  if (slots && (slots.flags & F.F_NEON_SAVES) && F.neonSwitchPending(rom, slots)) {
    toast(t('paraClearPending'), true); return;
  }
  if (!confirm(t('paraClearAsk'))) return;
  state.ctx.rom = SV.paraClear(rom, editionId);
  state.labItemEdits.clear();
  state.paraCleared = true;
  if (petFromRom) $('btnPetClose').click();
  renderSave(); renderFeld();
};
function paraSlots() { const fe = F.embedded(); try { return state.ctx && fe ? F.saveSlots(state.ctx.rom, fe.stub) : null; } catch (e) { return null; } }
function slotLabel(ss, i) {
  return (!ss.saves && fieldName(state.ctx.rom, F.fieldNames(state.ctx.rom)[i])) || t('saveSlot', { n: i + 1 });
}
function paraSlotPick() { return $('paraSlotRow').hidden ? 'live' : $('paraSlot').value; }
function t7SaveOutSel() {
  const p = saveProg(); if (!p || p.kind !== 't7') return null;
  return p.key === 'm' ? SV.t7SaveOut(state.ctx.rom) : SV.t7SaveOut(state.ctx.rom, p.saveOff);
}
$('saveFor').onchange = () => renderSave();
$('paraSlot').onchange = () => renderSave();
$('btnSlotClear').onclick = async () => {
  const ss = paraSlots(), i = Number(paraSlotPick());
  if (!dv.d || !ss?.list.some(x => x.i === i && x.used && x.i !== ss.live)) return;
  if (!await confirmFlashOperation(t('slotClearSure', { n: slotLabel(ss, i) }))) return;
  devWriteTask(async () => {
    const d = dv.d, f = ss.f, rom = state.ctx.rom;
    const deviceView = new Uint8Array(rom);
    await readSlotTarget(d, deviceView, f, i);
    const at = F.slotAddr(f, i), header = await d.read(at, 0x1000);
    if (!header.every((byte, index) => byte === rom[at + index]))
      throw new Error(t('slotDevOther'));
    const empty = new Uint8Array(0x1000).fill(0xFF);
    await d.writeSectors(new Map([[at, empty]]), devProg, () => dv.cancel, FL.embedded());
    deviceView.set(empty, at);
    state.ctx.rom = deviceView;
    devRender(t('slotClearDone', { n: slotLabel(ss, i) }));
    renderSave(); renderFeld();
  });
};
let g_slotIn = 'live';
$('btnParaIn').onclick = () => { g_slotIn = paraSlotPick(); $('fileSave').value = ''; $('fileSave').click(); };
$('btnEmuIn').onclick = () => $('fileEmuSav').click();
/* test23 SAVE_PICK: a save file goes to the program of its kind, whatever the list shows (with T7Emu in the menu and
 * another program chosen the import said "T7Emu has to be in the ROM"), also to an emulator added but not yet saved.
 * T18Emu: also the save of the T18Emu app (flash from 0x570000 or 0x5E0000, or its .zip with flash.bin). */
const SAVE_PICK = true;
const T18_PART = [[0x290000, 0, 0x570000], [0x220000, 0, 0x5E0000], [0x220010, 16, 0x5E0000]];
async function t18Part(g) {
  for (const [n, skip, at] of T18_PART) if (g.length === n) return { data: g.subarray(skip), at };
  if (g.length > 22 && g[0] === 0x50 && g[1] === 0x4B) {
    try { const z = await C.zipRead(g, inflateRaw); const fl = z.find((x) => x.name === 'flash.bin' && x.data.length === 0x800000); if (fl) return { data: fl.data.subarray(0x570000), at: 0x570000 }; } catch (err) {}
  }
  return null;
}
function saveKindOf(g) {
  if (SV.t7SaveCheck(g)) return 't7';
  if (E.t18Detect(g)) return 't18';
  if (g.length === 0x400000 || g.length === 0x800000 || g.length === 0x7FF800) { try { return { tama: E.emuDetect(g) }; } catch (err) {} }
  return null;
}
function progDev(p) {
  const rom = state.ctx.rom;
  if (p.key === 'm') { const c = romEmuCfg(rom); return c && c.dev; }
  const c = SV.emuCfg(rom.subarray(p.off, p.off + 0x1000)); return c && c.dev;
}
$('fileEmuSav').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let g = new Uint8Array(await f.arrayBuffer()), p = saveProg();
  let part = null;
  if (SAVE_PICK) {
    let k = saveKindOf(g), dev = null;
    if (!k && (part = await t18Part(g))) k = 't18';
    if (k && k.tama) { dev = k.tama; k = 'tama'; }
    if (k && !(p && p.kind === k && (k !== 'tama' || progDev(p) === dev))) {
      const q = savePrograms().filter((x) => x.kind === k && (k !== 'tama' || progDev(x) === dev));
      if (q.length) { p = q[0]; $('saveFor').value = String(p.key); }
      else if (k === 't7' && state.emu && state.emu.t7) p = null;     // added, not saved yet: the main program
      else if (k === 't18' && state.emu && state.emu.t18) p = { key: 'm', kind: 't18', name: 'T18Emu', pend: true };
    }
    if (part && (!p || p.kind !== 't18')) { toast(t('saveT18Need'), true); return; }
  }
  // 1.6.11 test2: Game Boy, Master System (cartridge RAM), Wolf3D (its saved game), T18Emu (firmware with its save)
  if (p && p.kind === 'ab') {   // 1.7.3: the Arduboy's EEPROM (1 KB, .eep); the kept game state goes
    const x = extraFor(p); if (!x) { toast(t('saveEmuBad'), true); return; }
    if (g.length !== 0x400) { toast(t('saveWrongFile', { n: p.name }), true); return; }
    const sv = new Uint8Array(E.AB_SAVE).fill(0xFF); if (x.save && x.save.length) sv.set(x.save.subarray(0, 0x1000));
    sv.set(g, 0x1000); x.save = sv; state.extrasDirty = true; renderEmu(); renderPlan();
    $('saveStat').textContent = t('saveCartIn', { n: p.name }); return;
  }
  if (p && p.kind === 'pm') {   // 1.7.3: the EEPROM (8 KB, .eep as PokeMini keeps it); the kept game state goes
    const x = extraFor(p); if (!x) { toast(t('saveEmuBad'), true); return; }
    if (g.length !== 0x2000) { toast(t('saveWrongFile', { n: p.name }), true); return; }
    const sv = new Uint8Array(E.PM_BIOS_AT).fill(0xFF); if (x.save && x.save.length) sv.set(x.save.subarray(0, 0x1000));
    sv.set(g, 0x1000); x.save = sv; state.extrasDirty = true; renderEmu(); renderPlan();
    $('saveStat').textContent = t('saveCartIn', { n: p.name }); return;
  }
  if (p && (p.kind === 'gb' || p.kind === 'sms' || p.kind === 'wolf')) {
    const x = extraFor(p); if (!x) { toast(t('saveEmuBad'), true); return; }
    const sv = new Uint8Array(0x10000).fill(0xFF); if (x.save && x.save.length) sv.set(x.save.subarray(0, 0x10000));
    if (p.kind === 'wolf') {
      if (g.length !== 0x10000 || (g[0x1000] | g[0x1001] << 8 | g[0x1002] << 16 | g[0x1003] << 24) >>> 0 !== 0x56533357) { toast(t('saveWrongFile', { n: p.name }), true); return; }
      sv.set(g.subarray(0x1000), 0x1000);
    } else {
      const n = p.kind === 'gb' ? gbSaveLen(x.rom) : Math.min(g.length, 0x8000);
      if (!n) { toast(t('saveNoBatt'), true); return; }
      if (g.length < n || g.length > 0x20000 + 64) { toast(t('saveWrongFile', { n: p.name }), true); return; }
      sv.fill(0xFF, 0x1000, 0x10000); sv.set(g.subarray(0, n), 0x1000);   // the kept game state (behind the RAM) goes
    }
    x.save = sv; state.extrasDirty = true; renderEmu(); renderPlan();
    $('saveStat').textContent = t('saveCartIn', { n: p.name }); return;
  }
  if (p && p.kind === 't18') {
    if (SAVE_PICK && part) {   // the T18Emu app's save: into the firmware the ROM has (or the one just added)
      const x0 = p.key === 'm' ? null : extraFor(p);
      const fw0 = p.key === 'm' ? (state.emu && state.emu.t18 ? state.emu.rom : E.t18FromRom(state.ctx.rom)) : x0 && (x0.fw || E.t18FromRom(state.ctx.rom, p.off));
      if (!fw0) { toast(t('saveT18Need'), true); return; }
      const fw = new Uint8Array(fw0); fw.set(part.data.subarray(0, 0x800000 - part.at), part.at); g = fw;
    }
    if (!E.t18Detect(g)) { toast(t('saveWrongFile', { n: p.name }), true); return; }
    const undo = { emu: state.emu, rem: state.emuRemove, x: null };
    if (p.key === 'm') { let n = 0; for (let i = 0; i < 128; i++) if (!g.subarray(i << 16, (i + 1) << 16).every((v) => v === 0xFF)) n++; state.emu = { t18: true, dev: 't18', rom: g, size: n << 16 }; emuRemoveClear(); }
    else { const x = extraFor(p); if (!x) { toast(t('saveEmuBad'), true); return; } undo.x = [x, x.fw, x.keepOff, x.saveImp]; x.fw = g; delete x.keepOff; x.saveImp = true; state.extrasDirty = true; }
    // does it fit? (a saved firmware may use more blocks than the fresh one) a trial build right away
    const err = await busy(t("Checking ROM Changes"), async () => { toast.mute = {}; try { await composeRom(); } catch (e) { toast.mute.err = toast.mute.err || em(e); } const m = toast.mute.err; toast.mute = null; return m; });
    if (err) {
      state.emu = undo.emu; state.emuRemove = undo.rem;
      if (undo.x) { const [x, fw, ko, si] = undo.x; x.fw = fw; if (ko !== undefined) x.keepOff = ko; if (!si) delete x.saveImp; }
      renderEmu(); toast(err, true); return;
    }
    renderEmu(); renderPlan();
    $('saveStat').textContent = t('t7SaveXDone', { n: p.name }); return;
  }
  if (SV.t7SaveCheck(g)) {
    if (p && p.kind === 't7' && p.key !== 'm') { state.t7saveX = { i: p.key, save: g }; renderPlan(); $('saveStat').textContent = t('t7SaveXDone', { n: p.name }); return; }
    if (!romT7(state.ctx.rom) && !(SAVE_PICK && state.emu && state.emu.t7)) { toast(t('t7SaveNeed'), true); return; }
    state.t7save = g; renderPlan();
    $('saveStat').textContent = t('t7SaveInDone');
    return;
  }
  // V1Emu: session and settings (8 KB, "V1ST" at the start or an empty session)
  if (g.length === 0x2000 && p && p.kind === 'v1') {
    state.saveIn = { key: p.key, kind: 'v1', data: g }; renderPlan();
    $('saveStat').textContent = t('t7SaveXDone', { n: p.name }); return;
  }
  let dev, pk;
  try { dev = E.emuDetect(g); pk = E.packMain(g, dev); } catch (err) { toast(t('saveEmuBad'), true); return; }
  // a colour Tama in the menu: its firmware with the save replaces the one in the ROM
  if (p && p.kind === 'tama' && p.key !== 'm') {
    const x = (state.extras || [])[p.key];
    if (x && x.kind === 'tama' && E.DETECT_TAG && x.dev === 'idl' && x.dev !== dev && E.DEVICES[dev].size === E.DEVICES.idl.size && E.emuDetect(x.guest) === dev) x.dev = dev;   // 1.7.6: built before as iD L (other version)
    if (!x || x.kind !== 'tama' || x.dev !== dev) { toast(t('saveEmuBad'), true); return; }
    if (SAVE_PACK_ASK && E.PACK_ASK && E.PACK_OPT && !x.pack && E.tamaNeedsLz(g, dev, E.MENU_ROOM ? E.MENU_ROOM_LEN : undefined)) { if (!confirm(t('savePackAsk'))) return; x.pack = true; }
    x.guest = g; state.extrasDirty = true; state.saveIn = { key: p.key, kind: 'tama' }; renderEmu();
    $('saveStat').textContent = t('t7SaveXDone', { n: p.name }); return;
  }
  if (!appRoom()) { toast(t('saveNoRoom'), true); return; }
  const cfg = romEmuCfg(state.ctx.rom), was = state.emu ? state.emu.dev : cfg && cfg.dev;
  if (was && was !== dev && !confirm(t('saveEmuOther', { a: E.DEVICES[was].label, b: E.DEVICES[dev].label }))) return;
  if (SAVE_PACK_ASK && E.PACK_ASK && E.PACK_OPT && !state.emuPack && E.mainNeedsPack(g, dev)) { if (!confirm(t('savePackAsk'))) return; state.emuPack = true; pk = E.packMain(g, dev, null, true); }
  state.emu = { guest: g, dev, size: pk.blob.length, big: pk.big }; emuRemoveClear(); if (!state.launch) state.doom = null;
  state.saveIn = { key: 'm', kind: 'tama' };
  renderDoom(); renderEmu();
  $('saveStat').textContent = t('saveEmuInDone', { d: E.DEVICES[dev].label });
};
/* Change a Paradise save (1.6.8): level, character, care. Names come from the loaded ROM. */
let petSave = null, petName = '';
$('btnPetOpen').onclick = () => { $('filePet').value = ''; $('filePet').click(); };
$('filePet').onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !state.ctx) return;
  let save; try { save = SV.paraDecode(new Uint8Array(await f.arrayBuffer())); } catch (err) { toast(em(err), true); return; }
  petOpen(save, f.name, false);
};
/* 1.6.8: the save of the loaded ROM itself; the change goes back into the ROM */
$('btnPetRom').onclick = () => {
  if (!state.ctx) return;
  const ed = state.ctx.editionId;
  petOpen({ stamp: 0, counter: 0, alarm: 0, status: 0, regs: [], pages: SV.paraFromImage(state.ctx.rom, ed), edition: ed }, '', true);
};
$('btnPetClose').onclick = () => { petSave = null; $('petRow').hidden = true; $('petStat').textContent = ''; };
let petFromRom = false;
function saveCharacterName(character) {
  const name = romDisplayName(state.ctx.rom, state.characterTextById.get(character.id));
  if (name && gameLocale() !== 'en') return name;
  const english = name || character.name;
  return english.charAt(0) + english.slice(1).toLowerCase();
}

function refreshPetNames() {
  const rom = state.ctx.rom;
  const fields = F.fieldNames(rom);
  $('petChar').options[0].textContent = t('petKeep');
  for (const [index, group] of Array.from($('petChar').querySelectorAll('optgroup')).entries())
    group.label = t(['petKid', 'petYoung', 'petAdult'][index]);
  for (const option of $('petChar').querySelectorAll('option[data-name]')) {
    const name = saveCharacterName({ id: Number(option.value.split(':')[0]), name: option.dataset.name });
    const field = fieldName(rom, fields[option.dataset.field]);
    option.textContent = field ? name + ' (' + field + ')' : name;
  }
  const ed = petSave.edition || state.ctx.editionId, neon = ed === 8;
  const pet = neon ? SV.neonProgress(petSave) : SV.paraPet(petSave, ed);
  if (!pet) return;
  for (const option of $('petMission').options) {
    const index = Number(option.value), mission = pet.missions?.[index];
    if (!mission) continue;
    const label = romDisplayName(rom, 177 + index) || '#' + (index + 1);
    option.textContent = (mission.complete ? '✓ ' : '') + label + ' (' + mission.count + '/' + mission.target + ')';
  }
  if (!neon || pet.canCare) {
    const current = Array.from($('petChar').options).find(option => option.value.startsWith(pet.id + ':'));
    const name = current ? saveCharacterName({ id: pet.id, name: current.dataset.name }) : pet.id;
    $('petStat').textContent = t('petNow', { l: pet.level, c: name, h: pet.hunger, j: pet.happy, s: pet.sick ? t('petSick') : '' });
  }
}

function petOpen(save, name, fromRom) {
  const ed = save.edition || state.ctx.editionId;
  if (SV.family(ed) !== SV.family(state.ctx.editionId)) { toast(t('petOther'), true); return; }
  const neon = ed === 8;
  const pet = neon ? SV.neonProgress(save) : SV.paraPet(save, ed);
  if (!pet) { toast(t('petNoSet'), true); return; }
  petSave = save; petSave.edition = ed; petName = name; petFromRom = fromRom;
  const lv = $('petLevel'); lv.innerHTML = '';
  for (let i = 0; i <= 10; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; if (i === pet.level) o.selected = true; lv.appendChild(o); }
  $('petCare').checked = false;
  $('petCharRow').hidden = neon && !pet.canCare;
  $('petCareRow').hidden = neon && !pet.canCare;
  $('petPointsRow').hidden = $('petMissionRow').hidden = $('petMissionActionRow').hidden = !neon;
  $('petRow').hidden = false;
  if (neon) {
    $('petPoints').value = pet.points;
    const missions = $('petMission');
    missions.innerHTML = '';
    pet.missions.forEach((mission, index) => {
      const option = document.createElement('option');
      option.value = index;
      const label = romDisplayName(state.ctx.rom, 177 + index) || '#' + (index + 1);
      option.textContent = (mission.complete ? '✓ ' : '') + label + ' (' + mission.count + '/' + mission.target + ')';
      missions.appendChild(option);
    });
    $('petMissionAction').value = '';
  }
  const sel = $('petChar'); sel.innerHTML = '';
  const keep = document.createElement('option'); keep.value = ''; keep.textContent = t('petKeep'); sel.appendChild(keep);
  const chars = F.characters(state.ctx.rom), fn = F.fieldNames(state.ctx.rom);
  let cur = '';
  for (const [st, k] of [[3, 'petKid'], [4, 'petYoung'], [5, 'petAdult']]) {
    const g = document.createElement('optgroup'); g.label = t(k);
    for (const c of chars.filter((x) => x.stage === st)) {
      const o = document.createElement('option'); o.value = c.id + ':' + c.stage;
      const nm = saveCharacterName(c);
      const field = fieldName(state.ctx.rom, fn[c.field]);
      o.textContent = field ? nm + ' (' + field + ')' : nm;
      o.dataset.name = c.name;
      o.dataset.field = c.field;
      if (c.id === pet.id) cur = nm;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  $('petCare').checked = false;
  $('petStat').textContent = !neon || pet.canCare ? t('petNow', { l: pet.level, c: cur || pet.id, h: pet.hunger, j: pet.happy, s: pet.sick ? t('petSick') : '' }) : '';
}
$('btnPetSave').onclick = () => {
  if (!petSave) return;
  const ed = petSave.edition, neon = ed === 8, ch = {};
  const pet = neon ? SV.neonProgress(petSave) : SV.paraPet(petSave, ed);
  const lv = +$('petLevel').value; if (lv !== pet.level) ch.level = lv;
  if (neon) {
    const points = $('petPoints').valueAsNumber;
    if (points !== pet.points) ch.points = points;
    const action = $('petMissionAction').value;
    if (action) ch.mission = { index: +$('petMission').value, complete: action === 'complete' };
  }
  const v = $('petChar').value;
  if (v && !$('petCharRow').hidden) {
    const [id, stage] = v.split(':').map(Number);
    if (id !== pet.id || stage !== pet.stage) Object.assign(ch, { id, stage });
  }
  if (!$('petCareRow').hidden && $('petCare').checked) ch.care = true;
  if (!Object.keys(ch).length) { toast(t('petNothing')); return; }
  let nw;
  try { nw = neon ? SV.neonProgressSet(petSave, ch) : SV.paraPetSet(petSave, ed, ch); }
  catch (err) { toast(em(err), true); return; }
  if (nw === petSave) { toast(t('petNothing')); return; }
  measure('edit', 'save_progress', romEditionKey(ed));
  if (petFromRom) {
    const r = new Uint8Array(state.ctx.rom);
    for (const [a, d] of nw.pages) if (d.length === 0x1000) r.set(d, a);
    state.ctx.rom = r; state.petDirty = true;
    petOpen(nw, petName, true);
    $('petStat').textContent = t('petRomDone'); renderPlan(); return;
  }
  const out = SV.paraWrite(nw, ed);
  const name = petName.replace(/\.tamasave$/i, '') + '-' + stamp() + '.tamasave';
  download(out, name);
  if (neon) petOpen(nw, petName, false);
  $('petStat').textContent = t('petDone', { n: name });
};

$('btnParaOut').onclick = () => busy(t("Exporting Paradise Save"), async () => {
  const ed = state.ctx.editionId, v = paraSlotPick(), rom = state.ctx.rom;
  let pages = SV.paraFromImage(rom, ed), tag = '';
  if (v !== 'live') {   // 1.6.8: a save the menu keeps in a slot
    const ss = paraSlots(), i = +v, sv = ss && await F.slotReadAsync((a, n) => rom.subarray(a, a + n), ss.f, i);
    if (!sv) { toast(t('slotNone'), true); return; }
    const [a, b] = SV.region(ed), got = F.slotPages(sv);
    pages = new Map(); for (let p = a; p < b; p += 0x1000) pages.set(p, got.get(p) || new Uint8Array(0x1000).fill(0xFF));
    const field = !ss.saves && F.fieldNames(rom)[i];
    tag = '-' + (field || 'Save ' + (i + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  const name = edSlug(ed) + tag + '-' + stamp() + '.tamasave';
  download(SV.paraEncode(pages, ed, null), name);
  $('saveStat').textContent = t('saveNoClock', { n: name });
});
$('btnEmuOut').onclick = () => busy(t("Exporting Program Save"), async () => {
  const p = saveProg(); if (!p) { toast(t('saveNoEmu'), true); return; }
  const rom = state.ctx.rom, slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (p.kind === 't7') {
    const sv = t7SaveOutSel(); if (!sv) { toast(t('t7NoSave'), true); return; }
    const name = 't7emu-' + slug + '-' + stamp() + '-save.bin'; download(sv, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  if (p.kind === 'v1') {
    const sv = rom.slice(p.saveOff, p.saveOff + 0x2000);
    if (sv.subarray(0, 0x1000).every((v) => v === 0xFF)) { toast(t('t7NoSave'), true); return; }
    const name = 'v1emu-' + slug + '-' + stamp() + '-save.bin'; download(sv, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  if (p.kind === 'tama') {
    const cfg = p.key === 'm' ? romEmuCfg(rom) : SV.emuCfg(rom.subarray(p.off, p.off + 0x1000)); if (!cfg) { toast(t('saveNoEmu'), true); return; }
    const g = await SV.emuGuestAsync((a, n) => rom.subarray(a, a + n), cfg);
    const name = cfg.app + '-' + (p.key === 'm' ? '' : slug + '-') + stamp() + '.sav';
    download(g, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  const slug2 = (k) => k + '-' + slug + '-' + stamp();
  if (p.kind === 't18') {
    const fw = p.key === 'm' ? E.t18FromRom(rom) : E.t18FromRom(rom, p.off); if (!fw) { toast(t('saveNone'), true); return; }
    const name = 't18emu-' + stamp() + '-save.bin'; download(fw, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  if (p.kind === 'ab') {
    const x = romExtras(rom)[p.key], sv = x && x.save;
    if (!sv || sv.length < 0x1400) { toast(t('saveNone'), true); return; }
    const out = sv.slice(0x1000, 0x1400); if (out.every((v) => v === 0xFF)) { toast(t('saveNone'), true); return; }
    const name = slug + '-' + stamp() + '.eep'; download(out, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  if (p.kind === 'pm') {
    const x = romExtras(rom)[p.key], sv = x && x.save;
    if (!sv || sv.length < 0x3000) { toast(t('saveNone'), true); return; }
    const out = sv.slice(0x1000, 0x3000); if (out.every((v) => v === 0xFF)) { toast(t('saveNone'), true); return; }
    const name = slug + '-' + stamp() + '.eep'; download(out, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  if (p.kind === 'gb' || p.kind === 'sms' || p.kind === 'wolf') {
    const x = romExtras(rom)[p.key], sv = x && x.save;
    if (!sv) { toast(t('saveNone'), true); return; }
    let out, name;
    if (p.kind === 'wolf') { if ((sv[0x1000] | sv[0x1001] << 8 | sv[0x1002] << 16 | sv[0x1003] << 24) >>> 0 !== 0x56533357) { toast(t('saveNone'), true); return; } out = sv.slice(0, 0x10000); name = slug2(E.wolfSod(x.pack) ? 'sod' : 'wolf3d') + '-save.bin'; }
    else {
      const n = p.kind === 'gb' ? gbSaveLen(x.rom) : smsSaveLen(sv);
      if (!n) { toast(t('saveNoBatt'), true); return; }
      out = sv.slice(0x1000, 0x1000 + n);
      if (out.every((v) => v === 0xFF)) { toast(t('saveNone'), true); return; }
      name = slug + '-' + stamp() + '.sav';
    }
    download(out, name);
    $('saveStat').textContent = t('saveDone', { n: name }); return;
  }
  toast(t('saveEmuBad'), true);
});
function usesMyLabDeviceSave(d) {
  return d?.info.edition === 0xFE || d?.info.edition === FL.MY_LAB_ON_PARADISE;
}
async function checkMyLabSaveRecovery(d) {
  if (d.info.edition === FL.MY_LAB_ON_PARADISE) {
    const header = await d.read(0, 0x18);
    const marker = await d.read(ML.PARADISE_PORT_MARKER_OFFSET, 8);
    if (!ML.hasParadisePortBoot(header, marker)) throw new Error(t('portSaveWrongRom'));
  }
  const slots = await d.read(0xC64000, 0x2000);
  const garden = await d.read(0xFEB000, 0x1000);
  if (ML.saveRecoveryPending(slots, garden, VIS)) {
    throw new Error(t('myLabSaveRecovery'));
  }
}
async function backupMyLabDevice(d, cancel) {
  const port = d.info.edition === FL.MY_LAB_ON_PARADISE;
  await checkMyLabSaveRecovery(d);
  const first = ML.DEVICE_SAVE_FIRST, end = ML.DEVICE_SAVE_END;
  const region = new Uint8Array(end - first).fill(0xFF);
  const used = await d.usedSectors(first, end, devProg, cancel);
  let n = 0;
  for (const off of used) {
    if (cancel()) throw new Error('cancelled');
    region.set(await d.read(off, 0x1000), off - first);
    devProg('read', ++n * 0x1000, used.length * 0x1000);
  }
  const clock = await d.clockRead();
  const name = (port ? 'my-lab-on-paradise-' : 'my-lab-') + stamp() + MY_LAB_SAVE_EXT;
  download(ML.deviceSaveBackup(region, (clock?.ctrl & 0x80) ? clock.counter : null, C, VIS), name);
  measure('operation', 'backup_save', romEditionKey(d.info.edition));
  devRender(t('devSaveGot', { n: name }));
}
async function writeMyLabDeviceSave(d, save, cancel) {
  await checkMyLabSaveRecovery(d);
  const live = await d.read(ML.APPDATA_FIRST, ML.DEVICE_SAVE_END - ML.APPDATA_FIRST);
  const page = ML.planDeviceSavePage(save.page, live, VIS);
  const map = new Map();
  if (save.data) {
    const first = save.dataStart, end = first + save.data.length;
    const image = new Uint8Array(Math.ceil(end / 0x10000) * 0x10000).fill(0xFF);
    image.set(save.data, first);
    const diff = await d.changed(image, devProg, cancel, first & ~0xFFFF, end);
    for (const off of diff)
      if (off >= first && off < end) map.set(off, image.subarray(off, off + 0x1000));
  }
  // Write Garden/crafted data before publishing the restored APPDATA page.
  if (page) map.set(page.off, page.bytes);
  const w = map.size ? await d.writeSectors(map, devProg, cancel) : 0;
  const clock = save.clock !== null && await d.clockSet(save.clock);
  if (w || clock) measure('operation', 'restore_save', romEditionKey(d.info.edition));
  devRender(t('devSaveDone', { w, c: t(clock ? 'devSaveClock' : 'devSaveClockNo') }));
}
$('btnReadLabItems').onclick = () => {
  const device = dv.d;
  if (dv.opening || dv.run || !canReadLabItems(device)) return;
  const status = $('deviceLabItemsStatus'), holder = $('deviceLabItems');
  status.hidden = false;
  status.textContent = t("Reading Lab Items from {v1}…", { v1: connectedEdition(device) });
  return devTask(async () => {
    let items;
    try {
      device.ready();
      const [start, end] = SV.region(device.info.edition);
      items = await LI.readDevice(device, start, end, C, devProg, () => dv.cancel);
    } catch (error) {
      status.textContent = dv.cancel ? t('devCancelled') : t('devErr', { e: flMsg(error) });
      throw error;
    }
    const edits = new Map();
    renderLabItems(holder, items, (original, button) => {
      openLabItem(edits.get(original.address) || original, edited => {
        edits.set(edited.address, edited);
      }, button);
    }, true, original => edits.get(original.address) || original);
    holder.hidden = false;
    status.textContent = t("Last scan: {v1}", { v1: connectedEdition(device) });
    measure('operation', 'read_lab_items', romEditionKey(device.info.edition));
    devRender(items.length ? t("Read Lab Items from {v1}.", { v1: connectedEdition(device) }) : t("No downloaded Lab Items found on {v1}.", { v1: connectedEdition(device) }));
  });
};

/* From the device: the native save with its clock, plus any supported emulator saves on Paradise. */
$('btnSaveRead').onclick = () => devTask(async () => {
  const d = dv.d, ed = d.info.edition, cancel = () => dv.cancel;
  if (usesMyLabDeviceSave(d)) { await backupMyLabDevice(d, cancel); return; }
  const [a, b] = SV.region(ed);
  const used = await d.usedSectors(a, b, devProg, cancel);
  const pages = new Map(), ff = new Uint8Array(0x1000).fill(0xFF);
  for (let p = a; p < b; p += 0x1000) pages.set(p, ff);
  let n = 0;
  for (const s of used) { if (cancel()) throw new Error('cancelled'); pages.set(s, await d.read(s, 0x1000)); devProg('read', ++n * 0x1000, used.length * 0x1000); }
  const clock = await d.clockRead();
  const names = [edSlug(ed) + '-' + stamp() + '.tamasave'];
  download(SV.paraEncode(pages, ed, clock && (clock.ctrl & 0x80) ? clock : null), names[0]);
  measure('operation', 'backup_save', romEditionKey(ed));
  // TamaEmu on the device?
  const sec = await d.read(0xA0000, 0x1000);
  const kindDoom = (() => { for (let i = 0x140; i < 0x400; i += 4) if ((sec[i] | sec[i + 1] << 8 | sec[i + 2] << 16 | sec[i + 3] << 24) >>> 0 === 0x434D4450) return true; return false; })();
  const cfg = kindDoom ? null : SV.emuCfg(sec);
  if ((sec[0x140] | sec[0x141] << 8 | sec[0x142] << 16 | sec[0x143] << 24) >>> 0 === E.T7_MAGIC) {
    // T7Emu: the pet's EEPROM (two slots) as save.bin of the T7Emu app
    const part = new Uint8Array(SV.T7_EE + 0x4000);
    part.set(await d.read(SV.T7_EE, 0x4000), SV.T7_EE);
    const sv = SV.t7SaveOut(part);
    if (sv) { names.push('t7emu-' + stamp() + '-save.bin'); download(sv, names[names.length - 1]); }
  }
  // further T7Emus (1.6.0): where the loaded ROM has them, if the device has the same program there
  if (state.ctx) for (const x of romExtras(state.ctx.rom)) {
    const h = await d.read(x.off, 0x1000);
    if ((h[0x140] | h[0x141] << 8 | h[0x142] << 16 | h[0x143] << 24) >>> 0 !== E.T7_MAGIC || (h[0x150] | h[0x151] << 8 | h[0x152] << 16 | h[0x153] << 24) >>> 0 !== x.saveOff) continue;
    const part = new Uint8Array(x.saveOff + 0x5000);
    part.set(await d.read(x.saveOff + 0x1000, 0x4000), x.saveOff + 0x1000);
    const sv = SV.t7SaveOut(part, x.saveOff);
    if (sv) { names.push('t7emu-' + x.name.toLowerCase() + '-' + stamp() + '-save.bin'); download(sv, names[names.length - 1]); }
  }
  if (cfg) {
    // read less: if the loaded ROM has the same firmware layout, only the sectors that differ
    let base = null;
    const rc = state.ctx && romEmuCfg(state.ctx.rom);
    if (rc && rc.guestOff === cfg.guestOff && rc.guestSize === cfg.guestSize && rc.kind === cfg.kind && rc.map.every((v, i) => v === cfg.map[i])) {
      const end = Math.max(cfg.spareEnd || 0, (cfg.guestOff + cfg.guestSize + 0xFFFF) & ~0xFFFF);
      const diff = await d.changed(state.ctx.rom, devProg, cancel, cfg.guestOff & ~0xFFFF, Math.min(end, 0x1000000));
      base = new Uint8Array(state.ctx.rom);
      for (const s of diff) base.set(await d.read(s, 0x1000), s);
    }
    const read = base ? (x, k) => base.subarray(x, x + k) : (x, k) => d.read(x, k);
    const g = await SV.emuGuestAsync(read, cfg, base ? null : devProg);
    names.push(cfg.app + '-' + stamp() + '.sav');
    download(g, names[1]);
  }
  devRender(t('devSaveGot', { n: names.join(', ') }) + (clock ? '' : ' ' + t('devSaveClockNo')));
});
$('btnSaveWrite').onclick = () => {
  g_slotIn = 'live';
  const input = $(usesMyLabDeviceSave(dv.d) ? 'fileMyLabSave' : 'fileSave');
  input.value = ''; input.click();
};
$('fileMyLabSave').onchange = async (e) => {
  const file = e.target.files[0], d = dv.d;
  if (!file || !usesMyLabDeviceSave(d) || d.info.readOnly || dv.run) return;
  let save;
  try {
    save = ML.readDeviceSaveBackup(new Uint8Array(await file.arrayBuffer()), C, VIS);
  } catch (err) {
    devRender(t('devErr', { e: em(err) }));
    return;
  }
  if (dv.run || dv.d !== d || !await confirmFlashOperation(t('devSaveSure', { ed: connectedEdition(d) }))) return;
  await devWriteTask(() => writeMyLabDeviceSave(d, save, () => dv.cancel));
};
$('fileSave').onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !dv.d) return;
  let save;
  try { save = SV.paraDecode(new Uint8Array(await f.arrayBuffer())); } catch (err) { toast(em(err), true); return; }
  const ed = dv.d.info.edition;
  const chk = SV.paraCheck(save, ed);
  chk.errors.forEach((x) => { if (x.p) { x.p.s = FL.EDITIONS[x.p.s] || x.p.s; x.p.d = FL.EDITIONS[x.p.d] || x.p.d; } });
  if (chk.errors.length) { devRender(t('devErr', { e: chk.errors.map(saveMsg).join(', ') })); return; }
  const warn = chk.warnings.map(saveMsg).join('\n');
  if (g_slotIn !== 'live') { slotWrite(save, chk, +g_slotIn, warn); return; }
  if (!await confirmFlashOperation(t('devSaveSure', { ed: connectedEdition(dv.d) }) + (warn ? '\n\n' + warn : ''))) return;
  devWriteTask(async () => {
    const d = dv.d, [a, b] = SV.region(ed);
    // only pages that differ from the device
    const img = new Uint8Array(0x1000000).fill(0xFF);
    for (const [p, data] of chk.pages) img.set(data, p);
    const diff = await d.changed(img, devProg, () => dv.cancel, a & ~0xFFFF, b);
    const map = new Map();
    for (const [p, data] of chk.pages) if (diff.has(p)) map.set(p, data);
    const w = map.size ? await d.writeSectors(map, devProg, () => dv.cancel, FL.embedded()) : 0;
    const v = SV.paraClock(save);
    const cl = v !== null && await d.clockSet(v);
    if (w || cl) measure('operation', 'restore_save', romEditionKey(ed));
    devRender(t('devSaveDone', { w, c: cl ? t('devSaveClock') : t('devSaveClockNo') }));
  });
};

// Recheck the on-device menu geometry and live slot before writing a slot.
async function readSlotTarget(d, view, f, slot) {
  const c = f.off + 0x140, size = f.version >= 11 ? 620 : 372;
  const menu = (await d.read(f.off, 0x1000)).subarray(0x140, 0x140 + size);
  const fields = [0, 4, 8, 12, 16, 28, 36, 364, 368];
  if (f.version >= 11) fields.push(612, 616);
  if (fields.some(o => rd32(menu, o) !== rd32(view, c + o)))
    throw new Error(t('slotDevOther'));
  if (f.flags & F.F_NEON_SAVES) {
    const from = f.slotOff - 0x2000;
    view.set(await d.read(from, 0x2000), from);
    if (F.neonActive(view, f) < 0 || F.neonSwitchPending(view, f))
      throw new Error(t('slotDevOther'));
  } else {
    view.set(await d.read(0xEFE000, 0x1000), 0xEFE000);
  }
  for (let i = 0; i < f.nslots; i++) {
    const at = F.slotAddr(f, i);
    view.set(await d.read(at, 0x1000), at);
  }
  const current = F.saveSlots(view, F.embedded().stub);
  if (!current || current.live < 0 || current.live === slot)
    throw new Error(t('slotDevOther'));
}

/* 1.6.8: a save into a slot of the menu on the device (packed like the menu does it, header page last) */
async function slotWrite(save, chk, i, warn) {
  const ss = paraSlots(), rom = state.ctx.rom, ed = dv.d.info.edition;
  if (!ss) return;
  if ((ss.f.flags & F.F_NEON_SAVES) && !chk.complete) {
    devRender(t('devErr', { e: t('neonSaveFull') })); return;
  }
  if (!ss.saves) {
    const set = chk.pages.get(0xEFE000), fi = F.fieldOfSettings(rom, set);
    if (fi !== i) { devRender(t('devErr', { e: t('slotField', { a: fieldName(rom, F.fieldNames(rom)[fi]) || '?', b: slotLabel(ss, i) }) })); return; }
  }
  if (!await confirmFlashOperation(t('slotSure', { n: slotLabel(ss, i) }) + (warn ? '\n\n' + warn : ''))) return;
  devWriteTask(async () => {
    const d = dv.d, f = ss.f, [a, b] = SV.region(ed);
    const mine = rom.subarray(f.off + 0x140, f.off + 0x140 + 620), dev = (await d.read(f.off, 0x1000)).subarray(0x140, 0x140 + 620);
    for (const o of [0, 4, 8, 12, 16, 36, 364, 368, ...(f.version >= 11 ? [612, 616] : [])]) if (mine[o] !== dev[o] || mine[o + 1] !== dev[o + 1] || mine[o + 2] !== dev[o + 2] || mine[o + 3] !== dev[o + 3]) throw new Error(t('slotDevOther'));
    const img = new Uint8Array(0x1000000).fill(0xFF);
    if (f.flags & F.F_NEON_SAVES) {
      const from = f.slotOff - 0x2000;
      img.set(await d.read(from, 0x2000), from);
      const active = F.neonActive(img, f);
      if (active < 0 || active === i || F.neonSwitchPending(img, f)) throw new Error(t('slotDevOther'));
    }
    const heads = [];
    for (let j = 0; j < f.nslots; j++) heads.push(new Uint8Array(await d.read(F.slotAddr(f, j), 0x1000)));
    const s = F.slotBuild(chk.pages, i, a, b);
    // Keep the old destination referenced until the replacement header commits.
    const used = F.poolUsed(f, heads);
    // Sharing must compare actual device bytes, not the empty staging image.
    for (const x of used) img.set(new Uint8Array(await d.read(F.poolAddr(f, x), 0x1000)), F.poolAddr(f, x));
    const written = F.slotPlace(img, f, i, s, used);
    const data = new Map(written.slice(1).map(p => [p, img.slice(p, p + 0x1000)]));
    let w = data.size ? await d.writeSectors(data, devProg, () => dv.cancel, FL.embedded()) : 0;
    w += await d.writeSectors(new Map([[written[0], img.slice(written[0], written[0] + 0x1000)]]), devProg, () => dv.cancel, FL.embedded());
    devRender(t('slotDone', { n: slotLabel(ss, i) }));
  });
}
window.addEventListener('beforeunload', (e) => { if (dv.writing || (state.ctx && state.changed.size && state.saved !== state.changed.size)) { e.preventDefault(); e.returnValue = true; } });

populateFoodBodies();
applyLang();
setupToolNavigation('paradise', paradiseTabs);
setupToolNavigation('lab', myLabTabs);
I18n.onChange(applyLang);
devRender();
async function restoreNavigation() {
  try {
    const guideDemoLink = location.hash === '#guide-demos';
    if (guideDemoLink) showDestination('guide');
    else if (['workspace', 'guide', 'device', 'codes'].includes(navigation.view)) showDestination(navigation.view);
    restoreTab(uartToolTabs, navigation.uart);
    restoreTab(deviceTabs, navigation.device);
    if (navigation.file instanceof File && await loadRom(navigation.file, true)) {
      if (myLabRom) restoreTab(myLabTabs, navigation.lab);
      else restoreTab(paradiseTabs, navigation.paradise);
    }
    if (guideDemoLink) $('guide-demos').scrollIntoView();
  } finally {
    restoringNavigation = false;
  }
}
void restoreNavigation();
window.__paramix = state; // for tests
})();
