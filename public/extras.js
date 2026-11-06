// Small daily trackers: supplements checklist, favorite foods, cardio log. Each one is a saved setting.
import { $, esc, r1, fmt, S, ACTIONS, saveSetting, toast, shiftDay } from "./lib.js";
import { dailyAvg } from "./stats.js";
import { logFood } from "./eat.js";
import { haptic } from "./fx.js";

const keep = (obj, n) => Object.fromEntries(Object.keys(obj).sort().slice(-n).map((d) => [d, obj[d]]));

// ---------- supplements ----------
const taken = () => S.supps.log[S.today] ?? [];
export const suppsCard = () => `<div class="card"><div class="meal-h"><h2>💊 Supplements</h2><span class="dim"><b>${taken().filter((n) => S.supps.list.includes(n)).length}</b> of ${S.supps.list.length}</span></div>
  <div class="row chips">${S.supps.list.map((n, i) => `<button class="chip ${taken().includes(n) ? "on" : ""}" aria-pressed="${taken().includes(n)}" data-act="suppTog" data-i="${i}">${taken().includes(n) ? "✓ " : ""}${esc(n)}</button>`).join("")}</div>
  <details><summary class="dim">Edit list</summary>
    ${S.supps.list.map((n, i) => `<div class="row between item"><span>${esc(n)}</span><button class="x" data-act="suppRm" data-i="${i}" aria-label="Remove ${esc(n)}">✕</button></div>`).join("")}
    <div class="row"><input id="suppnew" class="grow" maxlength="30" placeholder="Add one, like Omega-3" data-enter="suppAdd" aria-label="New supplement"><button class="btn" data-act="suppAdd">Add</button></div></details></div>`;

// ---------- favorite foods ----------
export const favsRow = () => S.favs.length ? `<div class="dim">⭐ Favorites</div><div class="row chips">${S.favs.map((r, i) => `<button class="chip sm" data-act="favAdd" data-i="${i}">${esc(r.name.slice(0, 28))}${r.grams ? ` · ${Math.round(r.grams)} g` : ""}</button>`).join("")}</div>` : "";
export const isFav = (r) => S.favs.some((f) => f.name === r.name && f.kcal === r.kcal);

// ---------- cardio ----------
const TYPES = ["Run", "Walk", "Bike", "Swim", "Row", "Other"];
export const cardioCard = () => {
  const week = S.cardio.filter((c) => c.d >= shiftDay(-6)), todays = S.cardio.filter((c) => c.d === S.today);
  return `<div class="card"><div class="meal-h"><h2>🏃 Cardio</h2><span class="dim">Last 7 days: <b>${week.reduce((a, c) => a + c.min, 0)}</b> min${week.some((c) => c.mi) ? ` · <b>${Math.round(week.reduce((a, c) => a + (c.mi || 0), 0) * 10) / 10}</b> mi` : ""}</span></div>
    ${todays.map((c) => `<div class="row between item"><span>${esc(c.t)} · ${c.min} min${c.mi ? ` · ${c.mi} mi` : ""}</span><button class="x" data-act="cardioDel" data-t="${c.at}" aria-label="Delete ${esc(c.t)}">✕</button></div>`).join("")}
    <div class="row" id="cardio"><select name="t" aria-label="Type">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
      <input name="min" class="num" type="number" inputmode="decimal" min="1" placeholder="min" aria-label="Minutes"><input name="mi" class="num" type="number" inputmode="decimal" min="0" step="any" placeholder="miles" aria-label="Miles, optional">
      <button class="btn primary" data-act="cardioAdd">Add</button></div></div>`;
};

// ---------- sleep and steps (typed in by hand) ----------
export const dailyCard = () => {
  const t = S.daily[S.today] ?? {}, sl = dailyAvg(S.daily, S.today, "sleep"), st = dailyAvg(S.daily, S.today, "steps");
  return `<div class="card"><div class="meal-h"><h2>😴 Sleep and steps</h2><span class="dim">7-day avg: <b>${sl ? r1(sl.avg) : "–"}</b> h · <b>${st ? fmt(st.avg) : "–"}</b> steps</span></div>
    <div class="row" id="daily"><input name="sleep" class="num" type="number" inputmode="decimal" min="0" max="24" step="any" placeholder="hours slept" value="${t.sleep ?? ""}" aria-label="Hours slept last night">
      <input name="steps" class="num" type="number" inputmode="numeric" min="0" max="100000" placeholder="steps" value="${t.steps ?? ""}" aria-label="Steps today"><button class="btn primary" data-act="dailySave">Save</button></div>
    ${sl && sl.avg < 7 ? `<p class="dim small">Adults are advised to sleep 7 or more hours a night for health (Watson et al., 2015, Sleep). Short sleep also makes hard training feel harder.</p>` : `<p class="dim small">Type last night's sleep and today's steps from your Health app.</p>`}</div>`;
};

Object.assign(ACTIONS, {
  dailySave: async () => {
    const v = (n) => parseFloat($(`#daily [name=${n}]`).value), sleep = v("sleep"), steps = Math.round(v("steps"));
    if (!(sleep >= 0 && sleep <= 24) && !(steps >= 0)) throw new Error("Type your sleep or your steps.");
    S.daily[S.today] = { ...(sleep >= 0 && sleep <= 24 ? { sleep } : {}), ...(steps >= 0 && steps <= 100000 ? { steps } : {}) };
    S.daily = keep(S.daily, 60); haptic(); await saveSetting("daily", S.daily); toast("Saved");
  },

  suppTog: async (t) => {
    const n = S.supps.list[t.dataset.i], now = taken();
    S.supps.log[S.today] = now.includes(n) ? now.filter((x) => x !== n) : [...now, n];
    S.supps.log = keep(S.supps.log, 30); haptic(8);
    await saveSetting("supps", S.supps);
  },
  suppAdd: async () => {
    const n = $("#suppnew").value.trim().slice(0, 30);
    if (!n) return false;
    if (S.supps.list.includes(n)) throw new Error("Already on the list.");
    if (S.supps.list.length >= 12) throw new Error("Twelve is plenty. Remove one first.");
    S.supps.list.push(n); await saveSetting("supps", S.supps);
  },
  suppRm: async (t) => { S.supps.list.splice(t.dataset.i, 1); await saveSetting("supps", S.supps); },

  favToggle: async (t) => {
    const r = S.food.find((x) => String(x.id) === t.dataset.id);
    if (isFav(r)) S.favs = S.favs.filter((f) => !(f.name === r.name && f.kcal === r.kcal));
    else {
      if (S.favs.length >= 15) throw new Error("15 favorites is the limit. Remove one first (tap ⭐ on it below).");
      const { name, grams, kcal, protein, carbs, fat, fiber, micro } = r;
      S.favs = [{ name, grams, kcal, protein, carbs, fat, fiber, micro }, ...S.favs];
    }
    await saveSetting("favs", S.favs); haptic(8);
  },
  favAdd: async (t) => {
    const { name, grams, kcal, protein, carbs, fat, fiber, micro } = S.favs[t.dataset.i];
    await logFood({ name, grams: grams ?? undefined, kcal, protein, carbs, fat, fiber: fiber ?? undefined, micro: micro ?? undefined });
    haptic(); toast("Added");
  },

  cardioAdd: async () => {
    const v = (n) => $(`#cardio [name=${n}]`).value, min = Math.round(parseFloat(v("min")));
    if (!(min >= 1 && min <= 1000)) throw new Error("Type the minutes.");
    S.cardio = [...S.cardio, { d: S.today, t: v("t"), min, mi: parseFloat(v("mi")) > 0 ? Math.round(parseFloat(v("mi")) * 100) / 100 : 0, at: Date.now() }].slice(-200);
    await saveSetting("cardio", S.cardio); haptic(); toast("Logged");
  },
  cardioDel: async (t) => { S.cardio = S.cardio.filter((c) => String(c.at) !== t.dataset.t); await saveSetting("cardio", S.cardio); },
});
