// Build a meal from ingredients (dal, curry, protein shake): USDA numbers add up, then log it or save it to "My meals".
import { $, esc, r1, S, api, ACTIONS, hooks, toast, header, go, saveSetting } from "./lib.js";
import { dishTotals, perServing, labelFood, topMicros, scaleMicro } from "./nutri.js";
import { logFood } from "./eat.js";
import { haptic } from "./fx.js";

const D = () => (S.dish ??= { name: "", servings: 2, items: [], q: "", res: null, busy: "" });

// the inputs are the truth while typing; copy them into state before any action
function sync() {
  const d = D();
  d.name = $("#dname")?.value ?? d.name;
  d.servings = Math.max(0.5, Math.min(24, parseFloat($("#dserv")?.value) || d.servings));
  document.querySelectorAll("[data-dg]").forEach((el) => { d.items[el.dataset.dg].grams = parseFloat(el.value) || 0; });
  return d;
}

const totalsHtml = () => {
  const d = D(), t = dishTotals(d.items), p = perServing(t, d.servings);
  return `<div class="stats"><div><b>${p.kcal}</b><span class="dim">cal</span></div><div><b>${p.protein}</b><span class="dim">g protein</span></div><div><b>${p.carbs}</b><span class="dim">g carbs</span></div></div>
    <div class="stats"><div><b>${p.fat}</b><span class="dim">g fat</span></div><div><b>${p.fiber}</b><span class="dim">g fiber</span></div><div><b>${p.grams}</b><span class="dim">g food</span></div></div>
    <p class="dim center">Per serving, for ${d.servings} serving${d.servings === 1 ? "" : "s"} in total (${Math.round(t.kcal)} cal in the whole dish).</p>
    ${t.missing ? `<p class="warn">⚠ ${t.missing} ingredient${t.missing > 1 ? "s" : ""} with no USDA match ${t.missing > 1 ? "are" : "is"} not counted.</p>` : ""}`;
};

export function renderDish() {
  const d = D();
  $("#view").innerHTML = `<header class="top"><div><h1>${d.editing ? "Edit meal" : "Build a meal"}</h1><div class="dim">Add up the ingredients. USDA does the math.</div></div><button class="btn" data-act="dishback">Back</button></header>
    <div class="card"><h2>✨ Describe it</h2>
      <p class="dim">Type a dish and the AI lists the ingredients. It only guesses the amounts, so check them below. USDA data does the math.</p>
      <div class="row"><input id="ddesc" class="grow" placeholder="Like: yellow curry fried rice" data-enter="dsuggest" aria-label="Describe your dish"><button class="btn primary" data-act="dsuggest">${d.busy ? "…" : "Suggest"}</button></div>
      ${d.busy ? `<p class="dim">${esc(d.busy)}</p>` : ""}</div>
    <div class="card"><h2>🧾 Ingredients</h2>
      <p class="dim">Weigh things raw or dry (dry rice, dry lentils). Cooking adds water, not calories. If you weigh it cooked, pick the "cooked" version when you search.</p>
      ${d.items.length ? d.items.map((i, n) => `<div class="item"><div class="row between"><div><b>${esc(i.name)}</b>${i.f ? `<div class="dim small">${esc(i.f.name)}</div>` : `<div class="warn small">No USDA match, so it is not counted. Remove it, or search for it below.</div>`}</div>
        <button class="x" data-act="ditemrm" data-i="${n}" aria-label="Remove ${esc(i.name)}">✕</button></div>
        <div class="row"><input class="num" data-dg="${n}" type="number" inputmode="decimal" min="0" value="${i.grams}" aria-label="Grams of ${esc(i.name)}"> g</div></div>`).join("") : `<p class="dim">Nothing yet. Search below or describe the dish above.</p>`}
      <div class="row"><input id="dq" class="grow" placeholder="Search an ingredient" value="${esc(d.q)}" data-enter="dsearch" aria-label="Search ingredient"><button class="btn primary" data-act="dsearch">Search</button></div>
      ${d.res ? (d.res.length ? d.res.map((x, i) => `<div class="item"><div>${esc(x.name)}</div>
        <div class="dim">per 100 g: ${Math.round(x.kcal)} cal · ${r1(x.protein)} protein · ${r1(x.carbs)} carbs · ${r1(x.fat)} fat</div>
        ${topMicros(x.micro, S.profile.sex, 2).length ? `<div class="dim small">Rich in: ${topMicros(x.micro, S.profile.sex, 2).map((m) => `${m.label} ${Math.round(m.pct * 100)}%`).join(" · ")}</div>` : ""}
        <div class="row"><input name="g" class="num" type="number" inputmode="decimal" min="1" placeholder="grams" aria-label="Grams"> g <button class="btn primary" data-act="dadd" data-i="${i}">Add</button></div></div>`).join("") : `<p class="dim">Nothing found. Try a simpler word.</p>`) : ""}
      <details><summary class="dim">Add from a label (protein powder, packaged food, restaurant)</summary>
        <p class="dim">Type the numbers for the amount you use, like one scoop.</p>
        <div class="row" id="dlabel"><input class="grow" name="name" placeholder="Name, like Protein powder" aria-label="Name">
          <input name="grams" type="number" inputmode="decimal" placeholder="grams" aria-label="Grams in this amount"><input name="kcal" type="number" inputmode="decimal" placeholder="calories" aria-label="Calories">
          <input name="protein" type="number" inputmode="decimal" placeholder="protein g" aria-label="Protein grams"><input name="carbs" type="number" inputmode="decimal" placeholder="carbs g" aria-label="Carbs grams">
          <input name="fat" type="number" inputmode="decimal" placeholder="fat g" aria-label="Fat grams"><input name="fiber" type="number" inputmode="decimal" placeholder="fiber g" aria-label="Fiber grams">
          <button class="btn" data-act="dlabel">Add</button></div></details></div>
    <div class="card"><h2>🍽️ Your meal</h2>
      <div class="field"><label for="dname">Name</label><input id="dname" value="${esc(d.name)}" maxlength="60" placeholder="Like: Spinach dal"></div>
      <div class="field"><label for="dserv">Servings it makes</label><input id="dserv" class="num" type="number" inputmode="decimal" min="0.5" step="0.5" value="${d.servings}"></div>
      <div id="dtotals">${totalsHtml()}</div>
      <button class="btn primary wide" data-act="dsavelog">Save to My meals and add 1 serving</button>
      <button class="btn wide" data-act="dsave">Save to My meals</button>
      <button class="btn wide" data-act="dlog">Just add 1 serving to today</button>
      ${d.items.length ? `<button class="btn danger wide" data-act="dclear">Start over</button>` : ""}</div>`;
}

// totals follow the grams and servings boxes as you type, without redrawing (keeps the keyboard open)
document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id !== "dserv" && el.dataset?.dg == null) return;
  sync(); const box = $("#dtotals"); if (box) box.innerHTML = totalsHtml();
});

async function finish(save, log) {
  const d = sync(), t = dishTotals(d.items);
  if (!d.name.trim()) throw new Error("Give the meal a name.");
  if (!d.items.some((i) => i.f && i.grams > 0)) throw new Error("Add at least one ingredient.");
  const p = perServing(t, d.servings), name = d.name.trim().slice(0, 60);
  const row = { name, grams: p.grams, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, micro: p.micro };
  if (save) {
    const parts = d.items.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(", ").slice(0, 300);
    const slim = (f) => f && { name: f.name, kcal: r1(f.kcal), protein: r1(f.protein), carbs: r1(f.carbs), fat: r1(f.fat), fiber: r1(f.fiber ?? 0), micro: f.micro ?? {} };
    const items = d.items.map((i) => ({ name: i.name, grams: i.grams, f: slim(i.f) })); // kept so the meal can be edited later
    S.mymeals = [{ ...row, servings: d.servings, parts, items }, ...S.mymeals.filter((m) => m.name !== name && m.name !== d.editing)].slice(0, 30);
    await saveSetting("mymeals", S.mymeals);
  }
  if (log) await logFood(row);
  S.dish = null; S.tab = S.prevTab ?? "eat"; haptic();
  toast(save && log ? "Saved and added ✓" : save ? "Saved to My meals ✓" : "Added ✓");
}

Object.assign(ACTIONS, {
  dishopen: () => { go("dish"); },
  editMine: (t) => {
    const m = S.mymeals[t.dataset.i], n = m.servings || 1, g = Math.max(1, m.grams * n);
    // meals saved before editing existed have no ingredient list: edit them as one item
    const items = m.items ?? [{ name: m.name + " (saved)", grams: Math.round(g), f: labelFood(m.name + " (saved)", g, { kcal: m.kcal * n, protein: m.protein * n, carbs: m.carbs * n, fat: m.fat * n, fiber: (m.fiber ?? 0) * n }, scaleMicro(m.micro, n)) }];
    S.dish = { name: m.name, servings: n, items: JSON.parse(JSON.stringify(items)), q: "", res: null, busy: "", editing: m.name };
    go("dish");
  },
  dishback: () => { sync(); S.tab = S.prevTab ?? "eat"; },
  dclear: () => { if (!confirm("Clear this meal and start over?")) return false; S.dish = null; },
  ditemrm: (t) => { sync().items.splice(t.dataset.i, 1); },
  dsearch: async () => {
    const d = sync(); d.q = $("#dq").value.trim();
    if (d.q.length < 2) return false;
    d.res = await api("/api/foods?q=" + encodeURIComponent(d.q));
  },
  dadd: (t) => {
    const d = sync(), g = parseFloat($("[name=g]", t.parentElement).value);
    if (!(g > 0)) throw new Error("Type how many grams.");
    const x = d.res[t.dataset.i];
    d.items.push({ name: x.name.split(",").slice(0, 2).join(",").trim(), grams: g, f: x });
    d.res = null; d.q = "";
  },
  dlabel: () => {
    const d = sync(), v = Object.fromEntries(["name", "grams", "kcal", "protein", "carbs", "fat", "fiber"].map((n) => [n, $(`#dlabel [name=${n}]`).value]));
    const g = parseFloat(v.grams);
    if (!v.name.trim() || !(g > 0)) throw new Error("Type a name and the grams.");
    const x = { kcal: +v.kcal || 0, protein: +v.protein || 0, carbs: +v.carbs || 0, fat: +v.fat || 0, fiber: +v.fiber || 0 };
    d.items.push({ name: v.name.trim(), grams: g, f: labelFood(v.name.trim() + " (from label)", g, x) });
  },
  dsuggest: async () => {
    const d = sync(), text = $("#ddesc").value.trim();
    if (text.length < 2) throw new Error("Type a dish first.");
    if (d.items.length && !confirm("This replaces the ingredients you have now.")) return false;
    d.busy = "Thinking… about 15 seconds"; hooks.render();
    try {
      const r = await api("/api/dish", { method: "POST", body: { text, servings: Math.min(12, Math.round(d.servings) || 1) } });
      d.items = r.items; d.name = d.name.trim() || (r.name || text).slice(0, 60);
    } finally { d.busy = ""; }
  },
  dsave: () => finish(true, false),
  dlog: () => finish(false, true),
  dsavelog: () => finish(true, true),
});
