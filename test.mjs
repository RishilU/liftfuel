// node test.mjs — checks the recipe/macro logic with stubs (no network, no AI)
import assert from "node:assert/strict";
import { per100, makeLookup, parseModelJson, computeRecipe, allowedByDiet, allowedByNever, fitPortions, suggestRecipes } from "./src/nutrition.js";

const nut = (o) => Object.entries(o).map(([nutrientNumber, value]) => ({ nutrientNumber, value }));

// energy id fallbacks: SR Legacy 208, Foundation 957, none -> Atwater
assert.equal(per100({ fdcId: 1, description: "a", foodNutrients: nut({ 203: 7, 204: 3, 205: 20, 208: 139 }) }).kcal, 139);
assert.equal(per100({ fdcId: 2, description: "b", foodNutrients: nut({ 203: 7, 204: 3, 205: 20, 957: 137 }) }).kcal, 137);
assert.equal(per100({ fdcId: 3, description: "c", foodNutrients: nut({ 203: 10, 204: 10, 205: 10 }) }).kcal, 170);

// entries with no standard macros (Foundation canola oil) are rejected, not read as zeros
assert.equal(per100({ fdcId: 5, description: "oil", foodNutrients: nut({ 1234: 5, 1235: 9 }) }), null);

// negative "by difference" carbs are clamped to 0
assert.equal(per100({ fdcId: 4, description: "d", foodNutrients: nut({ 203: 21, 204: 5, 205: -0.4, 208: 127 }) }).carbs, 0);

// model output: prose around JSON, already-parsed object, garbage
const good = { recipes: [{ name: "Bowl", minutes: 15, ingredients: [{ name: "Chickpeas", grams: 200, query: "chickpeas canned" }], steps: ["Mix"] }] };
assert.equal(parseModelJson({ response: "Sure! " + JSON.stringify(good) + " enjoy" })[0].name, "Bowl");
assert.equal(parseModelJson({ response: good })[0].ingredients[0].grams, 200);
assert.deepEqual(parseModelJson({ response: "no json here" }), []);
assert.deepEqual(parseModelJson({ response: "{broken" }), []);

// diet filter: blocks the right things, no false positives on spices
const r = (...names) => ({ name: "x", ingredients: names.map((name) => ({ name })) });
assert.equal(allowedByDiet(r("chicken breast"), "vegetarian"), false);
assert.equal(allowedByDiet(r("chicken breast"), "chicken_ok"), true);
assert.equal(allowedByDiet(r("beef mince"), "chicken_ok"), false);
assert.equal(allowedByDiet(r("minced garlic", "ground cumin", "coconut milk", "graham"), "vegetarian"), true);

// macros come from the lookup, not the model; pinches skipped; unmatched flagged
const DB = { "chicken breast raw": { name: "Chicken, broilers or fryers, breast, raw", kcal: 120, protein: 23, carbs: 0, fat: 2.6 }, "rice cooked": { name: "Rice", kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } };
const lookup = async (q) => DB[q] ?? null;
const rec = await computeRecipe({ name: "t", ingredients: [
  { name: "chicken", grams: 200, query: "chicken breast raw" },
  { name: "cumin", grams: 2, query: "cumin" },
  { name: "mystery", grams: 100, query: "unobtainium" },
] }, lookup);
assert.deepEqual(rec.totals, { kcal: 240, protein: 46, carbs: 0, fat: 5, fiber: 0 });
assert.deepEqual(rec.unmatched, ["mystery"]);
assert.equal(rec.complete, false);

// relevance: skip look-alikes, keep real matches, give up rather than guess
const pick = (q, names) => makeLookup("k", async () => names.map((name) => ({ name })))(q).then((f) => f?.name ?? null);
assert.equal(await pick("spinach", ["Pasta, fresh-refrigerated, spinach, as purchased", "Spinach, raw"]), "Spinach, raw");
assert.equal(await pick("spinach fresh", ["Pasta, fresh-refrigerated, spinach, as purchased", "Spinach, raw"]), "Spinach, raw");
assert.equal(await pick("spinach, raw fresh", ["Pasta, fresh-refrigerated, spinach, as purchased"]), null);
assert.equal(await pick("spinach", ["Spinach souffle", "Spinach, raw"]), "Spinach, raw");
assert.equal(await pick("spinach pasta", ["Pasta, fresh-refrigerated, spinach, as purchased"]), "Pasta, fresh-refrigerated, spinach, as purchased");
assert.equal(await pick("almonds", ["Nuts, almonds"]), "Nuts, almonds");
assert.equal(await pick("eggs", ["Egg, whole, raw, fresh"]), "Egg, whole, raw, fresh");
assert.equal(await pick("greek yogurt", ["Yogurt, Greek, plain, lowfat"]), "Yogurt, Greek, plain, lowfat");
assert.equal(await pick("chickpeas canned drained", ["Chickpeas (garbanzo beans, bengal gram), canned"]), "Chickpeas (garbanzo beans, bengal gram), canned");
assert.equal(await pick("spinach", ["Pasta, fresh-refrigerated, spinach, as purchased"]), null);
assert.equal(await pick("vegetable oil", ["Salsify (vegetable oyster), raw", "Oil, vegetable, soybean, refined"]), "Oil, vegetable, soybean, refined");
assert.equal(await pick("olive oil", ["Anchovies, canned in olive oil, with salt, drained", "Oil, olive, salad or cooking"]), "Oil, olive, salad or cooking");
assert.equal(await pick("tomatoes", ["Tomato powder", "Tomatoes, red, ripe, raw"]), "Tomatoes, red, ripe, raw");
assert.equal(await pick("chicken breast", ["Lunchmeat, chicken breast, sliced", "Chicken, broilers or fryers, breast, meat only, raw"]), "Chicken, broilers or fryers, breast, meat only, raw");
assert.equal(await pick("unobtainium", ["Cheese, swiss"]), null);

// preferences: "never" is enforced in code (whole word, plant milks exempt for dairy words)
const rr = (...names) => ({ name: "Bowl", ingredients: names.map((name) => ({ name })) });
assert.equal(allowedByNever(rr("eggs", "rice"), ["egg"]), false);
assert.equal(allowedByNever(rr("eggplant", "rice"), ["egg"]), true);
assert.equal(allowedByNever(rr("peanut butter"), ["nut"]), true);          // "nut" must not match inside "peanut"
assert.equal(allowedByNever(rr("peanut butter"), ["peanut"]), false);
assert.equal(allowedByNever(rr("oat milk", "oats"), ["milk"]), true);       // plant milk is not dairy
assert.equal(allowedByNever(rr("whole milk"), ["milk"]), false);
assert.equal(allowedByNever(rr("greek yogurt"), ["yogurt", "cheese"]), false);
assert.equal(allowedByNever(rr("chicken breast"), []), true);

// breakfast is always meat-free, even on the chicken-ok diet
const bfAi = { run: async () => ({ response: JSON.stringify({ recipes: [
  { name: "Oats with chicken", minutes: 5, ingredients: [{ name: "Rolled oats", grams: 60, query: "oats" }, { name: "Chicken breast", grams: 100, query: "chicken breast raw" }], steps: [] },
  { name: "Berry oats", minutes: 5, ingredients: [{ name: "Rolled oats", grams: 60, query: "oats" }], steps: [] } ] }) }) };
const bfOut = await suggestRecipes(bfAi, async (q) => ({ name: q, kcal: 100, protein: 10, carbs: 10, fat: 1 }),
  { kind: "breakfast", pantry: [], diet: "chicken_ok", never: [], max_minutes: 10, min_protein: 1, max_kcal: 2000 });
assert.deepEqual(bfOut.map((r) => r.name), ["Berry oats"]);

// portions: too-big recipe is scaled into the window; in-window, incomplete and extreme ones are left alone/clamped
const base = { complete: true, totals: { kcal: 1000, protein: 60, carbs: 100, fat: 40 }, ingredients: [{ name: "a", grams: 200 }, { name: "b", grams: 10 }] };
const sc = fitPortions(base, { min_kcal: 600, max_kcal: 800 });
assert.equal(sc.scaled, 0.78);                                           // 800 * 0.97 / 1000
assert.deepEqual(sc.totals, { kcal: 776, protein: 47, carbs: 78, fat: 31 });
assert.deepEqual(sc.ingredients.map((i) => i.grams), [155, 8]);
assert.equal(fitPortions(base, { min_kcal: 600, max_kcal: 1200 }), base); // already inside
assert.equal(fitPortions({ ...base, complete: false }, { max_kcal: 500 }).scaled, undefined);
assert.equal(fitPortions(base, { max_kcal: 100 }).scaled, 0.4);          // clamp: never shrink below 0.4x
assert.equal(fitPortions({ ...base, totals: { ...base.totals, kcal: 200 } }, { min_kcal: 700, max_kcal: 900 }).scaled, 2.5); // clamp up

// makeLookup caches repeated queries
let calls = 0;
const lk = makeLookup("k", async (q) => { calls++; return [{ name: q }]; });
await lk("Rice"); await lk("rice "); assert.equal(calls, 1);

// suggestRecipes: attempt 1 misses protein, attempt 2 fits; feedback carries computed macros; fits sorted first
const mk = (grams) => ({ recipes: [1, 2, 3].map((n) => ({ name: `R${n}`, minutes: 10, ingredients: [{ name: "chicken", grams, query: "chicken breast raw" }], steps: [] })) });
const prompts = [];
const ai = { run: async (_m, { messages }) => { prompts.push(messages[1].content); return { response: JSON.stringify(mk(prompts.length === 1 ? 50 : 200)) }; } };
const out = await suggestRecipes(ai, makeLookup("k", async (q) => (DB[q] ? [DB[q]] : [])), { pantry: ["chicken"], diet: "chicken_ok", max_minutes: 30, min_protein: 35, max_kcal: 800 });
assert.equal(prompts.length, 2);
assert.match(prompts[1], /12 g protein/); // 50 g chicken = 11.5 g, rounded
assert.equal(out.length, 3);
assert.ok(out.every((x) => x.fits));
console.log("all checks passed");

// micronutrients come through per100 and add up in recipes (USDA numbers: 303 iron, 401 vitamin C)
{
  const f = per100({ fdcId: 9, description: "lentils", foodNutrients: nut({ 203: 9, 204: 0.4, 205: 20, 208: 116, 303: 3.3, 401: 1.5, 328: 0 }) });
  assert.deepEqual(f.micro, { iron: 3.3, vitc: 1.5 });
  const rec = await computeRecipe({ name: "x", ingredients: [{ name: "lentils", grams: 200, query: "lentils" }] }, async () => f);
  assert.equal(rec.micro.iron, 6.6);
  assert.equal(fitPortions(rec, { max_kcal: 100, min_kcal: 0 }).micro.iron < 6.6, true);
  console.log("micro ok");
}
