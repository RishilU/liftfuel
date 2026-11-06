// USDA lookup + recipe suggestions. Macros ALWAYS come from USDA data, never from the model.

const MEAT = "beef|pork|turkey|bacon|\\bham\\b|sausage|lamb|fish|tuna|salmon|shrimp|prawn|\\bcod\\b|steak|duck|anchov|sardine";
const BANNED = {
  vegetarian: new RegExp(`chicken|${MEAT}`, "i"),
  chicken_ok: new RegExp(MEAT, "i"),
};
const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
const SUBREQUEST_BUDGET = 40; // Workers free plan allows 50 subrequests per request
const CACHE_VERSION = "v4:"; // bump when matching rules change

// USDA nutrient number -> key. Amounts are per 100 g: mg, except vita/vitd/b12/folate in µg.
const MICRO_ID = { 301: "calcium", 303: "iron", 304: "magnesium", 306: "potassium", 309: "zinc", 320: "vita", 401: "vitc", 328: "vitd", 418: "b12", 435: "folate" };
export const MICRO_KEYS = Object.values(MICRO_ID);

export async function usdaSearch(q, key, n = 5) {
  const u = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  u.search = new URLSearchParams({ api_key: key, query: q, dataType: "Foundation,SR Legacy", pageSize: String(n) });
  const r = await fetch(u);
  if (!r.ok) throw new Error("USDA lookup failed (" + r.status + ")");
  const { foods = [] } = await r.json();
  return foods.map(per100).filter(Boolean);
}

// Per 100 g. Energy id differs by dataset (208 SR Legacy, 957/958 Foundation); fall back to Atwater from macros.
export function per100(f) {
  const v = {};
  for (const n of f.foodNutrients ?? []) v[String(n.nutrientNumber)] = n.value;
  // some Foundation entries (e.g. canola oil) list none of the standard macros; treating them as zeros would silently drop calories
  if ([203, 204, 205, 208, 957, 958].every((k) => v[k] == null)) return null;
  // carbs are "by difference" and can come back slightly negative
  const protein = Math.max(0, v[203] ?? 0), fat = Math.max(0, v[204] ?? 0), carbs = Math.max(0, v[205] ?? 0);
  const kcal = v[208] ?? v[957] ?? v[958] ?? 4 * protein + 4 * carbs + 9 * fat;
  const fiber = Math.max(0, v[291] ?? 0);
  const micro = {};
  for (const [id, k] of Object.entries(MICRO_ID)) if (v[id] > 0) micro[k] = v[id];
  return { id: f.fdcId, name: f.description, kcal, protein, carbs, fat, fiber, micro };
}

// USDA names lead with the food ("Spinach, raw", "Nuts, almonds"); reject hits like "Pasta, fresh, spinach" for "spinach".
const stems = (s) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/oes$/, "o").replace(/s$/, "")));
// generic descriptors must not count as a match ("spinach fresh" must not match "Pasta, fresh-refrigerated")
const GENERIC = new Set("raw fresh cooked canned drained dried frozen boiled baked roasted whole plain low fat lowfat nonfat skinless boneless unsalted salted".split(" "));
// prepared dishes lead with the food name too ("Spinach souffle"); whole foods only unless the query asks for one
const PREPARED = /souffl|\bpie\b|soup|salad(?! or cooking)|sandwich|pizza|casserole|cake|cookie|pudding|\bmix\b|sauce|\bdip\b|burrito|taco|stew|chips|pasta|noodle|lasagna|muffin|croquette|patty|powder|juice|paste|puree|lunchmeat|spread|baby ?food|beverage|drink/i;
// The food itself (last word before the first comma: "vegetable oil" -> oil) must be in the name, and a query word must be in its first two pieces:
// "vegetable oil" cannot match "Salsify (vegetable oyster)".
export function relevant(query, name) {
  if (PREPARED.test(name) && !PREPARED.test(query)) return false;
  const words = [...stems(query)].filter((w) => !GENERIC.has(w));
  const head = [...stems(query.split(",")[0])].filter((w) => !GENERIC.has(w)).pop();
  const lead = stems(name.split(",").slice(0, 2).join(" "));
  return words.length > 0 && stems(name).has(head ?? words[0]) && words.some((w) => lead.has(w));
}
// best of the search hits: words in the first piece of the name count double ("Oil, olive" beats "Anchovies, canned in olive oil"); USDA order breaks ties
export function pick(query, foods) {
  const q = [...stems(query)].filter((w) => !GENERIC.has(w));
  const score = (f) => { const [a, b = ""] = f.name.split(","); const x = stems(a), y = stems(b); return q.reduce((n, w) => n + (x.has(w) ? 2 : y.has(w) ? 1 : 0), 0); };
  return foods.filter((f) => relevant(query, f.name)).sort((a, b) => score(b) - score(a))[0] ?? null;
}

// store (optional): { get(key) -> food|null, set(key, food) } persists matches so repeat plans need no USDA calls.
export function makeLookup(key, search = usdaSearch, store = null) {
  const cache = new Map();
  let calls = 0;
  return async (q) => {
    q = String(q).toLowerCase().trim();
    if (!cache.has(q)) {
      cache.set(q, (async () => {
        const hit = await store?.get(CACHE_VERSION + q).catch(() => null);
        if (hit) return hit;
        if (calls++ >= SUBREQUEST_BUDGET) return null;
        const found = await search(q, key, 15).then((r) => pick(q, r), () => null); // 15 so unusable or irrelevant entries can be skipped
        if (found) await store?.set(CACHE_VERSION + q, found).catch(() => {});
        return found;
      })());
    }
    return cache.get(q);
  };
}

const str = (s, n) => String(s ?? "").slice(0, n);

export function parseModelJson(out) {
  let v = out?.response ?? out;
  if (typeof v === "string") {
    const a = v.indexOf("{"), b = v.lastIndexOf("}");
    if (a < 0 || b < a) return [];
    try { v = JSON.parse(v.slice(a, b + 1)); } catch { return []; }
  }
  return (Array.isArray(v?.recipes) ? v.recipes : []).slice(0, 3).map((r) => ({
    name: str(r.name, 80),
    minutes: Number.isFinite(r.minutes) ? Math.round(r.minutes) : null,
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 12).map((i) => ({
      name: str(i.name, 60), grams: Number(i.grams), query: str(i.query || i.name, 60),
    })).filter((i) => i.name),
    steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 10).map((s) => str(s, 300)),
  })).filter((r) => r.name && r.ingredients.length);
}

export async function computeRecipe(r, lookup) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const ingredients = [], unmatched = [], micro = {};
  for (const i of r.ingredients) {
    if (!(i.grams > 0 && i.grams <= 2000)) continue;
    if (i.grams < 5 && !/oil|butter|ghee/i.test(i.name)) { ingredients.push({ ...i, match: null }); continue; } // pinch of spice
    const f = await lookup(i.query);
    if (!f) { unmatched.push(i.name); ingredients.push({ ...i, match: null }); continue; }
    const k = i.grams / 100;
    for (const m of Object.keys(totals)) totals[m] += (f[m] ?? 0) * k;
    for (const [m, x] of Object.entries(f.micro ?? {})) micro[m] = (micro[m] ?? 0) + x * k;
    ingredients.push({ ...i, match: f.name });
  }
  for (const m of Object.keys(totals)) totals[m] = Math.round(totals[m]);
  for (const m of Object.keys(micro)) micro[m] = Math.round(micro[m] * 10) / 10;
  return { ...r, ingredients, unmatched, totals, micro, complete: unmatched.length === 0 };
}

export const allowedByDiet = (r, diet) => !BANNED[diet].test(r.ingredients.map((i) => i.name).join(" ") + " " + r.name);

// "Never" foods are enforced here, not just requested of the model. Whole-word match: "egg" blocks "eggs", not "eggplant".
const DAIRY = /^(milk|yogurt|yoghurt|butter|cream|cheese)$/;
const PLANT = /\b(soy|oat|almond|coconut|cashew|peanut|rice|sunflower|vegan)\b/i;
export function allowedByNever(r, never = []) {
  const names = [r.name, ...r.ingredients.map((i) => i.name)].map((n) => n.toLowerCase());
  return !never.some((term) => {
    const t = term.toLowerCase().trim();
    if (!t) return false;
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?\\b`, "i");
    return names.some((n) => re.test(n) && !(DAIRY.test(t) && PLANT.test(n)));
  });
}

// Scale every ingredient by one factor so a too-big (or too-small) recipe lands inside the calorie window, like halving a recipe.
// Macros are linear in grams, so totals scale the same way; grams are rounded for display.
export function fitPortions(r, p) {
  const kcal = r.totals.kcal, hi = p.max_kcal, lo = p.min_kcal ?? 0;
  if (!r.complete || kcal <= 0) return r;
  const target = kcal > hi ? hi * 0.97 : kcal < lo ? lo * 1.03 : null;
  if (target == null) return r;
  const f = Math.min(2.5, Math.max(0.4, target / kcal));
  const round = (g) => (g >= 25 ? Math.round(g / 5) * 5 : Math.round(g));
  return {
    ...r, scaled: Math.round(f * 100) / 100,
    totals: Object.fromEntries(Object.entries(r.totals).map(([k, v]) => [k, Math.round(v * f)])),
    micro: Object.fromEntries(Object.entries(r.micro ?? {}).map(([k, v]) => [k, Math.round(v * f * 10) / 10])),
    ingredients: r.ingredients.map((i) => ({ ...i, grams: round(i.grams * f) })),
  };
}

const fits = (r, p) => r.complete && r.totals.protein >= p.min_protein && r.totals.kcal <= p.max_kcal && r.totals.kcal >= (p.min_kcal ?? 0);

const KIND = {
  dinner: "dinner recipes",
  lunch: "make-ahead lunch recipes that reheat well and keep 4 days in the fridge (cooked in a batch, packed in containers)",
  breakfast: "overnight-oats style breakfasts: no cooking, assembled in a jar the night before, keep 4 days in the fridge; vary flavours and toppings between the 3 recipes",
};
const list = (a) => (a?.length ? a.join(", ") : "");

const prompt = (p, feedback) => `Write 3 different ${KIND[p.kind ?? "dinner"]}.
${p.pantry?.length ? `Pantry (available): ${p.pantry.join(", ")}. ${p.strict ? "Use ONLY pantry ingredients plus basic staples (oil, salt, spices, water)." : "Build mostly from the pantry; you may add up to 2 other ingredients."}` : "Use common whole-food ingredients."}
Diet: ${p.diet === "vegetarian" ? "vegetarian (no meat or fish)" : "vegetarian or chicken only (no other meat or fish)"}.
${p.never?.length ? `Never use: ${list(p.never)}.` : ""} ${p.avoid?.length ? `Avoid if possible: ${list(p.avoid)}.` : ""} ${p.love?.length ? `Prefer: ${list(p.love)}.` : ""}
Max cooking time: ${p.max_minutes} minutes. One serving each.
Target per serving: at least ${p.min_protein} g protein, between ${p.min_kcal ?? 0} and ${p.max_kcal} kcal.
Rules: whole foods only, no processed meat substitutes. Give every ingredient in grams (raw or as-purchased weight unless the name says "cooked") and a short USDA-style search phrase in "query" in the pattern "food, variety or cut, state" (state = raw, cooked, canned, dry, etc.) so that it names the exact form of that ingredient, not just the bare food word. Only list ingredients that belong in the recipe. Do not state calories or macros.
${feedback}
Reply with JSON only: {"recipes":[{"name":"","minutes":0,"ingredients":[{"name":"","grams":0,"query":""}],"steps":[""]}]} with exactly 3 recipes.`;

export async function askModel(ai, content) {
  let err;
  for (const model of MODELS) {
    try {
      return await ai.run(model, {
        messages: [{ role: "system", content: "You are a careful cooking assistant. Output valid JSON only." }, { role: "user", content }],
        max_tokens: 2000,
      });
    } catch (e) { err = e; }
  }
  throw err;
}

// Up to 2 attempts; second one tells the model what USDA computed for the first.
export async function suggestRecipes(ai, lookup, p) {
  const pool = [];
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await askModel(ai, prompt(p, feedback));
    const diet = p.kind === "breakfast" ? "vegetarian" : p.diet; // no meat in breakfast, whatever the diet setting
    const recipes = parseModelJson(out).filter((r) => allowedByDiet(r, diet) && allowedByNever(r, p.never));
    const computed = (await Promise.all(recipes.map((r) => computeRecipe(r, lookup)))).map((r) => fitPortions(r, p));
    pool.push(...computed.map((r) => ({ ...r, fits: fits(r, p) })));
    if (pool.filter((r) => r.fits).length >= 3) break;
    feedback = "Previous attempt, with macros computed from USDA data: " +
      pool.map((r) => `${r.name}: ${r.totals.protein} g protein, ${r.totals.kcal} kcal`).join("; ") +
      ". Adjust portions so each recipe reaches the protein target and stays within the calorie range.";
  }
  if (!pool.length) throw new Error("The model returned no usable recipes. Try again.");
  const seen = new Set(); // best version of each name wins (fits sort first)
  return pool.sort((a, b) => b.fits - a.fits).filter((r) => !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase())).slice(0, 3);
}

// "Yellow curry fried rice" -> ingredients in grams, each matched to USDA. The model only lists ingredients; the client does the math.
export async function suggestDish(ai, lookup, text, servings) {
  const out = await askModel(ai, `List the ingredients of this dish: "${text}". Quantities for ${servings} serving${servings > 1 ? "s" : ""} in total. Raw or as-purchased weight in grams (dry rice, dry lentils, raw vegetables) unless the name says "cooked". Include cooking oil and any sauce. For each ingredient give a short USDA-style search phrase in "query", pattern "food, variety, state" (state = raw, cooked, canned, dry). Do not state calories or macros.
Reply with JSON only: {"recipes":[{"name":"","ingredients":[{"name":"","grams":0,"query":""}]}]} with exactly 1 recipe.`);
  const r = parseModelJson(out)[0];
  if (!r) throw new Error("Couldn't work out that dish. Try describing it differently.");
  const items = await Promise.all(r.ingredients.filter((i) => i.grams > 0 && i.grams <= 2000).map(async (i) => ({ name: i.name, grams: Math.round(i.grams), f: await lookup(i.query) })));
  return { name: r.name, items };
}
