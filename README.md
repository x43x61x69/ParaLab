<p align="center">
  <img src="src/paralab-icon.svg" width="96" height="96" alt="ParaLab flask logo">
</p>

# ParaLab

An offline ROM Lab for **Tamagotchi Paradise** and **My Lab**. Explore characters and sprites, edit a copy of your ROM, back up saves, and prepare device updates or experimental My Lab firmware for Paradise hardware. ROMs, saves, and device keys are processed locally in your browser.

**Open ParaLab in your browser:** [https://x43x61x69.github.io/ParaLab/](https://x43x61x69.github.io/ParaLab/)

[Report a problem](https://github.com/x43x61x69/ParaLab/issues) · [Quick Start](#quick-start) · [Workspace](#workspace) · [My Lab on Paradise](#my-lab-on-paradise) · [Device Console](#device-console) · [Lab Codes](#lab-codes) · [My Lab Updates](#my-lab-updates) · [Source Layout](#source-layout) · [Credits and Licenses](#credits-and-licenses)

## Quick Start

From the repository root, build the standalone app with Node.js.

```sh
node build.js
```

1. Open `dist/ParaLab.html` in a modern desktop browser.
2. In **Workspace**, choose **Open ROM** and select a dump from your own Paradise or My Lab.
3. Browse or edit the ROM, then export a copy when you’re ready.

The language menu remembers your choice. On first use, ParaLab uses a supported browser language or defaults to English. Game names and menu terms come from the loaded ROM or item data when available. The Taiwanese Traditional Chinese interface shows reviewed Traditional names and uses OpenCC for other names in the original Chinese slot. Exports and transfers use the source data. Edition selectors use Bandai’s regional model names where available and the official international name elsewhere. The standalone app opens directly from disk and works without a connected device.

<details>
<summary>Build for a static site</summary>

```sh
node build.js --web
```

Serve the entire `dist/web/` directory, including the versioned catalog. To choose a different destination, run `node build.js --web _site/index.html`. The build places the catalog alongside the HTML. Serve the site over HTTPS or localhost for Web Serial.

</details>

## Workspace

| Tool | What you can do |
| --- | --- |
| 🎨 **Characters · All Sprites** | Browse sprites and exchange PNG sheets as ZIP files. My Lab packages the Main and Boot archives together. Keep the PNG paths and dimensions, then use **Save ROM** to export the applied edits. |
| 🎁 **Lab Items** | Browse downloaded Lab Items in a Paradise ROM, edit or export them, or queue built-in items to include when saving the ROM. |
| 🛠️ **Menu · Garden · Field** | Prepare on-device menu changes for either device, edit My Lab Garden characters, or use Paradise field tools. |
| 💾 **Names · Saves** | Edit names, export backups, or open the Save Editor for the loaded ROM. |
| 🌐 **Translate** | Convert supported ROM text to Traditional Chinese. Choose Taiwan, Hong Kong, or Standard Traditional and a glyph font. Open the exported ROM in Workspace before writing it to a device. |
| 💿 **Update File** | Create or patch a My Lab microSD update using a supported stock ROM and the matching device key. |
| 🔀 **Experimental → Porting** | Adapt a supported My Lab ROM to run on Paradise hardware. |

Open **Save Editor** next to **Device** to edit the connected device’s save, the save in the loaded ROM, or a backup file. Paradise and My Lab backups use `.sav`. ParaLab identifies the device family from the file contents. It also opens legacy Paradise `.tamasave` and My Lab `.tamastate` or `.mylabsave` backups. Load a matching ROM to see character and item previews. Download a fresh copy of the save, apply changes to the loaded ROM, or review the target and block count before writing to a connected device.

Program saves also export as `.sav`, preserving their native bytes. Older `.bin` and `.eep` saves can still be imported. If another program expects an exact filename, use that name when transferring the export.

In Neon Planets, open **Save Editor → Planet Residents** to add, replace, move or remove residents in the loaded ROM or a matching `.sav` backup. For on-device editing, enable **Tama Editor** in **Menu** before exporting the ROM. On Neon Planets, open **ParaLab → Progress → Planet Residents** to add an adult Tama, edit its appearance, move residents between planets or remove them.

In Neon Planets, open **ParaLab → Tama → Planet Travel** to let Young and Adult Tama move between unlocked planets. The switch starts off and is saved with the active game.

On Paradise ROMs with imported Neon characters, hold **A** from just before the baby evolves until the animation begins to follow the original evolution route for its field. Without **A**, the imported Neon route is automatic. Open and save an already patched ROM to update its evolution behavior.

To update the planet artwork in Tama Files on an existing Tropical or Glacier ROM with imported Neon characters, choose the original Neon Planets ROM again in **Menu** before saving.

On Paradise, open **ParaLab → Tama → Stars (Past Tamas)**. Select an empty slot to set the appearance, age and cause of death, then confirm to save. Select an occupied slot to edit appearance, age or cause of death individually.

## My Lab on Paradise

The experimental port adapts My Lab firmware to Tamagotchi Paradise hardware. It displays the center 128 × 128 pixels of the My Lab game screen and maps the Paradise wheel to supported My Lab menus.

1. In **Workspace**, open a supported My Lab v1.0.00 ROM and go to **Experimental → Porting**. If the My Lab ROM has not been prepared, select its matching `.key`.
2. Enable **Include Port in Write and Export**. Use **Save ROM** to export the port. You can optionally select an existing Paradise ROM backup to pair it with the export.
3. To install, open **Device Console → UART → ROM Transfer → Review and Write…**. On the first installation, the default **Back Up ROM** option reads the connected Paradise and pairs the download with the installation. Download and keep the backup before approving the write. **Skip Backup** installs the port and overwrites the current Paradise firmware and saves without creating a backup.

To update an existing v0.1.89 port, open its exported ROM in ParaLab v0.2.1 or later. Workspace recognizes **My Lab on Paradise**, reuses the Paradise backup pairing stored in the ROM, and prepares the update for writing over UART. When updating an installed port, **Keep saves** and **Only write changes** are enabled by default. **Keep saves** preserves the live game, Garden, and save slots.

> [!NOTE]
> This port has been tested on Paradise hardware, in an emulator, and in host-side write simulations. Keep the original ROM backup for recovery. Hold **C** while pressing the rear **Reset** button to enter ParaLab recovery.

## Device Console

| Tool | What you can do |
| --- | --- |
| 🔌 **ROM Transfer** | Connect with a USB-UART adapter. Use **Read ROM** or **Quick Read ROM** to save a backup, or **Review and Write…** to check the prepared image and target before writing. |
| 💾 **Save Backup & Restore** | Read or restore supported saves over UART. |
| 📦 **Downloaded Lab Items** | Use **Read Lab Items** to preview, edit, or export items. Choose **Add from Lab Item Catalog…** to install selected items directly through a connected Flash Tool. |
| 🕒 **Device Clock** | Read the device time in Flash Tool. With a writable Flash Tool, set a date and time manually or sync to the computer’s local time, then return to the game. |
| 🤝 **Playdate** | Choose a ROM character, import a character file, or reuse a visitor saved in your browser. Use the hidden-character presets to track visits from different editions. Select an adult visitor to try a breeding Playdate. |
| 🎁 **Send Gift · Send Lab Item** | Browse gifts by Paradise edition or preview Lab Items and edit their prices before sending. |

**Quick Read ROM** compares the connected flash with the original 16 MB ROM open in Workspace. It transfers only differing 4 KiB sectors and saves a complete `.bin` backup, including the device's current saves. Paradise editions can share a base. Native My Lab and My Lab on Paradise each require their own matching firmware family.

> [!IMPORTANT]
> For UART ROM or save operations, check the adapter pins before connecting. Back up your ROM and saves before writing, and keep the device powered throughout the write.

### Send a Gift

Choose a gift for your Paradise edition. Gift Details lists the Shop Code and purchase information for supported items. To exchange a gift, open **Connect → Gift** on your device and press **B**. Select **Send Gift**, choose your USB-UART adapter, and follow the device prompts.

### Edit or Send a Lab Item

Choose a catalog card, open a 16 KiB `.arc2` or ARC2-format `.bin`, or load a folder of items. Edit the nine device-language names and the prices individually or apply **Buy 0 / Sell 9999**. To change the artwork, select a frame and choose **Export PNG** or **Replace PNG…**. Use the original dimensions and fully opaque or transparent pixels. **Download ARC2 Copy** exports the edited item with its updated checksum.

To send the item, open **Connect → Download → Download** on Paradise. Review the preview and prices in ParaLab, then select **Send Lab Item**.

To install several built-in items through Flash Tool, open **Device Console → UART → Downloaded Lab Items → Add from Lab Item Catalog…**. Select the items and choose **Write with Flash Tool**. For an item ID already installed, choose whether to overwrite its original slot or skip it. New items go into empty download slots in the active save. Restart the device when the write finishes.

For a ROM file, use **Workspace → Lab Items → Add from Lab Item Catalog…**, then choose **Save ROM**. The installed items are part of the ROM's save data. If you write with **Keep saves**, use **Downloaded Lab Items** to add the same items to the live save.

<details>
<summary>How the built-in catalogs are loaded</summary>

Built-in Lab Items live in [assets/lab-items](assets/lab-items/). To add an item, place its ARC2 archive there and add its filename at the top of [catalog.json](assets/lab-items/catalog.json). Both builds follow this display order and include identical archives once.

The gift and item tabs load their catalogs and thumbnail atlas when opened. Selecting a Lab Item loads its full ARC2 for the sprite gallery and price editor. The standalone build reads it from its embedded catalog. The static build fetches it as a separate file.

</details>

## Lab Codes

Open **Lab Codes** in the main navigation to browse 11 Paradise characters, their codes, and their raise conditions. The codes work as an offline reference. Character portraits load from the [official Tama Collection](https://tamagotchi-official.com/us/series/paradise/character/) when online. A loaded ROM supplies a local preview if the official image is unavailable.

## My Lab Updates

### 1. Prepare the UART update

Open a supported stock My Lab ROM, a dump with a supported writable UART bootstrap, or a compatible ParaLab menu ROM and go to **Update File**. Enter the device key as eight hexadecimal digits, load a text `.key` file, or choose **Find Key Automatically** to search the loaded ROM. Both update workflows share the key field.

- **Loaded ROM** creates an update from the ROM. Automatic key search runs locally in the browser.
- **Existing update file** opens a stock `MLTUPD.BIN`. Use **Patch Update with Key** to use the key already in the field, or **Choose Key and Patch Update…** to load a key and patch in one step. ParaLab authenticates the update against the loaded ROM before adding the writable UART Flash Tool.

Copy the resulting `MLTUPD.BIN` to the root of the microSD card and use the stock Settings update flow. This package installs the writable UART Flash Tool.

### 2. Install the full Menu and rescue region

1. Use **Device Console → UART → ROM Transfer → Read ROM** to back up the device and open the dump in Workspace.
2. Install the My Lab Menu using the matching device key, then export a fresh full image.
3. Open the exported image in Workspace and choose **Review and Write…** in Device Console. ParaLab verifies the image’s writable rescue region on-device before changing the main boot table. Images with the older read-only rescue are rejected.

For supported My Lab v1.0.00 dumps that already have the temporary **UART** entry, installing the full Menu replaces that entry with **ParaLab** in the Computer menu and preserves the saves in the dump. These dumps can also be used as the source for the experimental Paradise port.

> [!WARNING]
> The stock My Lab Settings update flow with `MLTUPD.BIN` and the full Menu and rescue-region install have been verified on hardware. Keep a working recovery card and a ROM backup.

### Flash a full ROM from microSD

After installing the full Menu and rescue region, place a compatible **16 MiB** My Lab ROM in the root of a **FAT16 or FAT32** card.

1. Open **Flash Tool**. Press **A** on its ready screen before starting UART communication.
2. Select the BIN with **B**. Use **A** to move between options and **B** to toggle them.
3. Review the write options, then select **Continue** and confirm. Leave the microSD card inserted throughout the update.

| Option | On by default | When turned off |
| --- | --- | --- |
| **Keep Saves** | Preserves the device’s saves. | Replaces them with the saves in the ROM. |
| **Only Write Changes** | Programs eligible sectors that differ. | Rewrites every eligible sector. |

The updater checks the ROM and the installed rescue region, then verifies each sector it programs. Packaged `MLTUPD.BIN` updates use the stock Settings update flow.

### Back up saves to microSD

**Save backup to SD** shows separate progress bars for reading the save, writing the card, and verifying the card. Flash Tool reads each batch back before publishing the file in the card root.

The filename uses the device clock, for example `ML0-YYYYMMDD-HHMMSS-00.sav`. The digit after `ML` identifies the active game (`0`) or save slot (`1` or `2`). The last two digits distinguish backups made in the same second. Flash Tool uses a shorter numbered filename when the clock is unavailable. Older My Lab backups can be imported under their original filenames.

## Source Layout

| Path | Contents |
| --- | --- |
| [`src/`](src/) | Browser interface and ROM modules |
| [`feld/`](feld/) | On-device ParaLab Menu |
| [`flash/`](flash/) | Flash Tool and UART entry |
| [`six/`](six/) | Paradise field and My Lab helper code |

After editing firmware sources, rebuild the on-device binaries before running `node build.js`. The build scripts are in [`feld/src/feld/`](feld/src/feld/) and [`flash/src/`](flash/src/) and require Clang, LLD, and LLVM objcopy.


## Credits and Licenses

| Contribution | Attribution |
| --- | --- |
| ROM workspace, on-device menu, and Flash Tool | [Paramix Studio by mameise](https://github.com/mameise/Paramix-Studio) and its contributors |
| Traditional Chinese ROM conversion | [tamagotchi-paradise-zh-patcher by sawaYch](https://github.com/sawaYch/tamagotchi-paradise-zh-patcher) and [x43x61x69’s My Lab fork](https://github.com/x43x61x69/tamagotchi-paradise-zh-patcher) |
| Translation dictionaries and glyphs | OpenCC dictionaries, Cubic 11, and Fusion Pixel. See the [included license notices](third_party/zh_js/). |

ParaLab is maintained by **x43x61x69** and licensed under [GPL-3.0-or-later](LICENSE). The settings code also carries an [MIT notice](licenses/paradise-zh-patcher-MIT.txt).

ParaLab is an unofficial fan project intended for personal, non-commercial use. The GPL permits commercial use of the covered code. Rights to third-party trademarks, artwork, characters, and game ROMs remain with their respective owners. Bring your own ROMs, saves, and device keys. Tamagotchi is a trademark of Bandai and its affiliates.
