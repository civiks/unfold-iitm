/* Show every IITM quiz question at once in a bottom sheet. The live
   app-assessment-question owns the form state, so the sheet is a mirror:
   answers are replayed on it. Source of truth for build/run.js + bookmarklet. */
(async () => {
  "use strict";

  // ── Selectors / config ──────────────────────────────────────────────────
  const SEL = {
    chip: "div.chips button.chip",
    chips: "div.chips",
    question: "app-assessment-question",
    view: "app-assessment-question-view",
    option: "[role=radio],[role=checkbox]",
    text: "textarea,input[type=text],input[type=number]",
    save: "app-save-status",
    timer: "app-submission-timer",
  };
  const SETTLE_MS = 700; // fallback pause if no save-status element is present
  const SAVE_TIMEOUT = 9000; // give up waiting for "Saved" after this long
  const DEFAULT_SHORTCUT = "Alt+Q";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const liveQ = () => $(SEL.question);
  const chips = () => $$(SEL.chip);
  const isQuiz = () => !!$(SEL.chips) && !!liveQ();

  // ── Styles ──────────────────────────────────────────────────────────────
  const CSS = __CSS__;

  const ensureStyle = () => {
    $("#saq-style")?.remove();
    const s = document.createElement("style");
    s.id = "saq-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  };

  // Settle after a chip click: text either changed from prev, or went stable.
  const sig = () => (liveQ()?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);

  const waitReady = async (prev) => {
    let last = null, steady = 0;
    for (let i = 0; i < 60; i++) {
      await sleep(50);
      const s = sig();
      if (!s) { steady = 0; last = s; continue; }
      if (s !== prev) { await sleep(40); return sig(); } // switched → done fast
      if (s === last) { if (++steady >= 2) return s; } else steady = 0; // stable → done
      last = s;
    }
    return sig();
  };

  // Safety-critical: poll app-save-status (don't guess a delay) so a slow
  // connection can't drop an answer before it commits.
  const isSaved = (t) => {
    t = t.toLowerCase();
    return t.includes("saved") && !t.includes("unsaved") && !t.includes("saving");
  };
  const waitSaved = async () => {
    const el = $(SEL.save);
    if (!el) { await sleep(SETTLE_MS); return true; }
    await sleep(200); // let the status flip out of a stale "Saved" first
    const start = Date.now();
    while (Date.now() - start < SAVE_TIMEOUT) {
      if (isSaved(el.textContent)) return true;
      await sleep(100);
    }
    return false; // timed out — surfaced to the user as a warning
  };

  // Label by e.code (physical key), so e.g. macOS Option+Q resolves to "Q".
  const keyName = (e) => {
    const c = e.code || "";
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return "Num" + c.slice(6);
    if (/^F\d{1,2}$/.test(c)) return c;
    const names = {
      Space: "Space",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
      Escape: "Esc",
    };
    if (names[c]) return names[c];
    const k = e.key || "";
    return k.length === 1 ? k.toUpperCase() : k;
  };
  const shortcutFromEvent = (e) => {
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";
    const key = keyName(e);
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    if (!parts.length && !/^F\d{1,2}$/.test(key)) return "";
    parts.push(key);
    return parts.join("+");
  };
  const isTypingTarget = (el) =>
    !!el?.closest?.("input, textarea, select, [contenteditable=true], [contenteditable='']");

  // ── Capture every question's HTML ───────────────────────────────────────
  const overlay = {
    el: null,
    bar: null,
    count: null,
    show() {
      const el = document.createElement("div");
      el.id = "saq-overlay";
      el.innerHTML = `<div class="saq-card">
        <div class="saq-card-row">
          <div class="saq-spinner"></div>
          <span>Loading questions</span>
          <span class="saq-count">0/0</span>
        </div>
        <div class="saq-track"><div class="saq-bar"></div></div>
      </div>`;
      document.body.appendChild(el);
      this.el = el;
      this.bar = $(".saq-bar", el);
      this.count = $(".saq-count", el);
    },
    progress(done, total) {
      if (this.count) this.count.textContent = `${done}/${total}`;
      if (this.bar) this.bar.style.transform = `scaleX(${total ? done / total : 0})`;
    },
    async hide() {
      if (!this.el) return;
      this.el.setAttribute("data-leaving", "");
      await sleep(200);
      this.el.remove();
      this.el = null;
    },
  };

  // Header "Question N / TOTAL" — verify we captured all (chips can be windowed).
  const totalQuestions = () => {
    const m = ($(SEL.view)?.textContent || "").match(/Question\s+\d+\s*\/\s*(\d+)/i);
    return m ? +m[1] : null;
  };

  let captureWarning = ""; // surfaced in the sheet header when non-empty

  const captureAll = async () => {
    reviewMode = isReview(); // post-deadline results view (read-only + scores)
    const list = chips();
    const wasActive = list.findIndex((c) => c.classList.contains("active"));
    const snaps = [];
    let prev = sig();
    for (let i = 0; i < list.length; i++) {
      overlay.progress(i, list.length);
      list[i].click();
      prev = await waitReady(prev);
      snaps.push(liveQ() ? grabQuestion() : { stem: "", opts: "" });
    }
    overlay.progress(list.length, list.length);
    if (wasActive >= 0) { const p = sig(); list[wasActive].click(); await waitReady(p); }

    const total = totalQuestions();
    captureWarning =
      total && total !== snaps.length
        ? `Captured ${snaps.length} of ${total} questions — some may be missing. Use the original quiz to be safe.`
        : "";
    return snaps;
  };

  // Prompt is rendered into .backend-html OUTSIDE the component (which holds only
  // the answer controls), so capture stem + opts separately to keep math intact.
  let snaps = []; // [{ stem, opts }]

  const isEscapedHtml = (el) =>
    el.children.length === 0 && /<[a-z!/][^>]*>/i.test(el.textContent);

  // Post-deadline the question is wrapped in .evaluated-answer (score + feedback).
  // Capture that panel; the sheet is read-only in this mode.
  let reviewMode = false;
  const isReview = () =>
    !!$(".evaluated-answer") ||
    /Answer is (Correct|Incorrect)|Score\s*:\s*\d/.test($(SEL.view)?.textContent || "");

  const lowestCommonAncestor = (a, b) => {
    const anc = new Set();
    for (let n = a; n; n = n.parentElement) anc.add(n);
    for (let n = b; n; n = n.parentElement) if (anc.has(n)) return n;
    return null;
  };

  // The evaluated result panel (review mode only).
  const resultPanel = () =>
    liveQ()?.closest(".evaluated-answer, .panel.right-panel, .cell") || null;

  const grabStem = () => {
    const view = $(SEL.view);
    const q = liveQ();
    const rp = reviewMode ? resultPanel() : null; // keep feedback out of the stem
    const seen = new Set();
    const stems = $$(".backend-html", view)
      .filter((el) => !q.contains(el) && !(rp && rp.contains(el)))
      .map((el) => el.outerHTML)
      .filter((h) => !seen.has(h) && seen.add(h)); // drop responsive duplicates
    if (stems.length) return stems.join("");
    const leg = q.querySelector("legend,.choices-legend");
    return leg ? `<div>${isEscapedHtml(leg) ? leg.textContent : leg.innerHTML}</div>` : "";
  };

  // Typed text lives in .value, not serialized HTML — bake it in so the
  // re-snapshot keeps what the user entered.
  const bakeValues = (root) =>
    $$(SEL.text, root).forEach((t) => {
      if (t.tagName === "TEXTAREA") t.textContent = t.value;
      else t.setAttribute("value", t.value);
    });

  const grabOpts = () => {
    const q = liveQ();
    if (!reviewMode) { bakeValues(q); return q.innerHTML; }
    // Prefer the evaluated panel (banner + options + "Correct" + feedback).
    const rp = resultPanel();
    if (rp) return rp.outerHTML;
    // Fallback: the smallest common ancestor of the banner and the options.
    const banner = $$("*", $(SEL.view))
      .filter((e) => /Answer is (Correct|Incorrect)|Score\s*:/.test(e.textContent) && !e.contains(q))
      .sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
    return (banner ? lowestCommonAncestor(banner, q) : q).outerHTML;
  };

  const grabQuestion = () => ({ stem: grabStem(), opts: grabOpts() });

  const fillBlock = (block, i) => {
    block.innerHTML =
      `<div class="saq-qlabel">Question ${i + 1}</div>` +
      `<div class="saq-stem">${snaps[i].stem}</div>` +
      snaps[i].opts;
    // Drop feedback sections that have only the "Feedback" label and no body.
    block.querySelectorAll(".feedback").forEach((fb) => {
      const title = fb.querySelector(".title");
      const body = fb.textContent.replace(title?.textContent || "", "").trim();
      if (!body) fb.remove();
    });
  };

  const ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    launch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  // Render the question blocks into the sheet's scroll area.
  const renderBlocks = (scroll) => {
    const inner = document.createElement("div");
    inner.className = "saq-inner";
    snaps.forEach((_, i) => {
      const b = document.createElement("div");
      b.className = "saq-block";
      b.id = "saq-q-" + i;
      b.dataset.q = i;
      b.style.animationDelay = Math.min(i, 8) * 40 + "ms";
      fillBlock(b, i);
      inner.appendChild(b);
    });
    scroll.replaceChildren(inner);
  };

  // Compact pref (popup toggle) — applied as a class so it's live, no rebuild.
  let compact = false;
  const applyPrefs = (sheet = $("#saq-sheet")) => {
    if (sheet) sheet.classList.toggle("saq-compact", compact);
  };

  const buildSheet = () => {
    const sheet = document.createElement("div");
    sheet.id = "saq-sheet";
    applyPrefs(sheet);
    const warn = captureWarning
      ? `<div class="saq-warn">${ICON.warn}<span>${captureWarning}</span></div>`
      : "";
    sheet.innerHTML = `
      <div class="saq-grip" title="Drag down to dismiss"></div>
      <div class="saq-header">
        <span class="saq-title">All Questions</span>
        <span class="saq-count-pill">${snaps.length}</span>
        ${reviewMode ? '<span class="saq-tag">Results</span>' : ""}
        <div class="saq-actions">
          <span class="saq-clock" title="Time remaining">${ICON.clock}<span class="saq-clock-val"></span></span>
          <button class="saq-btn saq-icon" data-act="print" title="Print / Save as PDF">${ICON.print}</button>
          <button class="saq-btn" data-act="refresh">${ICON.refresh}<span>Refresh</span></button>
          <button class="saq-btn saq-icon" data-act="dismiss" title="Close">${ICON.close}</button>
        </div>
      </div>
      ${warn}
      <div class="saq-scroll"></div>`;
    renderBlocks($(".saq-scroll", sheet));
    // Listen on the whole sheet so header actions fire too, not just the scroll area.
    sheet.addEventListener("click", onClick, true);
    sheet.addEventListener("change", onChange, true);
    wireDrag($(".saq-grip", sheet), sheet);
    return sheet;
  };

  // Mirror the live timer into the header (copy text on an interval) so it stays
  // visible behind the backdrop.
  let clockTimer = null;
  const startClock = () => {
    stopClock();
    const tick = () => {
      const wrap = $(".saq-clock");
      const val = $(".saq-clock-val");
      if (!wrap || !val) return;
      const txt = ($(SEL.timer)?.textContent || "").replace(/\s+/g, " ").trim();
      val.textContent = txt;
      wrap.style.display = txt ? "" : "none";
    };
    tick();
    clockTimer = setInterval(tick, 500);
  };
  const stopClock = () => { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } };

  // ── Proxy: replay an answer on the live component, then flush + re-snapshot
  let queue = Promise.resolve();
  let suppressScroll = false;

  const proxy = (qi, idx, sel, apply, full) => {
    queue = queue
      .then(async () => {
        const stack = $(".saq-scroll");
        const block = $("#saq-q-" + qi);
        const list = chips();
        suppressScroll = true;
        const scrollTop = stack.scrollTop;
        block.classList.add("is-syncing");

        const before = sig();
        list[qi].click();
        await waitReady(before);
        const target = $$(sel, liveQ())[idx];

        let saved = true;
        if (target) {
          apply(target);
          saved = await waitSaved(); // wait for the app to confirm the answer
        }

        snaps[qi] = grabQuestion();
        fillBlock(block, qi);

        const flush = qi === 0 ? (list[1] ? 1 : 0) : 0; // commit via navigate-away
        if (flush !== qi) { list[flush].click(); saved = (await waitSaved()) && saved; }

        // Text answers only serialize their value after the navigate-away round
        // trip — re-snapshot once we come back so the field isn't left blank.
        if (full && flush !== qi) {
          const p = sig();
          list[qi].click();
          await waitReady(p);
          snaps[qi] = grabQuestion();
          fillBlock(block, qi);
          const back = sig();
          list[flush].click();
          await waitReady(back);
        }

        block.classList.toggle("saq-unsaved", !saved); // red flag if it never saved
        block.classList.remove("is-syncing");
        stack.scrollTop = scrollTop;
        await sleep(50);
        stack.scrollTop = scrollTop;
        suppressScroll = false;
      })
      .catch((e) => console.warn("[SAQ]", e));
  };

  function onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (btn) {
      e.preventDefault();
      if (btn.dataset.act === "refresh") refresh();
      else if (btn.dataset.act === "print") window.print();
      else dismiss();
      return;
    }
    const block = e.target.closest("[data-q]");
    if (!block || e.target.closest(SEL.text)) return;
    if (reviewMode) return; // results view is read-only — no proxying
    const qi = +block.dataset.q;

    // Radio / checkbox option — match by index against the identical snapshot.
    const opt = e.target.closest(SEL.option);
    if (opt && block.contains(opt)) {
      e.preventDefault();
      e.stopPropagation();
      proxy(qi, $$(SEL.option, block).indexOf(opt), SEL.option, (t) => t.click());
      return;
    }
    // Any other action button (e.g. "Clear Selection") — proxy it too.
    const action = e.target.closest("button,[role=button]");
    if (action && block.contains(action)) {
      e.preventDefault();
      e.stopPropagation();
      const all = "button,[role=button]";
      proxy(qi, $$(all, block).indexOf(action), all, (t) => t.click());
    }
  }

  function onChange(e) {
    if (reviewMode) return; // results view is read-only
    const block = e.target.closest("[data-q]");
    if (!block || !e.target.matches(SEL.text)) return;
    const qi = +block.dataset.q;
    const idx = $$(SEL.text, block).indexOf(e.target);
    const value = e.target.value;
    proxy(qi, idx, SEL.text, (t) => {
      Object.getOwnPropertyDescriptor(t.constructor.prototype, "value").set.call(t, value);
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.dispatchEvent(new Event("change", { bubbles: true }));
      t.dispatchEvent(new Event("blur", { bubbles: true }));
    }, true);
  }

  // ── Drag-to-dismiss (grip / sheet header) ────────────────────────────────
  function wireDrag(grip, sheet) {
    let start = null;
    const onMove = (e) => {
      if (!start) return;
      const dy = Math.max(0, e.clientY - start.y);
      sheet.style.transform = `translateY(${dy}px)`;
      const bd = $("#saq-backdrop");
      if (bd) bd.style.opacity = String(Math.max(0, 1 - dy / (innerHeight * 0.6)));
    };
    const onUp = (e) => {
      if (!start) return;
      const dy = Math.max(0, e.clientY - start.y);
      const velocity = dy / Math.max(1, Date.now() - start.t);
      grip.releasePointerCapture?.(e.pointerId);
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      sheet.classList.remove("is-dragging");
      sheet.style.transform = "";
      const bd = $("#saq-backdrop");
      if (bd) bd.style.opacity = "";
      start = null;
      if (dy > 140 || velocity > 0.55) dismiss(); // flick or far enough
    };
    grip.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      start = { y: e.clientY, t: Date.now() };
      sheet.classList.add("is-dragging");
      grip.setPointerCapture?.(e.pointerId);
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
    });
  }

  // ── Open / dismiss ───────────────────────────────────────────────────────
  const removeAll = () => {
    stopClock();
    ["#saq-backdrop", "#saq-sheet", "#saq-launcher", "#saq-overlay", "#saq-style"]
      .forEach((s) => $(s)?.remove());
  };

  const dismiss = () => {
    stopClock(); // the live timer is visible again once the backdrop is gone
    $("#saq-sheet")?.classList.remove("is-open");
    $("#saq-backdrop")?.classList.remove("is-open");
    $("#saq-launcher")?.classList.add("is-shown");
  };

  // Animate the already-built sheet into view. Instant — no recapture.
  const show = () => {
    const backdrop = $("#saq-backdrop"), sheet = $("#saq-sheet");
    if (!backdrop || !sheet) return;
    $("#saq-launcher")?.classList.remove("is-shown");
    startClock(); // mirror the live timer while the backdrop covers it
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      sheet.classList.add("is-open");
    });
  };

  // Capture fresh, (re)build the sheet, and show it. Used on first run and on
  // explicit Refresh only — NOT on every reopen.
  const rebuild = async () => {
    $("#saq-sheet")?.remove();
    $("#saq-backdrop")?.remove();
    overlay.show();
    snaps = await captureAll();
    await overlay.hide();

    const backdrop = document.createElement("div");
    backdrop.id = "saq-backdrop";
    backdrop.addEventListener("click", dismiss);
    document.body.append(backdrop, buildSheet());
    show();
  };

  // Launcher: reopen the existing sheet instantly; only capture if it's gone.
  const reopen = () => ($("#saq-sheet") ? show() : rebuild());

  const ensureLauncher = () => {
    if ($("#saq-launcher")) return;
    const b = document.createElement("button");
    b.id = "saq-launcher";
    b.className = "saq-launcher";
    b.dataset.pos = launcherPos;
    b.innerHTML = `${ICON.launch}<span>All Questions</span>`;
    b.addEventListener("click", reopen);
    document.body.appendChild(b);
  };

  const refresh = rebuild; // the Refresh button re-captures on demand

  // Settings state; storage updates these live in the extension build.
  let enabled = true; // master toggle; off → tear everything down
  let autoLauncher = true; // off → wait for manual open
  let openShortcutEnabled = true;
  let openShortcut = DEFAULT_SHORTCUT;
  let launcherPos = "bottom-center";

  // Esc dismisses; the configured shortcut opens the all-questions sheet.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#saq-sheet")?.classList.contains("is-open")) dismiss();
    if (!enabled || !openShortcutEnabled || !openShortcut || e.repeat || isTypingTarget(e.target)) return;
    if (shortcutFromEvent(e) !== openShortcut || !isQuiz()) return;
    e.preventDefault();
    e.stopPropagation();
    window.__saqOpen();
  }, true);

  // ── Auto-detect ──────────────────────────────────────────────────────────
  // Show the launcher when a quiz is on the page; tear down when it's gone.
  const detect = () => {
    if (!enabled) { removeAll(); return; }
    if (isQuiz()) {
      if (!autoLauncher && !$("#saq-sheet")) return; // user opted out of auto-show
      ensureStyle();
      ensureLauncher();
      if (!$("#saq-sheet")) $("#saq-launcher")?.classList.add("is-shown");
    } else if ($("#saq-launcher") || $("#saq-sheet")) {
      removeAll();
    }
  };

  // Manual entry point used by the toolbar button and the bookmarklet.
  window.__saqOpen = () => {
    if (!isQuiz()) { alert("Open a quiz (with the numbered questions) first."); return; }
    ensureStyle();
    ensureLauncher();
    reopen();
  };

  // SPA-navigation observer, once per page (debounced).
  if (!window.__saqDetect) {
    window.__saqDetect = true;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(detect, 250); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  // Settings (extension only; page world has no chrome.storage → defaults stick).
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get({ enabled: true, autoLauncher: true, compact: false, openShortcutEnabled: true, openShortcut: DEFAULT_SHORTCUT, launcherPos: "bottom-center" }, (v) => {
        enabled = v.enabled; autoLauncher = v.autoLauncher; compact = v.compact;
        openShortcutEnabled = v.openShortcutEnabled; openShortcut = v.openShortcut; launcherPos = v.launcherPos;
        detect(); applyPrefs();
      });
      chrome.storage.onChanged?.addListener((c) => {
        if (c.enabled) { enabled = c.enabled.newValue; detect(); }
        if (c.autoLauncher) { autoLauncher = c.autoLauncher.newValue; detect(); }
        if (c.compact) { compact = c.compact.newValue; applyPrefs(); }
        if (c.openShortcutEnabled) { openShortcutEnabled = c.openShortcutEnabled.newValue; }
        if (c.openShortcut) { openShortcut = c.openShortcut.newValue; }
        if (c.launcherPos) { launcherPos = c.launcherPos.newValue; const l = $("#saq-launcher"); if (l) l.dataset.pos = launcherPos; }
      });
    }
  } catch {}

  detect();

  // Bookmarklet / console use (page world, no extension APIs): open immediately.
  const inExtension = (() => { try { return !!chrome?.runtime?.id; } catch { return false; } })();
  if (!inExtension && isQuiz()) reopen();
})();
