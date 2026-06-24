/* Declutter / restyle the IITM portal via reversible CSS — each setting injects
   one <style> when on, removed when off. Storage-driven, so popup toggles are
   live. Quiz answering/timer/submit untouched. */
(() => {
  "use strict";
  const store = (() => { try { return chrome.storage?.local; } catch { return null; } })();
  if (!store) return; // not in the extension (e.g. bookmarklet) — nothing to do

  // Portal font: a user-typed local font name (e.g. "Inter", "JetBrains Mono").
  // Empty = no override. Unresolved names fall back to system-ui. None bundled.
  const fontRule = (name) => {
    name = (name || "").trim();
    if (!name) return "";
    // Bare name is quoted; a stack (containing , " ') is passed through as-is.
    const family = /[,"']/.test(name) ? name : `"${name}"`;
    return `
      body, body *:not(mat-icon):not(.material-icons):not([class*="app-icon"]):not(.icon-container):not(i):not(code):not(pre):not(kbd):not(samp):not(.ace_editor):not(.ace_editor *):not(.hljs):not(.hljs *) {
        font-family: ${family}, system-ui, sans-serif !important;
      }
      /* code stays monospace: the Ace editor and highlight.js (.hljs) blocks are
         excluded above; re-assert for plain semantic code tags too. */
      body code, body pre, body kbd, body samp, body tt {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      }
      body pre *, body code * { font-family: inherit !important; }`;
  };

  // key → CSS injected while the toggle is on. All reversible, no JS/DOM surgery.
  const RULES = {
    hideBreadcrumb: `.breadcrumb { display: none !important; }`,
    hideBanner: `.info-banner { display: none !important; }`,
    // The left rail differs by page: the global icon rail (nav.app-bar) on the
    // assessment view, the unit list (.side-nav) on the course dashboard.
    hideSidebar: `nav.app-bar, .side-nav, #side-nav-content { display: none !important; }
      main.app-main { max-width: none !important; width: 100% !important; }`,
  };
  const KEYS = Object.keys(RULES);
  const defaults = Object.fromEntries(KEYS.map((k) => [k, false]));

  const setStyle = (id, css) => {
    let el = document.getElementById(id);
    if (css) {
      if (!el) { el = document.createElement("style"); el.id = id; (document.head || document.documentElement).appendChild(el); }
      el.textContent = css;
    } else if (el) {
      el.remove();
    }
  };
  const apply = (key, on) => setStyle("saq-cz-" + key, on ? RULES[key] : "");
  const applyFont = (name) => setStyle("saq-cz-font", fontRule(name));

  // The master "enabled" toggle gates everything: when off, no styles are applied.
  let enabled = true;
  const all = { ...defaults, enabled: true, fontName: "" };
  const applyAll = (v) => {
    KEYS.forEach((k) => apply(k, enabled && v[k]));
    applyFont(enabled ? v.fontName : "");
  };

  store.get(all, (v) => { enabled = v.enabled; applyAll(v); });
  chrome.storage.onChanged?.addListener((c) => {
    if (c.enabled) { enabled = c.enabled.newValue; store.get(all, applyAll); return; }
    if (c.fontName) applyFont(enabled ? c.fontName.newValue : "");
    KEYS.forEach((k) => { if (c[k]) apply(k, enabled && c[k].newValue); });
  });
})();
