// Weekly meal-prep plan helpers. No DOM here.
// plan = { made, weekdays: [1..5], breakfast: {recipe, options, servings}, lunches: [{recipe, options, servings}], checked: {} }

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monFirst = (d) => (d + 6) % 7;
export const orderedDays = (plan) => [...plan.weekdays].sort((a, b) => monFirst(a) - monFirst(b));

// Meals planned for a weekday number (0=Sun), or [] if it isn't a prep day. Lunch batches fill in order.
export function planMeals(plan, dow) {
  if (!plan) return [];
  let i = orderedDays(plan).indexOf(dow);
  if (i < 0) return [];
  const out = [{ slot: "Breakfast", recipe: plan.breakfast.recipe }];
  for (const l of plan.lunches) {
    if (i < l.servings) { out.push({ slot: "Lunch", recipe: l.recipe }); break; }
    i -= l.servings;
  }
  return out;
}

export const dayTotals = (meals) => meals.reduce((t, m) => {
  for (const k of ["kcal", "protein", "carbs", "fat"]) t[k] += m.recipe.totals[k];
  return t;
}, { kcal: 0, protein: 0, carbs: 0, fat: 0 });

const batches = (plan) => [[plan.breakfast.recipe, plan.breakfast.servings], ...plan.lunches.map((l) => [l.recipe, l.servings])];

// Total grams to buy for the whole plan, merged by ingredient name; pinches (<5 g, except oils) are skipped.
export function groceries(plan) {
  const m = new Map();
  for (const [r, n] of batches(plan)) {
    for (const i of r.ingredients) {
      if (!(i.grams >= 5 || /oil|butter|ghee/i.test(i.name)) || !(i.grams > 0)) continue;
      const key = i.name.toLowerCase().trim();
      m.set(key, { key, name: i.name, grams: (m.get(key)?.grams ?? 0) + i.grams * n });
    }
  }
  return [...m.values()].map((x) => ({ ...x, grams: Math.max(5, Math.round(x.grams / 5) * 5) })).sort((a, b) => a.name.localeCompare(b.name));
}
