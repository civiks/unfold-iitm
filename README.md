<img width="72px" alt="[unfold] icon" src="extension/icons/icon-128.png" />

# [unfold]

> Declutter the IITM Online Degree portal.

**[Download the latest release](../../releases/latest)**

[![CI](https://github.com/civiks/unfold-iitm/actions/workflows/ci.yml/badge.svg)](https://github.com/civiks/unfold-iitm/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/civiks/unfold-iitm?include_prereleases)](../../releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<sub>Unofficial, beta, not affiliated with IIT Madras. <a href="NAMING.md">Why "[unfold]"?</a></sub>

<img width="800px" alt="[unfold] in action" src=".github/assets/demo.gif" />

## Features

- Unfold a quiz into a single scrollable sheet
- Print or save a quiz as PDF
- Inter font
- Hide sidebar, breadcrumbs, info banners
- Compact mode
- Master on/off toggle
- Configurable keyboard shortcut

<img width="300px" alt="[unfold] popup" src=".github/assets/hero.png" />

## Install

Not on the Chrome/Firefox stores yet. Install it manually.

**Chrome / Edge / Brave**

1. Download the zip from [Releases](../../releases/latest).
2. Unzip it.
3. Open `chrome://extensions`, turn on "Developer mode" (top right).
4. Click "Load unpacked" and select the unzipped folder.

**Firefox** (140 or newer)

1. Download the zip from [Releases](../../releases/latest) (no need to unzip).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click "Load Temporary Add-on…" and pick the zip (or `manifest.json` from the unzipped folder).

Temporary add-ons are removed when Firefox restarts. If the launcher doesn't appear, open the toolbar popup and click "Allow access to the IITM portal" (or enable it under `about:addons` → [unfold] → Permissions).

No install needed? Open `bookmarklet/install.html` and drag the button to your bookmarks bar.

## Build

There's no bundler. The logic lives in `bookmarklet/bookmarklet-source.js`; the build assembles `build/` from `extension/` (the static manifest, icons, popup) plus the generated `run.js`, and regenerates the bookmarklet files. `build/` isn't committed — CI produces it as a downloadable artifact.

```bash
node build.mjs
```

Full dev and release guide: [CONTRIBUTING](.github/CONTRIBUTING.md).

## How it works

The portal shows one question at a time and owns the form state, so the sheet is a mirror. It snapshots each question and replays your answers on the live form, flushing autosave by navigating away. Prompts are captured from the rendered HTML, so math stays intact.

## Disclaimer

Beta and unofficial. It reads and replays answers on the live quiz form, so verify everything saved on the original quiz before submitting. Not affiliated with IIT Madras; "IITM" only describes what it works with.

## License

[MIT](LICENSE)
