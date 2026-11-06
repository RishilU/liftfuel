// node test-app.mjs — checks the app's pure logic (targets, routine, plan). No browser, no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { computeTargets, weeklyCheck, weightNow, estMaintenance, maintenance, activity } from "./public/targets.js";
import { TEMPLATES, defaultRoutine, plannedVolume, loggedVolume, nextLoad, volumeClass } from "./public/routine.js";
import { planMeals, groceries, dayTotals } from "./public/plan.js";
import { dayNum } from "./public/util.js";

const X = JSON.parse(fs.readFileSync("./public/exercises.json", "utf8"));
const byId = Object.fromEntries(X.exercises.map((e) => [e.id, e]));
const dayAgo = (n, from = "2026-11-05") => new Date((dayNum(from) - n) * 864e5).toISOString().slice(0, 10);

// ---- templates: every exercise exists; weekly volume per muscle
for (const [key, t] of Object.entries(TEMPLATES)) {
  const days = t.build();
  assert.equal(days.length, 7, key + " has 7 days");
  for (const d of days) for (const e of d.ex) assert.ok(byId[e.id], `${key}: unknown exercise ${e.id}`);
  const v = plannedVolume(days, byId);
  console.log(key.padEnd(5), X.groups.map((g) => `${g.id.slice(0, 4)} ${v[g.id] ?? 0}`).join("  "));
}
const v5 = plannedVolume(defaultRoutine("hyp5").days, byId);
for (const g of X.groups) assert.ok(v5[g.id] >= 10, `hyp5 ${g.id} should be >= 10 sets, got ${v5[g.id]}`);
const v4 = plannedVolume(defaultRoutine("hyp4").days, byId);
for (const g of X.groups) assert.ok(v4[g.id] >= 9, `hyp4 ${g.id} should be >= 9 sets, got ${v4[g.id]}`);
assert.equal(volumeClass(10), "good"); assert.equal(volumeClass(7), "ok"); assert.equal(volumeClass(3), "low");
assert.deepEqual(loggedVolume([{ exercise_id: "back-squat" }, { exercise_id: "back-squat" }], byId), { quads: 2, glutes: 1 });

// ---- targets: 155 lb, 22 y, 5'10", 5 training days
assert.equal(activity(5), 1.55);
assert.equal(maintenance({ sex: "male", age: 22, height_in: 70 }, 155, 5), 2649);
const t = computeTargets({ phase: "bulk" }, 155, 5);
assert.deepEqual([t.kcal, t.protein, t.fat, t.carbs], [2910, 140, 70, 430]);
assert.deepEqual(t.proteinRange, [124, 155]);
// protein follows bodyweight; calories follow training days; phase changes the surplus; adjust offsets
assert.equal(computeTargets({ phase: "bulk" }, 165, 5).protein, 149);
assert.ok(computeTargets({ phase: "bulk" }, 155, 3).kcal < t.kcal);
assert.ok(computeTargets({ phase: "recomp" }, 155, 5).kcal < t.kcal);
assert.equal(computeTargets({ phase: "bulk", adjust: 125 }, 155, 5).kcal, 3040);
assert.deepEqual(computeTargets({ phase: "bulk", manual: { kcal: 3000, protein: 150 } }, 155, 5).protein, 150);

// ---- weight + weekly check
const W = (pairs) => pairs.map(([n, weight]) => ({ date: dayAgo(n), weight }));
assert.equal(weightNow([], "2026-11-05"), null);
assert.equal(weightNow(W([[20, 150]]), "2026-11-05"), 150); // old entry: use latest
assert.equal(weightNow(W([[0, 156], [2, 154]]), "2026-11-05"), 155);
assert.equal(weeklyCheck(W([[0, 155]]), "2026-11-05", "bulk", null), null); // not enough data
const flat = W([[0, 155], [3, 155], [8, 155], [11, 155]]);
const c1 = weeklyCheck(flat, "2026-11-05", "bulk", null);
assert.equal(c1.status, "low"); assert.equal(c1.suggest, 125);                         // no gain on a bulk -> eat more
assert.equal(weeklyCheck(flat, "2026-11-05", "recomp", null).status, "ok");              // flat is right for recomp
const fast = W([[0, 158], [3, 158], [8, 155], [11, 155]]);
assert.equal(weeklyCheck(fast, "2026-11-05", "bulk", null).status, "high");
assert.equal(weeklyCheck(fast, "2026-11-05", "bulk", null).suggest, -125);
assert.equal(weeklyCheck(flat, "2026-11-05", "bulk", dayAgo(5)).suggest, 0);             // just adjusted: wait
assert.equal(weeklyCheck(flat, "2026-11-05", "bulk", dayAgo(5)).waiting, true);
const good = W([[0, 155.6], [3, 155.6], [8, 155], [11, 155]]);                           // +0.4%
assert.equal(weeklyCheck(good, "2026-11-05", "bulk", null).status, "ok");

// ---- maintenance estimated from your own logs: 3000 kcal/day, +1 lb over ~3 weeks -> maintenance a bit under 3000
const body = W([[0, 156], [2, 156], [22, 155], [25, 155]]);
const intake = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [dayAgo(i), 3000]));
const est = estMaintenance(body, intake, "2026-11-05");
assert.ok(est && est.kcal > 2800 && est.kcal < 3000, JSON.stringify(est));
assert.equal(estMaintenance(body, { [dayAgo(1)]: 3000 }, "2026-11-05"), null);            // too few logged days

// ---- progression
const spec = { sets: 3, reps: [6, 10] };
assert.equal(nextLoad([], spec).weight, null);
assert.equal(nextLoad([{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }], spec).weight, 65);
assert.equal(nextLoad([{ weight: 60, reps: 10 }, { weight: 60, reps: 9 }, { weight: 60, reps: 8 }], spec).weight, 60);
assert.equal(nextLoad([{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }], spec).weight, 60);   // only 2 of 3 sets done: no jump
assert.match(nextLoad([{ weight: 60, reps: 5 }, { weight: 60, reps: 6 }, { weight: 60, reps: 6 }], spec).note, /aim for 6\+/);

// ---- plan: Mon-Fri, 5 breakfasts, lunches 3 + 2
const R = (name, p, k, ing) => ({ name, totals: { kcal: k, protein: p, carbs: 50, fat: 10 }, ingredients: ing });
const plan = {
  weekdays: [5, 1, 3, 2, 4],
  breakfast: { recipe: R("Oats", 36, 600, [{ name: "Rolled oats", grams: 60 }, { name: "Greek yogurt", grams: 200 }, { name: "Cumin", grams: 2 }]), servings: 5 },
  lunches: [{ recipe: R("Chili", 40, 700, [{ name: "Chickpeas", grams: 150 }, { name: "Olive oil", grams: 3 }]), servings: 3 },
            { recipe: R("Bowl", 38, 650, [{ name: "Chickpeas", grams: 100 }, { name: "Rice", grams: 80 }]), servings: 2 }],
};
assert.deepEqual(planMeals(plan, 1).map((m) => m.recipe.name), ["Oats", "Chili"]);          // Monday
assert.deepEqual(planMeals(plan, 3).map((m) => m.recipe.name), ["Oats", "Chili"]);          // Wednesday = 3rd lunch
assert.deepEqual(planMeals(plan, 4).map((m) => m.recipe.name), ["Oats", "Bowl"]);           // Thursday
assert.deepEqual(planMeals(plan, 0), []);                                                    // Sunday: not a prep day
assert.deepEqual(dayTotals(planMeals(plan, 1)), { kcal: 1300, protein: 76, carbs: 100, fat: 20 });
const g = Object.fromEntries(groceries(plan).map((x) => [x.key, x.grams]));
assert.deepEqual(g, { chickpeas: 650, "greek yogurt": 1000, "olive oil": 10, "rolled oats": 300, rice: 160 }); // 150*3+100*2; cumin pinch skipped; oil 9 g kept, rounded to 10
console.log("app logic checks passed");

// ======== stats, insights, lifting math ========
import { dayStreak, weekStreak, level, xp, achievements, stalledLifts, insights, mondayOf, weeklySummary, prs } from "./public/stats.js";
import { plateSplit, warmups, repMax } from "./public/lifting.js";
const T = "2026-11-05"; // a Thursday
assert.equal(dayStreak([T, dayAgo(1), dayAgo(2)], T), 3);
assert.equal(dayStreak([dayAgo(1), dayAgo(2)], T), 2);          // today not logged yet: streak is still alive
assert.equal(dayStreak([T, dayAgo(2)], T), 1);                  // gap breaks it
assert.equal(dayStreak([], T), 0);
assert.equal(mondayOf(T), "2026-11-02");
assert.equal(weekStreak(["2026-11-02", "2026-11-03", "2026-11-04", "2026-10-26", "2026-10-27", "2026-10-28"], T, 3), 2);   // this week + last week
assert.equal(weekStreak(["2026-11-02", "2026-10-26", "2026-10-27", "2026-10-28"], T, 3), 1);                                 // this week not done yet: last week still counts
assert.equal(weekStreak(["2026-10-26", "2026-10-28", "2026-10-20", "2026-10-21", "2026-10-22"], T, 3), 0);                   // last week had only 2: broken
assert.deepEqual([level(0).level, level(99).level, level(100).level, level(400).level], [1, 1, 2, 3]);
assert.equal(level(150).into, 50); assert.equal(level(150).need, 300);
assert.equal(xp({ workouts: 2, sets: 10, foodDays: 3, weighIns: 1, photos: 1 }), 100 + 50 + 30 + 5 + 15);
const ach = Object.fromEntries(achievements({ workouts: 12, sets: 40, volume: 120000, foodDays: 3, foodStreak: 3, proteinDays: 0, weighIns: 5, photos: 0, hasPlan: true }).map((a) => [a.id, a]));
assert.ok(ach.first.done && ach.ten.done && ach.ton.done && ach.weigh.done && ach.plan.done);
assert.ok(!ach.fifty.done && !ach.sets.done && !ach.photo.done && !ach.streak7.done);
assert.equal(ach.sets.have, 40); assert.equal(ach.ton.have, 100000);   // progress is capped at the goal

// stalled: last session no better than the two before it
const S1 = (d, w, r) => ({ exercise_id: "lat-pulldown", date: dayAgo(d), weight: w, reps: r });
assert.deepEqual(stalledLifts([S1(14, 100, 10), S1(7, 100, 10), S1(0, 100, 10)]), ["lat-pulldown"]);
assert.deepEqual(stalledLifts([S1(14, 100, 10), S1(7, 100, 10), S1(0, 105, 10)]), []);
assert.deepEqual(stalledLifts([S1(7, 100, 10), S1(0, 100, 10)]), []);   // too few sessions to judge

// insights
const groups = X.groups;
const base = { today: T, volume: { chest: 10 }, byId, groups, workoutDates: [T, dayAgo(1), dayAgo(3)], plannedDays: 5, foodByDate: {}, target: { protein: 140 }, check: null, stalled: [] };
let ins = insights(base);
assert.ok(ins.some((i) => /3 of 5/.test(i.title)));
assert.ok(ins.some((i) => i.tone === "warn" && /Low weekly volume/.test(i.title)), "3 workouts, most muscles under 6 sets -> warn");
assert.ok(ins.some((i) => /Log a bit more/.test(i.title)));
ins = insights({ ...base, volume: Object.fromEntries(groups.map((g) => [g.id, 10])), workoutDates: [T, dayAgo(1), dayAgo(2), dayAgo(3), dayAgo(4)],
  foodByDate: { [dayAgo(1)]: { protein: 100 }, [dayAgo(2)]: { protein: 110 }, [dayAgo(3)]: { protein: 105 }, [dayAgo(4)]: { protein: 90 } } });
assert.ok(ins.some((i) => /Week complete/.test(i.title)));
assert.ok(ins.some((i) => /Protein is running low/.test(i.title)));
assert.equal(ins[0].tone, "warn");                                         // warnings first
assert.ok(insights({ ...base, stalled: ["lat-pulldown"] }).some((i) => /Lat pulldown has stalled/.test(i.title)));

// plates, warm-ups, rep maxes
assert.deepEqual(plateSplit(185).perSide, [45, 25]);
assert.deepEqual(plateSplit(135).perSide, [45]);
assert.deepEqual(plateSplit(100).perSide, [25, 2.5]);
assert.deepEqual(plateSplit(45).perSide, []);
assert.equal(plateSplit(30), null);                                          // lighter than the bar
assert.equal(plateSplit(47).leftover, 2);                                    // 1 lb a side can't be made
assert.deepEqual(warmups(100), [{ weight: 50, reps: 8 }, { weight: 70, reps: 5 }, { weight: 85, reps: 2 }]);
assert.equal(Math.round(repMax(100)[9].weight), 75);                         // 10 reps ~ 75% of 1RM (Epley)
console.log("stats and lifting checks passed");

// ---------- nutri: meals from ingredients, micronutrient totals ----------
import { dishTotals, perServing, labelFood, microPct, sumMicro, topMicros } from "./public/nutri.js";
{
  const lentils = { kcal: 350, protein: 25, carbs: 60, fat: 1, fiber: 11, micro: { iron: 7.5, folate: 480 } };
  const scoop = labelFood("powder", 30, { kcal: 120, protein: 24, carbs: 3, fat: 1.5 });
  const t = dishTotals([{ grams: 100, f: lentils }, { grams: 30, f: scoop }, { grams: 50, f: null }]);
  assert.equal(Math.round(t.kcal), 470); assert.equal(Math.round(t.protein), 49); assert.equal(t.missing, 1); assert.equal(t.micro.iron, 7.5);
  const p = perServing(t, 2);
  assert.equal(p.kcal, 235); assert.equal(p.micro.folate, 240);
  const m = microPct(sumMicro([{ micro: { iron: 4 } }, { micro: { iron: 4 } }, { micro: null }]), "male");
  assert.equal(m.find((x) => x.k === "iron").pct, 1);
  assert.equal(microPct({ iron: 9 }, "female").find((x) => x.k === "iron").pct, 0.5);
  assert.equal(topMicros({ iron: 7.5, folate: 480 }, "male")[0].k, "folate");
  console.log("nutri ok");
}

// weekly summary: window is the last 7 days including today; weight change compares with the 7 days before
{
  const w = weeklySummary({ today: "2026-03-10", workoutDates: ["2026-03-04", "2026-03-03", "2026-03-10", "2026-03-10"], plannedDays: 5,
    foodByDate: { "2026-03-10": { kcal: 2800, protein: 150 }, "2026-03-09": { kcal: 2600, protein: 100 }, "2026-03-02": { kcal: 9999, protein: 1 }, "2026-03-08": { kcal: 0, protein: 0 } },
    proteinGoal: 150, body: [{ date: "2026-03-10", weight: 156 }, { date: "2026-03-08", weight: 155 }, { date: "2026-03-02", weight: 154 }] });
  assert.equal(w.workouts, 2);                       // Mar 3 is 7 days back: outside the window
  assert.equal(w.daysLogged, 2); assert.equal(w.avgKcal, 2700); assert.equal(w.proteinDays, 1);
  assert.equal(w.weight, 155.5); assert.equal(w.weightChange, 1.5);
  const none = weeklySummary({ today: "2026-03-10", workoutDates: [], plannedDays: 0, foodByDate: {}, proteinGoal: 150, body: [] });
  assert.equal(none.avgKcal, null); assert.equal(none.weightChange, null);
  // deload note only with 3+ stalled lifts
  const base = { today: "2026-03-10", volume: {}, byId: Object.fromEntries(["a", "b", "c"].map((i) => [i, { name: i }])), groups: [], workoutDates: [], plannedDays: 0, foodByDate: {}, target: { protein: 150 }, check: null };
  assert.ok(insights({ ...base, stalled: ["a", "b", "c"] }).some((n) => n.title === "Maybe an easier week"));
  assert.ok(!insights({ ...base, stalled: ["a", "b"] }).some((n) => n.title === "Maybe an easier week"));
  console.log("weekly summary ok");
}

// personal records: only sets that beat every earlier set of that lift; the first session is the baseline
{
  const s = (id, date, weight, reps, n) => ({ id: n, exercise_id: id, date, weight, reps });
  const rec = prs([s("a", "2026-03-01", 100, 10, 1), s("a", "2026-03-03", 100, 8, 2), s("a", "2026-03-05", 105, 10, 3), s("a", "2026-03-05", 110, 10, 4), s("b", "2026-03-02", 50, 10, 5)]);
  assert.equal(rec.length, 1);                              // b has one session only; a's Mar 3 set was lower
  assert.equal(rec[0].date, "2026-03-05"); assert.equal(rec[0].weight, 110);
  assert.deepEqual(prs([]), []);
  console.log("prs ok");
}
