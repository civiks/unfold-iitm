/* Declutter / restyle the IITM portal via reversible CSS — each setting injects
   one <style> when on, removed when off. Storage-driven, so popup toggles are
   live. Quiz answering/timer/submit untouched. */
(() => {
  "use strict";
  const store = (() => { try { return chrome.storage?.local; } catch { return null; } })();
  if (!store) return; // not in the extension (e.g. bookmarklet) — nothing to do

  const url = (f) => chrome.runtime.getURL("fonts/" + f);

  // key → CSS injected while the toggle is on. All reversible, no JS/DOM surgery.
  const RULES = {
    font: `
      @font-face{font-family:'Inter';font-weight:400;font-display:swap;src:url('${url("Inter-Regular.woff2")}') format('woff2')}
      @font-face{font-family:'Inter';font-weight:500;font-display:swap;src:url('${url("Inter-Medium.woff2")}') format('woff2')}
      body, body *:not(mat-icon):not(.material-icons):not([class*="app-icon"]):not(.icon-container):not(i):not(code):not(pre):not(kbd):not(samp):not(.ace_editor):not(.ace_editor *):not(.hljs):not(.hljs *) {
        font-family:'Inter', Roboto, system-ui, sans-serif !important;
      }
      /* code stays monospace: the Ace editor and highlight.js (.hljs) blocks are
         excluded above; re-assert for plain semantic code tags too. */
      body code, body pre, body kbd, body samp, body tt {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      }
      body pre *, body code * { font-family: inherit !important; }`,
    hideBreadcrumb: `.breadcrumb { display: none !important; }`,
    hideBanner: `.info-banner { display: none !important; }`,
    // The left rail differs by page: the global icon rail (nav.app-bar) on the
    // assessment view, the unit list (.side-nav) on the course dashboard.
    hideSidebar: `nav.app-bar, .side-nav, #side-nav-content { display: none !important; }
      main.app-main { max-width: none !important; width: 100% !important; }`,
  };
  const KEYS = Object.keys(RULES);
  const defaults = Object.fromEntries(KEYS.map((k) => [k, false]));

  const apply = (key, on) => {
    const id = "saq-cz-" + key;
    let el = document.getElementById(id);
    if (on) {
      if (!el) { el = document.createElement("style"); el.id = id; (document.head || document.documentElement).appendChild(el); }
      el.textContent = RULES[key];
    } else if (el) {
      el.remove();
    }
  };

  // The master "enabled" toggle gates everything: when off, no styles are applied.
  let enabled = true;
  const all = { ...defaults, enabled: true };
  const applyAll = (v) => KEYS.forEach((k) => apply(k, enabled && v[k]));

  store.get(all, (v) => { enabled = v.enabled; applyAll(v); });
  chrome.storage.onChanged?.addListener((c) => {
    if (c.enabled) { enabled = c.enabled.newValue; store.get(all, applyAll); return; }
    KEYS.forEach((k) => { if (c[k]) apply(k, enabled && c[k].newValue); });
  });
})();
