// Toolbar popup: gate the quiz action on a study-domain tab, and persist every
// [data-key] toggle to chrome.storage.local (read live by run.js + customize.js).
const QUIZ_HOST = /(^|\.)(study\.iitm\.ac\.in|onlinedegree\.iitm\.ac\.in)$/i;
const DEFAULT_SHORTCUT = "Alt+Q";

const openBtn = document.getElementById("open");
const shortcutBtn = document.getElementById("shortcut");
const shortcutClear = document.getElementById("shortcutClear");
const shortcutEnabled = document.getElementById("shortcutEnabled");
const mf = chrome.runtime.getManifest();

document.getElementById("ver").textContent = "v" + mf.version;
const repo = document.getElementById("repo");
if (mf.homepage_url) { repo.href = mf.homepage_url; repo.hidden = false; }

const activeTab = async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

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

// Settings ── controls declare their storage key via data-key. Checkbox default
// comes from `checked`; text-input default from `data-default` (or "").
const toggles = [...document.querySelectorAll("input[type=checkbox][data-key]")];
const texts = [...document.querySelectorAll("input[type=text][data-key]")];
const selects = [...document.querySelectorAll("select[data-key]")];
const store = chrome.storage?.local;
let currentShortcut = DEFAULT_SHORTCUT;
let recordingShortcut = false;
const renderShortcut = (value = currentShortcut) => {
  currentShortcut = value || "";
  shortcutBtn.textContent = recordingShortcut ? "Press keys" : currentShortcut || "Off";
  shortcutBtn.classList.toggle("is-listening", recordingShortcut);
  const disabled = !shortcutEnabled.checked;
  shortcutBtn.disabled = disabled;
  shortcutClear.disabled = disabled;
};
const stopRecording = () => {
  recordingShortcut = false;
  window.removeEventListener("keydown", onShortcutKey, true);
  renderShortcut();
};
function onShortcutKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") { stopRecording(); return; }
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  if (e.key === "Backspace" || e.key === "Delete") {
    store.set({ openShortcut: "" });
    stopRecording();
    return;
  }
  const next = shortcutFromEvent(e);
  if (!next) {
    shortcutBtn.textContent = "Add modifier";
    setTimeout(() => renderShortcut(), 700);
    return;
  }
  store.set({ openShortcut: next });
  currentShortcut = next;
  stopRecording();
}

if (store) {
  const defaults = { openShortcut: DEFAULT_SHORTCUT };
  toggles.forEach((t) => (defaults[t.dataset.key] = t.defaultChecked));
  texts.forEach((t) => (defaults[t.dataset.key] = t.dataset.default ?? ""));
  selects.forEach((t) => (defaults[t.dataset.key] = t.value));
  store.get(defaults, (v) => {
    toggles.forEach((t) => (t.checked = v[t.dataset.key]));
    texts.forEach((t) => (t.value = v[t.dataset.key] ?? ""));
    selects.forEach((t) => (t.value = v[t.dataset.key] ?? t.value));
    renderShortcut(v.openShortcut);
  });
  toggles.forEach((t) =>
    t.addEventListener("change", () => store.set({ [t.dataset.key]: t.checked }))
  );
  texts.forEach((t) =>
    t.addEventListener("input", () => store.set({ [t.dataset.key]: t.value.trim() }))
  );
  selects.forEach((t) =>
    t.addEventListener("change", () => store.set({ [t.dataset.key]: t.value }))
  );
  shortcutBtn.addEventListener("click", () => {
    if (!shortcutEnabled.checked) return;
    if (recordingShortcut) { stopRecording(); return; }
    recordingShortcut = true;
    renderShortcut();
    window.addEventListener("keydown", onShortcutKey, true);
  });
  shortcutClear.addEventListener("click", () => {
    if (!shortcutEnabled.checked) return;
    store.set({ openShortcut: "" });
    renderShortcut("");
  });
  chrome.storage.onChanged?.addListener((c) => {
    if (c.openShortcutEnabled) {
      shortcutEnabled.checked = c.openShortcutEnabled.newValue;
      if (!shortcutEnabled.checked && recordingShortcut) stopRecording();
      renderShortcut();
    }
    if (c.openShortcut && !recordingShortcut) renderShortcut(c.openShortcut.newValue);
  });
} else {
  toggles.forEach((t) => t.closest(".row")?.remove());
  texts.forEach((t) => t.closest(".row")?.remove());
  selects.forEach((t) => t.closest(".row")?.remove());
  shortcutBtn.closest(".row")?.remove();
}

// Page gate ── enable the quiz action only on a study domain.
(async () => {
  const tab = await activeTab();
  let host = "";
  try { host = new URL(tab?.url || "").hostname; } catch {}
  if (QUIZ_HOST.test(host)) {
    openBtn.disabled = false;
  } else {
    openBtn.textContent = "Open a quiz page first";
  }
})();

openBtn.addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["run.js"] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__saqOpen && window.__saqOpen(),
    });
    window.close();
  } catch (e) {
    openBtn.textContent = "Couldn't open — reload & retry";
    console.warn("[SAQ] popup inject failed:", e);
  }
});
