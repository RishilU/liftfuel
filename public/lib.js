// Shared state and UI helpers for every screen.
import { esc, r1, avg, ymd, dayNum, e1rm } from "./util.js";
import { computeTargets, weightNow, DEFAULT_PROFILE } from "./targets.js";
export { esc, r1, avg, ymd, dayNum, e1rm };

export const $ = (s, el = document) => el.querySelector(s);
export const X = await (await fetch("/exercises.json")).json();
export const byId = Object.fromEntries(X.exercises.map((e) => [e.id, e]));

export const ACTIONS = {};  // data-act="name"      -> click handlers; return false to skip the re-render
export const CHANGES = {};  // data-change="name"   -> change handlers
export const hooks = { render: () => {} };

export const S = {
  today: ymd(), tab: "eat", settings: {}, profile: { ...DEFAULT_PROFILE }, routine: null, prefs: { states: {}, custom: [] }, plan: null,
  // eat
  food: [], recent: [], intake: {}, fq: "", fres: null, fbusy: false, dismissCheck: false,
  // cook
  cookTab: "tonight", pantry: [], cook: { diet: "chicken_ok", max_minutes: 30, min_protein: 35, max_kcal: 800, strict: false },
  recipes: null, busy: "",
  // train
  trainTab: "today", sets: [], hist: {}, extra: [], chart: null, editDay: null, group: "chest", rest: null, rangeSets: null,
  // progress
  body: [], photos: [], pdata: {}, cmpPose: "front", cmpA: null, cmpB: null, measure: "chest",
  // v3
  overview: { workoutDates: [], sets: 0, volume: 0, bests: {}, food: [], weighIns: 0, photos: 0 },
  water: {}, saved: [], mymeals: [], supps: { list: [], log: {} }, favs: [], cardio: [], daily: {}, dish: null, mealSel: null, cm: null, lastNav: "", prevTab: "eat",
};

export async function api(path, opts = {}) {
  let pass = null;
  try { pass = localStorage.getItem("pass"); } catch {}
  for (;;) {
    if (!pass) { pass = prompt("Passphrase"); if (!pass) throw new Error("A passphrase is needed to open the app."); }
    let r;
    try {
      r = await fetch(path, { method: opts.method, headers: { "x-pass": pass, "content-type": "application/json" }, body: opts.body && JSON.stringify(opts.body) });
    } catch { throw Object.assign(new Error("No connection. Check your internet and try again."), { offline: true }); }
    if (r.status === 401) { try { localStorage.removeItem("pass"); } catch {} pass = null; continue; }
    try { localStorage.setItem("pass", pass); } catch {}
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }
}

// ---------- outbox: writes made with no signal wait in the phone's storage and are sent, in order, when you are back online ----------
const OK = "outbox";
export const outbox = () => cache.get(OK, []);
// like api(), but a "no connection" failure queues the request instead of throwing. Settings are coalesced: the newest value for a key wins.
export async function apiQ(path, opts) {
  try { return await api(path, opts); }
  catch (e) {
    if (!e.offline) throw e;
    const keep = outbox().filter((o) => !(path === "/api/settings" && o.path === path && o.body.key === opts.body.key));
    const t = Date.now() + Math.random();
    cache.set(OK, [...keep, { t, path, method: opts.method, body: opts.body }]);
    return { queued: true, t };
  }
}
let flushing;
export const flushOutbox = () => (flushing ??= (async () => {
  let n = 0;
  for (const o of outbox()) {
    try { await api(o.path, { method: o.method, body: o.body }); }
    catch (e) { if (e.offline || !/^invalid|not found/.test(e.message)) break; } // a request the server rejects is dropped, not retried forever
    cache.set(OK, outbox().filter((x) => x.t !== o.t)); n++;
  }
  return n;
})().finally(() => { flushing = null; }));

export async function saveSetting(key, obj) {
  S.settings[key] = JSON.stringify(obj);
  cache.set("settingsCache", S.settings);
  await apiQ("/api/settings", { method: "PUT", body: { key, value: S.settings[key] } });
}
export const saveProfile = () => saveSetting("profile", S.profile);
export const saveRoutine = () => saveSetting("routine", S.routine);

export const currentWeight = () => weightNow(S.body, S.today);
export function targets() {
  return computeTargets(S.profile, currentWeight() ?? 155, S.routine.days.filter((d) => d.ex.length).length);
}

let toastTimer;
// undo (optional): a function that reverses what just happened; the toast then shows an Undo button for a few seconds
export function toast(msg, undo) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  S.undo = undo ?? null;
  if (undo) el.insertAdjacentHTML("beforeend", ` <button class="tundo" data-act="undo">Undo</button>`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; S.undo = null; }, undo ? 6000 : 2800);
}
ACTIONS.undo = async () => { const f = S.undo; S.undo = null; $("#toast").hidden = true; await f?.(); };
export function openSheet(html) {
  $("#sheet").innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true">${html}<button class="btn" data-act="closeSheet">Close</button></div>`;
  $("#sheet").hidden = false;
}
export function closeSheet() { $("#sheet").hidden = true; $("#sheet").innerHTML = ""; S.wl?.release?.().catch?.(() => {}); S.wl = null; }
ACTIONS.closeSheet = () => closeSheet();

export const ICON = {
  eat: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>`,
  cook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 11h20M9 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4"/></svg>`,
  train: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>`,
  progress: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
};

export const header = (title, sub = "", chip = "") => `<header class="top"><div><h1>${esc(title)}</h1>${sub ? `<div class="dim">${esc(sub)}</div>` : ""}${chip}</div>
  <div class="row nowrap"><button class="avatar" data-act="profile" aria-label="Your profile">${esc(initials())}</button>
  <button class="icon" data-act="settings" aria-label="Settings">${ICON.gear}</button></div></header>`;

export const seg = (opts, cur, act) => `<div class="seg" role="tablist">${opts.map(([v, l]) =>
  `<button role="tab" aria-selected="${v === cur}" class="${v === cur ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;

export const bar = (label, val, goal, unit = "", note = "") => {
  const pct = Math.min(100, goal > 0 ? (val / goal) * 100 : 0);
  return `<div class="row between"><span>${label}</span><span><b>${Math.round(val)}</b> / ${Math.round(goal)} ${unit} ${note}</span></div>
    <div class="bar ${val > goal * 1.05 ? "over" : ""}" role="progressbar" aria-valuenow="${Math.round(val)}" aria-valuemax="${Math.round(goal)}" aria-label="${label}"><i style="width:${pct}%"></i></div>`;
};

export const stepper = (name, val, d, label) => `<div class="stepper" role="group" aria-label="${label}">
  <button class="step" data-act="step" data-d="${-d}" aria-label="Less ${label}">−</button>
  <input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${val}" aria-label="${label}">
  <button class="step" data-act="step" data-d="${d}" aria-label="More ${label}">+</button></div>`;
ACTIONS.step = (t) => {
  const inp = $("input", t.closest(".stepper"));
  inp.value = Math.max(0, r1((parseFloat(inp.value) || 0) + Number(t.dataset.d)));
  return false;
};

export const badge = (ev) => `<span class="badge ${ev}">${{ direct: "tested", principle: "inferred", limited: "practical" }[ev]}</span>`;

// marks: indices of points to highlight (personal records)
export function lineSvg(pts, unit, trend, marks = []) {
  if (pts.length < 2) return `<p class="dim">Add one more entry to see a chart.</p>`;
  const all = pts.map((p) => p[1]).concat(trend ?? []);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const xy = (v, i) => `${(10 + (i / (pts.length - 1)) * 280).toFixed(1)},${(95 - ((v - lo) / span) * 75).toFixed(1)}`;
  return `<svg viewBox="0 0 300 110" role="img" aria-label="${esc(unit)} over time">
    <polyline points="${pts.map((p, i) => xy(p[1], i)).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${trend ? `<polyline points="${trend.map(xy).join(" ")}" fill="none" stroke="var(--dim)" stroke-width="1.5" stroke-dasharray="4 3"/>` : ""}
    ${marks.map((i) => `<circle cx="${xy(pts[i][1], i).split(",")[0]}" cy="${xy(pts[i][1], i).split(",")[1]}" r="4.5" fill="#ffc23d" stroke="var(--card)" stroke-width="1.5"/>`).join("")}
    <text x="10" y="10" font-size="10" fill="var(--dim)">high ${r1(hi)}</text>
    <text x="10" y="108" font-size="10" fill="var(--dim)">${pts[0][0]} to ${pts.at(-1)[0]} (${esc(unit)})</text></svg>`;
}

export const mealNow = () => { const h = new Date().getHours(); return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack"; };
export const MEALS = [["breakfast", "Breakfast", "🌅"], ["lunch", "Lunch", "☀️"], ["dinner", "Dinner", "🌙"], ["snack", "Snacks", "🍎"]];
export const greeting = () => { const h = new Date().getHours(); return (h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (S.profile.name ? ", " + S.profile.name : ""); };
export const initials = () => (S.profile.name || "?").trim().slice(0, 2).toUpperCase();
export const fmt = (n) => Math.round(n).toLocaleString();

// circular progress ring; the number inside counts up when the screen opens
export function ring(pct, { size = 150, stroke = 12, color = "var(--accent)", track = "var(--line)", inner = "" } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" style="--full:${c.toFixed(1)}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
    <div class="inner">${inner}</div></div>`;
}

export const loadOverview = async () => {
  try { S.overview = await api("/api/overview"); cache.set("overview", S.overview); }
  catch (e) { if (!e.offline) throw e; S.overview = cache.get("overview", S.overview); }
};
export const foodDates = () => [...new Set([...S.overview.food.filter((r) => r.kcal > 0).map((r) => r.date), ...(S.food.length ? [S.today] : [])])];
export const workoutDates = () => [...new Set([...S.overview.workoutDates, ...(S.sets.length ? [S.today] : [])])];
export const plannedDays = () => S.routine.days.filter((d) => d.ex.length).length;
export const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
export const shiftDay = (n) => new Date((dayNum(S.today) + n) * 864e5).toISOString().slice(0, 10);
// offline: show what we have (nothing) instead of an error page
// the last copy is kept on the phone, so History and Progress still show something with no signal
export const loadRange = async (days) => {
  try { S.rangeSets = await api(`/api/sets?from=${shiftDay(-days)}&to=${S.today}`); cache.set("range", S.rangeSets.slice(-1500)); }
  catch (e) { if (!e.offline) throw e; S.rangeSets = cache.get("range", []); }
};
export const offlineOk = (p) => p.catch((e) => { if (!e.offline) throw e; });
// small JSON copies in the phone's storage, so the gym screen works with no signal
export const cache = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const go = (tab) => { if (!['settings', 'profile', 'dish'].includes(S.tab)) S.prevTab = S.tab; S.tab = tab; window.scrollTo(0, 0); };
