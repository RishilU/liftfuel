import { $, esc, S, api, ACTIONS, CHANGES, toast, openSheet, closeSheet, saveProfile, saveRoutine, targets, currentWeight, r1, go, seg } from "./lib.js";
import { DEFAULT_PROFILE, PHASES } from "./targets.js";
import { TEMPLATES } from "./routine.js";
import { loadBody } from "./progress.js";
import { applyTheme, ui, ACCENTS, haptic } from "./fx.js";

const VERSION = "3.6";
const csv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}

export function renderSettings() {
  const p = S.profile, t = targets(), u = ui();
  $("#view").innerHTML = `<header class="top"><div><h1>Settings</h1></div><button class="btn" data-act="closeSettings">Back</button></header>
    <div class="card"><h2>👤 About you</h2>
      <div class="field"><label for="pname">Name</label><input id="pname" value="${esc(p.name ?? "")}" maxlength="20" placeholder="Optional" data-change="pname"></div>
      <div class="field"><label for="age">Age</label><input id="age" type="number" inputmode="numeric" value="${p.age}" data-change="pset" data-f="age"></div>
      <div class="field"><label for="sex">Sex</label><select id="sex" data-change="pset" data-f="sex"><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option></select></div>
      <div class="field"><label>Height</label><span class="row"><input id="hft" class="num" type="number" inputmode="numeric" value="${Math.floor(p.height_in / 12)}" data-change="pheight" aria-label="Feet"> ft
        <input id="hin" class="num" type="number" inputmode="numeric" value="${p.height_in % 12}" data-change="pheight" aria-label="Inches"> in</span></div>
      <p class="dim">Your weight comes from the Progress tab (${currentWeight() ? r1(currentWeight()) + " lb" : "not logged yet"}).</p></div>
    <div class="card"><h2>🎯 Goal and food</h2>
      <div class="field"><label for="phase">Phase</label><select id="phase" data-change="pset" data-f="phase">${Object.entries(PHASES).map(([k, v]) => `<option value="${k}" ${p.phase === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
      <div class="field"><label for="ppl">Protein per lb of bodyweight</label><select id="ppl" data-change="pset" data-f="ppl">${[0.8, 0.85, 0.9, 0.95, 1].map((v) => `<option value="${v}" ${p.ppl === v ? "selected" : ""}>${v} g</option>`).join("")}</select></div>
      <div class="field"><label for="meals">Meals per day</label><select id="meals" data-change="pset" data-f="meals">${[3, 4, 5, 6].map((v) => `<option value="${v}" ${(p.meals ?? 4) === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label for="wg">Water goal</label><select id="wg" data-change="pset" data-f="waterGoalOz">${[64, 80, 96, 112, 128, 144, 160].map((v) => `<option value="${v}" ${(p.waterGoalOz ?? 128) === v ? "selected" : ""}>${v} oz${v === 128 ? " (1 gallon)" : ""}</option>`).join("")}</select></div>
      ${(p.bottles ?? []).map((b, i) => `<div class="field"><label>Bottle ${i + 1}</label><span class="row"><input class="grow" value="${esc(b.name)}" maxlength="14" data-change="pbottle" data-i="${i}" data-k="name" aria-label="Bottle ${i + 1} name"><input class="num" type="number" inputmode="numeric" value="${b.oz}" data-change="pbottle" data-i="${i}" data-k="oz" aria-label="Bottle ${i + 1} ounces"> oz</span></div>`).join("")}
      <div class="field"><label for="fg">Fiber goal (g)</label><select id="fg" data-change="pset" data-f="fiberGoal">${[25, 30, 35, 40].map((v) => `<option value="${v}" ${(p.fiberGoal ?? 30) === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <p class="dim">Your daily numbers: <b>${t.kcal}</b> calories, <b>${t.protein}</b> g protein, ${t.carbs} g carbs, ${t.fat} g fat. They update when your weight, plan or phase change.</p>
      <label class="check"><input class="switch" type="checkbox" data-change="mtoggle" ${p.manual ? "checked" : ""}> Set my own numbers</label>
      ${p.manual ? `<div class="inputs3"><div><label for="mk">Calories</label><input id="mk" type="number" inputmode="numeric" value="${t.kcal}" data-change="mset" data-f="kcal"></div>
        <div><label for="mp">Protein g</label><input id="mp" type="number" inputmode="numeric" value="${t.protein}" data-change="mset" data-f="protein"></div>
        <div><label for="mf">Fat g</label><input id="mf" type="number" inputmode="numeric" value="${t.fat}" data-change="mset" data-f="fat"></div></div>` : ""}</div>
    <div class="card"><h2>🏋️ Training</h2>
      <div class="field"><label for="rest">Rest timer</label><select id="rest" data-change="pset" data-f="restSec">${[60, 90, 120, 180, 240].map((v) => `<option value="${v}" ${(p.restSec ?? 120) === v ? "selected" : ""}>${v >= 120 ? v / 60 + " min" : v + " sec"}</option>`).join("")}</select></div>
      <div class="field"><label for="ws">Week starts on</label><select id="ws" data-change="pset" data-f="weekStart"><option value="1" ${(p.weekStart ?? 1) === 1 ? "selected" : ""}>Monday</option><option value="0" ${p.weekStart === 0 ? "selected" : ""}>Sunday</option></select></div>
      <p class="dim">Plan: ${esc(TEMPLATES[S.routine.template]?.label ?? "Custom")}. Change it on the Train tab, My plan. There is no single best rest time: rest as long as you need to lift well on the next set.</p></div>
    <div class="card"><h2>🎨 Look and feel</h2>
      <div class="dim">Theme</div>${seg([["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], u.theme, "uitheme")}
      <div class="dim">Accent colour</div><div class="swatches">${Object.entries(ACCENTS).map(([k, h]) => `<button class="sw ${u.accent === k ? "on" : ""}" style="background:hsl(${h} 68% 42%)" data-act="uiaccent" data-v="${k}" aria-label="${k}" aria-pressed="${u.accent === k}"></button>`).join("")}</div>
      <div class="dim">Text size</div>${seg([["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]], u.text, "uitext")}
      <label class="check" style="margin-top:8px"><input class="switch" type="checkbox" data-change="uiflag" data-f="motion" ${u.motion === "on" ? "checked" : ""}> Animations and confetti</label>
      <label class="check"><input class="switch" type="checkbox" data-change="uiflag" data-f="haptics" ${u.haptics === "on" ? "checked" : ""}> Vibration feedback</label>
      <label class="check"><input class="switch" type="checkbox" data-change="uiflag" data-f="awake" ${u.awake !== "off" ? "checked" : ""}> Keep the screen on during workouts</label></div>
    <div class="card"><h2>💾 Your data</h2>
      <button class="btn wide" data-act="export">Download a full backup (JSON)</button>
      <button class="btn wide" data-act="exportWorkouts">Download workouts (CSV)</button>
      <button class="btn wide" data-act="exportFood">Download food log (CSV)</button>
      <button class="btn wide" data-act="replayWelcome">Redo the welcome questions</button>
      <button class="btn wide" data-act="signout">Sign out of this phone</button>
      <p class="dim">Everything is saved on the server, so signing out does not delete anything.</p></div>
    <p class="dim center">LiftFuel ${VERSION}. Sources are listed on the Progress tab.</p>`;
}

export function openOnboarding() {
  const p = S.profile;
  openSheet(`<h2>Welcome 👋</h2><p>A few quick questions set your starting numbers. You can change them later in Settings.</p>
    <div class="field"><label for="ob-name">Your name (optional)</label><input id="ob-name" value="${esc(p.name ?? "")}" maxlength="20"></div>
    <div class="field"><label for="ob-age">Age</label><input id="ob-age" type="number" inputmode="numeric" value="${p.age}"></div>
    <div class="field"><label for="ob-sex">Sex</label><select id="ob-sex"><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option></select></div>
    <div class="field"><label>Height</label><span class="row"><input id="ob-ft" class="num" type="number" inputmode="numeric" value="${Math.floor(p.height_in / 12)}" aria-label="Feet"> ft <input id="ob-in" class="num" type="number" inputmode="numeric" value="${p.height_in % 12}" aria-label="Inches"> in</span></div>
    <div class="field"><label for="ob-w">Weight (lb)</label><input id="ob-w" type="number" inputmode="decimal" placeholder="155"></div>
    <div class="field"><label for="ob-phase">Goal</label><select id="ob-phase">${Object.entries(PHASES).map(([k, v]) => `<option value="${k}" ${k === p.phase ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
    <button class="btn primary wide" data-act="finishOnboarding">Start</button>`);
}

Object.assign(ACTIONS, {
  settings: () => { go("settings"); },
  closeSettings: () => { S.tab = S.prevTab ?? "eat"; },
  replayWelcome: () => { openOnboarding(); return false; },
  finishOnboarding: async () => {
    const v = (id) => $("#" + id).value;
    const age = +v("ob-age"), h = (+v("ob-ft") || 0) * 12 + (+v("ob-in") || 0), w = +v("ob-w");
    if (!(age >= 14 && age <= 100) || !(h >= 48 && h <= 96)) throw new Error("Check your age and height.");
    S.profile = { ...DEFAULT_PROFILE, ...S.profile, name: v("ob-name").trim(), age, sex: v("ob-sex"), height_in: h, phase: v("ob-phase") };
    await saveProfile(); await saveRoutine();
    if (w >= 60 && w <= 600) { await api("/api/body", { method: "PUT", body: { date: S.today, weight: w } }); await loadBody(); }
    closeSheet(); toast("You're all set 🎉");
  },
  uitheme: async (t) => { S.profile.ui = { ...ui(), theme: t.dataset.v }; applyTheme(); await saveProfile(); },
  uitext: async (t) => { S.profile.ui = { ...ui(), text: t.dataset.v }; applyTheme(); await saveProfile(); },
  uiaccent: async (t) => { S.profile.ui = { ...ui(), accent: t.dataset.v }; applyTheme(); haptic(); await saveProfile(); },
  export: async () => {
    download(`liftfuel-backup-${S.today}.json`, JSON.stringify(await api("/api/export")), "application/json");
    return false;
  },
  exportWorkouts: async () => {
    const d = await api("/api/export");
    download(`workouts-${S.today}.csv`, csv(d.sets, ["date", "exercise_id", "weight", "reps"]), "text/csv"); return false;
  },
  exportFood: async () => {
    const d = await api("/api/export");
    download(`food-${S.today}.csv`, csv(d.food_log, ["date", "meal", "name", "grams", "kcal", "protein", "carbs", "fat", "fiber"]), "text/csv"); return false;
  },
  signout: () => { try { localStorage.removeItem("pass"); } catch {} location.reload(); return false; },
});

Object.assign(CHANGES, {
  pset: async (el) => {
    const f = el.dataset.f, num = ["age", "ppl", "restSec", "meals", "waterGoalOz", "fiberGoal", "weekStart"].includes(f);
    S.profile[f] = num ? Number(el.value) : el.value;
    await saveProfile();
  },
  pbottle: async (el) => { const b = S.profile.bottles[el.dataset.i]; if (el.dataset.k === "oz") b.oz = Math.min(200, Math.max(4, Math.round(+el.value) || b.oz)); else b.name = el.value.trim() || b.name; await saveProfile(); },
  pname: async (el) => { S.profile.name = el.value.trim(); await saveProfile(); },
  pheight: async () => { S.profile.height_in = (+$("#hft").value || 0) * 12 + (+$("#hin").value || 0); await saveProfile(); },
  mtoggle: async (el) => { const t = targets(); S.profile.manual = el.checked ? { kcal: t.kcal, protein: t.protein, fat: t.fat } : null; await saveProfile(); },
  mset: async (el) => { S.profile.manual[el.dataset.f] = Number(el.value); await saveProfile(); },
  uiflag: async (el) => { S.profile.ui = { ...ui(), [el.dataset.f]: el.checked ? "on" : "off" }; applyTheme(); await saveProfile(); },
});
