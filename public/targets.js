// Dynamic daily targets: derived from current weight, phase and how many days you train. No DOM here.
import { avg, dayNum } from "./util.js";

// rate = weekly bodyweight change (% of bodyweight) the phase should produce.
// Lean bulk: 0.25-0.5%/week (Iraki 2019 review). Recomp/maintain: roughly steady (my simplification).
export const PHASES = {
  bulk: { label: "Lean bulk", surplus: 0.1, rate: [0.25, 0.5] },
  recomp: { label: "Recomp", surplus: 0, rate: [-0.25, 0.25] },
  maintain: { label: "Maintain", surplus: 0, rate: [-0.25, 0.25] },
};
export const DEFAULT_PROFILE = {
  sex: "male", age: 22, height_in: 70, phase: "bulk",
  ppl: 0.9, // protein, g per lb of bodyweight (your range is 0.8-1.0)
  adjust: 0, lastAdjust: null, manual: null, prepDays: [1, 2, 3, 4, 5], restSec: 120,
  waterGoalOz: 128, bottles: [{ name: "Owala", oz: 32 }, { name: "Stanley", oz: 40 }], // 128 oz = 1 gallon; bottle sizes are editable in Settings
};

const r10 = (n) => Math.round(n / 10) * 10;
// standard activity multipliers by training days per week
export const activity = (d) => (d <= 0 ? 1.2 : d <= 3 ? 1.375 : d <= 5 ? 1.55 : 1.725);

// Mifflin-St Jeor x activity
export function maintenance({ sex, age, height_in }, weightLb, trainDays) {
  const bmr = 10 * (weightLb * 0.45359237) + 6.25 * (height_in * 2.54) - 5 * age + (sex === "female" ? -161 : 5);
  return Math.round(bmr * activity(trainDays));
}

export function computeTargets(profile, weightLb, trainDays) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const maint = maintenance(p, weightLb, trainDays);
  const ph = PHASES[p.phase] ?? PHASES.bulk;
  const auto = { kcal: r10(maint * (1 + ph.surplus) + p.adjust), protein: Math.round(weightLb * p.ppl), fat: Math.round(weightLb * 0.45) };
  const t = p.manual ? { ...auto, ...p.manual } : auto;
  return {
    ...t, carbs: Math.max(0, Math.round((t.kcal - 4 * t.protein - 9 * t.fat) / 4)),
    maintenance: maint, manual: !!p.manual, proteinRange: [Math.round(weightLb * 0.8), Math.round(weightLb)],
  };
}

const rows = (body) => body.filter((r) => r.weight != null);
const within = (body, today, from, to) => rows(body).filter((r) => { const d = dayNum(today) - dayNum(r.date); return d >= from && d < to; });

// 7-day average if there are recent entries, else the latest one, else null
export function weightNow(body, today) {
  const recent = within(body, today, 0, 7);
  if (recent.length) return avg(recent.map((r) => r.weight));
  const all = rows(body).sort((a, b) => a.date.localeCompare(b.date));
  return all.length ? all.at(-1).weight : null;
}

// Compare the last 7 days of weigh-ins with the 7 before. Suggests +/-125 kcal when outside the phase's range.
// After you accept a change, wait 14 days before suggesting another (the trend needs time to show it).
export function weeklyCheck(body, today, phase, lastAdjust) {
  const cur = within(body, today, 0, 7).map((r) => r.weight), prev = within(body, today, 7, 14).map((r) => r.weight);
  if (cur.length < 2 || prev.length < 2) return null;
  const A = avg(cur), B = avg(prev), pct = ((A - B) / B) * 100;
  const [lo, hi] = (PHASES[phase] ?? PHASES.bulk).rate;
  const waiting = !!lastAdjust && dayNum(today) - dayNum(lastAdjust) < 14;
  const status = pct < lo ? "low" : pct > hi ? "high" : "ok";
  const suggest = waiting || status === "ok" ? 0 : status === "low" ? 125 : -125;
  return { A, B, rate: A - B, pct, lo, hi, status, suggest, waiting, lbRange: [(B * lo) / 100, (B * hi) / 100] };
}

// Information only: maintenance implied by your own logs (needs ~4 weeks of weigh-ins and 14+ logged days).
// Uses the common 3,500 kcal per lb rule of thumb, which is rough.
export function estMaintenance(body, intake, today) {
  const end = within(body, today, 0, 7), start = within(body, today, 21, 28);
  if (end.length < 2 || start.length < 2) return null;
  const days = Object.entries(intake).filter(([d, k]) => { const x = dayNum(today) - dayNum(d); return x >= 0 && x < 28 && k >= 1200; });
  if (days.length < 14) return null;
  const span = avg(end.map((r) => dayNum(r.date))) - avg(start.map((r) => dayNum(r.date)));
  if (span < 10) return null;
  const dW = avg(end.map((r) => r.weight)) - avg(start.map((r) => r.weight));
  return { kcal: r10(avg(days.map(([, k]) => k)) - (dW * 3500) / span), days: days.length };
}
