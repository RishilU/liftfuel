// Routine templates, weekly volume and load progression. No DOM here.

export const VOLUME_TARGET = 10; // weekly hard sets per muscle; the data could not say whether more than ~10 helps (Schoenfeld 2017)
export const primary = (e) => Object.keys(e.roles)[0];

const ex = (id, sets, lo, hi) => ({ id, sets, reps: [lo, hi] });
const rest = () => ({ name: "Rest", ex: [] });

// Hypertrophy templates use the preferred exercise per muscle, 6-15 reps, about 10 weekly sets per muscle.
export const TEMPLATES = {
  mach: {
    label: "My machine plan, 5 days (Push, Pull, Legs, Upper, Lower)",
    note: "Your exercise list. Sets and rep ranges are my defaults, and the Upper and Lower days are built from the same exercises. Edit any of it.",
    build: () => [
      { name: "Push", ex: [ex("incline-machine-press", 3, 8, 12), ex("pec-deck", 3, 10, 15), ex("dip-machine", 3, 8, 12), ex("pushdown", 3, 10, 15), ex("machine-shoulder-press", 3, 8, 12), ex("lateral-raise-machine", 3, 10, 15)] },
      { name: "Pull", ex: [ex("lat-pulldown", 3, 8, 12), ex("machine-row", 3, 8, 12), ex("t-bar-row", 3, 8, 12), ex("reverse-pec-deck", 3, 10, 15), ex("bicep-curl", 3, 8, 12), ex("hammer-curl", 3, 10, 15)] },
      { name: "Legs", ex: [ex("leg-press", 3, 8, 12), ex("leg-extension", 3, 10, 15), ex("seated-leg-curl", 3, 8, 12), ex("pendulum-squat", 3, 8, 12), ex("standing-calf-raise", 4, 8, 15)] },
      rest(),
      { name: "Upper", ex: [ex("incline-machine-press", 3, 8, 12), ex("lat-pulldown", 3, 8, 12), ex("machine-shoulder-press", 3, 8, 12), ex("machine-row", 3, 8, 12), ex("lateral-raise-machine", 3, 10, 15), ex("bicep-curl", 3, 8, 12), ex("pushdown", 3, 10, 15)] },
      { name: "Lower", ex: [ex("pendulum-squat", 3, 8, 12), ex("leg-press", 3, 8, 12), ex("seated-leg-curl", 3, 8, 12), ex("leg-extension", 3, 10, 15), ex("standing-calf-raise", 4, 8, 15)] },
      rest(),
    ],
  },
  hyp5: {
    label: "Hypertrophy, 5 days (Push, Pull, Legs, Upper, Lower)",
    build: () => [
      { name: "Push", ex: [ex("incline-db-press", 3, 6, 10), ex("cable-fly", 3, 10, 15), ex("db-shoulder-press", 3, 6, 10), ex("lateral-raise", 3, 10, 15), ex("overhead-cable-ext", 3, 8, 12), ex("pushdown", 3, 10, 15)] },
      { name: "Pull", ex: [ex("lat-pulldown", 3, 8, 12), ex("chest-supported-row", 3, 8, 12), ex("reverse-pec-deck", 3, 10, 15), ex("incline-db-curl", 3, 8, 12), ex("hammer-curl", 3, 10, 15)] },
      { name: "Legs", ex: [ex("back-squat", 3, 6, 10), ex("leg-press", 3, 8, 12), ex("seated-leg-curl", 3, 8, 12), ex("hip-thrust", 4, 8, 12), ex("standing-calf-raise", 5, 8, 15)] },
      rest(),
      { name: "Upper", ex: [ex("barbell-bench", 4, 6, 10), ex("pull-up", 3, 6, 10), ex("seated-cable-row", 3, 8, 12), ex("lateral-raise", 3, 10, 15), ex("preacher-curl", 4, 8, 12), ex("overhead-db-ext", 4, 10, 15)] },
      { name: "Lower", ex: [ex("hack-squat", 3, 6, 10), ex("rdl", 4, 6, 10), ex("seated-leg-curl", 3, 8, 12), ex("leg-extension", 3, 10, 15), ex("hip-thrust", 3, 8, 12), ex("seated-calf-raise", 5, 10, 15)] },
      rest(),
    ],
  },
  hyp4: {
    label: "Hypertrophy, 4 days (Upper / Lower twice)",
    build: () => [
      { name: "Upper A", ex: [ex("barbell-bench", 4, 6, 10), ex("lat-pulldown", 4, 8, 12), ex("db-shoulder-press", 3, 6, 10), ex("overhead-cable-ext", 4, 8, 12), ex("pushdown", 2, 10, 15), ex("incline-db-curl", 4, 8, 12), ex("lateral-raise", 3, 10, 15)] },
      { name: "Lower A", ex: [ex("back-squat", 4, 6, 10), ex("rdl", 4, 6, 10), ex("leg-extension", 3, 10, 15), ex("seated-leg-curl", 3, 8, 12), ex("hip-thrust", 3, 8, 12), ex("standing-calf-raise", 5, 8, 15)] },
      rest(),
      { name: "Upper B", ex: [ex("incline-db-press", 4, 6, 10), ex("pull-up", 4, 6, 10), ex("cable-fly", 3, 10, 15), ex("chest-supported-row", 3, 8, 12), ex("lateral-raise", 3, 10, 15), ex("overhead-db-ext", 4, 10, 15), ex("preacher-curl", 4, 8, 12), ex("hammer-curl", 2, 10, 15)] },
      { name: "Lower B", ex: [ex("hack-squat", 4, 6, 10), ex("hip-thrust", 4, 8, 12), ex("seated-leg-curl", 4, 8, 12), ex("leg-press", 3, 8, 12), ex("seated-calf-raise", 5, 10, 15)] },
      rest(), rest(),
    ],
  },
  hyp3: {
    label: "Hypertrophy, 3 days (Full body)",
    build: () => {
      const A = { name: "Full body A", ex: [ex("back-squat", 3, 6, 10), ex("incline-db-press", 3, 6, 10), ex("lat-pulldown", 3, 8, 12), ex("seated-leg-curl", 3, 8, 12), ex("lateral-raise", 3, 10, 15), ex("overhead-cable-ext", 3, 8, 12), ex("incline-db-curl", 3, 8, 12), ex("standing-calf-raise", 3, 8, 15)] };
      const B = { name: "Full body B", ex: [ex("hack-squat", 3, 6, 10), ex("barbell-bench", 3, 6, 10), ex("chest-supported-row", 3, 8, 12), ex("rdl", 3, 6, 10), ex("db-shoulder-press", 3, 6, 10), ex("pushdown", 3, 10, 15), ex("preacher-curl", 3, 8, 12), ex("hip-thrust", 3, 8, 12), ex("seated-calf-raise", 3, 10, 15)] };
      return [A, rest(), B, rest(), JSON.parse(JSON.stringify(A)), rest(), rest()];
    },
  },
  str4: {
    label: "Strength, 4 days (squat, bench, deadlift, press)",
    note: "Strength focus: heavy compounds first, so arms, hamstrings and calves get less direct work. Heavier loads gave greater strength gains in a meta-analysis.",
    build: () => [
      { name: "Squat + Bench", ex: [ex("back-squat", 4, 3, 5), ex("barbell-bench", 4, 3, 5), ex("barbell-row", 3, 5, 8), ex("lateral-raise", 3, 10, 15)] },
      { name: "Deadlift + Press", ex: [ex("conventional-deadlift", 3, 3, 5), ex("barbell-ohp", 4, 3, 6), ex("pull-up", 3, 5, 8), ex("incline-db-curl", 3, 8, 12)] },
      rest(),
      { name: "Bench + Legs", ex: [ex("barbell-bench", 3, 5, 8), ex("leg-press", 3, 6, 10), ex("seated-cable-row", 3, 6, 10), ex("rdl", 3, 5, 8), ex("overhead-cable-ext", 3, 8, 12)] },
      { name: "Press + Pull", ex: [ex("barbell-ohp", 3, 5, 8), ex("back-squat", 3, 5, 8), ex("lat-pulldown", 3, 6, 10), ex("dips", 3, 6, 10), ex("seated-calf-raise", 3, 8, 12)] },
      rest(), rest(),
    ],
  },
};

export const defaultRoutine = (template = "hyp5") => ({ template, days: TEMPLATES[template].build() });

// Primary muscle counts 1 set; muscles an exercise also works (its other roles) count half. My simplification, not from a study.
export function setsByGroup(list, byId) {
  const out = {};
  for (const { id, sets } of list) {
    const e = byId[id];
    if (!e) continue;
    Object.keys(e.roles).forEach((g, i) => { out[g] = (out[g] ?? 0) + sets * (i === 0 ? 1 : 0.5); });
  }
  return out;
}
export const plannedVolume = (days, byId) => setsByGroup(days.flatMap((d) => d.ex), byId);
// rows = logged sets, one row each
export const loggedVolume = (rows, byId) => setsByGroup(rows.map((r) => ({ id: r.exercise_id, sets: 1 })), byId);
export const volumeClass = (n) => (n >= VOLUME_TARGET ? "good" : n >= 6 ? "ok" : "low");

// Double progression: when every planned set hits the top of the rep range, add weight; otherwise keep the load and chase reps.
// last = previous session's sets for this exercise, in order: [{weight, reps}]
export function nextLoad(last, spec) {
  const [lo, hi] = spec.reps;
  if (!last.length) return { weight: null, note: `Pick a weight you can lift ${lo}-${hi} times, stopping 1-3 reps before you can't.` };
  const w = Math.max(...last.map((s) => s.weight));
  const top = last.filter((s) => s.weight === w);
  if (top.length >= spec.sets && top.every((s) => s.reps >= hi)) return { weight: w + 5, note: `You hit ${hi} reps on every set last time. Add weight today.`, up: true };
  if (top.some((s) => s.reps < lo)) return { weight: w, note: `Keep ${w} lb and aim for ${lo}+ reps on each set.` };
  return { weight: w, note: `Same weight as last time. Try for one more rep on a set.` };
}
