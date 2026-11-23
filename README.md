<p align="center">
  <img src="src/paralab-icon.svg" width="96" height="96" alt="ParaLab flask logo">
</p>

# ParaLab

An offline ROM studio for **Tamagotchi Paradise** and **My Lab**. Explore characters and sprites, edit a copy of your ROM, back up saves, and prepare device updates or experimental My Lab firmware for Paradise hardware. ROMs, saves, and device keys are processed locally in your browser.

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
| 🎁 **Lab Items** | Browse downloaded Lab Items in a Paradise ROM, preview their sprites, edit prices, and export an ARC2 file or an updated ROM. |
| 🛠️ **Menu · Garden · Field** | Prepare on-device menu changes for either device, edit My Lab Garden characters, or use Paradise field tools. |
| 💾 **Names · Saves** | Edit names and saved data in the loaded ROM. |
| 🌐 **Translate** | Convert supported ROM text to Traditional Chinese. Choose Taiwan, Hong Kong, or Standard Traditional and a glyph font. Open the exported ROM in Workspace before writing it to a device. |
| 💿 **Update File** | Create or patch a My Lab microSD update using a supported stock ROM and the matching device key. |
| 🔀 **Experimental → Porting** | Adapt a supported My Lab ROM to run on Paradise hardware. |

## My Lab on Paradise

The experimental port adapts My Lab firmware to Tamagotchi Paradise hardware. It displays the center 128 × 128 pixels of the My Lab game screen and maps the Paradise wheel to supported My Lab menus.

1. Back up the full ROM and saves from your target Paradise. In **Workspace**, open a supported My Lab v1.0.00 ROM.
2. Open **Experimental → Porting** and select the target Paradise ROM backup. If the My Lab ROM has not been prepared, select its matching `.key` as well.
3. Once preparation succeeds, ParaLab selects **Include Port in Write and Export**. Use **Save ROM** to export the port, or open **Device Console → UART → ROM Transfer → Review and Write…** to install it.

To update an existing v0.1.89 port, open its exported ROM in ParaLab v0.2.1 or later. Workspace recognizes **My Lab on Paradise**, reuses the Paradise backup pairing stored in the ROM, and prepares the update for writing over UART. When updating an installed port, **Keep saves** and **Only write changes** are enabled by default. **Keep saves** preserves the live game, Garden, and save slots.

> [!NOTE]
> This port has been tested on Paradise hardware, in Capybara, and in host-side write simulations. Keep the original ROM backup for recovery. Hold **C** while pressing the rear **Reset** button to enter ParaLab recovery.

## Device Console

| Tool | What you can do |
| --- | --- |
| 🔌 **ROM Transfer** | Connect with a USB-UART adapter. Use **Read ROM** to save a backup or **Review and Write…** to check the prepared image and target before writing. |
| 💾 **Save Backup & Restore** | Read or restore supported saves over UART. |
| 📦 **Downloaded Lab Items** | Use **Read Lab Items** on a connected Paradise to preview saved items, edit prices, or export individual ARC2 files. |
| 🤝 **Playdate** | Choose a ROM character, import a character file, or reuse a visitor saved in your browser. Use the hidden-character presets to track visits from different editions. Select an adult visitor to try a breeding Playdate. |
| 🎁 **Send Gift · Send Lab Item** | Browse gifts by Paradise edition or preview Lab Items and edit their prices before sending. |

> [!IMPORTANT]
> For UART ROM or save operations, check the adapter pins before connecting. Back up your ROM and saves before writing, and keep the device powered throughout the write.

### Send a Gift

Choose a gift for your Paradise edition. Gift Details lists the Shop Code and purchase information for supported items. To exchange a gift, open **Connect → Gift** on your device and press **B**. Select **Send Gift**, choose your USB-UART adapter, and follow the device prompts.

### Edit or Send a Lab Item

Choose a catalog card, open a 16 KiB `.arc2` or ARC2-format `.bin`, or load a folder of items. Edit the nine device-language names and the prices individually or apply **Buy 0 / Sell 9999**. To change the artwork, select a frame and choose **Export PNG** or **Replace PNG…**. Use the original dimensions and fully opaque or transparent pixels. **Download ARC2 Copy** exports the edited item with its updated checksum.

To send the item, open **Connect → Download → Download** on Paradise. Review the preview and prices in ParaLab, then select **Send Lab Item**.

<details>
<summary>How the built-in catalogs are loaded</summary>

Built-in Lab Items live in [assets/lab-items](assets/lab-items/). To add an item, place its ARC2 archive there and add its filename at the top of [catalog.json](assets/lab-items/catalog.json). Both builds follow this display order and include identical archives once.

The gift and item tabs load their catalogs and thumbnail atlas when opened. Selecting a Lab Item loads its full ARC2 for the sprite gallery and price editor. The standalone build reads it from its embedded catalog. The static build fetches it as a separate file.

</details>

## Lab Codes

Open **Lab Codes** in the main navigation to browse 11 Paradise characters, their codes, and their raise conditions. The codes work as an offline reference. Character portraits load from the [official Tama Collection](https://tamagotchi-official.com/us/series/paradise/character/) when online. A loaded ROM supplies a local preview if the official image is unavailable.

## My Lab Updates

### 1. Prepare the UART update

Open a supported stock My Lab ROM and go to **Update File**. Have the matching device `.key` ready.

- **Loaded ROM** creates an update from the ROM.
- **Existing update file** opens a stock `MLTUPD.BIN`. Choose **Choose Key and Patch Update…** to authenticate it against the loaded ROM and add the writable UART Flash Tool.

Copy the resulting `MLTUPD.BIN` to the root of the microSD card and use the stock Settings update flow. This package installs the writable UART Flash Tool.

### 2. Install the full Menu and rescue region

1. Use **Device Console → UART → ROM Transfer → Read ROM** to back up the device and open the dump in Workspace.
2. Install the My Lab Menu using the matching device key, then export a fresh full image.
3. Open the exported image in Workspace and choose **Review and Write…** in Device Console. ParaLab verifies the image’s writable rescue region on-device before changing the main boot table. Images with the older read-only rescue are rejected.

> [!WARNING]
> The stock My Lab Settings update flow with `MLTUPD.BIN` has been verified on hardware. Emulator checks covered Recovery, UART launch, and one rescue-sector write and readback. A host-side simulation covered the rescue-first write sequence. Keep a working recovery card and a ROM backup.

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

The filename uses the device clock, for example `ML0-YYYYMMDD-HHMMSS-00.tamastate`. The digit after `ML` identifies the active game (`0`) or save slot (`1` or `2`). The last two digits distinguish backups made in the same second. Flash Tool uses a shorter numbered filename when the clock is unavailable. ParaLab also imports older My Lab `.SAV` backups.

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
