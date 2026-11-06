import { $, esc, r1, S, api, ACTIONS, CHANGES, hooks, toast, openSheet, closeSheet, header, seg, stepper, saveSetting, saveProfile, targets, go } from "./lib.js";
import { DOW, orderedDays, planMeals, dayTotals, groceries } from "./plan.js";
import { loadFood } from "./eat.js";
import { haptic } from "./fx.js";

// ---------- food preferences: Love / Avoid / Never ----------
const CATS = [
  ["redmeat", "Red meat", ["beef", "steak", "lamb", "veal", "bison"]],
  ["pork", "Pork", ["pork", "bacon", "ham", "sausage", "prosciutto"]],
  ["fish", "Fish", ["fish", "salmon", "tuna", "cod", "tilapia", "sardine", "anchovy", "trout"]],
  ["shellfish", "Shellfish", ["shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster"]],
  ["dairy", "Dairy", ["milk", "cheese", "yogurt", "butter", "cream", "whey", "paneer", "ghee"]],
  ["eggs", "Eggs", ["egg"]],
  ["gluten", "Gluten (wheat)", ["wheat", "bread", "pasta", "flour", "tortilla", "couscous", "barley", "rye", "noodle", "seitan"]],
  ["nuts", "Nuts and peanuts", ["almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut", "peanut"]],
  ["soy", "Soy", ["soy", "tofu", "tempeh", "edamame", "miso"]],
  ["mushrooms", "Mushrooms", ["mushroom"]],
  ["spicy", "Spicy food", ["chili", "chile", "jalapeno", "cayenne", "sriracha", "hot sauce"]],
  ["cilantro", "Cilantro", ["cilantro", "coriander"]],
];
const NEXT = { none: "love", love: "avoid", avoid: "never", never: "none" };
const STATE_LABEL = { none: "No preference", love: "Love", avoid: "Avoid", never: "Never" };
const STATE_ICON = { none: "○", love: "♥", avoid: "–", never: "✕" };

function prefTerms() {
  const out = { never: [], avoid: [], love: [] };
  for (const [id, , terms] of CATS) { const s = S.prefs.states[id]; if (out[s]) out[s].push(...terms); }
  for (const c of S.prefs.custom) out[c.state]?.push(c.term);
  return out;
}
const blockedRe = () => {
  const n = prefTerms().never;
  return n.length ? new RegExp(`\\b(${n.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(s|es)?\\b`, "i") : null;
};

function openPrefs() {
  const custom = S.prefs.custom;
  openSheet(`<h2>Foods you like and don't</h2>
    <p class="dim">Tap a food to change it: ♥ love, – avoid, ✕ never. "Never" foods will not appear in any recipe. This is a taste filter, not an allergy guarantee.</p>
    <label class="dim" for="diet">Diet</label>
    <select id="diet" data-change="cookf" data-f="diet"><option value="chicken_ok" ${S.cook.diet === "chicken_ok" ? "selected" : ""}>Vegetarian + chicken</option><option value="vegetarian" ${S.cook.diet === "vegetarian" ? "selected" : ""}>Vegetarian only</option></select>
    <div class="prefs">${CATS.map(([id, label]) => { const s = S.prefs.states[id] ?? "none";
      return `<button class="pf ${s}" data-act="prefcycle" data-id="${id}" aria-label="${label}: ${STATE_LABEL[s]}. Tap to change."><span>${STATE_ICON[s]}</span> ${label}</button>`; }).join("")}</div>
    ${custom.map((c, i) => `<div class="row between item"><span>${STATE_ICON[c.state]} ${esc(c.term)} <span class="dim">(${STATE_LABEL[c.state]})</span></span><button class="x" data-act="prefdel" data-i="${i}" aria-label="Remove ${esc(c.term)}">✕</button></div>`).join("")}
    <div class="row" style="margin:10px 0"><input id="prefterm" class="grow" placeholder="Add a food, like olives" aria-label="Add a food" data-enter="prefadd">
      <select id="prefstate" aria-label="Preference"><option value="never">Never</option><option value="avoid">Avoid</option><option value="love">Love</option></select>
      <button class="btn" data-act="prefadd">Add</button></div>`);
}

// ---------- pantry ----------
const PANTRY = {
  Protein: ["chicken breast", "eggs", "tofu", "greek yogurt", "cottage cheese", "lentils", "chickpeas", "black beans", "tempeh", "feta"],
  Grains: ["rice", "oats", "pasta", "quinoa", "bread", "tortillas", "potatoes", "sweet potato"],
  Vegetables: ["spinach", "broccoli", "onion", "garlic", "tomato", "bell pepper", "carrot", "mushrooms", "zucchini", "kale", "cucumber"],
  "Dairy and fruit": ["milk", "cheese", "butter", "avocado", "banana", "berries", "apple", "lemon"],
  Cupboard: ["olive oil", "canned tomatoes", "soy sauce", "peanut butter", "honey", "nuts", "chia seeds"],
};
const stem = (s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/s$/, ""));
const inPantry = (name) => S.pantry.some((p) => stem(p).some((w) => stem(name).includes(w)));
const STAPLE = /oil|salt|pepper|water|cumin|paprika|oregano|basil|thyme|cinnamon|vinegar|spice|herb|powder|seasoning/i;
const missing = (r) => r.ingredients.filter((i) => i.grams >= 15 && !STAPLE.test(i.name) && !inPantry(i.name)).map((i) => i.name);
const totalGrams = (r) => Math.round(r.ingredients.reduce((a, i) => a + i.grams, 0));

const reqBody = (kind, extra) => ({ kind, diet: S.cook.diet, ...prefTerms(), ...extra });

// ---------- recipe card ----------
function recipeCard(r, i) {
  const need = missing(r);
  const state = r.fits ? `<span class="badge direct">fits your targets</span>` : r.complete ? `<span class="badge">misses your targets</span>` : `<span class="badge">some data missing</span>`;
  return `<div class="card ${r.fits ? "pref" : ""}">
    <div class="row between"><h2>${esc(r.name)}</h2>${state}</div>
    <div class="big"><b>${r.totals.protein} g protein</b> · ${r.totals.kcal} calories</div>
    <div class="dim">${r.totals.carbs} carbs · ${r.totals.fat} fat${r.minutes ? ` · ${r.minutes} min` : ""} · per serving</div>
    ${S.recipes ? (need.length ? `<p><b>You need:</b> ${esc(need.join(", "))}</p>` : `<p class="ok"><b>You have everything.</b></p>`) : ""}
    ${r.scaled ? `<p class="dim">Portions adjusted (×${r.scaled}) to fit your targets.</p>` : ""}
    <details><summary class="dim">Ingredients</summary><ul class="tight">${r.ingredients.map((x) => `<li>${esc(x.name)} ${x.grams} g<div class="dim">${x.match ? "USDA: " + esc(x.match) : x.grams < 5 ? "pinch, not counted" : "no match, not counted"}</div></li>`).join("")}</ul>
      ${r.unmatched.length ? `<div class="warn">Not counted: ${esc(r.unmatched.join(", "))}</div>` : ""}</details>
    <details><summary class="dim">Steps</summary><ol class="tight">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>
    ${i != null ? `<div class="row"><button class="btn primary" data-act="logRecipe" data-i="${i}">I ate this</button><button class="btn" data-act="cookMode" data-src="r" data-i="${i}">👩‍🍳 Cook it</button><button class="btn" data-act="saveRecipe" data-i="${i}">⭐ Save</button></div>` : ""}</div>`;
}

// ---------- tonight ----------
function tonight() {
  const c = S.cook, re = blockedRe();
  const custom = S.pantry.filter((p) => !Object.values(PANTRY).flat().includes(p));
  return `<div class="card"><div class="row between"><h2>Preferences</h2><button class="btn" data-act="openPrefs">Edit</button></div>
      <p class="dim">${prefSummary()}</p></div>
    <div class="card"><h2>What do you have?</h2>
      ${Object.entries(PANTRY).map(([cat, items]) => `<div class="dim cat">${cat}</div><div class="row chips">${items.filter((it) => !(re && re.test(it))).map((it) =>
        `<button class="chip ${S.pantry.includes(it) ? "on" : ""}" aria-pressed="${S.pantry.includes(it)}" data-act="ptoggle" data-v="${esc(it)}">${esc(it)}</button>`).join("")}</div>`).join("")}
      ${custom.length ? `<div class="dim cat">Other</div><div class="row chips">${custom.map((it) => `<button class="chip on" aria-pressed="true" data-act="ptoggle" data-v="${esc(it)}">${esc(it)} ✕</button>`).join("")}</div>` : ""}
      <div class="row" style="margin-top:10px"><input id="pin" class="grow" placeholder="Add something else" aria-label="Add something else" data-enter="padd"><button class="btn" data-act="padd">Add</button></div>
    </div>
    <div class="card"><h2>What do you want?</h2>
      <div class="field"><label>Time</label><select data-change="cookf" data-f="max_minutes">${[15, 30, 45, 60].map((m) => `<option value="${m}" ${c.max_minutes === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></div>
      <div class="field"><label>Protein at least (g)</label>${stepper("mp", c.min_protein, 5, "protein")}</div>
      <div class="field"><label>Calories at most</label>${stepper("mk", c.max_kcal, 50, "calories")}</div>
      <label class="check"><input type="checkbox" data-change="cookf" data-f="strict" ${c.strict ? "checked" : ""}> Only use what I have</label>
      <button class="btn primary wide" data-act="suggest" ${S.busy ? "disabled" : ""}>${S.busy || "Suggest 3 meals"}</button></div>
    ${(S.recipes ?? []).map((r, i) => recipeCard(r, i)).join("")}
    ${S.recipes ? `<p class="dim">Calories and protein are worked out from USDA food data, not guessed by the AI.</p>` : ""}
    ${S.saved.length ? `<h2 class="sect">⭐ Saved recipes</h2>${S.saved.map((r, i) => `<div class="card"><div class="row between"><h2>${esc(r.name)}</h2><button class="x" data-act="delSaved" data-i="${i}" aria-label="Remove ${esc(r.name)}">✕</button></div>
      <div class="dim"><b>${r.totals.protein} g protein</b> · ${r.totals.kcal} cal${r.minutes ? ` · ${r.minutes} min` : ""}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-act="logSaved" data-i="${i}">I ate this</button><button class="btn" data-act="cookMode" data-src="s" data-i="${i}">👩‍🍳 Cook it</button></div></div>`).join("")}` : ""}`;
}
function prefSummary() {
  const p = { never: [], avoid: [], love: [] };
  for (const [id, label] of CATS) { const s = S.prefs.states[id]; if (p[s]) p[s].push(label.toLowerCase()); }
  for (const c of S.prefs.custom) p[c.state]?.push(c.term);
  const parts = [["Never", p.never], ["Avoid", p.avoid], ["Love", p.love]].filter(([, a]) => a.length).map(([l, a]) => `<b>${l}:</b> ${esc(a.join(", "))}`);
  return `${S.cook.diet === "vegetarian" ? "Vegetarian" : "Vegetarian + chicken"}. ${parts.join(" · ") || "No other preferences set."}`;
}

// ---------- prep week ----------
function week() {
  const pl = S.plan, t = targets();
  const days = DOW.map((d, i) => [i, d]).sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7));
  const head = `<div class="card"><h2>Prep days</h2><p class="dim">Which days do you want breakfast and lunch ready? Dinner stays flexible.</p>
    <div class="row chips">${days.map(([i, d]) => `<button class="chip ${S.profile.prepDays.includes(i) ? "on" : ""}" aria-pressed="${S.profile.prepDays.includes(i)}" data-act="pday" data-v="${i}">${d}</button>`).join("")}</div>
    <button class="btn primary wide" style="margin-top:12px" data-act="makePlan" ${S.busy ? "disabled" : ""}>${S.busy || (pl ? "Make a new plan" : "Make my prep plan")}</button>
    <p class="dim">Breakfast is overnight oats in jars. Lunch is cooked once and eaten over several days. Each meal is sized to your targets.</p></div>`;
  if (!pl) return head;
  const rows = orderedDays(pl).map((d) => { const m = planMeals(pl, d), tot = dayTotals(m);
    return `<div class="card"><div class="row between"><h2>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}</h2><span class="dim">${tot.kcal} cal · ${tot.protein} g protein</span></div>
      ${m.map((x) => `<div><b>${x.slot}:</b> ${esc(x.recipe.name)}</div>`).join("")}
      <div class="dim">Left for dinner and snacks: ${Math.max(0, t.kcal - tot.kcal)} cal, ${Math.max(0, t.protein - tot.protein)} g protein</div></div>`; }).join("");
  const batch = (label, r, n, slot) => `<div class="card"><div class="row between"><h2>${label}: ${esc(r.name)}</h2><span class="row nowrap"><button class="btn" data-act="cookMode" data-src="p" data-slot="${slot}" aria-label="Cook mode">👩‍🍳</button><button class="btn" data-act="swap" data-slot="${slot}">Change</button></span></div>
    <div class="big"><b>Make ${n} servings</b></div><div class="dim">${r.totals.protein} g protein · ${r.totals.kcal} cal each</div>
    ${r.scaled ? `<p class="dim">Portions adjusted (×${r.scaled}) to fit your calories.</p>` : ""}
    ${r.fits ? "" : `<p class="warn">This one does not reach your targets (${r.complete ? "protein or calories are off" : "some ingredients had no data"}). Tap Change to see other ideas, or relax a food preference.</p>`}
    <ul class="tight">${r.ingredients.filter((i) => i.grams >= 5 || /oil|butter/i.test(i.name)).map((i) => `<li>${esc(i.name)}: ${Math.round(i.grams * n)} g</li>`).join("")}</ul>
    <details><summary class="dim">Steps</summary><ol class="tight">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details></div>`;
  return `${head}<h2 class="sect">Your week</h2>${rows}<h2 class="sect">Cook once</h2>
    ${batch("Breakfast", pl.breakfast.recipe, pl.breakfast.servings, "b")}${pl.lunches.map((l, i) => batch("Lunch " + (i + 1), l.recipe, l.servings, "l" + i)).join("")}
    <button class="btn wide" data-act="clearPlan">Clear this plan</button>`;
}

// ---------- groceries ----------
function groceriesView() {
  if (!S.plan) return `<div class="card"><p>Make a prep plan first. Your shopping list is built from it.</p><button class="btn primary" data-act="cooktab" data-v="week">Go to prep week</button></div>`;
  const list = groceries(S.plan), ck = S.plan.checked ?? {};
  const sorted = [...list].sort((a, b) => !!ck[a.key] - !!ck[b.key] || a.name.localeCompare(b.name));
  return `<div class="card"><div class="row between"><h2>Shopping list</h2><span class="dim">${list.filter((x) => ck[x.key]).length} of ${list.length} done</span></div>
    ${sorted.map((x) => `<label class="check item ${ck[x.key] ? "done" : ""}"><input type="checkbox" data-change="gcheck" data-k="${esc(x.key)}" ${ck[x.key] ? "checked" : ""}>
      <span>${esc(x.name)} <b>${x.grams} g</b>${inPantry(x.name) ? ` <span class="dim">(you have some)</span>` : ""}</span></label>`).join("")}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="gcopy">Copy list</button><button class="btn" data-act="guncheck">Clear ticks</button></div></div>`;
}

export function renderCook() {
  $("#view").innerHTML = `${header("Cook")}${seg([["tonight", "Tonight"], ["week", "Prep week"], ["groceries", "Shopping"]], S.cookTab, "cooktab")}
    ${S.cookTab === "tonight" ? tonight() : S.cookTab === "week" ? week() : groceriesView()}`;
}

function cookSheet() {
  const c = S.cm, last = c.i === c.steps.length - 1;
  openSheet(`<div class="cm"><div class="stepno">${esc(c.name)} · step ${c.i + 1} of ${c.steps.length}</div>
    <div class="stepText">${esc(c.steps[c.i])}</div>
    <div class="dots">${c.steps.map((_, k) => `<i class="${k === c.i ? "on" : ""}"></i>`).join("")}</div>
    <div class="row"><button class="btn grow" data-act="cmstep" data-d="-1" ${c.i === 0 ? "disabled" : ""}>← Back</button>
      ${last ? "" : `<button class="btn primary grow" data-act="cmstep" data-d="1">Next →</button>`}</div></div>`);
}

// ---------- actions ----------
async function generate(kind, extra) { return api("/api/recipes", { method: "POST", body: reqBody(kind, extra) }); }
const slotReq = (share) => { const t = targets(); return { min_protein: Math.round(t.protein / 4 - 2), min_kcal: Math.round(t.kcal * share * 0.85), max_kcal: Math.round(t.kcal * share * 1.15) }; };
const slotCfg = { b: ["breakfast", 0.25, 10], l0: ["lunch", 0.3, 45], l1: ["lunch", 0.3, 45] };

Object.assign(ACTIONS, {
  cooktab: (t) => { S.cookTab = t.dataset.v; },
  openPrefs: () => { openPrefs(); return false; },
  prefcycle: async (t) => { const id = t.dataset.id; S.prefs.states[id] = NEXT[S.prefs.states[id] ?? "none"]; await saveSetting("prefs", S.prefs); openPrefs(); return false; },
  prefadd: async () => {
    const term = $("#prefterm").value.trim().toLowerCase();
    if (!term || term.length > 30) return false;
    S.prefs.custom.push({ term, state: $("#prefstate").value }); await saveSetting("prefs", S.prefs); openPrefs(); return false;
  },
  prefdel: async (t) => { S.prefs.custom.splice(t.dataset.i, 1); await saveSetting("prefs", S.prefs); openPrefs(); return false; },
  ptoggle: async (t) => {
    const v = t.dataset.v, i = S.pantry.indexOf(v);
    if (i >= 0) S.pantry.splice(i, 1); else S.pantry.push(v);
    await saveSetting("pantry", S.pantry);
  },
  padd: async () => {
    const v = $("#pin").value.trim().toLowerCase();
    if (!v || v.length > 40) return;
    if (!S.pantry.includes(v)) S.pantry.push(v);
    await saveSetting("pantry", S.pantry);
  },
  suggest: async () => {
    if (!S.pantry.length) throw new Error("Tap at least one thing you have.");
    S.cook.min_protein = +$("[name=mp]").value || 0; S.cook.max_kcal = +$("[name=mk]").value || 800; S.cook.min_kcal = 0;
    S.busy = "Thinking… about 20 seconds"; S.recipes = null; hooks.render();
    try {
      await saveSetting("cook", S.cook);
      S.recipes = await generate("dinner", { pantry: S.pantry, strict: !!S.cook.strict, max_minutes: S.cook.max_minutes, min_protein: S.cook.min_protein, max_kcal: S.cook.max_kcal });
    } finally { S.busy = ""; }
  },
  logRecipe: async (t) => {
    const r = S.recipes[t.dataset.i];
    await api("/api/food", { method: "POST", body: { date: S.today, meal: "dinner", name: r.name, grams: totalGrams(r), ...r.totals, micro: r.micro } });
    await loadFood(); haptic(); toast("Logged. Check the Eat tab.");
  },
  saveRecipe: async (t) => {
    const r = S.recipes[t.dataset.i];
    const slim = { name: r.name, minutes: r.minutes, totals: r.totals, micro: r.micro, ingredients: r.ingredients.map((x) => ({ name: x.name, grams: x.grams })), steps: r.steps };
    S.saved = [slim, ...S.saved.filter((x) => x.name !== r.name)].slice(0, 20);
    await saveSetting("saved", S.saved); toast("Saved ⭐");
  },
  delSaved: async (t) => { S.saved.splice(t.dataset.i, 1); await saveSetting("saved", S.saved); },
  logSaved: async (t) => {
    const r = S.saved[t.dataset.i];
    await api("/api/food", { method: "POST", body: { date: S.today, meal: "dinner", name: r.name, grams: totalGrams(r), ...r.totals, micro: r.micro } });
    await loadFood(); haptic(); toast("Logged. Check the Eat tab.");
  },
  // cook mode: one big step at a time, screen stays awake
  cookMode: async (t) => {
    const src = t.dataset.src;
    const r = src === "r" ? S.recipes[t.dataset.i] : src === "s" ? S.saved[t.dataset.i] : t.dataset.slot === "b" ? S.plan.breakfast.recipe : S.plan.lunches[+t.dataset.slot[1]].recipe;
    const gather = "Get out: " + r.ingredients.filter((i) => i.grams >= 5).map((i) => `${i.name} (${i.grams} g)`).join(", ") + ".";
    S.cm = { name: r.name, steps: [gather, ...r.steps, "All done. Enjoy your meal! 🎉"], i: 0 };
    try { S.wl = await navigator.wakeLock?.request("screen"); } catch {}
    cookSheet(); return false;
  },
  cmstep: (t) => { S.cm.i = Math.max(0, Math.min(S.cm.steps.length - 1, S.cm.i + Number(t.dataset.d))); cookSheet(); return false; },

  pday: async (t) => {
    const d = Number(t.dataset.v), a = S.profile.prepDays, i = a.indexOf(d);
    if (i >= 0) a.splice(i, 1); else a.push(d);
    await saveProfile();
  },
  makePlan: async () => {
    const days = S.profile.prepDays.length;
    if (!days) throw new Error("Pick at least one prep day.");
    try {
      S.busy = "Finding overnight oats… about 20 seconds"; hooks.render();
      const bf = await generate("breakfast", { max_minutes: 10, ...slotReq(0.25) });
      S.busy = "Finding lunches… about 20 seconds"; hooks.render();
      const ln = await generate("lunch", { max_minutes: 45, ...slotReq(0.3) });
      const lunches = ln.length > 1 && days > 1
        ? [{ recipe: ln[0], options: ln, servings: Math.ceil(days / 2) }, { recipe: ln[1], options: ln, servings: Math.floor(days / 2) }]
        : [{ recipe: ln[0], options: ln, servings: days }];
      S.plan = { made: S.today, weekdays: [...S.profile.prepDays], breakfast: { recipe: bf[0], options: bf, servings: days }, lunches, checked: {} };
      await saveSetting("plan", S.plan);
      toast("Plan ready");
    } finally { S.busy = ""; }
  },
  clearPlan: async () => { if (!confirm("Clear this plan?")) return false; S.plan = null; await saveSetting("plan", null); },
  swap: (t) => {
    const slot = t.dataset.slot, p = slot === "b" ? S.plan.breakfast : S.plan.lunches[+slot[1]];
    openSheet(`<h2>Choose a different one</h2>${p.options.map((r, i) => `<div class="card ${r === p.recipe || r.name === p.recipe.name ? "pref" : ""}"><b>${esc(r.name)}</b>
      <div class="dim">${r.totals.protein} g protein · ${r.totals.kcal} cal${r.fits ? " · fits your targets" : ""}</div>
      <button class="btn" data-act="useopt" data-slot="${slot}" data-i="${i}">Use this</button></div>`).join("")}
      <button class="btn wide" data-act="moreideas" data-slot="${slot}">${S.busy || "Show me new ideas"}</button>`);
    return false;
  },
  useopt: async (t) => {
    const slot = t.dataset.slot, p = slot === "b" ? S.plan.breakfast : S.plan.lunches[+slot[1]];
    p.recipe = p.options[t.dataset.i]; await saveSetting("plan", S.plan); closeSheet();
  },
  moreideas: async (t) => {
    const slot = t.dataset.slot, p = slot === "b" ? S.plan.breakfast : S.plan.lunches[+slot[1]], [kind, share, mins] = slotCfg[slot];
    S.busy = "Thinking…"; $("[data-act=moreideas]").textContent = S.busy;
    try { p.options = await generate(kind, { max_minutes: mins, ...slotReq(share) }); p.recipe = p.options[0]; await saveSetting("plan", S.plan); }
    finally { S.busy = ""; }
    closeSheet(); toast("New ideas ready");
  },
  gcopy: async () => {
    const text = groceries(S.plan).map((x) => `${x.name} - ${x.grams} g`).join("\n");
    try { await navigator.clipboard.writeText(text); toast("List copied"); } catch { throw new Error("Could not copy. Take a screenshot of the list instead."); }
    return false;
  },
  guncheck: async () => { S.plan.checked = {}; await saveSetting("plan", S.plan); },
});

Object.assign(CHANGES, {
  cookf: async (el) => {
    const f = el.dataset.f;
    S.cook[f] = f === "strict" ? el.checked : f === "max_minutes" ? Number(el.value) : el.value;
    await saveSetting("cook", S.cook);
    if (f === "diet") openPrefs();
  },
  gcheck: async (el) => { (S.plan.checked ??= {})[el.dataset.k] = el.checked; await saveSetting("plan", S.plan); },
});
