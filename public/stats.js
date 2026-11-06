// Streaks, levels, badges and coach notes computed from your own logs. No DOM here.
import { dayNum, e1rm, avg } from "./util.js";

const shift = (d, n) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);
export const mondayOf = (date, weekStart = 1) => shift(date, -((new Date(dayNum(date) * 864e5).getUTCDay() - weekStart + 7) % 7));

// consecutive days ending today (or yesterday if today isn't logged yet)
export function dayStreak(dates, today) {
  const set = new Set(dates);
  let d = set.has(today) ? today : shift(today, -1), n = 0;
  while (set.has(d)) { n++; d = shift(d, -1); }
  return n;
}

// consecutive weeks with at least `min` workouts; the current week never breaks the streak until it ends
export function weekStreak(dates, today, min, weekStart = 1) {
  if (min < 1) return 0;
  const counts = {};
  for (const d of new Set(dates)) { const w = mondayOf(d, weekStart); counts[w] = (counts[w] ?? 0) + 1; }
  let w = mondayOf(today, weekStart), n = (counts[w] ?? 0) >= min ? 1 : 0;
  for (w = shift(w, -7); (counts[w] ?? 0) >= min; w = shift(w, -7)) n++;
  return n;
}

export const xp = (o) => o.workouts * 50 + o.sets * 5 + o.foodDays * 10 + o.weighIns * 5 + o.photos * 15;
export function level(x) {
  const L = Math.floor(Math.sqrt(x / 100)) + 1, lo = (L - 1) ** 2 * 100, hi = L ** 2 * 100;
  return { level: L, xp: x, into: x - lo, need: hi - lo };
}

export function achievements(o) {
  const A = (id, icon, name, desc, have, need) => ({ id, icon, name, desc, have: Math.min(have, need), need, done: have >= need });
  return [
    A("first", "🏋️", "First workout", "Log your first set", o.workouts, 1),
    A("ten", "💪", "Getting going", "10 workouts logged", o.workouts, 10),
    A("fifty", "🔥", "Regular", "50 workouts logged", o.workouts, 50),
    A("sets", "🎯", "100 sets", "Log 100 sets", o.sets, 100),
    A("ton", "🏗️", "Heavy mover", "Lift 100,000 lb in total", o.volume, 100000),
    A("food7", "🥗", "Food log habit", "Log food on 7 days", o.foodDays, 7),
    A("streak7", "⚡", "7-day streak", "Log food 7 days in a row", o.foodStreak, 7),
    A("protein10", "🥚", "Protein pro", "Hit your protein on 10 days", o.proteinDays, 10),
    A("weigh", "⚖️", "Weigh-in regular", "Log your weight 4 times", o.weighIns, 4),
    A("photo", "📸", "Progress photo", "Add a progress photo", o.photos, 1),
    A("plan", "🍱", "Meal prepper", "Make a prep-week plan", o.hasPlan ? 1 : 0, 1),
  ];
}

// Personal records: sets whose estimated 1RM beat everything logged before for that exercise (the first session sets the baseline, so it is not a PR).
// rows = sets with {id, exercise_id, date, weight, reps}. One record per exercise per day, newest first.
export function prs(rows) {
  const by = {};
  for (const r of [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))) (by[r.exercise_id] ??= []).push(r);
  const out = [];
  for (const [id, list] of Object.entries(by)) {
    let max = 0; const days = {};
    for (const r of list) {
      const e = e1rm(r.weight, r.reps);
      if (max > 0 && e > max * 1.0001) days[r.date] = { id, date: r.date, weight: r.weight, reps: r.reps, e1rm: e, gain: e - max };
      if (e > max) max = e;
    }
    out.push(...Object.values(days));
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Lifts whose best estimated 1RM has not gone up across their last 3 sessions. rows = sets with {exercise_id, date, weight, reps}.
export function stalledLifts(rows) {
  const by = {};
  for (const r of rows) ((by[r.exercise_id] ??= {})[r.date] ??= []).push(e1rm(r.weight, r.reps));
  return Object.entries(by).filter(([, days]) => {
    const ds = Object.keys(days).sort();
    if (ds.length < 3) return false;
    const best = ds.slice(-3).map((d) => Math.max(...days[d]));
    return best[2] <= Math.max(best[0], best[1]);
  }).map(([id]) => id);
}

// The last 7 days (today included) in numbers. foodByDate: {date: {kcal, protein}}, body: [{date, weight}]
export function weeklySummary({ today, workoutDates, plannedDays, foodByDate, proteinGoal, body }) {
  const inWeek = (d, back = 0) => { const n = dayNum(today) - dayNum(d); return n >= back && n < back + 7; };
  const food = Object.entries(foodByDate).filter(([d, v]) => inWeek(d) && v.kcal > 0).map(([, v]) => v);
  const weights = (back) => body.filter((r) => r.weight != null && inWeek(r.date, back)).map((r) => r.weight);
  const [now, before] = [weights(0), weights(7)];
  return {
    workouts: new Set(workoutDates.filter((d) => inWeek(d))).size, planned: plannedDays,
    daysLogged: food.length, avgKcal: food.length ? avg(food.map((f) => f.kcal)) : null, avgProtein: food.length ? avg(food.map((f) => f.protein)) : null,
    proteinDays: food.filter((f) => f.protein >= proteinGoal * 0.9).length,
    weight: now.length ? avg(now) : null, weightChange: now.length && before.length ? avg(now) - avg(before) : null,
  };
}

// Plain-language notes from your data. ctx: { today, weekRows, volume, byId, groups, workoutDates, plannedDays, foodByDate, target, check, stalled }
export function insights(ctx) {
  const out = [], { today } = ctx, week = new Set([...ctx.workoutDates].filter((d) => dayNum(today) - dayNum(d) < 7 && dayNum(today) - dayNum(d) >= 0));
  if (ctx.plannedDays > 0) {
    const n = week.size;
    out.push(n >= ctx.plannedDays
      ? { icon: "🏆", tone: "good", area: "train", title: "Week complete", text: `You trained ${n} times in the last 7 days. That is your full plan.` }
      : { icon: "📅", tone: "info", area: "train", title: `${n} of ${ctx.plannedDays} workouts`, text: `Your plan has ${ctx.plannedDays} training days a week. Showing up matters more than a perfect session.` });
  }
  if (week.size >= 3) {
    const low = ctx.groups.filter((g) => (ctx.volume[g.id] ?? 0) < 6).map((g) => g.name.toLowerCase());
    if (low.length) out.push({ icon: "🎯", tone: "warn", area: "train", title: "Low weekly volume", text: `Last 7 days: ${low.slice(0, 4).join(", ")} got fewer than 6 sets. Studies found more weekly sets gave more growth, up to about 10.` });
  }
  const days = Object.entries(ctx.foodByDate).filter(([d]) => dayNum(today) - dayNum(d) < 7 && dayNum(today) - dayNum(d) >= 0 && d !== today);
  if (days.length >= 3) {
    const p = avg(days.map(([, v]) => v.protein));
    out.push(p < ctx.target.protein * 0.85
      ? { icon: "🥚", tone: "warn", area: "eat", title: "Protein is running low", text: `You averaged ${Math.round(p)} g on days you logged. Your target is ${ctx.target.protein} g. A protein-rich breakfast is the easiest fix.` }
      : { icon: "✅", tone: "good", area: "eat", title: "Protein on track", text: `You averaged ${Math.round(p)} g a day. Target: ${ctx.target.protein} g.` });
  }
  const logged = Object.keys(ctx.foodByDate).filter((d) => dayNum(today) - dayNum(d) < 7 && dayNum(today) - dayNum(d) >= 0).length;
  if (logged < 4) out.push({ icon: "📝", tone: "info", area: "eat", title: "Log a bit more", text: `You logged food on ${logged} of the last 7 days. Four or more days makes your numbers trustworthy.` });
  if (ctx.check && ctx.check.suggest) out.push({ icon: "⚖️", tone: "warn", area: "body", title: ctx.check.status === "low" ? "Gaining slowly" : "Gaining fast", text: `Your weight is changing ${ctx.check.pct.toFixed(2)}% a week. Suggested change: ${ctx.check.suggest > 0 ? "+" : ""}${ctx.check.suggest} calories a day.` });
  if (ctx.stalled.length >= 3) out.push({ icon: "🛌", tone: "info", area: "train", title: "Maybe an easier week", text: `${ctx.stalled.length} lifts have stalled. A lighter week (same weights, about half the sets) is a common reset. Research on deloads is limited, so treat it as an option, and check sleep and calories first.` });
  for (const id of ctx.stalled.slice(0, 2)) {
    const e = ctx.byId[id];
    if (e) out.push({ icon: "🧱", tone: "info", area: "train", title: `${e.name} has stalled`, text: "Its estimated best has not gone up in 3 sessions. Try one more rep per set, a swap, or more sleep and food." });
  }
  const rank = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// US Navy tape method (Hodgdon & Beckett, 1984), inches in, body-fat % out. Typical error is a few points: an estimate, not a measurement.
// Women also need hips. Returns null when the tape numbers don't make sense.
export function navyBodyFat({ sex, height, waist, neck, hips }) {
  const girth = sex === "female" ? waist + hips - neck : waist - neck;
  if (!(height > 0 && waist > 0 && neck > 0 && girth > 0) || (sex === "female" && !(hips > 0))) return null;
  const bf = sex === "female" ? 163.205 * Math.log10(girth) - 97.684 * Math.log10(height) - 78.387 : 86.01 * Math.log10(girth) - 70.041 * Math.log10(height) + 36.76;
  return bf > 2 && bf < 60 ? Math.round(bf * 10) / 10 : null;
}

// last `weeks` Monday-first weeks as columns of 7 days: 1 = trained, 0 = not, null = future
export function trainingGrid(dates, today, weeks = 12) {
  const set = new Set(dates), start = shift(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => { const day = shift(start, w * 7 + d); return day > today ? null : { day, on: set.has(day) ? 1 : 0 }; }));
}

// 7-day averages of the manual daily log ({ date: { sleep, steps } }), only over days that have the value
export function dailyAvg(log, today, key) {
  const v = Array.from({ length: 7 }, (_, i) => log[shift(today, -i)]?.[key]).filter((x) => x > 0);
  return v.length ? { avg: avg(v), n: v.length } : null;
}
