#!/usr/bin/env node
// Build = assemble build/ from the static extension/ assets plus the
// generated run.js, and regenerate the bookmarklet artifacts. No bundler.
// build/ is gitignored; CI runs this to produce the artifact. Run: `node build.mjs`
import { readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";

const SRC = "bookmarklet/bookmarklet-source.js";

// 0) assemble static extension files (manifest, icons, fonts, popup, customize.js)
rmSync("build", { recursive: true, force: true });
cpSync("extension", "build", { recursive: true });

const css = readFileSync("bookmarklet/styles.css", "utf8");

// inline styles.css into the `const CSS = __CSS__;` placeholder
const src = readFileSync(SRC, "utf8").replace("__CSS__", JSON.stringify(css));

// 1) generated extension entry
writeFileSync("build/run.js", src);

// 2) bookmarklet javascript: URL
const url = "javascript:" + encodeURIComponent(src);
writeFileSync("bookmarklet/bookmarklet.txt", url);

// 3) drag-to-install page (swap the href in place)
const esc = url
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");
const html = readFileSync("bookmarklet/install.html", "utf8")
  .replace(/href="javascript[^"]*"/, `href="${esc}"`);
writeFileSync("bookmarklet/install.html", html);

console.log(`built: build/ (from extension/ + run.js), bookmarklet.txt (${url.length} chars), install.html`);
console.log("icons: cd extension/icons && for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o icon-$s.png; done");
