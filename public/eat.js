import { $, esc, r1, S, api, apiQ, outbox, cache, ACTIONS, hooks, toast, openSheet, closeSheet, header, targets, saveProfile, saveSetting, sum, go, currentWeight, ring, fmt, MEALS, mealNow, greeting, foodDates, shiftDay } from "./lib.js";
import { weeklyCheck, estMaintenance, PHASES } from "./targets.js";
import { planMeals } from "./plan.js";
import { dayStreak } from "./stats.js";
import { coach, insightCard } from "./coach.js";
import { confetti, haptic } from "./fx.js";
import { suppsCard, favsRow, isFav } from "./extras.js";
import { FOODS, sumMicro, scaleMicro, microPct, topMicros } from "./nutri.js";

const withMicro = (rows) => rows.map((r) => ({ ...r, micro: typeof r.micro === "string" ? JSON.parse(r.micro) : r.micro ?? null }));
async function setWater(oz, last = 0) {
  const before = water(), goal = waterGoal();
  S.water[S.today] = Math.min(1000, oz); S.waterLast = last;
  S.water = Object.fromEntries(Object.keys(S.water).sort().slice(-30).map((d) => [d, S.water[d]]));
  haptic(8); await saveSetting("water", S.water);
  if (before < goal && oz >= goal) { confetti(60); toast("Water goal done! 💧"); }
}
// food logged with no signal: shown with a clock until it syncs
const pendingFood = () => outbox().filter((o) => o.path === "/api/food" && o.method === "POST" && o.body.date === S.today).map((o) => ({ ...o.body, id: "q" + o.t, pending: true }));
export async function loadFood() {
  let f, r;
  try { [f, r] = await Promise.all([api("/api/food?date=" + S.today), api("/api/recent")]); cache.set("foodToday", { date: S.today, f }); cache.set("recent", r); }
  catch (e) { if (!e.offline) throw e; const c = cache.get("foodToday", null); f = c?.date === S.today ? c.f : []; r = cache.get("recent", []); }
  S.food = [...withMicro(f), ...withMicro(pendingFood())]; S.recent = withMicro(r);
  S.intake[S.today] = sum(S.food, "kcal");
}
const proteinNow = () => sum(S.food, "protein");

// log one food; celebrates the moment you reach today's protein goal
export async function logFood(row) {
  const before = proteinNow(), goal = targets().protein;
  const r = await apiQ("/api/food", { method: "POST", body: { date: S.today, meal: S.mealSel ?? mealNow(), ...row } });
  if (r.queued) toast("No signal: saved on your phone, it will sync later 📶");
  await loadFood();
  if (before < goal && proteinNow() >= goal) { confetti(); toast("Protein goal reached! 💪"); }
}
const scale = (x, g) => ({ grams: g, kcal: Math.round((x.kcal * g) / 100), protein: r1((x.protein * g) / 100), carbs: r1((x.carbs * g) / 100), fat: r1((x.fat * g) / 100), fiber: r1(((x.fiber ?? 0) * g) / 100), micro: scaleMicro(x.micro, g / 100) });
const totalGrams = (r) => Math.round(r.ingredients.reduce((a, i) => a + i.grams, 0));
const water = () => S.water[S.today] ?? 0;
const waterGoal = () => S.profile.waterGoalOz ?? 128;
const mbar = (label, val, goal, cls, note = "") => `<div class="row between"><span>${label}</span><span><b>${Math.round(val)}</b> / ${Math.round(goal)} g ${note}</span></div>
  <div class="bar ${cls} ${val > goal * 1.1 && cls !== "protein" && cls !== "fiber" ? "over" : ""}" role="progressbar" aria-valuenow="${Math.round(val)}" aria-valuemax="${Math.round(goal)}" aria-label="${label}"><i style="width:${Math.min(100, goal ? (val / goal) * 100 : 0)}%"></i></div>`;

function checkCard() {
  if (S.dismissCheck) return "";
  const c = weeklyCheck(S.body, S.today, S.profile.phase, S.profile.lastAdjust);
  if (!c) return `<div class="card note"><b>⚖️ Weekly check-in</b><p class="dim">Weigh yourself 3 or more times a week (Progress tab). After two weeks of weigh-ins, the app checks whether you are gaining at the right speed and suggests a calorie change.</p></div>`;
  const ph = PHASES[S.profile.phase].label;
  const moved = `${c.rate >= 0 ? "+" : ""}${r1(c.rate)} lb vs last week (${r1(c.pct)}%)`;
  const want = `${c.lo}% to ${c.hi}% a week for ${ph.toLowerCase()}`;
  if (c.waiting) return `<div class="card note"><b>⚖️ Weekly check-in</b><p>${moved}. You changed your calories recently, so give it 2 weeks before the next check.</p></div>`;
  if (!c.suggest) return `<div class="card note"><b class="ok">✅ On track</b><p>${moved}. Goal: ${want}. Keep your calories.</p></div>`;
  return `<div class="card note"><b class="warn">${c.status === "low" ? "Gaining too slowly" : "Gaining too fast"}</b>
    <p>${moved}. Goal: ${want}.</p><p>Suggested change: <b>${c.suggest > 0 ? "+" : ""}${c.suggest} calories a day</b>.</p>
    <div class="row"><button class="btn primary" data-act="applyCheck" data-d="${c.suggest}">Apply</button><button class="btn" data-act="skipCheck">Not now</button></div></div>`;
}

// fiber, vitamins and minerals so far today; from 3 pm it suggests foods for what is still low
function nutrientsCard(fiber) {
  const sex = S.profile.sex, rows = microPct(sumMicro(S.food), sex), tracked = S.food.some((r) => r.micro);
  const late = new Date().getHours() >= 15, low = rows.filter((r) => r.pct < 0.7).sort((a, b) => a.pct - b.pct).slice(0, 4);
  const nbar = (r) => `<div class="row between"><span>${r.label}</span><span><b>${Math.round(r.pct * 100)}%</b> <span class="dim">${r.have >= 10 ? Math.round(r.have) : r1(r.have)} / ${r.goal} ${r.unit}</span></span></div>
    <div class="bar ${r.pct >= 1 ? "" : "fiber"}" role="progressbar" aria-valuenow="${Math.round(r.pct * 100)}" aria-valuemax="100" aria-label="${r.label}"><i style="width:${Math.min(100, r.pct * 100)}%"></i></div>`;
  const tips = !late ? `<p class="dim">After 3 pm this card suggests foods for whatever you are still low on, so you can plan dinner.</p>`
    : !tracked ? "" : low.length ? `<div class="note-box"><b>🥗 Still low today</b>${low.map((r) => `<div class="tip-row"><span>${r.label} <b>${Math.round(r.pct * 100)}%</b></span>
        <div class="row chips">${FOODS[r.k].map((f) => `<button class="chip sm" data-act="foodtip" data-q="${esc(f)}">${esc(f)}</button>`).join("")}</div></div>`).join("")}
      <p class="dim">Tap a food to see how much of each vitamin it has per 100 g.${low.some((r) => r.k === "vitd") ? " Vitamin D is hard to get from food alone; sunlight or a supplement is common (ask a doctor)." : ""}</p></div>`
    : `<p class="ok"><b>🎉 You are covered on the main vitamins and minerals today.</b></p>`;
  return `<div class="card"><h2>🥦 Fiber, vitamins and minerals</h2>
    ${mbar("Fiber", fiber, S.profile.fiberGoal ?? 30, "fiber")}
    <details ${tracked ? "open" : ""}><summary class="dim">Vitamins and minerals (${rows.filter((r) => r.pct >= 0.7).length} of ${rows.length} at 70% or more)</summary>${rows.map(nbar).join("")}</details>
    ${tracked ? "" : `<p class="dim">Foods you add from the search and meals you build count here. Typed-in foods have no vitamin data.</p>`}${tips}
    <p class="dim small">Goals: US daily amounts for adults 19-30. If USDA lists no value for a nutrient in a food, it counts as 0, so treat these as a minimum.</p></div>`;
}

function myMeals() {
  return `${S.mymeals.length ? `<div class="dim">My meals</div>${S.mymeals.map((m, i) => `<div class="item"><div class="row between"><div><b>${esc(m.name)}</b>
      <div class="dim">${m.kcal} cal · ${m.protein} protein per serving</div></div><span class="row nowrap"><button class="btn sm" data-act="editMine" data-i="${i}">Edit</button><button class="x" data-act="delMine" data-i="${i}" aria-label="Delete ${esc(m.name)}">✕</button></span></div>
      <div class="row"><select name="sv" aria-label="Servings">${[0.5, 1, 1.5, 2].map((v) => `<option value="${v}" ${v === 1 ? "selected" : ""}>${v} serving${v === 1 ? "" : "s"}</option>`).join("")}</select><button class="btn primary" data-act="logMine" data-i="${i}">Add</button></div></div>`).join("")}` : ""}
    <button class="btn wide" data-act="dishopen">🍲 Build a meal or dish (curry, dal, protein shake…)</button>`;
}

function mealCards(t) {
  const meals = S.profile.meals ?? 4, per = Math.round(t.protein / meals);
  return MEALS.map(([id, label, emoji]) => {
    const rows = S.food.filter((x) => (x.meal ?? "snack") === id);
    if (!rows.length) return "";
    const p = sum(rows, "protein"), ok = id !== "snack" && p >= per * 0.9;
    return `<div class="card"><div class="meal-h"><h2>${emoji} ${label}</h2><span class="dim"><b>${Math.round(sum(rows, "kcal"))}</b> cal · <b class="${ok ? "ok" : ""}">${Math.round(p)}</b>${id === "snack" ? "" : ` / ${per}`} g protein${ok ? " ✓" : ""}</span></div>
      ${rows.map((r) => `<div class="row between item"><div data-act="editfood" data-id="${r.id}" role="button" tabindex="0" aria-label="Edit ${esc(r.name)}"><div>${r.pending ? "⏳ " : ""}${esc(r.name)}${r.grams ? ` <span class="dim">${Math.round(r.grams)} g</span>` : ""}</div>
        <div class="dim">${Math.round(r.kcal)} cal · ${r1(r.protein)} protein · ${r1(r.carbs)} carbs · ${r1(r.fat)} fat</div></div>
        <span class="row nowrap"><button class="x" data-act="favToggle" data-id="${r.id}" aria-pressed="${isFav(r)}" aria-label="${isFav(r) ? "Remove from" : "Add to"} favorites: ${esc(r.name)}">${isFav(r) ? "⭐" : "☆"}</button><button class="x" data-act="fdel" data-id="${r.id}" aria-label="Delete ${esc(r.name)}">✕</button></span></div>`).join("")}</div>`;
  }).join("");
}

export function renderEat() {
  const t = targets(), f = S.food;
  const e = { kcal: sum(f, "kcal"), protein: sum(f, "protein"), carbs: sum(f, "carbs"), fat: sum(f, "fat"), fiber: f.reduce((a, x) => a + (x.fiber ?? 0), 0) };
  const left = t.kcal - e.kcal, over = left < 0;
  const meals = planMeals(S.plan, new Date().getDay());
  const todo = meals.filter((m) => !f.some((x) => x.name === m.recipe.name));
  const wanted = { kcal: left - sum(todo.map((m) => m.recipe.totals), "kcal") };
  const streak = dayStreak(foodDates(), S.today), w = currentWeight(), est = estMaintenance(S.body, S.intake, S.today);
  const sel = S.mealSel ?? mealNow(), mealsPerDay = S.profile.meals ?? 4;
  const notes = coach().filter((i) => i.area === "eat" || i.area === "body").slice(0, 2);
  $("#view").innerHTML = `${header(greeting(), new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      streak ? `<div class="streak"><span class="flame">🔥</span> ${streak}-day logging streak</div>` : "")}
    <div class="card hero"><div class="herogrid">
      ${ring(e.kcal / t.kcal, { color: "#fff", track: "rgba(255,255,255,.28)", inner: `<span class="huge" data-count="${Math.abs(Math.round(left))}">${fmt(Math.abs(left))}</span><span class="dim">${over ? "calories over" : "calories left"}</span>` })}
      <div><div class="dim">Eaten</div><div class="big"><b>${fmt(e.kcal)}</b></div><div class="dim" style="margin-top:8px">Goal</div><div class="big"><b>${fmt(t.kcal)}</b></div></div></div></div>
    <div class="card"><h2>Macros</h2>
      ${mbar("Protein", e.protein, t.protein, "protein", `<span class="dim">(range ${t.proteinRange[0]}-${t.proteinRange[1]})</span>`)}
      ${mbar("Carbs", e.carbs, t.carbs, "carbs")}${mbar("Fat", e.fat, t.fat, "fat")}
      <details><summary class="dim">Why these numbers?</summary><ul class="tight">
        <li>Weight: ${w ? r1(w) + " lb (7-day average)" : "155 lb (log your weight in Progress for exact numbers)"}</li>
        <li>Protein: ${S.profile.ppl} g per lb of bodyweight, within your 0.8-1.0 range. About ${Math.round(t.protein / mealsPerDay)} g per meal across ${mealsPerDay} meals.</li>
        <li>Calories: about ${t.maintenance} to maintain (formula; ${S.routine.days.filter((d) => d.ex.length).length} training days a week), ${PHASES[S.profile.phase].surplus ? "+" + PHASES[S.profile.phase].surplus * 100 + "% for a lean bulk" : "no surplus"}${S.profile.adjust ? `, ${S.profile.adjust > 0 ? "+" : ""}${S.profile.adjust} from your check-ins` : ""}.${t.manual ? " You set your own numbers in Settings." : ""}</li>
        ${est ? `<li>Your own logs suggest maintenance is about <b>${est.kcal}</b> (from ${est.days} logged days; only accurate if you log everything).</li>` : ""}</ul></details></div>
    ${nutrientsCard(e.fiber)}
    ${suppsCard()}
    <div class="card"><div class="meal-h"><h2>💧 Water</h2><span class="dim"><b>${water()}</b> of ${waterGoal()} oz${waterGoal() === 128 ? " (1 gallon)" : ""}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${water()}" aria-valuemax="${waterGoal()}" aria-label="Water"><i style="width:${Math.min(100, (water() / waterGoal()) * 100)}%"></i></div>
      <p class="dim">${water() >= waterGoal() ? "Goal done 🎉" : `${waterGoal() - water()} oz to go`}</p>
      <div class="row chips">${(S.profile.bottles ?? []).map((b) => `<button class="chip" data-act="drink" data-oz="${b.oz}">+ ${esc(b.name)} · ${b.oz} oz</button>`).join("")}
        <button class="chip" data-act="drink" data-oz="8">+ Glass · 8 oz</button><button class="chip sm" data-act="undrink">Undo</button></div></div>
    ${wanted.kcal > 250 ? `<button class="btn primary wide" data-act="dinnerLeft">🍳 Find a meal for what's left today</button>` : ""}
    ${checkCard()}${notes.map(insightCard).join("")}
    ${meals.length ? `<div class="card"><h2>🍱 Prepped for today</h2>${meals.map((m, i) => {
      const done = f.some((x) => x.name === m.recipe.name);
      return `<div class="row between item"><div><div><b>${m.slot}:</b> ${esc(m.recipe.name)}</div><div class="dim">${m.recipe.totals.kcal} cal · ${m.recipe.totals.protein} g protein</div></div>
        ${done ? `<span class="ok">Eaten ✓</span>` : `<button class="btn" data-act="logPlanned" data-i="${i}">I ate this</button>`}</div>`;
    }).join("")}</div>` : ""}
    <div class="card"><h2>Add food</h2>
      <div class="row chips">${MEALS.map(([id, l, em]) => `<button class="chip sm ${id === sel ? "on" : ""}" aria-pressed="${id === sel}" data-act="mealsel" data-v="${id}">${em} ${l}</button>`).join("")}</div>
      ${favsRow()}
      ${S.recent.length ? `<div class="dim">Quick add</div><div class="row chips">${S.recent.map((r, i) => `<button class="chip sm" data-act="recent" data-i="${i}">${esc(r.name.slice(0, 28))}${r.grams ? ` · ${Math.round(r.grams)} g` : ""}</button>`).join("")}</div>` : ""}
      <div class="row"><input id="fq" class="grow" placeholder="Search a food, like chicken breast" value="${esc(S.fq)}" data-enter="fsearch" aria-label="Search foods">
        <button class="btn primary" data-act="fsearch">${S.fbusy ? "…" : "Search"}</button></div>
      ${S.fres ? (S.fres.length ? S.fres.map((x, i) => `<div class="item"><div>${esc(x.name)}</div>
        <div class="dim">per 100 g: ${Math.round(x.kcal)} cal · ${r1(x.protein)} protein · ${r1(x.carbs)} carbs · ${r1(x.fat)} fat${x.fiber ? ` · ${r1(x.fiber)} fiber` : ""}</div>
        ${topMicros(x.micro, S.profile.sex).length ? `<div class="dim">Rich in: ${topMicros(x.micro, S.profile.sex).map((m) => `${m.label} ${Math.round(m.pct * 100)}%`).join(" · ")} <span class="small">(of a day, per 100 g)</span></div>` : ""}
        <div class="row chips">${[50, 100, 150, 200].map((g) => `<button class="chip sm" data-act="portion" data-g="${g}">${g} g</button>`).join("")}</div>
        <div class="row"><input name="g" type="number" inputmode="decimal" min="1" placeholder="grams" aria-label="Grams eaten"><button class="btn primary" data-act="fadd" data-i="${i}">Add</button></div></div>`).join("") : `<p class="dim">Nothing found. Try a simpler word.</p>`) : ""}
      ${myMeals()}
      <details><summary class="dim">Type it in (labels, restaurants)</summary>
        <div class="row" id="manual"><input class="grow" name="name" placeholder="Name" aria-label="Name">
          <input name="kcal" type="number" inputmode="decimal" placeholder="calories" aria-label="Calories"><input name="protein" type="number" inputmode="decimal" placeholder="protein g" aria-label="Protein grams">
          <input name="carbs" type="number" inputmode="decimal" placeholder="carbs g" aria-label="Carbs grams"><input name="fat" type="number" inputmode="decimal" placeholder="fat g" aria-label="Fat grams">
          <button class="btn" data-act="manual">Add</button></div></details></div>
    ${f.length ? mealCards(t) : `<div class="card center"><div style="font-size:2.5rem">🍽️</div><p><b>Nothing logged yet today.</b></p><p class="dim">Search a food above, or copy what you ate yesterday.</p><button class="btn" data-act="copyYesterday">Copy yesterday's meals</button></div>`}`;
}

Object.assign(ACTIONS, {
  mealsel: (t) => { S.mealSel = t.dataset.v; },
  portion: (t) => { $("[name=g]", t.closest(".item")).value = t.dataset.g; return false; },
  fsearch: async () => {
    S.fq = $("#fq").value.trim();
    if (S.fq.length < 2) return false;
    S.fbusy = true; hooks.render();
    try { S.fres = await api("/api/foods?q=" + encodeURIComponent(S.fq)); } finally { S.fbusy = false; }
  },
  fadd: async (t) => {
    const g = parseFloat($("[name=g]", t.parentElement).value);
    if (!(g > 0)) throw new Error("Type how many grams you ate, or tap a size above.");
    const x = S.fres[t.dataset.i];
    await logFood({ name: x.name, ...scale(x, g) });
    S.fres = null; S.fq = ""; haptic(); toast("Added");
  },
  recent: async (t) => { const r = S.recent[t.dataset.i]; await logFood({ name: r.name, grams: r.grams ?? undefined, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber ?? undefined, micro: r.micro ?? undefined }); haptic(); toast("Added"); },
  manual: async () => {
    const v = Object.fromEntries(["name", "kcal", "protein", "carbs", "fat"].map((n) => [n, $(`#manual [name=${n}]`).value]));
    if (!v.name.trim()) throw new Error("Type a name for the food.");
    await logFood({ name: v.name, kcal: +v.kcal || 0, protein: +v.protein || 0, carbs: +v.carbs || 0, fat: +v.fat || 0 });
    toast("Added");
  },
  foodtip: async (t) => {
    $("#fq").value = t.dataset.q;
    await ACTIONS.fsearch();
    setTimeout(() => $("#fq")?.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  },
  logMine: async (t) => {
    const m = S.mymeals[t.dataset.i], sv = parseFloat($("[name=sv]", t.parentElement.parentElement).value) || 1;
    await logFood({ name: sv === 1 ? m.name : `${m.name} ×${sv}`, grams: Math.round(m.grams * sv), kcal: Math.round(m.kcal * sv), protein: r1(m.protein * sv), carbs: r1(m.carbs * sv), fat: r1(m.fat * sv), fiber: r1(m.fiber * sv), micro: scaleMicro(m.micro, sv) });
    haptic(); toast("Added");
  },
  delMine: async (t) => { S.mymeals.splice(t.dataset.i, 1); await saveSetting("mymeals", S.mymeals); },
  fdel: async (t) => {
    const r = S.food.find((x) => String(x.id) === t.dataset.id);
    if (t.dataset.id.startsWith("q")) { cache.set("outbox", outbox().filter((o) => "q" + o.t !== t.dataset.id)); await loadFood(); return; }
    await api("/api/food/" + t.dataset.id, { method: "DELETE" }); await loadFood();
    if (r) toast("Removed", async () => { const { name, grams, kcal, protein, carbs, fat, fiber, meal, micro } = r; await api("/api/food", { method: "POST", body: { date: S.today, name, grams: grams ?? undefined, kcal, protein, carbs, fat, fiber: fiber ?? undefined, meal: meal ?? undefined, micro: micro ?? undefined } }); await loadFood(); });
  },
  editfood: (t) => {
    const r = S.food.find((x) => String(x.id) === t.dataset.id);
    if (!r) return false;
    if (r.pending) throw new Error("This one is still waiting for signal. Edit it after it syncs.");
    openSheet(`<h2>Edit food</h2>
      <div class="field"><label for="ef-name">Name</label><input id="ef-name" maxlength="120" value="${esc(r.name)}"></div>
      <div class="field"><label for="ef-amt">${r.grams ? "Amount (grams)" : "How many (1 = what you logged)"}</label><input id="ef-amt" type="number" inputmode="decimal" min="0.1" step="any" value="${r.grams ? Math.round(r.grams) : 1}"></div>
      <div class="field"><label for="ef-meal">Meal</label><select id="ef-meal">${MEALS.map(([id, l]) => `<option value="${id}" ${(r.meal ?? "snack") === id ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <p class="dim">Calories, macros, fiber and vitamins scale with the amount.</p>
      <button class="btn primary wide" data-act="savefood" data-id="${r.id}">Save</button>`);
    return false;
  },
  savefood: async (t) => {
    const r = S.food.find((x) => String(x.id) === t.dataset.id), amt = parseFloat($("#ef-amt").value), name = $("#ef-name").value.trim();
    if (!name) throw new Error("Give it a name.");
    if (!(amt > 0)) throw new Error("Type an amount above 0.");
    const k = r.grams ? amt / r.grams : amt, p = (v) => r1(v * k);
    await api("/api/food/" + r.id, { method: "PATCH", body: { name, grams: r.grams ? amt : undefined, kcal: Math.round(r.kcal * k), protein: p(r.protein), carbs: p(r.carbs), fat: p(r.fat), fiber: r.fiber != null ? p(r.fiber) : undefined, meal: $("#ef-meal").value, micro: r.micro ? scaleMicro(r.micro, k) : undefined } });
    closeSheet(); await loadFood(); haptic(); toast("Updated ✓");
  },
  logPlanned: async (t) => {
    const m = planMeals(S.plan, new Date().getDay())[t.dataset.i];
    S.mealSel = m.slot.toLowerCase();
    await logFood({ name: m.recipe.name, grams: totalGrams(m.recipe), ...m.recipe.totals, micro: m.recipe.micro });
    S.mealSel = null; toast("Logged");
  },
  copyYesterday: async () => {
    const rows = withMicro(await api("/api/food?date=" + shiftDay(-1)));
    if (!rows.length) throw new Error("Nothing was logged yesterday.");
    for (const r of rows) await api("/api/food", { method: "POST", body: { date: S.today, name: r.name, grams: r.grams ?? undefined, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber ?? undefined, micro: r.micro ?? undefined, meal: r.meal ?? undefined } });
    await loadFood(); toast(`Copied ${rows.length} items`);
  },
  drink: async (t) => { await setWater(water() + Number(t.dataset.oz), Number(t.dataset.oz)); },
  undrink: async () => { await setWater(Math.max(0, water() - (S.waterLast || 8))); S.waterLast = 0; },
  applyCheck: async (t) => {
    S.profile.adjust += Number(t.dataset.d); S.profile.lastAdjust = S.today;
    await saveProfile(); toast("Calories updated");
  },
  skipCheck: () => { S.dismissCheck = true; },
  dinnerLeft: () => {
    const t = targets(), f = S.food;
    const todo = planMeals(S.plan, new Date().getDay()).filter((m) => !f.some((x) => x.name === m.recipe.name));
    const kcal = t.kcal - sum(f, "kcal") - sum(todo.map((m) => m.recipe.totals), "kcal");
    const protein = t.protein - sum(f, "protein") - sum(todo.map((m) => m.recipe.totals), "protein");
    S.cook = { ...S.cook, min_protein: Math.min(60, Math.max(20, Math.round(protein))), max_kcal: Math.min(1300, Math.max(300, Math.round(kcal))), min_kcal: 0 };
    S.cookTab = "tonight"; S.recipes = null; go("cook");
  },
});
