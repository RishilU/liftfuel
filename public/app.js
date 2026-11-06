import { $, esc, S, api, flushOutbox, outbox, saveSetting, offlineOk, cache, ACTIONS, CHANGES, hooks, toast, closeSheet, ymd, go, loadOverview, loadRange } from "./lib.js";
import { DEFAULT_PROFILE } from "./targets.js";
import { defaultRoutine } from "./routine.js";
import { applyTheme, enterAnim, countUps } from "./fx.js";
import { renderEat, loadFood } from "./eat.js";
import { renderCook } from "./cook.js";
import { renderTrain, loadToday, flushQueue } from "./train.js";
import { renderProgress, loadBody } from "./progress.js";
import { renderProfile } from "./profile.js";
import { renderSettings, openOnboarding } from "./settings.js";
import { renderDish } from "./dish.js";
import "./extras.js";

const VIEWS = { eat: renderEat, cook: renderCook, train: renderTrain, progress: renderProgress, profile: renderProfile, settings: renderSettings, dish: renderDish };

// screen stays on while you are on today's workout (the browser drops the lock whenever the app is hidden; the next render asks again)
async function keepAwake(on) {
  try {
    if (on && !S.wlTrain && navigator.wakeLock) { S.wlTrain = await navigator.wakeLock.request("screen"); S.wlTrain.addEventListener("release", () => { S.wlTrain = null; }); }
    else if (!on && S.wlTrain) { const l = S.wlTrain; S.wlTrain = null; await l.release(); }
  } catch { S.wlTrain = null; }
}

async function render() {
  document.querySelectorAll("#tabs button").forEach((b) => { const on = b.dataset.tab === (S.tab === "dish" ? "eat" : S.tab); b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  keepAwake(S.tab === "train" && S.trainTab === "today" && S.profile.ui?.awake !== "off");
  try { await VIEWS[S.tab](); }
  catch (e) { $("#view").innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn primary" data-act="retry">Try again</button></div>`; }
  const nav = `${S.tab}|${S.trainTab}|${S.cookTab}`; // animate when you move to a different screen, not on every tap
  if (nav !== S.lastNav) { S.lastNav = nav; enterAnim(); countUps(); }
}
hooks.render = render;
ACTIONS.retry = () => {};

document.addEventListener("click", async (ev) => {
  if (ev.target.id === "sheet") { closeSheet(); return; }
  const t = ev.target.closest("[data-tab],[data-act]");
  if (!t) return;
  let skip = false;
  try {
    if (t.dataset.tab) go(t.dataset.tab);
    else skip = (await ACTIONS[t.dataset.act](t, t.closest("[data-ex]"))) === false;
  } catch (e) { toast(e.message); }
  if (!skip) render();
});

document.addEventListener("change", async (ev) => {
  const el = ev.target, name = el.dataset.change;
  if (!name || !CHANGES[name]) return;
  try { await CHANGES[name](el); } catch (e) { toast(e.message); }
  if ($("#sheet").hidden) render();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeSheet();
  if (ev.key === "Enter" && ev.target.dataset?.enter) {
    Promise.resolve(ACTIONS[ev.target.dataset.enter](ev.target, null)).then((r) => r !== false && render()).catch((e) => toast(e.message));
  }
});

// ---------- rest timer ----------
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
ACTIONS.restAdd = (t) => { S.rest.end += Number(t.dataset.d) * 1000; S.rest.total += Number(t.dataset.d); return false; };
ACTIONS.restSkip = () => { S.rest = null; return false; };
setInterval(() => {
  const el = $("#rest");
  document.body.classList.toggle("resting", !!S.rest);
  if (!S.rest) { el.hidden = true; return; }
  const left = Math.ceil((S.rest.end - Date.now()) / 1000);
  if (left <= 0) { S.rest = null; el.hidden = true; document.body.classList.remove("resting"); toast("Rest is over. Next set! 💪"); navigator.vibrate?.(300); return; }
  el.hidden = false;
  el.innerHTML = `<div class="restbar"><div><span class="dim">Rest</span> <b class="big">${mmss(left)}</b></div>
    <div class="row"><button class="btn" data-act="restAdd" data-d="30">+30s</button><button class="btn" data-act="restSkip">Skip</button></div>
    <i class="rp" style="width:${Math.max(0, (left / S.rest.total) * 100)}%"></i></div>`;
}, 500);

// A home-screen app can stay open overnight: reload when the date changes.
const sync = async () => {
  try {
    const n = await flushOutbox();
    if (n) { await Promise.all([loadFood(), loadBody()]); toast(`Synced ${n} item${n > 1 ? "s" : ""} ✓`); }
    await flushQueue();
    hooks.render();
  } catch {}
};
document.addEventListener("visibilitychange", () => { if (!document.hidden && ymd() !== S.today) location.reload(); else if (!document.hidden) sync(); });
addEventListener("online", () => { S.rangeSets = null; sync(); });
const offline = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", offline); addEventListener("offline", offline);

// ---------- boot ----------
try { S.profile.ui = JSON.parse(localStorage.getItem("ui") ?? "null") ?? undefined; } catch {}
applyTheme(); // use the saved look right away, before anything loads

(async () => {
  try {
    try { S.settings = await api("/api/settings"); cache.set("settingsCache", S.settings); }
    catch (e) { const c = e.offline && cache.get("settingsCache", null); if (!c) throw e; S.settings = c; }
    for (const o of outbox()) if (o.path === "/api/settings") S.settings[o.body.key] = o.body.value; // changes made with no signal win over the saved copy
    const j = (k, d) => (S.settings[k] ? JSON.parse(S.settings[k]) : d);
    S.profile = { ...DEFAULT_PROFILE, ...j("profile", {}) };
    S.routine = j("routine", null) ?? defaultRoutine("hyp5");
    S.prefs = { states: {}, custom: [], ...j("prefs", {}) };
    S.plan = j("plan", null); S.pantry = j("pantry", []); S.water = j("water", {});
    // water used to be counted in cups
    if (S.settings.waterUnit !== "oz") { S.water = Object.fromEntries(Object.entries(S.water).map(([d, c]) => [d, c * 8])); await saveSetting("water", S.water); await api("/api/settings", { method: "PUT", body: { key: "waterUnit", value: "oz" } }); S.settings.waterUnit = "oz"; } S.saved = j("saved", []); S.mymeals = j("mymeals", []);
    S.supps = { list: ["Creatine", "Vitamin D", "Vitamin B12"], log: {}, ...j("supps", {}) }; S.favs = j("favs", []); S.cardio = j("cardio", []);
    S.cook = { ...S.cook, ...j("cook", {}) };
    applyTheme();
    try { localStorage.setItem("ui", JSON.stringify(S.profile.ui ?? null)); } catch {}
    if (!S.settings.anchor) { S.settings.anchor = `${S.today}|0`; await api("/api/settings", { method: "PUT", body: { key: "anchor", value: S.settings.anchor } }); }
    await Promise.all([loadToday(), loadFood(), loadBody(), loadOverview(), loadRange(120)].map(offlineOk));
    S.intake = { ...Object.fromEntries(S.overview.food.map((r) => [r.date, r.kcal])), [S.today]: S.food.reduce((a, r) => a + r.kcal, 0) };
    offline();
    await render();
    sync();
    if (!S.settings.profile) openOnboarding();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  } catch (e) {
    $("#view").innerHTML = `<div class="card"><h2>Can't open the app</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
  }
})();
