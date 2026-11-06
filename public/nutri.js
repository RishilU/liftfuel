// Vitamins and minerals: daily targets, totals, gaps, and meals built from ingredients. No DOM here.
import { r1 } from "./util.js";

// US recommended daily amounts for adults 19-30 (NIH/NASEM DRIs; potassium is an "adequate intake"). m = male, f = female.
export const MICROS = [
  { k: "calcium", label: "Calcium", unit: "mg", m: 1000, f: 1000 },
  { k: "iron", label: "Iron", unit: "mg", m: 8, f: 18 },
  { k: "magnesium", label: "Magnesium", unit: "mg", m: 400, f: 310 },
  { k: "potassium", label: "Potassium", unit: "mg", m: 3400, f: 2600 },
  { k: "zinc", label: "Zinc", unit: "mg", m: 11, f: 8 },
  { k: "vita", label: "Vitamin A", unit: "µg", m: 900, f: 700 },
  { k: "vitc", label: "Vitamin C", unit: "mg", m: 90, f: 75 },
  { k: "vitd", label: "Vitamin D", unit: "µg", m: 15, f: 15 },
  { k: "b12", label: "Vitamin B12", unit: "µg", m: 2.4, f: 2.4 },
  { k: "folate", label: "Folate", unit: "µg", m: 400, f: 400 },
];

// Foods rich in each nutrient (vegetarian or chicken). Names only: tapping one searches USDA, which shows the real numbers.
export const FOODS = {
  calcium: ["tofu", "yogurt", "milk", "kale", "almonds"],
  iron: ["lentils", "spinach", "chickpeas", "tofu", "pumpkin seeds"],
  magnesium: ["pumpkin seeds", "almonds", "spinach", "black beans", "oats"],
  potassium: ["banana", "potato", "white beans", "lentils", "avocado"],
  zinc: ["pumpkin seeds", "chickpeas", "cashews", "lentils", "chicken"],
  vita: ["sweet potato", "carrots", "spinach", "kale", "egg"],
  vitc: ["orange", "red bell pepper", "broccoli", "strawberries", "kiwi"],
  vitd: ["egg", "milk", "mushrooms"],
  b12: ["egg", "yogurt", "milk", "cheese", "chicken"],
  folate: ["lentils", "spinach", "asparagus", "black beans", "broccoli"],
};

export const sumMicro = (rows) => {
  const t = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.micro ?? {})) t[k] = (t[k] ?? 0) + v;
  return t;
};
export const scaleMicro = (micro, f) => Object.fromEntries(Object.entries(micro ?? {}).map(([k, v]) => [k, Math.round(v * f * 10) / 10]));

// one row per nutrient: amount, daily goal, fraction of goal
export const microPct = (total, sex) => MICROS.map((m) => {
  const goal = sex === "female" ? m.f : m.m, have = total?.[m.k] ?? 0;
  return { ...m, have, goal, pct: have / goal };
});
// what a food is rich in, per 100 g: the nutrients where it covers the largest share of a day
export const topMicros = (micro, sex, n = 3) =>
  microPct(micro, sex).filter((x) => x.pct >= 0.1).sort((a, b) => b.pct - a.pct).slice(0, n);

// ---------- meals built from ingredients: items = [{ grams, f: per-100 g food | null }] ----------
export function dishTotals(items) {
  const t = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, micro: {}, missing: 0 };
  for (const i of items) {
    const g = i.grams > 0 ? i.grams : 0;
    t.grams += g;
    if (!i.f) { if (g) t.missing++; continue; }
    for (const m of ["kcal", "protein", "carbs", "fat", "fiber"]) t[m] += ((i.f[m] ?? 0) * g) / 100;
    for (const [m, v] of Object.entries(i.f.micro ?? {})) t.micro[m] = (t.micro[m] ?? 0) + (v * g) / 100;
  }
  return t;
}
export const perServing = (t, n) => ({
  grams: Math.round(t.grams / n), kcal: Math.round(t.kcal / n), protein: r1(t.protein / n), carbs: r1(t.carbs / n),
  fat: r1(t.fat / n), fiber: r1(t.fiber / n), micro: scaleMicro(t.micro, 1 / n),
});
// a label gives numbers for the amount you eat; store them per 100 g so the grams box can scale them
export const labelFood = (name, grams, x, micro = {}) => {
  const k = 100 / grams, p = (v) => (v || 0) * k;
  return { name, kcal: p(x.kcal), protein: p(x.protein), carbs: p(x.carbs), fat: p(x.fat), fiber: p(x.fiber), micro: scaleMicro(micro, k) };
};
