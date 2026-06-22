// Toolbar popup: gate the quiz action on a study-domain tab, and persist every
// [data-key] toggle to chrome.storage.local (read live by run.js + customize.js).
const QUIZ_HOST = /(^|\.)(study\.iitm\.ac\.in|onlinedegree\.iitm\.ac\.in)$/i;

const openBtn = document.getElementById("open");
const mf = chrome.runtime.getManifest();

document.getElementById("ver").textContent = "v" + mf.version;
const repo = document.getElementById("repo");
if (mf.homepage_url) { repo.href = mf.homepage_url; repo.hidden = false; }

const activeTab = async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

// Settings ── every toggle declares its storage key + default via data-key/checked.
const toggles = [...document.querySelectorAll("input[data-key]")];
const store = chrome.storage?.local;
if (store) {
  const defaults = {};
  toggles.forEach((t) => (defaults[t.dataset.key] = t.defaultChecked));
  store.get(defaults, (v) => toggles.forEach((t) => (t.checked = v[t.dataset.key])));
  toggles.forEach((t) =>
    t.addEventListener("change", () => store.set({ [t.dataset.key]: t.checked }))
  );
} else {
  toggles.forEach((t) => t.closest(".row")?.remove());
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
